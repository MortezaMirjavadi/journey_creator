import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DraftParseIssue } from '@/domain/serialization';
import type { PageState } from '@/editor/types';

export function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="loading">
      <div className="spinner" />
      {t('page.loadingTitle')}
      <p className="help">{t('page.loadingDescription')}</p>
    </div>
  );
}

const ERROR_META: Record<
  Exclude<PageState, 'loading' | 'ready' | 'unsupported'>,
  { icon: string; title: string; description: string }
> = {
  not_found: { icon: '◇', title: 'page.notFoundTitle', description: 'page.notFoundDescription' },
  forbidden: { icon: '⛔', title: 'page.forbiddenTitle', description: 'page.forbiddenDescription' },
  network_error: { icon: '⌁', title: 'page.networkTitle', description: 'page.networkDescription' },
  error: { icon: '⚠', title: 'page.errorTitle', description: 'page.errorDescription' },
};

export function ErrorState({
  kind,
  message,
  onRetry,
  onBack,
}: {
  kind: Exclude<PageState, 'loading' | 'ready' | 'unsupported'>;
  message?: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const meta = ERROR_META[kind] ?? ERROR_META.error;
  return (
    <div className="state-page">
      <div className="state-card">
        <div className="state-icon">{meta.icon}</div>
        <h1>{t(meta.title)}</h1>
        <p>{t(meta.description)}</p>
        {message ? <p className="error">{message}</p> : null}
        <div className="actions">
          <button type="button" className="secondary" onClick={onBack}>
            {t('page.backToJourneys')}
          </button>
          <button type="button" className="primary" onClick={onRetry}>
            {t('page.retry')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnsupportedState({
  issues,
  raw,
  onBack,
  onRetry,
}: {
  issues: DraftParseIssue[];
  raw: unknown;
  onBack: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const pretty = (() => {
    try {
      return JSON.stringify(raw, null, 2) ?? String(raw);
    } catch {
      return String(raw);
    }
  })();

  return (
    <div className="state-page">
      <div className="state-card" style={{ maxWidth: 720 }}>
        <div className="state-icon">⚠</div>
        <h1>{t('page.unsupportedTitle')}</h1>
        <p>{t('page.unsupportedDescription')}</p>
        <p className="help">{t('page.unsupportedHelp')}</p>

        {issues.length > 0 ? (
          <ul className="issue-list">
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <code>{issue.code}</code> {issue.message}
                {issue.nodeId ? <span> ({issue.nodeId})</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <details className="raw-doc">
          <summary className="text-button">{t('page.rawDocument')}</summary>
          <pre>{pretty}</pre>
        </details>

        <div className="actions">
          <button type="button" className="secondary" onClick={onBack}>
            {t('page.backToJourneys')}
          </button>
          <button type="button" className="primary" onClick={onRetry}>
            {t('page.retry')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BackToJourneys() {
  const { t } = useTranslation();
  return (
    <Link to="/" className="secondary small">
      {t('page.backToJourneys')}
    </Link>
  );
}
