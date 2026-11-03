import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readMeta, type DraftParseIssue } from '@/domain/serialization';
import type { JsonObject } from '@/domain/types';

/**
 * Small JSON editor for the persisted `meta` object. Applies on blur or via the
 * Apply action; invalid JSON (or non-JSON values / oversized objects) never
 * overwrites the document.
 */
export function MetadataEditor({
  value,
  disabled,
  label,
  help,
  onApply,
}: {
  value?: JsonObject;
  disabled: boolean;
  label?: string;
  help?: string;
  onApply: (meta: JsonObject | undefined) => void;
}) {
  const { t } = useTranslation();
  const valueText = value && Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : '';
  const [text, setText] = useState(valueText);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (disabled) return;
    if (text.trim().length === 0) {
      setError(null);
      onApply(undefined);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError(t('properties.metadataInvalidJson'));
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setError(t('properties.metadataInvalidObject'));
      return;
    }
    const issues: DraftParseIssue[] = [];
    const meta = readMeta(parsed, issues, 'meta');
    if (issues.length > 0) {
      setError(issues[0].message);
      return;
    }
    setError(null);
    onApply(meta);
  };

  return (
    <div className="field">
      <span>{label ?? t('properties.metadata')}</span>
      <textarea
        data-field="meta"
        className="metadata-input"
        aria-label={label ?? t('properties.metadata')}
        value={text}
        disabled={disabled}
        spellCheck={false}
        placeholder="{}"
        onChange={(event) => setText(event.target.value)}
        onBlur={apply}
        aria-invalid={Boolean(error) || undefined}
      />
      <span className="help">
        {help ?? t('properties.metadataHelp')}{' '}
        {!disabled ? (
          <button type="button" className="text-button" onClick={apply}>
            {t('properties.metadataApply')}
          </button>
        ) : null}
      </span>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
