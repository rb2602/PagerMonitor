import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sl from './locales/sl.json';
import de from './locales/de.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sl: { translation: sl }, de: { translation: de } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
