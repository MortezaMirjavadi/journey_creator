import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NODE_REGISTRY } from '@/domain/nodeRegistry';
import type { ValidationIssue } from '@/domain/types';
import { useEditorSession, useEditorState } from '@/editor/EditorContext';
import { issueText } from './properties/helpers';

function IssueButton({ issue, tone }: { issue: ValidationIssue; tone: 'error' | 'warning' }) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const state = useEditorState();
  const node = issue.nodeId ? state.draft.nodes.find((item) => item.id === issue.nodeId) : undefined;
  const label = node ? node.config.label?.trim() || t(NODE_REGISTRY[node.type].labelKey) : null;
  return (
    <li>
      <button type="button" className="issue-button" onClick={() => session.focusIssue(issue)}>
        <code>{issue.code}</code>
        {label ? <span> · {label}</span> : null}
        {tone === 'error' ? ' — ' : ' — '}
        {issueText(issue, t)}
        {issue.field ? (
          <>
            <br />
            <small>{issue.field}</small>
          </>
        ) : null}
      </button>
    </li>
  );
}

export function ValidationSection() {
  const { t, i18n } = useTranslation();
  const session = useEditorSession();
  const state = useEditorState();
  const [validating, setValidating] = useState(false);

  const grouped = useMemo(() => {
    const errors = state.validation.errors;
    const warnings = state.validation.warnings;
    return {
      graphErrors: errors.filter((issue) => issue.scope === 'graph'),
      propertyErrors: errors.filter((issue) => issue.scope === 'property'),
      warnings,
    };
  }, [state.validation]);

  const runValidation = async () => {
    setValidating(true);
    try {
      await session.validate();
    } finally {
      setValidating(false);
    }
  };

  const lastValidated = state.lastValidatedAt
    ? new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(state.lastValidatedAt))
    : null;

  const total = state.validation.issues.length;

  return (
    <section className="inspector-fields" style={{ paddingTop: 0 }}>
      <div className="section-head" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{t('validation.title')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {state.validation.errors.length > 0 ? (
            <span className="badge red">{t('validation.errorsCount', { count: state.validation.errors.length })}</span>
          ) : null}
          {state.validation.warnings.length > 0 ? (
            <span className="badge amber">
              {t('validation.warningsCount', { count: state.validation.warnings.length })}
            </span>
          ) : null}
          <button type="button" className="text-button" onClick={() => void runValidation()} disabled={validating}>
            {validating ? t('header.validating') : t('common.validate')}
          </button>
        </div>
      </div>

      {total === 0 ? (
        <p className="help">{t('validation.empty')}</p>
      ) : (
        <>
          {grouped.graphErrors.length > 0 ? (
            <>
              <div className="eyebrow">{t('validation.graphIssues')}</div>
              <ul className="error-list">
                {grouped.graphErrors.map((issue, index) => (
                  <IssueButton key={`${issue.code}-${index}`} issue={issue} tone="error" />
                ))}
              </ul>
            </>
          ) : null}
          {grouped.propertyErrors.length > 0 ? (
            <>
              <div className="eyebrow">{t('validation.propertyIssues')}</div>
              <ul className="error-list">
                {grouped.propertyErrors.map((issue, index) => (
                  <IssueButton key={`${issue.code}-${index}`} issue={issue} tone="error" />
                ))}
              </ul>
            </>
          ) : null}
          {grouped.warnings.length > 0 ? (
            <ul className="warn-list">
              {grouped.warnings.map((issue, index) => (
                <IssueButton key={`${issue.code}-${index}`} issue={issue} tone="warning" />
              ))}
            </ul>
          ) : null}
        </>
      )}

      <p className="help" style={{ marginTop: 10 }}>
        {state.validation.errors.length > 0
          ? t('validation.publishBlocked')
          : state.validation.warnings.length > 0
            ? t('validation.warningsDoNotBlock')
            : t('validation.clickToFocus')}
        {lastValidated ? ` · ${t('validation.lastValidated', { time: lastValidated })}` : null}
      </p>
    </section>
  );
}
