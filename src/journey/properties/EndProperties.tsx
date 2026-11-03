import { useTranslation } from 'react-i18next';
import type { EndNode } from '@/domain/types';
import { DisplayLabelField, NodeDebugFields } from './shared';
import type { PropertyEditorProps } from './helpers';

export function EndProperties({ node, disabled, onConfig }: PropertyEditorProps) {
  const { t } = useTranslation();
  const end = node as EndNode;
  const id = `note-${end.id}`;
  const resultId = `result-${end.id}`;
  return (
    <>
      <label className="field" htmlFor={resultId}>
        {t('properties.endResult')}
        <select
          id={resultId}
          data-field="config.result"
          value={end.config.result ?? ''}
          disabled={disabled}
          onChange={(event) => {
            const next = { ...end.config };
            if (event.target.value === 'successful' || event.target.value === 'notSuccessful') {
              next.result = event.target.value;
            } else {
              delete next.result;
            }
            onConfig(next);
          }}
        >
          <option value="">{t('properties.endResultNone')}</option>
          <option value="successful">{t('properties.endResultSuccessful')}</option>
          <option value="notSuccessful">{t('properties.endResultNotSuccessful')}</option>
        </select>
        <span className="help">{t('properties.endResultHelp')}</span>
      </label>
      <label className="field" htmlFor={id}>
        {t('properties.noteLabel')}
        <textarea
          id={id}
          data-field="config.note"
          value={end.config.note}
          disabled={disabled}
          maxLength={500}
          placeholder={t('properties.notePlaceholder')}
          onChange={(event) => onConfig({ ...end.config, note: event.target.value })}
        />
        <span className="help">{t('properties.noteHelp')}</span>
      </label>
      <DisplayLabelField node={end} disabled={disabled} onConfig={onConfig} />
      <NodeDebugFields node={end} />
    </>
  );
}
