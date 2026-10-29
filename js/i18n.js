// Tiny i18n layer. All player-facing text is looked up here by dotted key.
import en from '../strings/en.js';

const SUPPORTED = ['en']; // add 'it' etc. here when strings/<lang>.js exists
let dict = en;

export async function loadLocale(locale) {
  const lang = String(locale || 'en').slice(0, 2).toLowerCase();
  dict = en;
  if (lang !== 'en' && SUPPORTED.includes(lang)) {
    try { dict = (await import(`../strings/${lang}.js`)).default; } catch { dict = en; }
  }
  return SUPPORTED.includes(lang) ? lang : 'en';
}

function lookup(obj, key) {
  let o = obj;
  for (const part of key.split('.')) {
    if (o == null) return undefined;
    o = o[part];
  }
  return o;
}

function raw(key) {
  let v = lookup(dict, key);
  if (v === undefined && dict !== en) v = lookup(en, key);
  return v;
}

export function fmt(s, vars) {
  if (!vars) return s;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

// t('ui.play') -> string. Arrays return their first entry (use tList for the whole list).
export function t(key, vars) {
  let v = raw(key);
  if (v === undefined) return key;
  if (Array.isArray(v)) v = v[0];
  return fmt(v, vars);
}

export function tList(key) {
  const v = raw(key);
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function has(key) { return raw(key) !== undefined; }
