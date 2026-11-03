import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { EngageLayout } from '@/components/EngageLayout';
import { isRtl } from '@/i18n';
import { JourneyBuilderPage } from '@/pages/JourneyBuilderPage';
import { LandingPage } from '@/pages/LandingPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="state-page">
      <div className="state-card">
        <div className="state-icon">◇</div>
        <h1>{t('page.notFoundTitle')}</h1>
        <p>{t('page.notFoundDescription')}</p>
        <div className="actions">
          <Link to="/" className="primary">
            {t('page.backToJourneys')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const language = i18n.language.startsWith('fa') ? 'fa' : 'en';
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr';
  }, [i18n.language]);

  return (
    <BrowserRouter>
      <a href="#journey-canvas" className="skip-link">
        {i18n.t('app.skipToCanvas')}
      </a>
      <Routes>
        <Route element={<EngageLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/segments"
            element={<PlaceholderPage titleKey="landing.segmentsTitle" textKey="landing.segmentsText" />}
          />
          <Route
            path="/templates"
            element={<PlaceholderPage titleKey="landing.templatesTitle" textKey="landing.templatesText" />}
          />
          <Route path="/workspaces/:workspaceId/journeys/:journeyId" element={<JourneyBuilderPage />} />
          <Route
            path="/workspaces/:workspaceId/journeys/:journeyId/demo"
            element={<JourneyBuilderPage sandbox />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
