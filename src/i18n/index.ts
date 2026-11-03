import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import fa from './fa';

export const LANGUAGES = ['en', 'fa'] as const;
export type Language = (typeof LANGUAGES)[number];
const STORAGE_KEY = 'marco.lang';

function initialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'fa') return stored;
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fa: { translation: fa },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function isRtl(language: string): boolean {
  return language.startsWith('fa');
}

export function currentLanguage(): Language {
  return i18n.language.startsWith('fa') ? 'fa' : 'en';
}

export function setLanguage(language: Language): void {
  localStorage.setItem(STORAGE_KEY, language);
  void i18n.changeLanguage(language);
}

export default i18n;
