import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createJourneyApi } from '@/api';
import { Modal } from '@/components/ui';
import { DEFAULT_SCENARIO_ID, getScenario, type ScenarioDefinition } from '@/demo/scenarios';
import { SandboxJourneyApi } from '@/demo/sandboxApi';
import { toJourneyDsl } from '@/domain/journeyDsl';
import { emptyDraft } from '@/domain/serialization';
import { EditorProvider, useEditorSession, useEditorState } from '@/editor/EditorContext';
import { EditorSession } from '@/editor/session';
import { BuilderHeader } from '@/journey/BuilderHeader';
import { Canvas } from '@/journey/Canvas';
import { DemoControls } from '@/journey/DemoControls';
import { ExportJsonModal, ImportJsonModal } from '@/journey/JsonTransferModals';
import { NodePalette } from '@/journey/NodePalette';
import { PropertiesPanel } from '@/journey/PropertiesPanel';
import { cn } from '@/utils/cn';
import { ErrorState, LoadingState, UnsupportedState } from './PageStates';

export const IMPORTED_DRAFT_KEY = 'marco.import.draft';

interface PendingNavigation {
  run: () => void;
  title: string;
  description: string;
  confirmLabel: string;
}

const NOTICE_TONES = {
  info: 'notice info',
  warning: 'notice warning',
  error: 'notice error',
} as const;

export function JourneyBuilderPage({ sandbox = false }: { sandbox?: boolean }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const workspaceId = params.workspaceId ?? '';
  const journeyId = params.journeyId ?? '';
  const scenarioId = searchParams.get('scenario') ?? DEFAULT_SCENARIO_ID;
  const importKey = searchParams.get('import') ?? '';
  const scenario = getScenario(scenarioId);
  const navigate = useNavigate();

  const session = useMemo(() => {
    // Re-create the sandbox session when a new import replaces the previous one.
    void importKey;
    if (sandbox) {
      if (scenarioId === 'imported') {
        let definition: unknown = emptyDraft();
        try {
          const stored = sessionStorage.getItem(IMPORTED_DRAFT_KEY);
          if (stored) definition = JSON.parse(stored) as unknown;
        } catch {
          definition = emptyDraft();
        }
        const api = new SandboxJourneyApi(workspaceId, 'sandbox_imported', { definition });
        return new EditorSession({
          api,
          workspaceId,
          journeyId: 'sandbox_imported',
          sandbox: true,
          scenarioId: 'imported',
        });
      }
      const payload = scenario.payload();
      const initial =
        payload.kind === 'unsupported'
          ? { definition: payload.definition, readOnly: true as const }
          : { definition: payload.draft, status: payload.status, readOnly: payload.readOnly };
      const api = new SandboxJourneyApi(workspaceId, `sandbox_${scenario.id}`, initial);
      return new EditorSession({
        api,
        workspaceId,
        journeyId: `sandbox_${scenario.id}`,
        sandbox: true,
        scenarioId: scenario.id,
      });
    }
    return new EditorSession({ api: createJourneyApi(), workspaceId, journeyId });
  }, [sandbox, workspaceId, journeyId, scenario, scenarioId, importKey]);

  useEffect(() => {
    void session.load();
    return () => session.dispose();
  }, [session]);

  return (
    <EditorProvider session={session}>
      <BuilderShell sandbox={sandbox} scenario={scenario} onNavigate={navigate} />
    </EditorProvider>
  );
}

