'use strict';

/**
 * Pagar ekonomi: menjaga agar tuning tidak menghancurkan progres jangka panjang.
 * Memakai simulasi asli (scripts/balance-sim.js). Jalankan: node test/balance-check.js
 */

const assert = require('node:assert');
const G = require('../src/config/game');
const { SEEDS } = require('../src/data/seeds');
const { TOOL_TIERS } = require('../src/data/tools');
const { BAITS, FISHES } = require('../src/data/fishes');
const { ORES, CAVES } = require('../src/data/ores');
const { DUNGEONS } = require('../src/data/dungeons');
const { computeHalving } = require('../src/lib/halvingMath');
const S = require('../scripts/balance-sim');

/* ---- Tidak ada aktivitas yang mendominasi atau mati di level mana pun ---- */
for (const L of [10, 20, 30, 50, 75, 100]) {
  const farm = S.farm(L);
  const mine = S.mining(L);
  const fish = S.fishing(L);
  const dung = S.dungeon(L, 40);
  assert.ok(farm.xp > 0 && farm.income > 0, `farm Lv${L} harus untung`);
  assert.ok(mine.xp / farm.xp >= 0.3 && mine.xp / farm.xp <= 2.5, `XP mining/farm Lv${L} = ${(mine.xp / farm.xp).toFixed(2)}`);
  assert.ok(fish.xp / farm.xp >= 0.02, `fishing Lv${L} tidak boleh nol XP`);
  assert.ok(mine.income / farm.income <= 2, `income mining mendominasi di Lv${L}`);
  assert.ok(fish.income / farm.income <= 1, `fishing (AFK) harus <= farming di Lv${L}: ${(fish.income / farm.income).toFixed(2)}`);
  assert.ok(dung.income / farm.income <= 3, `income dungeon mendominasi di Lv${L}: ${(dung.income / farm.income).toFixed(2)}`);
  assert.ok(dung.win >= 0.8, `dungeon harus bisa dimenangkan dengan gear terbaik di Lv${L}: ${dung.win}`);
}

/* ---- Gerbang level bisa dicapai dalam waktu wajar (bukan ribuan jam) ---- */
const hoursFarm30 = S.hoursTo(30, S.farm);
const hoursMine20 = S.hoursTo(20, S.mining);
const hoursFish10 = S.hoursTo(10, S.fishing);
assert.ok(hoursMine20 < hoursFarm30, `Mining 20 (${hoursMine20.toFixed(0)}h) harus lebih cepat dari Farming 30 (${hoursFarm30.toFixed(0)}h)`);
assert.ok(hoursFish10 < 100, `Fishing 10 harus < 100 jam, dapat ${hoursFish10.toFixed(0)}`);
assert.ok(hoursFarm30 < 400, `Farming 30 harus < 400 jam, dapat ${hoursFarm30.toFixed(0)}`);

/* ---- Lv 100 = tahunan (tidak terlalu cepat) ---- */
const hours100 = S.hoursTo(100, S.farm);
assert.ok(hours100 > 1500, `Farming Lv100 terlalu cepat: ${hours100.toFixed(0)} jam`);

/* ---- Benih: tiap tier memberi XP & untung per jam per plot lebih tinggi ---- */
for (let i = 1; i < SEEDS.length; i++) {
  const per = (s) => (s.sellPrice - s.buyPrice * (1 - G.SEED_RETURN_RATE)) / s.growMs;
  assert.ok(per(SEEDS[i]) >= per(SEEDS[i - 1]) * 0.9, `untung/jam ${SEEDS[i].id} tidak boleh turun jauh`);
  assert.ok(SEEDS[i].sellPrice > SEEDS[i].buyPrice * 2, `margin benih ${SEEDS[i].id}`);
}

/* ---- Harga alat naik tiap tier & selalu positif (sink Viaz) ---- */
for (const [type, list] of Object.entries(TOOL_TIERS)) {
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i].cost > list[i - 1].cost, `${type} tier ${i + 1} harus lebih mahal`);
    assert.ok(list[i].unlockLevel >= list[i - 1].unlockLevel, `${type} level unlock tidak turun`);
  }
  assert.ok(list.slice(1).every((t) => (t.speedMult ?? t.atk ?? t.def) !== undefined));
}

/* ---- Umpan: lebih mahal = peluang langka lebih besar, dan selalu lebih murah dari nilai tangkapan ---- */
const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const avgValue = (b) => b.pool.reduce((sum, pct, i) => {
  const list = FISHES.filter((f) => f.rarity === RARITY[i]);
  return sum + (pct / 100) * (list.reduce((s, f) => s + ((f.minLbs + f.maxLbs) / 2) * f.pricePerLb, 0) / list.length);
}, 0);
for (let i = 1; i < BAITS.length; i++) {
  assert.ok(BAITS[i].cost > BAITS[i - 1].cost, `umpan ${BAITS[i].id} harus lebih mahal`);
  assert.ok(avgValue(BAITS[i]) > avgValue(BAITS[i - 1]), `umpan ${BAITS[i].id} harus bernilai lebih tinggi`);
}
for (const b of BAITS) assert.ok(avgValue(b) > b.cost * 1.5 && avgValue(b) < b.cost * 8, `EV umpan ${b.id} wajar: ${(avgValue(b) / b.cost).toFixed(1)}x`);

/* ---- Ore & gua: ore langka lebih mahal, gua dalam lebih bernilai ---- */
for (const cave of CAVES) {
  const prices = cave.oreIds.map((id) => ORES.find((o) => o.id === id).sellPrice);
  assert.deepStrictEqual([...prices].sort((a, b) => a - b), prices, `ore ${cave.id} urut harga naik`);
}

/* ---- Dungeon: biaya masuk selalu jauh di bawah hadiah rata-rata ---- */
for (const d of DUNGEONS) assert.ok(d.fee > 0 && d.fee < d.xp, `fee dungeon ${d.id}`);

/* ---- Sink jangka panjang & halving ---- */
const plot = (n) => G.PLOT_BASE_PRICE * G.PLOT_PRICE_GROWTH ** n;
assert.ok(plot(300) > 20_000 && plot(900) > plot(300) * 50, 'plot harus jadi sink eksponensial');
assert.strictEqual(computeHalving(0).multiplier, 1);

console.log('balance-check: semua lolos (paritas aktivitas, gerbang level, tier alat/umpan/ore, sink Viaz)');
