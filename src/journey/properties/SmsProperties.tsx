import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { estimateSegments, reconcileMappings, renderPreview, MOCK_PREVIEW_CONTACT } from '@/domain/sms';
import { CONTACT_FIELDS, type ContactField, type SmsNode } from '@/domain/types';
import {
  CatalogError,
  CatalogLoading,
  DisplayLabelField,
  FieldIssue,
  NodeDebugFields,
} from './shared';
import { issueForField, type PropertyEditorProps } from './helpers';

export function SmsProperties({
  node,
  disabled,
  issues,
  catalog,
  catalogState,
  onConfig,
  session,
}: PropertyEditorProps) {
  const { t } = useTranslation();
  const sms = node as SmsNode;
  const config = sms.config;
  const [pendingTemplate, setPendingTemplate] = useState<{ id: string; count: number } | null>(null);

  const templatesState = catalogState.templates.status;
  const template = catalog.templates.find((item) => item.id === config.templateVersionId);
  const templateForeign = template && template.workspaceId !== catalog.workspaceId;
  const templateMissing = Boolean(config.templateVersionId) && !template && templatesState === 'ready';
  const templateIssue = issueForField(issues, 'config.templateVersionId');

  const sortedTemplates = [...catalog.templates].sort((a, b) => {
    if (a.workspaceId === catalog.workspaceId && b.workspaceId !== catalog.workspaceId) return -1;
    if (b.workspaceId === catalog.workspaceId && a.workspaceId !== catalog.workspaceId) return 1;
    return a.name.localeCompare(b.name);
  });

  const applyTemplate = (id: string) => {
    if (!id) {
      onConfig({ ...config, templateVersionId: '', variableMappings: {} });
      return;
    }
    const next = catalog.templates.find((item) => item.id === id);
    const { mappings } = reconcileMappings(config.variableMappings, next?.variables ?? []);
    onConfig({ ...config, templateVersionId: id, variableMappings: mappings });
  };

  const requestTemplate = (id: string) => {
    if (!id) {
      applyTemplate('');
      return;
    }
    const next = catalog.templates.find((item) => item.id === id);
    if (!next) {
      onConfig({ ...config, templateVersionId: id });
      return;
    }
    const { removed } = reconcileMappings(config.variableMappings, next.variables);
    if (removed.length > 0) {
      setPendingTemplate({ id, count: removed.length });
    } else {
      applyTemplate(id);
    }
  };

  const setMapping = (variable: string, value: string) => {
    const mappings = { ...config.variableMappings };
    if (!value) {
      delete mappings[variable];
    } else if (value === 'literal') {
      const existing = mappings[variable];
      mappings[variable] = {
        kind: 'literal',
        value: existing?.kind === 'literal' ? existing.value : '',
      };
    } else {
      mappings[variable] = { kind: 'contact', field: value as ContactField };
    }
    onConfig({ ...config, variableMappings: mappings });
  };

  const setLiteral = (variable: string, value: string) => {
    onConfig({
      ...config,
      variableMappings: { ...config.variableMappings, [variable]: { kind: 'literal', value } },
    });
  };

  const removeMapping = (variable: string) => {
    const mappings = { ...config.variableMappings };
    delete mappings[variable];
    onConfig({ ...config, variableMappings: mappings });
  };

  const preview = template ? renderPreview(template.body, config.variableMappings) : null;
  const estimate = preview ? estimateSegments(preview.plainText) : null;
  const unknownMappings = template
    ? Object.keys(config.variableMappings).filter((variable) => !template.variables.includes(variable))
    : [];

  return (
    <>
      <label className="field" htmlFor={`template-${sms.id}`}>
        {t('properties.templateLabel')} *
        <select
          id={`template-${sms.id}`}
          data-field="config.templateVersionId"
          value={config.templateVersionId}
          disabled={disabled || templatesState !== 'ready'}
          aria-invalid={templateIssue?.severity === 'error' || undefined}
          onChange={(event) => requestTemplate(event.target.value)}
        >
          <option value="">{t('properties.templatePlaceholder')}</option>
          {sortedTemplates.map((item) => {
            const foreign = item.workspaceId !== catalog.workspaceId;
            return (
              <option key={item.id} value={item.id}>
                {item.name} · v{item.versionNumber}
                {foreign ? ` (${t('properties.listOtherWorkspace')})` : ''}
              </option>
            );
          })}
          {templateMissing ? (
            <option value={config.templateVersionId}>
              {t('properties.templateUnavailable')} ({config.templateVersionId})
            </option>
          ) : null}
        </select>
        <span className="help">{t('properties.templateHelp')}</span>
      </label>

      {templatesState === 'loading' ? <CatalogLoading label={t('properties.templateLoading')} /> : null}
      {templatesState === 'error' ? (
        <CatalogError
          message={t('properties.templateError')}
          retryLabel={t('properties.templateRetry')}
          onRetry={() => void session.loadCatalogs()}
        />
      ) : null}
      {templatesState === 'ready' && catalog.templates.length === 0 ? (
        <p className="help">{t('properties.templateEmpty')}</p>
      ) : null}

      <FieldIssue issue={templateIssue} />

      {!config.templateVersionId ? <p className="help">{t('properties.templateNoSelection')}</p> : null}

      {template ? (
        <>
          <h3>{t('properties.templateBody')}</h3>
          <div className="template-body">{template.body || '—'}</div>
          {templateForeign ? <p className="field-error">{t('properties.templateForeign')}</p> : null}
          {template.body.trim().length === 0 ? (
            <p className="field-warning">{t('validation.templateEmpty')}</p>
          ) : null}

          <h3>{t('properties.variableMappings')}</h3>
          <p className="help">{t('properties.variableMappingsHelp')}</p>
          {template.variables.length === 0 ? (
            <p className="help">{t('properties.templateNoVariables')}</p>
          ) : (
            template.variables.map((variable) => {
              const mapping = config.variableMappings[variable];
              const field = `config.variableMappings.${variable}`;
              const issue = issueForField(issues, field);
              const value = !mapping ? '' : mapping.kind === 'contact' ? mapping.field : 'literal';
              return (
                <div key={variable} className="field">
                  <code>{`{{${variable}}}`}</code>
                  <div className="two-col" style={{ marginTop: 6 }}>
                    <select
                      data-field={field}
                      aria-label={`${t('properties.mappingType')}: ${variable}`}
                      value={value}
                      disabled={disabled}
                      aria-invalid={issue?.severity === 'error' || undefined}
                      onChange={(event) => setMapping(variable, event.target.value)}
                    >
                      <option value="">{t('properties.mappingMissing')}</option>
                      {CONTACT_FIELDS.map((contactField) => (
                        <option key={contactField} value={contactField}>
                          {t(`contactFields.${contactField}`)}
                        </option>
                      ))}
                      <option value="literal">{t('properties.mappingLiteral')}</option>
                    </select>
                    {mapping?.kind === 'literal' ? (
                      <input
                        data-field={field}
                        aria-label={`${t('properties.mappingLiteral')}: ${variable}`}
                        value={mapping.value}
                        disabled={disabled}
                        placeholder={t('properties.mappingLiteralPlaceholder')}
                        aria-invalid={issue?.severity === 'error' || undefined}
                        onChange={(event) => setLiteral(variable, event.target.value)}
                      />
                    ) : null}
                  </div>
                  <FieldIssue issue={issue} />
                </div>
              );
            })
          )}

          {unknownMappings.length > 0 ? (
            <div className="info">
              <p>{t('properties.mappingUnknown')}</p>
              {unknownMappings.map((variable) => (
                <div key={variable} className="detail-row">
                  <span>
                    <code>{`{{${variable}}}`}</code>
                  </span>
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={disabled}
                    onClick={() => removeMapping(variable)}
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <h3>{t('properties.previewTitle')}</h3>
          <p className="help">
            {t('properties.previewContact', { name: MOCK_PREVIEW_CONTACT.firstName ?? '—' })}
          </p>
          <div className="template-body">
            {preview && template.body.trim().length > 0 ? (
              preview.tokens.map((token, index) => {
                if (token.kind === 'text') return <span key={index}>{token.text}</span>;
                if (token.kind === 'unresolved') {
                  return (
                    <mark
                      key={index}
                      style={{ background: '#fff3dc', color: '#a98945', padding: '0 2px' }}
                      title={t('properties.previewUnresolved', { variable: token.variable })}
                    >
                      {`{{${token.variable}}}`}
                    </mark>
                  );
                }
                return (
                  <span
                    key={index}
                    style={{ background: '#f2f3f7', color: '#8a8c9c', padding: '0 2px' }}
                    title={t('properties.previewMissingValue', { field: token.field })}
                  >
                    [{t('properties.previewMissingValue', { field: token.field })}]
                  </span>
                );
              })
            ) : (
              <span className="help">{t('properties.previewUnavailable')}</span>
            )}
          </div>
          {preview && preview.unresolvedVariables.length > 0 ? (
            <ul className="warn-list">
              {preview.unresolvedVariables.map((variable) => (
                <li key={variable}>{t('properties.previewUnresolved', { variable })}</li>
              ))}
            </ul>
          ) : null}
          {preview && preview.missingPreviewFields.length > 0 ? (
            <p className="help">
              {preview.missingPreviewFields
                .map((field) => t('properties.previewMissingValue', { field }))
                .join(' · ')}
            </p>
          ) : null}
          {estimate ? (
            <p className="help">
              {t('properties.segments', {
                segments: estimate.segments,
                encoding: estimate.encoding,
                units: estimate.units,
              })}{' '}
              · {t('properties.segmentEstimate')}
            </p>
          ) : null}
        </>
      ) : null}

      <DisplayLabelField node={sms} disabled={disabled} onConfig={onConfig} />
      <NodeDebugFields node={sms} />

      <Modal
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null);
        }}
        title={t('properties.templateChangeTitle')}
        description={t('properties.templateChangeDescription')}
        width="sm"
        footer={
          <>
            <button type="button" className="secondary" onClick={() => setPendingTemplate(null)}>
              {t('properties.templateChangeKeep')}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (pendingTemplate) applyTemplate(pendingTemplate.id);
                setPendingTemplate(null);
              }}
            >
              {t('properties.templateChangeConfirm')}
            </button>
          </>
        }
      >
        <p className="field-warning">
          {t('properties.templateChangeWarning', { count: pendingTemplate?.count ?? 0 })}
        </p>
      </Modal>
    </>
  );
}
