import { useTranslation } from 'react-i18next';
import type { WaitForEventNode } from '@/domain/types';
import { DisplayLabelField, FieldIssue, NodeDebugFields } from './shared';
import { issueForField, type PropertyEditorProps } from './helpers';

export function WaitForEventProperties({ node, disabled, issues, onConfig }: PropertyEditorProps) {
  const { t } = useTranslation();
  const wait = node as WaitForEventNode;
  const config = wait.config;
  const sourceIssue = issueForField(issues, 'config.event.sourceName');
  const ventureIssue = issueForField(issues, 'config.event.venture');
  const valueIssue = issueForField(issues, 'config.maxWait.value');
  const unitIssue = issueForField(issues, 'config.maxWait.unit');
  return (
    <>
      <label className="field" htmlFor={`event-source-${wait.id}`}>
        {t('properties.eventSource')}
        <input
          id={`event-source-${wait.id}`}
          data-field="config.event.sourceName"
          value={config.event.sourceName}
          disabled={disabled}
          aria-invalid={sourceIssue?.severity === 'error' || undefined}
          onChange={(event) =>
            onConfig({ ...config, event: { ...config.event, sourceName: event.target.value } })
          }
        />
        <span className="help">{t('properties.eventSourceHelp')}</span>
        <FieldIssue issue={sourceIssue} />
      </label>

      <label className="field" htmlFor={`event-venture-${wait.id}`}>
        {t('properties.eventVenture')}
        <input
          id={`event-venture-${wait.id}`}
          data-field="config.event.venture"
          value={config.event.venture}
          disabled={disabled}
          aria-invalid={ventureIssue?.severity === 'error' || undefined}
          onChange={(event) =>
            onConfig({ ...config, event: { ...config.event, venture: event.target.value } })
          }
        />
        <FieldIssue issue={ventureIssue} />
      </label>

      <div className="two-col">
        <label className="field" htmlFor={`maxwait-value-${wait.id}`}>
          {t('properties.maxWaitValue')}
          <input
            id={`maxwait-value-${wait.id}`}
            data-field="config.maxWait.value"
            type="number"
            min={1}
            step={1}
            value={config.maxWait.value}
            disabled={disabled}
            aria-invalid={valueIssue?.severity === 'error' || undefined}
            onChange={(event) =>
              onConfig({ ...config, maxWait: { ...config.maxWait, value: Number(event.target.value) } })
            }
          />
          <FieldIssue issue={valueIssue} />
        </label>
        <label className="field" htmlFor={`maxwait-unit-${wait.id}`}>
          {t('properties.maxWaitUnit')}
          <select
            id={`maxwait-unit-${wait.id}`}
            data-field="config.maxWait.unit"
            value={config.maxWait.unit}
            disabled={disabled}
            aria-invalid={unitIssue?.severity === 'error' || undefined}
            onChange={(event) =>
              onConfig({
                ...config,
                maxWait: { ...config.maxWait, unit: event.target.value === 'hours' ? 'hours' : 'days' },
              })
            }
          >
            <option value="hours">{t('properties.unitHours')}</option>
            <option value="days">{t('properties.unitDays')}</option>
          </select>
          <FieldIssue issue={unitIssue} />
        </label>
      </div>

      <DisplayLabelField node={wait} disabled={disabled} onConfig={onConfig} />
      <NodeDebugFields node={wait} />
    </>
  );
}
