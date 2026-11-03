import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MOCK_JOURNEY_SEEDS, MOCK_WORKSPACES, defaultJourneyIdForWorkspace } from '@/api/mockData';
import { DEFAULT_SCENARIO_ID } from '@/demo/scenarios';

function stamp(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const defaultWorkspace = MOCK_WORKSPACES[0];
  const defaultJourney = defaultJourneyIdForWorkspace(defaultWorkspace.id);
  const journeys = Object.entries(MOCK_JOURNEY_SEEDS);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">{t('landing.breadcrumb')}</div>
          <h1>{t('landing.title')}</h1>
          <p>{t('landing.subtitle')}</p>
        </div>
        <div className="actions">
          <Link className="secondary" to={`/workspaces/${defaultWorkspace.id}/journeys/${defaultJourney}`}>
            {t('landing.open')}
          </Link>
          <Link
            className="primary"
            to={`/workspaces/${defaultWorkspace.id}/journeys/${defaultJourney}/demo?scenario=${DEFAULT_SCENARIO_ID}`}
          >
            ＋ {t('landing.scenarioGallery')}
          </Link>
        </div>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('landing.journeyName')}</th>
                <th>{t('landing.workspace')}</th>
                <th>{t('landing.start')}</th>
                <th>{t('landing.state')}</th>
                <th>{t('landing.draftRevision')}</th>
                <th>{t('landing.latestVersion')}</th>
                <th>{t('landing.updated')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {journeys.map(([journeyId, seed]) => {
                const workspace = MOCK_WORKSPACES.find((item) => item.id === seed.workspaceId);
                const href = `/workspaces/${seed.workspaceId}/journeys/${journeyId}`;
                return (
                  <tr key={journeyId}>
                    <td>
                      <Link to={href} className="text-button name">
                        {seed.name}
                      </Link>
                    </td>
                    <td>{workspace?.name ?? seed.workspaceId}</td>
                    <td>{t('landing.startValue')}</td>
                    <td>
                      <span className={`badge ${seed.status === 'published' ? 'green' : ''}`}>
                        {seed.status === 'published' ? t('common.published') : t('common.draft')}
                      </span>
                    </td>
                    <td>{seed.revision}</td>
                    <td>{seed.latestVersion ? `v${seed.latestVersion.versionNumber}` : '—'}</td>
                    <td>{stamp(seed.updatedAt, i18n.language)}</td>
                    <td>
                      <Link to={href} className="secondary small">
                        {t('landing.open')}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {journeys.length === 0 ? <div className="empty">{t('landing.noJourneys')}</div> : null}
        </div>
      </section>
      <p className="page-note">{t('landing.pageNote')}</p>
    </>
  );
}
