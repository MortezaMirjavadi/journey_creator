import { useTranslation } from 'react-i18next';
import type { SplitNode } from '@/domain/types';
import { DisplayLabelField, FieldIssue, NodeDebugFields } from './shared';
import { issueForField, type PropertyEditorProps } from './helpers';

export function SplitProperties({ node, disabled, issues, onConfig }: PropertyEditorProps) {
  const { t } = useTranslation();
  const split = node as SplitNode;
  const config = split.config;
  const issue = issueForField(issues, 'config.controlPercentage');
  return (
    <>
      <label className="field" htmlFor={`control-${split.id}`}>
        {t('properties.controlPercentage')}
        <input
          id={`control-${split.id}`}
          data-field="config.controlPercentage"
          type="number"
          min={0}
          max={100}
          step={1}
          value={config.controlPercentage}
          disabled={disabled}
          aria-invalid={issue?.severity === 'error' || undefined}
          onChange={(event) =>
            onConfig({ ...config, controlPercentage: Number(event.target.value) })
          }
        />
        <span className="help">{t('properties.controlPercentageHelp')}</span>
        <FieldIssue issue={issue} />
      </label>
      <DisplayLabelField node={split} disabled={disabled} onConfig={onConfig} />
      <NodeDebugFields node={split} />
    </>
  );
}
