import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { parseJourneyDsl } from '@/domain/journeyDsl';
import { parseDraft, type DraftParseIssue } from '@/domain/serialization';
import type { JourneyDraft } from '@/domain/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ImportJsonModal({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (draft: JourneyDraft) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<DraftParseIssue[]>([]);

  const close = (next: boolean) => {
    if (!next) {
      setIssues([]);
    }
    onOpenChange(next);
  };

  const load = () => {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      setIssues([{ code: 'JSON_INVALID', message: t('jsonImport.invalidJson') }]);
      return;
    }

    if (isRecord(raw) && raw.dslVersion !== undefined) {
      const result = parseJourneyDsl(raw);
      if (!result.ok) {
        setIssues(result.issues);
        return;
      }
      setIssues([]);
      onImported(result.draft);
      close(false);
      return;
    }

    const definition = isRecord(raw)
      ? isRecord(raw.draft) && raw.draft.definition !== undefined
        ? raw.draft.definition
        : raw.definition !== undefined
          ? raw.definition
          : raw
      : raw;
    const result = parseDraft(definition);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    onImported(result.draft);
    close(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={t('jsonImport.title')}
      description={t('jsonImport.description')}
      width="lg"
      footer={
        <>
          <button type="button" className="secondary" onClick={() => close(false)}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" onClick={load} disabled={text.trim().length === 0}>
            {t('jsonImport.load')}
          </button>
        </>
      }
    >
      <p className="info">{t('jsonImport.sandboxNote')}</p>
      <label className="field" htmlFor="import-json">
        {t('jsonImport.label')}
        <textarea
          id="import-json"
          className="metadata-input"
          style={{ minHeight: 300 }}
          value={text}
          spellCheck={false}
          placeholder={t('jsonImport.placeholder')}
          onChange={(event) => {
            setText(event.target.value);
            if (issues.length > 0) setIssues([]);
          }}
        />
      </label>
      {issues.length > 0 ? (
        <ul className="issue-list">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              <code>{issue.code}</code> {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}

export function ExportJsonModal({
  open,
  onOpenChange,
  json,
  filename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  json: string;
  filename: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('jsonExport.title')}
      description={t('jsonExport.description')}
      width="lg"
      footer={
        <>
          <button type="button" className="secondary" onClick={() => void copy()}>
            {copied ? t('jsonExport.copied') : t('jsonExport.copy')}
          </button>
          <button type="button" className="primary" onClick={download}>
            {t('jsonExport.download')}
          </button>
        </>
      }
    >
      <label className="field" htmlFor="export-json">
        {t('jsonExport.label')}
        <textarea
          id="export-json"
          className="metadata-input"
          style={{ minHeight: 360 }}
          value={json}
          readOnly
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <p className="help">{t('jsonExport.schemaNote')}</p>
    </Modal>
  );
}
