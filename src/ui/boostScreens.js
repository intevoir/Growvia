'use strict';

/** Toko booster Viaz (konsumsi sementara berbayar Viaz). */

const C = require('../config/constants');
const { BOOSTS } = require('../data/boosts');
const { activeBoosts, boostCost, remainingMs } = require('../lib/boosts');
const { now: clockNow } = require('../lib/clock');
const { tr, descOf, nameOf } = require('../lib/i18n');
const { formatNumber, formatViaz, formatDuration } = require('../lib/format');
const { btn, row } = require('./v2');
const { viaz, bagLine } = require('./common');

const PURPLE = 0x9c27b0;

/**
 * back: null (tanpa tombol kembali), 'profile' (dari Hall), atau prefix panel publik lain.
 */
function boostShop(account, lang, notice = '', now = clockNow(), back = 'profile') {
  const actives = activeBoosts(account, now);
  const rows = [];
  for (let i = 0; i < BOOSTS.length; i += 2) {
    rows.push(row(...BOOSTS.slice(i, i + 2).map((b) => {
      const cost = boostCost(account, b);
      const locked = b.skill && (account.skills?.[b.skill]?.level ?? 1) < b.unlockLevel;
      return btn(`${C.HALL_BOOST_BUY_PREFIX}${b.id}`, `${tr(lang, 'Buy', 'Beli')} ${nameOf(b, lang)}`, b.emote, locked || account.viaz < cost);
    })));
  }
  if (back) rows.push(row(btn(`${C.HALL_NAV_PREFIX}${back}`, tr(lang, 'Back', 'Kembali'), '⬅️')));
  return {
    title: `🍔 ${tr(lang, 'Viaz Boost Shop', 'Toko Booster Viaz')}`,
    accent: PURPLE,
    notice,
    body: [
      tr(lang, 'Temporary boosts paid with Viaz. Prices rise with your skill level. Buy more to extend them.', 'Booster sementara berbayar Viaz. Harga naik mengikuti level skill. Beli lagi untuk memperpanjang.'),
      '',
      ...(actives.length ? actives.map((b) => `✅ ${b.emote} **${nameOf(b, lang)}** · ⏰ ${formatDuration(b.expiresAt - now, lang)}`) : []),
      ...BOOSTS.map((b) => {
        const locked = b.skill && (account.skills?.[b.skill]?.level ?? 1) < b.unlockLevel;
        const left = remainingMs(account, b.id, now);
        return `${locked ? '🔒' : b.emote} **${nameOf(b, lang)}** · ${descOf(b, lang)}\n　${viaz(boostCost(account, b))} · ${formatDuration(b.durationMs, lang)}${left > 0 ? ` · ⏰ ${formatDuration(left, lang)}` : ''}`;
      }),
      '',
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      bagLine(account, lang),
    ],
    rows,
  };
}

module.exports = { boostShop };
