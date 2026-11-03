import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MOCK_WORKSPACES, defaultJourneyIdForWorkspace } from '@/api/mockData';
import { currentLanguage, setLanguage } from '@/i18n';

const NAV = [
  { to: '/', icon: '⑂', labelKey: 'nav.journeys', end: true },
  { to: '/segments', icon: '◉', labelKey: 'nav.segments', end: false },
  { to: '/templates', icon: '▤', labelKey: 'nav.templates', end: false },
];

export function EngageLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const workspaceId = params.workspaceId ?? MOCK_WORKSPACES[0].id;
  const workspace = MOCK_WORKSPACES.find((item) => item.id === workspaceId) ?? MOCK_WORKSPACES[0];
  const isBuilder = location.pathname.includes('/journeys/');

  const switchWorkspace = (nextWorkspaceId: string) => {
    const journeyId = defaultJourneyIdForWorkspace(nextWorkspaceId);
    navigate(`/workspaces/${nextWorkspaceId}/journeys/${journeyId}`);
  };

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">
          Marco<span className="brand-mark">●</span>
        </NavLink>
        <select
          aria-label={t('workspace.label')}
          value={workspace.id}
          onChange={(event) => switchWorkspace(event.target.value)}
        >
          {MOCK_WORKSPACES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <div className="top-spacer" />
        <span className="prototype">{t('chrome.prototype')}</span>
        <button
          type="button"
          className="text-button"
          onClick={() => setLanguage(currentLanguage() === 'en' ? 'fa' : 'en')}
          aria-label={t('common.switchLanguage')}
        >
          {currentLanguage() === 'en' ? 'فارسی' : 'English'}
        </button>
        <div className="account">
          <span className="avatar">D</span>
          <span>
            {t('chrome.user')}
            <small>
              {workspace.role} · {t('chrome.smsOnly')}
            </small>
          </span>
          <button type="button" className="text-button" onClick={() => navigate('/')}>
            {t('chrome.signOut')}
          </button>
        </div>
      </header>

      <aside className="nav">
        <span className="nav-caption">ENGAGE</span>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive || (item.to === '/' && isBuilder) ? 'active' : ''
            }
          >
            <b>{item.icon}</b>
            {t(item.labelKey)}
          </NavLink>
        ))}
        <div className="nav-bottom">
          <span>{t('chrome.smsOnly')}</span>
          <small>Asia/Tehran</small>
          <span>{t('chrome.apiDocs')} ↗</span>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
