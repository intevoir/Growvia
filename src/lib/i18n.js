'use strict';

/**
 * Bahasa. Panel publik selalu English; semua tampilan pribadi pakai bahasa akun.
 * Teks ditulis inline per bahasa lewat tr(lang, en, id) supaya tidak ada key yang hilang.
 */

const LANGS = ['en', 'id'];

function langOf(account) {
  return account?.lang === 'id' ? 'id' : 'en';
}

function tr(lang, en, id) {
  return lang === 'id' ? id : en;
}

/** Nama item data (field `name` = Indonesia, `en` = English). */
function nameOf(item, lang) {
  if (!item) return '?';
  return lang === 'en' && item.en ? item.en : item.name;
}

function descOf(item, lang) {
  if (!item) return '';
  return lang === 'en' && item.descEn ? item.descEn : item.desc ?? '';
}

module.exports = { LANGS, langOf, tr, nameOf, descOf };
