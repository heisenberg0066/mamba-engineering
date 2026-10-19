// i18n: English source strings are the keys; Swedish and Arabic translations in i18n-data.js. Missing → English.
import { SV, AR } from './i18n-data.js';
let lang = 'en';
const dicts = { sv: SV, ar: AR };
export function setLang(l) { lang = l; document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; }
export function getLang() { return lang; }
export function t(s) { if (lang === 'en' || s === undefined || s === null) return s; const d = dicts[lang]; return (d && d[s]) || s; }
