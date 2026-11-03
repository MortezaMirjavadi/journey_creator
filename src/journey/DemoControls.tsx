import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '@/components/ui';
import { getMockBehavior, resetMockBehavior, setMockBehavior, type MockBehavior } from '@/api/mockBehavior';
import { SCENARIOS, type ScenarioDefinition } from '@/demo/scenarios';
import { useEditorSession } from '@/editor/EditorContext';

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function DemoControls({
  open,
  onOpenChange,
  scenario,
  onSelectScenario,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: ScenarioDefinition;
  onSelectScenario: (scenario: ScenarioDefinition) => void;
}) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const [, forceRender] = useState(0);
  const behavior = getMockBehavior();

  const patch = (value: Partial<MockBehavior>) => {
    setMockBehavior(value);
    forceRender((version) => version + 1);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={t('demo.title')}>
      <div className="demo-section">
        <h3>{t('demo.scenarioLabel')}</h3>
        <div className="demo-scenario">
          <strong>{t(scenario.nameKey)}</strong>
          <p>{t(scenario.descriptionKey)}</p>
          <div>
            <span className={`badge ${scenario.publishable ? 'green' : 'amber'}`}>
              {scenario.publishable ? t('demo.publishable') : t('demo.notPublishable')}
            </span>
            {scenario.expectedErrorCodes.map((code) => (
              <span key={code} className="badge red" style={{ marginRight: 4 }}>
                {code}
              </span>
            ))}
            {scenario.expectedWarningCodes.map((code) => (
              <span key={code} className="badge amber" style={{ marginRight: 4 }}>
                {code}
              </span>
            ))}
          </div>
        </div>
        <button type="button" className="secondary small wide" onClick={() => void session.reload()}>
          {t('demo.reloadScenario')}
        </button>
      </div>

      <div className="demo-section">
        <h3>{t('examples.title')}</h3>
        <div className="demo-list">
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === scenario.id ? 'active' : ''}
              onClick={() => onSelectScenario(item)}
            >
              <strong>{t(item.nameKey)}</strong>
              <small>{t(item.descriptionKey)}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="demo-section">
        <h3>{t('demo.behavior')}</h3>
        <p className="help">{t('demo.description')}</p>

        <label className="field">
          {t('demo.latency')}
          <input
            type="number"
            min={0}
            max={1500}
            step={50}
            value={behavior.latencyMs}
            onChange={(event) => patch({ latencyMs: Number(event.target.value) })}
          />
        </label>

        <Toggle
          label={t('demo.failNextSave')}
          checked={behavior.failNextSave}
          onChange={(value) => patch({ failNextSave: value })}
        />
        <Toggle
          label={t('demo.conflictNextSave')}
          checked={behavior.conflictNextSave}
          onChange={(value) => patch({ conflictNextSave: value })}
        />
        <Toggle
          label={t('demo.failNextPublish')}
          checked={behavior.failNextPublish}
          onChange={(value) => patch({ failNextPublish: value })}
        />
        <Toggle
          label={t('demo.failCatalogs')}
          checked={behavior.failCatalogs}
          onChange={(value) => patch({ failCatalogs: value })}
        />
        <Toggle
          label={t('demo.emptyCatalogs')}
          checked={behavior.emptyCatalogs}
          onChange={(value) => patch({ emptyCatalogs: value })}
        />
        <Toggle
          label={t('demo.unsupportedDocument')}
          checked={behavior.unsupportedDocument}
          onChange={(value) => patch({ unsupportedDocument: value })}
        />

        <label className="field">
          {t('demo.pageFailure')}
          <select
            value={behavior.pageFailure}
            onChange={(event) => patch({ pageFailure: event.target.value as MockBehavior['pageFailure'] })}
          >
            <option value="none">{t('demo.pageFailureNone')}</option>
            <option value="not_found">{t('demo.pageFailureNotFound')}</option>
            <option value="forbidden">{t('demo.pageFailureForbidden')}</option>
            <option value="network">{t('demo.pageFailureNetwork')}</option>
          </select>
        </label>

        <button
          type="button"
          className="secondary small wide"
          onClick={() => {
            resetMockBehavior();
            patch({});
          }}
        >
          {t('demo.reset')}
        </button>
      </div>

      <div className="demo-note">
        <strong>{t('demo.stateMatrix')}</strong>
        <br />
        {t('demo.stateMatrixHint')}
      </div>
    </Drawer>
  );
}
