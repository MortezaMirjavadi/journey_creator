import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { SCENARIOS, type ScenarioDefinition } from '@/demo/scenarios';

export function ExamplesMenu({
  currentScenarioId,
  onSelect,
  onOpenGallery,
  onImport,
  onExport,
}: {
  currentScenarioId?: string;
  onSelect: (scenario: ScenarioDefinition) => void;
  onOpenGallery: () => void;
  onImport?: () => void;
  onExport?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="text-button" aria-label={t('examples.title')}>
          {t('common.examples')}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="menu" style={{ width: 340 }}>
          <div className="menu-label">
            <strong>{t('examples.title')}</strong>
            <div>{t('examples.sandboxHint')}</div>
          </div>
          <div className="menu-sep" />
          {SCENARIOS.map((scenario) => (
            <DropdownMenu.Item
              key={scenario.id}
              onSelect={() => onSelect(scenario)}
              className="menu-item"
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ flex: 1 }}>{t(scenario.nameKey)}</strong>
                {currentScenarioId === scenario.id ? (
                  <span className="badge">{t('examples.current')}</span>
                ) : scenario.publishable ? (
                  <span className="badge green">{t('examples.publishable')}</span>
                ) : (
                  <span className="badge amber">
                    {scenario.expectedErrorCodes.length} {t('common.errors')}
                  </span>
                )}
              </span>
              <small>{t(scenario.descriptionKey)}</small>
            </DropdownMenu.Item>
          ))}
          <div className="menu-sep" />
          <DropdownMenu.Item onSelect={onOpenGallery} className="menu-item">
            <strong>{t('examples.openGallery')}</strong>
          </DropdownMenu.Item>
          {onImport ? (
            <DropdownMenu.Item onSelect={onImport} className="menu-item">
              <strong>{t('jsonImport.title')}</strong>
            </DropdownMenu.Item>
          ) : null}
          {onExport ? (
            <DropdownMenu.Item onSelect={onExport} className="menu-item">
              <strong>{t('jsonExport.title')}</strong>
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
