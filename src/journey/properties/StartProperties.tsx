import { useTranslation } from 'react-i18next';
import type { StartNode } from '@/domain/types';
import { DisplayLabelField, FieldIssue, NodeDebugFields } from './shared';
import { issueForField, type PropertyEditorProps } from './helpers';

export function StartProperties({ node, disabled, issues, onConfig }: PropertyEditorProps) {
  const { t } = useTranslation();
  const start = node as StartNode;
  const config = start.config;
  const modeIssue = issueForField(issues, 'config.mode');
  return (
    <>
      <label className="field" htmlFor={`mode-${start.id}`}>
        {t('properties.startMode')}
        <select
          id={`mode-${start.id}`}
          data-field="config.mode"
          value={config.mode}
          disabled={disabled}
          onChange={(event) =>
            onConfig({ ...config, mode: event.target.value === 'event' ? 'event' : 'manual' })
          }
        >
          <option value="manual">{t('properties.startModeManual')}</option>
          <option value="event">{t('properties.startModeEvent')}</option>
        </select>
        <span className="help">{t('properties.startModeHelp')}</span>
        <FieldIssue issue={modeIssue} />
      </label>
      <DisplayLabelField node={start} disabled={disabled} onConfig={onConfig} />
      <NodeDebugFields node={start} />
    </>
  );
}
