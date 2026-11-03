import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function PlaceholderPage({ titleKey, textKey }: { titleKey: string; textKey: string }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">{t('landing.breadcrumb')}</div>
          <h1>{t(titleKey)}</h1>
          <p>{t(textKey)}</p>
        </div>
      </div>
      <section className="card pad">
        <p className="help">{t(textKey)}</p>
        <Link to="/" className="secondary small" style={{ display: 'inline-block', marginTop: 12 }}>
          {t('landing.backToJourneys')}
        </Link>
      </section>
    </>
  );
}
