'use strict';

/**
 * Self-check booster: harga berdasar level, syarat level, beli + perpanjang,
 * efek per skill (xp, yield, weight, loot, seeds), integrasi XP & jual.
 * Tanpa jaringan. Jalankan: node test/boosts-check.js
 */

const assert = require('node:assert');
const { BOOSTS, getBoost } = require('../src/data/boosts');
const B = require('../src/lib/boosts');
const { addXp } = require('../src/lib/xp');
const { price } = require('../src/lib/viazRate');

const acct = () => ({
  skills: { farming: { level: 1, exp: 0 }, mining: { level: 1, exp: 0 }, fishing: { level: 1, exp: 0 }, dungeon: { level: 1, exp: 0 } },
  viaz: 10_000_000,
  boosts: {},
});

/* ---- Data: banyak tipe, tiap booster punya efek jelas ---- */
{
  assert.ok(BOOSTS.length >= 12, `minimal 12 tipe booster, dapat ${BOOSTS.length}`);
  for (const b of BOOSTS) {
    assert.ok(b.emote && b.en && b.descEn && b.effect && Object.values(b.effect).some((v) => v !== 1), b.id);
    assert.ok(b.payHours > 0 && b.durationMs > 0);
  }
  const kinds = new Set(BOOSTS.flatMap((b) => Object.keys(b.effect)));
  for (const k of ['xp', 'sell', 'luck', 'speed', 'xp_farming', 'xp_mining', 'xp_fishing', 'xp_dungeon', 'seeds', 'yield', 'weight', 'loot']) {
    assert.ok(kinds.has(k), `jenis efek ${k} harus ada`);
  }
}

/* ---- Harga: murah di level rendah, mahal di level tinggi ---- */
{
  const def = getBoost('feast'); // skill farming
  const low = acct();
  low.skills.farming.level = 1;
  const high = acct();
  high.skills.farming.level = 90;
  assert.ok(B.boostCost(low, def) < B.boostCost(high, def), 'harga naik mengikuti level');
  assert.strictEqual(B.boostCost(low, def), price(2250), 'Lv 1: 1.5 jam × 1500 = 2250, terjangkau server baru');
  assert.ok(B.boostCost(high, def) > B.boostCost(low, def) * 50, 'Lv 90 jauh lebih mahal');
}

/* ---- Syarat level ---- */
{
  const a = acct(); // mining level 1, booster magnet butuh 20
  const res = B.buyBoost(a, 'magnet');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, 'level');
  a.skills.mining.level = 20;
  assert.ok(B.buyBoost(a, 'magnet').ok);
}

/* ---- Beli + perpanjang masa aktif ---- */
{
  const a = acct();
  const r1 = B.buyBoost(a, 'feast');
  assert.ok(r1.ok);
  assert.strictEqual(B.effectOf(a, 'xp_farming'), 2);
  assert.strictEqual(B.effectOf(a, 'xp_mining'), 1, 'booster skill lain tidak ikut');
  assert.strictEqual(B.skillXpMult(a, 'farming'), 2);
  const first = r1.expiresAt;
  const r2 = B.buyBoost(a, 'feast');
  assert.ok(r2.expiresAt > first, 'beli lagi memperpanjang');
  assert.strictEqual(r2.expiresAt - first, 4 * 3600_000);
  // Kedaluwarsa hilang
  a.boosts.feast = Date.now() - 1000;
  assert.strictEqual(B.effectOf(a, 'xp_farming'), 1);
  assert.strictEqual(a.boosts.feast, undefined, 'dibersihkan saat dibaca');
  assert.deepStrictEqual(B.activeBoosts(a), []);
}

/* ---- Efek ke XP nyata ---- */
{
  const a = acct();
  a.skills.farming.level = 50; // cukup tinggi agar tambahan XP tidak naik level
  a.boosts.feast = Date.now() + 3600_000; // boosts menyimpan expiresAtMs (bukan {until, mult})
  const before = a.skills.farming.exp;
  addXp(a, 'farming', 100);
  assert.strictEqual(a.skills.farming.exp - before, 200, 'XP farming double');
}

/* ---- Efek global tetap jalan ---- */
{
  const a = acct();
  a.boosts.xp = Date.now() + 3600_000;
  assert.strictEqual(B.effectOf(a, 'xp'), 2);
  a.boosts.sell = Date.now() + 6 * 3600_000;
  const P = require('../src/lib/progress');
  assert.strictEqual(P.sellBonus(a), 1.5);
}

console.log(`boosts-check: semua lolos (${BOOSTS.length} tipe, harga per level, efek per skill)`);