function BuilderShell({
  sandbox,
  scenario,
  onNavigate,
}: {
  sandbox: boolean;
  scenario: ScenarioDefinition;
  onNavigate: (to: string) => void;
}) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const state = useEditorState();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const workspaceId = params.workspaceId ?? '';
  const journeyId = params.journeyId ?? '';
  const scenarioId = searchParams.get('scenario') ?? DEFAULT_SCENARIO_ID;
  const fitViewRef = useRef<(() => void) | null>(null);
  const viewportRef = useRef<(() => { x: number; y: number; zoom: number }) | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);

  const guard = (run: () => void, options: Omit<PendingNavigation, 'run'>) => {
    if (state.dirty) setPendingNav({ run, ...options });
    else run();
  };

  const demoPath = (workspace: string, journey: string, id: string) =>
    `/workspaces/${workspace}/journeys/${journey}/demo?scenario=${encodeURIComponent(id)}`;

  const goBack = () => {
    guard(() => onNavigate('/'), {
      title: t('header.unsavedLeaveTitle'),
      description: t('header.unsavedLeaveDescription'),
      confirmLabel: t('header.discardAndLeave'),
    });
  };

  const selectScenario = (next: ScenarioDefinition) => {
    if (sandbox) {
      if (next.id === scenario.id) return;
      guard(() => onNavigate(demoPath(workspaceId, journeyId, next.id)), {
        title: t('examples.confirmTitle'),
        description: t('examples.confirmDescription'),
        confirmLabel: t('notices.loadExample'),
      });
      return;
    }
    guard(() => onNavigate(demoPath(workspaceId, journeyId, next.id)), {
      title: t('header.unsavedLeaveTitle'),
      description: t('header.unsavedLeaveDescription'),
      confirmLabel: t('header.discardAndLeave'),
    });
  };

  const openGallery = () => {
    if (sandbox) {
      setDemoOpen(true);
      return;
    }
    guard(() => onNavigate(demoPath(workspaceId, journeyId, scenarioId)), {
      title: t('header.unsavedLeaveTitle'),
      description: t('header.unsavedLeaveDescription'),
      confirmLabel: t('header.discardAndLeave'),
    });
  };

  const importDraft = (draft: unknown) => {
    try {
      sessionStorage.setItem(IMPORTED_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      return;
    }
    setImportOpen(false);
    onNavigate(`${demoPath(workspaceId, journeyId, 'imported')}&import=${Date.now()}`);
  };

  const exportJourney = () => {
    const viewport = viewportRef.current?.();
    const json = toJourneyDsl(state.draft, {
      journey: {
        id: state.document?.journeyId ?? journeyId,
        name: state.name,
        workspace: state.workspace?.id ?? workspaceId,
        version: state.document?.revision ?? 1,
        status: state.document?.status ?? 'draft',
      },
      ...(viewport ? { viewport } : {}),
    });
    setExportJson(JSON.stringify(json, null, 2));
    setExportOpen(true);
  };

  if (state.page === 'loading') return <LoadingState />;
  if (state.page === 'unsupported') {
    return (
      <UnsupportedState
        issues={state.unsupported?.issues ?? []}
        raw={state.unsupported?.raw}
        onBack={() => onNavigate('/')}
        onRetry={() => void session.reload()}
      />
    );
  }
  if (state.page !== 'ready') {
    return (
      <ErrorState
        kind={state.page}
        message={state.pageError}
        onBack={() => onNavigate('/')}
        onRetry={() => void session.reload()}
      />
    );
  }

  return (
    <div className="builder-main">
      <BuilderHeader
        onBack={goBack}
        onOpenGallery={openGallery}
        onSelectScenario={selectScenario}
        onImport={() => setImportOpen(true)}
        onExport={exportJourney}
        currentScenarioId={sandbox ? scenario.id : undefined}
      />

      {sandbox ? (
        <div className="sandbox-banner">
          <span aria-hidden>◐</span>
          <span>
            <strong>{t('demo.sandboxBanner')}</strong> {t(scenario.nameKey)}
          </span>
          <button type="button" className="text-button" onClick={() => setDemoOpen(true)}>
            {t('demo.openControls')}
          </button>
        </div>
      ) : null}

      {state.notice ? (
        <div className={cn(NOTICE_TONES[state.notice.tone])} role="status">
          <span>{t(state.notice.key, state.notice.params)}</span>
          <button type="button" className="text-button" onClick={() => session.clearNotice()}>
            {t('common.dismiss')}
          </button>
        </div>
      ) : null}

      <div className="builder-layout">
        <NodePalette />
        <Canvas fitViewRef={fitViewRef} viewportRef={viewportRef} />
        <PropertiesPanel />
      </div>

      <ImportJsonModal open={importOpen} onOpenChange={setImportOpen} onImported={importDraft} />
      <ExportJsonModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        json={exportJson}
        filename={`journey-${state.document?.journeyId ?? journeyId}.json`}
      />

      <DemoControls
        open={demoOpen}
        onOpenChange={setDemoOpen}
        scenario={scenario}
        onSelectScenario={(next) => {
          setDemoOpen(false);
          selectScenario(next);
        }}
      />

      <Modal
        open={pendingNav !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNav(null);
        }}
        title={pendingNav?.title ?? ''}
        description={pendingNav?.description}
        width="sm"
        footer={
          <>
            <button type="button" className="secondary" onClick={() => setPendingNav(null)}>
              {t('header.keepEditing')}
            </button>
            <button
              type="button"
              className="secondary danger"
              onClick={() => {
                const run = pendingNav?.run;
                setPendingNav(null);
                run?.();
              }}
            >
              {pendingNav?.confirmLabel ?? t('common.confirm')}
            </button>
          </>
        }
      />
    </div>
  );
}
