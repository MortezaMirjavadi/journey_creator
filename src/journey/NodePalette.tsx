import { useTranslation } from 'react-i18next';
import { NODE_REGISTRY, NODE_TYPE_LIST } from '@/domain/nodeRegistry';
import type { NodeType } from '@/domain/types';
import { useEditorSession, useEditorState } from '@/editor/EditorContext';
import { nextFreePosition } from '@/editor/layout';
import { NODE_DRAG_MIME } from './Canvas';
import { NODE_GLYPHS, categoryClass } from './icons';

export function NodePalette() {
  const { t } = useTranslation();
  const session = useEditorSession();
  const state = useEditorState();

  const existingTypes = new Set(state.draft.nodes.map((node) => node.type));

  const add = (type: NodeType) => {
    session.addNode(type, nextFreePosition(state.draft));
  };

  return (
    <aside className="palette" aria-label={t('palette.title')}>
      <h3>{t('palette.title')}</h3>
      {NODE_TYPE_LIST.map((type) => {
        const definition = NODE_REGISTRY[type];
        const singletonExists = definition.constraints.singleton && existingTypes.has(type);
        const disabled = state.readOnly || singletonExists;
        const reason = state.readOnly
          ? t('palette.disabledReadOnly')
          : singletonExists
            ? t('palette.singletonExists', { name: t(definition.labelKey) })
            : t(definition.descriptionKey);
        return (
          <button
            key={type}
            type="button"
            draggable={!disabled}
            disabled={disabled}
            aria-label={t('palette.addNode', { name: t(definition.labelKey) })}
            title={reason}
            onClick={() => add(type)}
            onDragStart={(event) => {
              event.dataTransfer.setData(NODE_DRAG_MIME, type);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            data-testid={`palette-${type}`}
            className="palette-item"
          >
            <span className={`node-icon ${categoryClass(definition.category)}`} aria-hidden>
              {NODE_GLYPHS[type]}
            </span>
            <span>{t(definition.labelKey)}</span>
          </button>
        );
      })}
      <p className="help">{t('palette.hint')}</p>
      {state.readOnly ? <p className="help">{t('palette.disabledReadOnly')}</p> : null}
    </aside>
  );
}
