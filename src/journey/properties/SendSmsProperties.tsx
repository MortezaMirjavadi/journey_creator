import { useTranslation } from 'react-i18next';
import { estimateSegments } from '@/domain/sms';
import type { SendSmsNode } from '@/domain/types';
import { DisplayLabelField, FieldIssue, NodeDebugFields } from './shared';
import { issueForField, type PropertyEditorProps } from './helpers';

export function SendSmsProperties({ node, disabled, issues, onConfig }: PropertyEditorProps) {
  const { t } = useTranslation();
  const sms = node as SendSmsNode;
  const config = sms.config;
  const bodyIssue = issueForField(issues, 'config.body');
  const expiryIssue = issueForField(issues, 'config.expiryHours');
  const estimate = estimateSegments(config.body);
  return (
    <>
      <label className="field" htmlFor={`body-${sms.id}`}>
        {t('properties.smsBody')}
        <textarea
          id={`body-${sms.id}`}
          data-field="config.body"
          value={config.body}
          disabled={disabled}
          aria-invalid={bodyIssue?.severity === 'error' || undefined}
          onChange={(event) => onConfig({ ...config, body: event.target.value })}
        />
        <span className="help">
          {t('properties.segments', {
            segments: estimate.segments,
            encoding: estimate.encoding,
            units: estimate.units,
          })}{' '}
          · {t('properties.segmentEstimate')}
        </span>
        <FieldIssue issue={bodyIssue} />
      </label>

      <label className="field" htmlFor={`expiry-${sms.id}`}>
        {t('properties.expiryHours')}
        <input
          id={`expiry-${sms.id}`}
          data-field="config.expiryHours"
          type="number"
          min={0}
          step={1}
          value={config.expiryHours}
          disabled={disabled}
          aria-invalid={expiryIssue?.severity === 'error' || undefined}
          onChange={(event) => onConfig({ ...config, expiryHours: Number(event.target.value) })}
        />
        <span className="help">{t('properties.expiryHoursHelp')}</span>
        <FieldIssue issue={expiryIssue} />
      </label>

      <DisplayLabelField node={sms} disabled={disabled} onConfig={onConfig} />
      <NodeDebugFields node={sms} />
    </>
  );
}
