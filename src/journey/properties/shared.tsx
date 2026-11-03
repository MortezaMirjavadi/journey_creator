import { useTranslation } from 'react-i18next';
import type { JourneyNode, JourneyNodeConfig, ValidationIssue } from '@/domain/types';
import { issueText } from './helpers';

export function FieldIssue({ issue }: { issue?: ValidationIssue }) {
  const { t } = useTranslation();
  if (!issue) return null;
  return (
    <span className={issue.severity === 'warning' ? 'field-warning' : 'field-error'} role={issue.severity === 'warning' ? 'status' : 'alert'}>
      {issueText(issue, t)}
    </span>
  );
}

export function DisplayLabelField({
  node,
  disabled,
  onConfig,
}: {
  node: JourneyNode;
  disabled: boolean;
  onConfig: (config: JourneyNodeConfig) => void;
}) {
  const { t } = useTranslation();
  const id = `label-${node.id}`;
  return (
    <label className="field" htmlFor={id}>
      {t('properties.displayLabel')}
      <input
        id={id}
        data-field="config.label"
        value={node.config.label}
        disabled={disabled}
        placeholder={t('properties.displayLabelPlaceholder')}
        maxLength={80}
        onChange={(event) => onConfig({ ...node.config, label: event.target.value })}
      />
      <span className="help">{t('properties.displayLabelHelp')}</span>
    </label>
  );
}

export function NodeDebugFields({ node }: { node: JourneyNode }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="divider" />
      <h3 style={{ margin: '0 0 6px' }}>{t('properties.advanced')}</h3>
      <div className="detail-row">
        <span>{t('properties.nodeId')}</span>
        <strong>
          <code>{node.id}</code>
        </strong>
      </div>
      <div className="detail-row">
        <span>{t('properties.nodeType')}</span>
        <strong>
          {node.type}@{node.typeVersion}
        </strong>
      </div>
    </>
  );
}

export function CatalogLoading({ label }: { label: string }) {
  return (
    <p className="help">
      <span className="spinner inline" aria-hidden />
      {label}
    </p>
  );
}

export function CatalogError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <span className="field-error">
      {message}{' '}
      <button type="button" className="text-button" onClick={onRetry}>
        {retryLabel}
      </button>
    </span>
  );
}
