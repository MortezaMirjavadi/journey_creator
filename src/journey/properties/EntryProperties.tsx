import { useTranslation } from 'react-i18next';
import type { EntryStaticListNode } from '@/domain/types';
import {
  CatalogError,
  CatalogLoading,
  DisplayLabelField,
  FieldIssue,
  NodeDebugFields,
} from './shared';
import { formatCount, issueForField, workspaceName, type PropertyEditorProps } from './helpers';

export function EntryProperties({
  node,
  disabled,
  issues,
  catalog,
  catalogState,
  workspaces,
  onConfig,
  session,
}: PropertyEditorProps) {
  const { t, i18n } = useTranslation();
  const entry = node as EntryStaticListNode;
  const config = entry.config;
  const selectId = `list-${entry.id}`;

  const listsState = catalogState.lists.status;
  const selected = catalog.lists.find((list) => list.id === config.listId);
  const selectedForeign = selected && selected.workspaceId !== catalog.workspaceId;
  const selectedMissing = Boolean(config.listId) && !selected && listsState === 'ready';
  const issue = issueForField(issues, 'config.listId');
  const isEmpty = selected && selected.memberCount === 0 && !selectedForeign;

  const sortedLists = [...catalog.lists].sort((a, b) => {
    if (a.workspaceId === catalog.workspaceId && b.workspaceId !== catalog.workspaceId) return -1;
    if (b.workspaceId === catalog.workspaceId && a.workspaceId !== catalog.workspaceId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <label className="field" htmlFor={selectId}>
        {t('properties.listLabel')} *
        <select
          id={selectId}
          data-field="config.listId"
          value={config.listId}
          disabled={disabled || listsState !== 'ready'}
          aria-invalid={issue?.severity === 'error' || undefined}
          onChange={(event) => onConfig({ ...config, listId: event.target.value })}
        >
          <option value="">{t('properties.listPlaceholder')}</option>
          {sortedLists.map((list) => {
            const foreign = list.workspaceId !== catalog.workspaceId;
            return (
              <option key={list.id} value={list.id}>
                {list.name} ·{' '}
                {t('properties.listMembers', { count: formatCount(list.memberCount, i18n.language) })}
                {foreign ? ` (${t('properties.listOtherWorkspace')})` : ''}
              </option>
            );
          })}
          {selectedMissing ? (
            <option value={config.listId}>
              {t('properties.listUnavailable')} ({config.listId})
            </option>
          ) : null}
        </select>
        <span className="help">{t('properties.listHelp')}</span>
      </label>

      {listsState === 'loading' ? <CatalogLoading label={t('properties.listLoading')} /> : null}
      {listsState === 'error' ? (
        <CatalogError
          message={t('properties.listError')}
          retryLabel={t('properties.listRetry')}
          onRetry={() => void session.loadCatalogs()}
        />
      ) : null}
      {listsState === 'ready' && catalog.lists.length === 0 ? (
        <p className="help">{t('properties.listEmpty')}</p>
      ) : null}

      <FieldIssue issue={issue} />

      {!config.listId ? <p className="help">{t('properties.listNoSelection')}</p> : null}

      {selected ? (
        <div className="info">
          <strong style={{ color: '#4b657e' }}>{selected.name}</strong>
          <p>
            {workspaceName(workspaces, selected.workspaceId)} ·{' '}
            {t('properties.listMembers', {
              count: formatCount(selected.memberCount, i18n.language),
            })}{' '}
            · {t('common.informational')}
          </p>
          {selectedForeign ? <p className="error">{t('properties.listForeign')}</p> : null}
          {isEmpty ? <p className="field-warning">{t('properties.listEmptyWarning')}</p> : null}
        </div>
      ) : null}

      {selectedMissing ? <p className="field-error">{t('properties.listUnavailable')}</p> : null}

      <DisplayLabelField node={entry} disabled={disabled} onConfig={onConfig} />
      <NodeDebugFields node={entry} />
    </>
  );
}
