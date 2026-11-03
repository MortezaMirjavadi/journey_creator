import { useEffect, useMemo, useRef, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { NODE_REGISTRY } from '@/domain/nodeRegistry';
import type { NodeType } from '@/domain/types';
import { useEditorSession, useEditorState } from '@/editor/EditorContext';
import { buildCatalogContext } from '@/editor/session';
import { EndProperties } from './properties/EndProperties';
import { EntryProperties } from './properties/EntryProperties';
import { MetadataEditor } from './properties/MetadataEditor';
import { SendSmsProperties } from './properties/SendSmsProperties';
import { SmsProperties } from './properties/SmsProperties';
import { SplitProperties } from './properties/SplitProperties';
import { StartProperties } from './properties/StartProperties';
import { WaitForEventProperties } from './properties/WaitForEventProperties';
import type { PropertyEditorProps } from './properties/helpers';
import { NODE_GLYPHS, categoryClass } from './icons';
import { ValidationSection } from './ValidationPanel';

const EDITORS: Record<NodeType, ComponentType<PropertyEditorProps>> = {
  'entry.static_list': EntryProperties,
  'action.sms': SmsProperties,
  start: StartProperties,
  split: SplitProperties,
  sendSms: SendSmsProperties,
  waitForEvent: WaitForEventProperties,
  end: EndProperties,
};

export function PropertiesPanel() {
  const { t } = useTranslation();
  const session = useEditorSession();
  const state = useEditorState();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const catalog = useMemo(() => buildCatalogContext(state), [state]);

  const focusRequest = state.focusRequest;
  useEffect(() => {
    if (!focusRequest) return;
    const root = panelRef.current;
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-field]'));
    const target = focusRequest.field
      ? elements.find((element) => element.dataset.field === focusRequest.field)
      : root.querySelector<HTMLElement>('input, select, textarea, button');
    target?.focus();
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [focusRequest]);

  const selectedNode =
    state.selection.nodeIds.length === 1
      ? state.draft.nodes.find((node) => node.id === state.selection.nodeIds[0])
      : undefined;
  const selectedEdge =
    state.selection.edgeIds.length === 1
      ? state.draft.edges.find((edge) => edge.id === state.selection.edgeIds[0])
      : undefined;
  const multiCount = state.selection.nodeIds.length;

  const nodeLabel = (id: string) => {
    const node = state.draft.nodes.find((item) => item.id === id);
    if (!node) return id;
    return node.config.label?.trim() || t(NODE_REGISTRY[node.type].labelKey);
  };

  return (
    <aside ref={panelRef} className="node-inspector" aria-label={t('properties.title')}>
      {selectedNode ? (
        <header className="inspector-head">
          <span className={`node-icon ${categoryClass(NODE_REGISTRY[selectedNode.type].category)}`} aria-hidden>
            {NODE_GLYPHS[selectedNode.type]}
          </span>
          <div>
            <span className="eyebrow">{t(NODE_REGISTRY[selectedNode.type].labelKey)}</span>
            <h3>{selectedNode.id}</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => session.clearSelection()}
            aria-label={t('a11y.closePanel')}
          >
            ×
          </button>
        </header>
      ) : selectedEdge ? (
        <header className="inspector-head">
          <span className="node-icon end" aria-hidden>
            ⇄
          </span>
          <div>
            <span className="eyebrow">{t('common.edge')}</span>
            <h3>{selectedEdge.id}</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => session.clearSelection()}
            aria-label={t('a11y.closePanel')}
          >
            ×
          </button>
        </header>
      ) : null}

      {multiCount > 1 ? (
        <div className="inspector-empty" style={{ textAlign: 'center' }}>
          <span>◇</span>
          <h3>{t('properties.multiTitle', { count: multiCount })}</h3>
          <p>{t('properties.multiDescription')}</p>
        </div>
      ) : selectedNode ? (
        <div className="inspector-fields">
          {state.readOnly ? <div className="info">{t('properties.readOnlyNotice')}</div> : null}
          {(() => {
            const Editor = EDITORS[selectedNode.type];
            return (
              <Editor
                key={selectedNode.id}
                node={selectedNode}
                disabled={state.readOnly}
                issues={state.validation.issues.filter((issue) => issue.nodeId === selectedNode.id)}
                catalog={catalog}
                catalogState={state.catalogs}
                workspaces={state.workspaces}
                onConfig={(config) => session.updateNodeConfig(selectedNode.id, config)}
                session={session}
              />
            );
          })()}
          <MetadataEditor
            key={`node-meta-${selectedNode.id}-${JSON.stringify(selectedNode.meta ?? {})}`}
            value={selectedNode.meta}
            disabled={state.readOnly}
            onApply={(meta) => session.updateNodeMeta(selectedNode.id, meta)}
          />
          <div className="inspector-footer">
            {NODE_REGISTRY[selectedNode.type].constraints.duplicateable && !state.readOnly ? (
              <button
                type="button"
                className="text-button"
                onClick={() => session.duplicateNode(selectedNode.id)}
              >
                {t('properties.duplicateNode')}
              </button>
            ) : null}
            {!state.readOnly ? (
              <button
                type="button"
                className="text-button danger"
                onClick={() => session.removeNodes([selectedNode.id])}
              >
                {t('properties.deleteNode')}
              </button>
            ) : null}
          </div>
        </div>
      ) : selectedEdge ? (
        <div className="inspector-fields">
          <div className="detail-row">
            <span>{t('common.edge')}</span>
            <strong>
              {nodeLabel(selectedEdge.source)} → {nodeLabel(selectedEdge.target)}
            </strong>
          </div>
          <div className="detail-row">
            <span>{t('common.type')}</span>
            <strong>
              <code>{selectedEdge.sourcePort}</code>
            </strong>
          </div>
          <div className="detail-row">
            <span>{t('common.id')}</span>
            <strong>
              <code>{selectedEdge.id}</code>
            </strong>
          </div>
          <MetadataEditor
            key={`edge-meta-${selectedEdge.id}-${JSON.stringify(selectedEdge.meta ?? {})}`}
            value={selectedEdge.meta}
            disabled={state.readOnly}
            label={t('properties.edgeMetadata')}
            onApply={(meta) => session.updateEdgeMeta(selectedEdge.id, meta)}
          />
          {!state.readOnly ? (
            <div className="inspector-footer">
              <button
                type="button"
                className="text-button danger"
                onClick={() => session.removeEdges([selectedEdge.id])}
              >
                {t('common.delete')}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="inspector-empty" style={{ textAlign: 'center' }}>
            <span>◇</span>
            <h3>{t('properties.emptyTitle')}</h3>
            <p>{t('properties.emptyDescription')}</p>
          </div>
          <div className="inspector-fields" style={{ paddingTop: 0 }}>
            <h3 style={{ marginTop: 0 }}>{t('properties.journeyMetadata')}</h3>
            <MetadataEditor
              key={`draft-meta-${JSON.stringify(state.draft.meta ?? {})}`}
              value={state.draft.meta}
              disabled={state.readOnly}
              label={t('properties.journeyMetadata')}
              onApply={(meta) => session.updateDraftMeta(meta)}
            />
          </div>
        </>
      )}

      <ValidationSection />
    </aside>
  );
}
