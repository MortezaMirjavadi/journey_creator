import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import type { ScenarioDefinition } from '@/demo/scenarios';
import { useEditorSession, useEditorState } from '@/editor/EditorContext';
import { ExamplesMenu } from './ExamplesMenu';

export interface BuilderHeaderProps {
  onBack: () => void;
  onOpenGallery: () => void;
  onSelectScenario: (scenario: ScenarioDefinition) => void;
  onImport: () => void;
  onExport: () => void;
  currentScenarioId?: string;
}

export function BuilderHeader({
  onBack,
  onOpenGallery,
  onSelectScenario,
  onImport,
  onExport,
  currentScenarioId,
}: BuilderHeaderProps) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const state = useEditorState();
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const errorCount = state.validation.errors.length;
  const isPublished = state.document?.status === 'published' || state.publishState === 'published';
  const canPublish = Boolean(state.workspace?.canPublish) && !state.readOnly;
  const publishing = state.publishState === 'publishing' || state.publishState === 'validating';
  const successOpen =
    state.publishState === 'published' &&
    Boolean(state.publishedVersion) &&
    dismissedVersion !== state.publishedVersion?.id;

  const publishDisabledReason = state.readOnly
    ? t('header.publishBlockedReadOnly')
    : !state.workspace?.canPublish
      ? t('header.publishBlockedPermission')
      : errorCount > 0
        ? t('header.publishBlocked', { count: errorCount })
        : undefined;

  const readOnlyReason = state.readOnlyReason
    ? t(`header.readOnlyReason.${state.readOnlyReason}`)
    : '';

  const draftText =
    state.saveState === 'conflict'
      ? t('header.saveStatus.conflict')
      : state.saveState === 'saving'
        ? t('header.saveStatus.saving')
        : state.saveState === 'error'
          ? t('header.saveStatus.error')
          : state.dirty
            ? t('header.saveStatus.dirty')
            : t('header.savedRevision', { revision: state.document?.revision ?? 1 });

  const dotClass =
    state.saveState === 'conflict' || state.saveState === 'error'
      ? 'dot err'
      : state.dirty || state.saveState === 'saving'
        ? 'dot'
        : 'dot ok';

  return (
    <>
      <div className="builder-top">
        <button type="button" className="back-link" onClick={onBack} aria-label={t('header.backToJourneys')}>
          ← {t('nav.journeys')}
        </button>
        <input
          className="journey-title"
          value={state.name}
          readOnly
          aria-label={t('header.journeyName')}
          title={state.name}
        />
        <span className={`badge ${isPublished ? 'green' : ''}`}>
          {isPublished ? t('common.published') : t('common.draft')}
        </span>
        {state.sandbox ? <span className="badge">Sandbox</span> : null}
        {state.readOnly ? <span className="badge line">{t('common.readOnly')}</span> : null}
        <div className="draft-indicator">
          <span className={dotClass} />
          {draftText}
        </div>
        <div className="actions">
          {state.saveState === 'conflict' ? (
            <button type="button" className="secondary" onClick={() => void session.reload()}>
              {t('header.conflictReload')}
            </button>
          ) : null}
          <ExamplesMenu
            currentScenarioId={currentScenarioId}
            onSelect={onSelectScenario}
            onOpenGallery={onOpenGallery}
            onImport={onImport}
            onExport={onExport}
          />
          <button type="button" className="secondary" onClick={() => void session.validate()}>
            {t('common.validate')}
            {errorCount > 0 ? ` (${errorCount})` : ''}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setPublishConfirmOpen(true)}
            disabled={!canPublish || publishing || errorCount > 0}
            title={publishDisabledReason}
          >
            {publishing ? t('header.publishing') : t('common.publish')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void session.save(true)}
            disabled={state.readOnly || state.saveState === 'saving'}
            title={state.readOnly ? t('header.saveBlockedReadOnly') : undefined}
          >
            {state.saveState === 'saving' ? t('header.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {state.readOnly ? (
        <div className="notice info">
          <span>{t('header.readOnlyBanner', { reason: readOnlyReason })}</span>
        </div>
      ) : null}

      {state.saveState === 'conflict' ? (
        <div className="conflict">
          <span>
            <strong>{t('header.conflictTitle')}.</strong>{' '}
            {t('header.conflictDescription', {
              revision: state.conflict?.currentRevision ?? state.document?.revision ?? '?',
            })}
          </span>
          <button type="button" className="text-button" onClick={() => void session.reload()}>
            {t('header.conflictReload')}
          </button>
        </div>
      ) : null}

      {state.saveState === 'error' ? (
        <div className="notice error">
          <span>
            <strong>{t('header.saveFailedTitle')}.</strong> {state.saveError}
          </span>
          <button type="button" className="text-button" onClick={() => session.retrySave()}>
            {t('header.retrySave')}
          </button>
        </div>
      ) : null}

      {state.publishState === 'error' ? (
        <div className="notice error">
          <span>
            <strong>{t('header.publishFailedTitle')}.</strong> {state.publishError}
          </span>
          <button type="button" className="text-button" onClick={() => session.dismissPublishError()}>
            {t('common.dismiss')}
          </button>
        </div>
      ) : null}

      {state.publishState === 'validation_failed' ? (
        <div className="notice warning">{t('header.publishValidationFailed')}</div>
      ) : null}

      <Modal
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
        title={t('a11y.publishConfirmTitle')}
        description={t('a11y.publishConfirmDescription', {
          revision: state.document?.revision ?? 1,
        })}
        width="sm"
        footer={
          <>
            <button type="button" className="secondary" onClick={() => setPublishConfirmOpen(false)}>
              {t('a11y.cancelPublish')}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setPublishConfirmOpen(false);
                void session.publish();
              }}
            >
              {t('a11y.confirmPublish')}
            </button>
          </>
        }
      >
        <p className="info">{t('header.simulatedPublish')}</p>
      </Modal>

      <Modal
        open={successOpen}
        onOpenChange={(open) => {
          if (!open && state.publishedVersion) setDismissedVersion(state.publishedVersion.id);
        }}
        title={t('a11y.publishSuccessTitle', {
          version: state.publishedVersion?.versionNumber ?? 1,
        })}
        description={t('a11y.publishSuccessDescription')}
        width="sm"
        footer={
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (state.publishedVersion) setDismissedVersion(state.publishedVersion.id);
            }}
          >
            {t('a11y.closeSuccess')}
          </button>
        }
      >
        <p className="info">{t('header.simulatedPublish')}</p>
      </Modal>
    </>
  );
}
