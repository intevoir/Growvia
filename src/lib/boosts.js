'use strict';

/**
 * Booster Viaz sementara. Tersimpan di account.boosts: { <boostId>: expiresAtMs }.
 * Kedaluwarsa dibersihkan lazy saat dibaca (pemanggil menyimpan account).
 */

const { BOOSTS, getBoost } = require('../data/boosts');
const { price } = require('./viazRate');
const { now: clockNow } = require('./clock');
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const skillLevel = (account, skill) => account.skills?.[skill]?.level ?? 1;

/**
 * Estimasi pendapatan Viaz per jam dari satu aktivitas di level tertentu (dari balance-sim:
 * farming/mining seimbang). Dipakai supaya harga booster selalu terjangkau di level sekarang
 * (server baru = level rendah = murah) dan tetap sink di level tinggi.
 */
const INCOME_BANDS = [
  [1, 1500], [10, 20000], [20, 35000], [30, 50000], [40, 90000], [50, 120000],
  [60, 200000], [75, 240000], [90, 420000], [100, 550000],
];

function incomePerHour(level) {
  const l = Math.max(1, Math.min(100, Math.floor(level) || 1));
  for (let i = 1; i < INCOME_BANDS.length; i++) {
    const [l0, v0] = INCOME_BANDS[i - 1];
    const [l1, v1] = INCOME_BANDS[i];
    if (l <= l1) return Math.round(v0 + ((v1 - v0) * (l - l0)) / (l1 - l0));
  }
  return INCOME_BANDS[INCOME_BANDS.length - 1][1];
}

function activeBoosts(account, now = clockNow()) {
  const out = [];
  if (!account.boosts) return out;
  for (const [id, expiresAt] of Object.entries(account.boosts)) {
    const def = getBoost(id);
    if (def && expiresAt > now) out.push({ ...def, expiresAt });
    else delete account.boosts[id];
  }
  return out;
}

/** Pengali satu jenis efek: 1 kalau tidak ada booster aktif (speed juga 1). */
function effectOf(account, kind, now) {
  for (const b of activeBoosts(account, now)) if (b.effect[kind]) return b.effect[kind];
  return 1;
}

/** Pengali XP skill tertentu (booster global xp x booster skill itu). */
const skillXpMult = (account, skill) => effectOf(account, `xp_${skill}`); // booster global 'xp' sudah termasuk di xpMultiplier

const remainingMs = (account, id, now = clockNow()) => Math.max(0, (account.boosts?.[id] ?? 0) - now);

/**
 * Harga booster saat ini: payHours jam pendapatan di level skill acuan (murah untuk level rendah,
 * mahal untuk level tinggi) + ikut kurs halving seperti semua harga lain.
 */
function boostCost(account, def) {
  const level = def.skill
    ? skillLevel(account, def.skill)
    : Math.max(...['farming', 'mining', 'fishing', 'dungeon'].map((s) => skillLevel(account, s)));
  return price(Math.max(100, Math.round(def.payHours * incomePerHour(level))));
}

/** Beli booster: bayar Viaz (kurs halving), perpanjang masa aktifnya bila sudah ada. */
function buyBoost(account, id) {
  const def = getBoost(id);
  if (!def) return { ok: false, code: 'not_found' };
  if (def.skill && skillLevel(account, def.skill) < def.unlockLevel) return { ok: false, code: 'level' };
  const cost = boostCost(account, def);
  if ((account.viaz ?? 0) < cost) return { ok: false, code: 'no_viaz' };
  account.viaz = round2(account.viaz - cost);
  const now = clockNow();
  if (!account.boosts) account.boosts = {};
  account.boosts[id] = Math.max(account.boosts[id] ?? 0, now) + def.durationMs;
  return { ok: true, boost: def, cost, expiresAt: account.boosts[id] };
}

module.exports = { BOOSTS, incomePerHour, activeBoosts, effectOf, skillXpMult, remainingMs, boostCost, buyBoost };
