'use strict';

/**
 * Self-check logika game murni (Farming, Mining, Tools, Ores, Halving, Mutual Exclusion).
 * Tidak butuh .env / Supabase / Discord.
 * Jalankan: npm test
 */

const assert = require('node:assert');
const G = require('../src/config/game');
const { SEEDS, getSeed, getUnlockedSeeds } = require('../src/data/seeds');
const { RARITIES } = require('../src/data/rarity');
const { getTool, getNextToolTier, getToolSpeedMultiplier } = require('../src/data/tools');
const { ORES, CAVES, getOre, getCave, getUnlockedCaves } = require('../src/data/ores');
const { computeHalving, round2, FLOOR_MULTIPLIER } = require('../src/lib/halvingMath');
const F = require('../src/lib/farmLogic');
const M = require('../src/lib/miningLogic');
const { canPlant, canMine } = require('../src/lib/activityLock');
const {
  usedSlots,
  maxSlots,
  freeSlots,
  backpackPrice,
  backpacksCost,
  getDiscardableItems,
  discardItem,
} = require('../src/lib/backpack');

function newAccount() {
  return {
    user_id: 'u1',
    skills: {
      farming: { level: 1, exp: 0 },
      mining: { level: 1, exp: 0 },
    },
    viaz: 0,
    seeds: { ...G.START_SEEDS },
    harvests: {},
    plantings: {},
    bought_plots: 0,
    auto_plant: false,
    ores: {},
    mining_trip: null,
    auto_mining: false,
    inventory: { hoe: 1, pickaxe: 0 },
    items: { hoe_1: 1 },
  };
}

const never = () => 0.99; // rng yang tidak pernah memberi bonus pecahan

/* ---- Data Tools ---- */
assert.ok(getTool('hoe', 1));
assert.ok(getTool('pickaxe', 1));
assert.strictEqual(getTool('hoe', 1).speedMult, 1.0);
assert.strictEqual(getTool('hoe', 1).starter, true, 'tier 1 = cangkul pemula');
assert.strictEqual(getTool('hoe', 2).rarity, 'common', 'toko tetap jual cangkul common');
assert.ok(getTool('hoe', 2).speedMult < 1.0, 'cangkul common toko lebih baik dari starter');
assert.strictEqual(getTool('hoe', 6).speedMult, 0.40);
assert.strictEqual(getNextToolTier('hoe', 1).tier, 2);
assert.strictEqual(getNextToolTier('hoe', 6), null, 'tier 6 max');
assert.strictEqual(getToolSpeedMultiplier('pickaxe', 3), 0.70);

/* ---- Data Benih ---- */
assert.strictEqual(Object.keys(RARITIES).length, 5, '5 rarity global');
const ids = new Set();
for (const s of SEEDS) {
  assert.ok(!ids.has(s.id), `id ganda: ${s.id}`);
  ids.add(s.id);
  assert.ok(RARITIES[s.rarity], `rarity tidak valid: ${s.id}`);
  assert.ok(s.buyPrice < s.sellPrice, `jual harus lebih tinggi dari beli: ${s.id}`);
  assert.ok(s.levelUnlock >= 1 && s.levelUnlock <= G.MAX_LEVEL);
}
assert.strictEqual(getSeed('gandum').buyPrice, 1, 'Gandum beli 1 Viaz');
assert.strictEqual(getSeed('gandum').sellPrice, 2, 'Gandum jual 2 Viaz');
assert.strictEqual(getSeed('gandum').growMs, 60_000, 'Gandum tumbuh 1 menit');
assert.deepStrictEqual(getUnlockedSeeds(1).map((s) => s.id), ['gandum']);
assert.deepStrictEqual(getUnlockedSeeds(5).map((s) => s.id), ['gandum', 'wortel']);
// Benih baru selalu memberi XP/jam per plot lebih tinggi dari benih sebelumnya (alasan untuk naik level).
for (let i = 1; i < SEEDS.length; i++) {
  const rate = (s) => s.xp / s.growMs;
  assert.ok(rate(SEEDS[i]) > rate(SEEDS[i - 1]), `XP/jam ${SEEDS[i].id} harus > ${SEEDS[i - 1].id}`);
}

/* ---- Data Ores & Caves ---- */
assert.strictEqual(ORES.length, 15, '15 variasi ore');
assert.strictEqual(CAVES.length, 5, '5 kedalaman gua');
for (const o of ORES) {
  assert.ok(RARITIES[o.rarity], `rarity ore tidak valid: ${o.id}`);
  assert.ok(o.sellPrice > 0 && o.xp > 0);
}
assert.strictEqual(getCave('cave_shallow').unlockLevel, 1);
assert.strictEqual(getUnlockedCaves(1).length, 1);
assert.strictEqual(getUnlockedCaves(80).length, 5);

/* ---- Halving ---- */
assert.strictEqual(computeHalving(0).multiplier, 1);
assert.strictEqual(computeHalving(10_000_000).multiplier, 0.5);
assert.strictEqual(computeHalving(30_000_000).multiplier, 0.25);
assert.strictEqual(computeHalving(10_000_000_000).multiplier, FLOOR_MULTIPLIER);
assert.strictEqual(round2(1.005 * 100), 100.5);

/* ---- Level & plot Farming ---- */
const acc = newAccount();
assert.strictEqual(F.plotCapacity(acc), 100, 'awal 100 plot');
acc.skills.farming.level = 10;
assert.strictEqual(F.plotCapacity(acc), 200, 'Lv 10 +100 plot');
acc.skills.farming.level = 100;
assert.strictEqual(F.plotCapacity(acc), 1100, 'Lv 100 = 100 + 10 x 100');

{
  const a = newAccount();
  a.skills.farming.level = 9;
  const r = F.addFarmingXP(a, F.expToNext(9));
  assert.strictEqual(r.newLevel, 10);
  assert.strictEqual(r.plotsGained, G.PLOTS_PER_MILESTONE, 'Lv 10 beri 100 plot');
  assert.strictEqual(r.unlockedCave, true, 'Lv 10 buka akses gua');
  assert.strictEqual(a.inventory.pickaxe, 0, 'tidak beri pickaxe gratis');
}

/* ---- Tanam & Panen dengan Hoe Buff ---- */
{
  const a = newAccount();
  const t0 = 1_000_000;
  a.inventory.hoe = 3; // Cangkul Tembaga: durasi -15% (0.85)

  const res = F.plant(a, 'gandum', 100, t0);
  assert.ok(res.ok);
  assert.strictEqual(res.qty, 100);
  assert.strictEqual(res.finishedAt, t0 + Math.round(60_000 * 0.85), 'durasi tanam dipotong buff hoe');

  // Panen (rng never: 0% chance drop)
  const done = F.settle(a, t0 + 60_000, { manual: true, rng: never });
  assert.strictEqual(done.harvested.gandum, 100);
  assert.strictEqual(a.harvests.gandum, 100);
  assert.strictEqual(a.seeds.gandum, undefined, '0 benih jika semua roll gagal');

  // Uji seedsReturned dengan chance
  assert.strictEqual(F.seedsReturned(50, never), 0, 'chance gagal');
  assert.strictEqual(F.seedsReturned(50, () => 0.05), 50, 'chance berhasil');
  let sampleTotal = 0;
  for (let i = 0; i < 100; i++) sampleTotal += F.seedsReturned(100);
  assert.ok(sampleTotal >= 700 && sampleTotal <= 1300, `rata-rata 10% chance harus ~1000, dapat ${sampleTotal}`);
}

/* ---- Mutual Exclusion (1 Aktivitas Aktif) ---- */
{
  const a = newAccount();
  const t0 = 1_000_000;
  a.skills.farming.level = 10;
  a.inventory.pickaxe = 1;

  // Sedang menanam di Farm -> tidak boleh nambang
  F.plant(a, 'gandum', 10, t0);
  assert.strictEqual(canMine(a).ok, false, 'tidak boleh nambang jika sedang bertani');
  const mFail = M.startTrip(a, 'cave_shallow', t0);
  assert.strictEqual(mFail.ok, false);

  // Panen selesai -> boleh nambang
  F.settle(a, t0 + 60_000, { manual: true, rng: never });
  assert.strictEqual(canMine(a).ok, true);

  // Sedang nambang di Gua -> tidak boleh menanam
  const mOk = M.startTrip(a, 'cave_shallow', t0);
  assert.strictEqual(mOk.ok, true);
  assert.strictEqual(canPlant(a).ok, false, 'tidak boleh bertani jika sedang nambang');
  const pFail = F.plant(a, 'gandum', 10, t0);
  assert.strictEqual(pFail.ok, false);
}

/* ---- Ekspedisi Gua Tambang & Auto-Mining ---- */
{
  const a = newAccount();
  const t0 = 2_000_000;
  a.skills.farming.level = 10;
  a.inventory.pickaxe = 2; // Beliung Besi: durasi -15%

  const baseDuration = getCave('cave_shallow').baseDurationMs;
  const expectedDuration = Math.round(baseDuration * 0.85);

  const start = M.startTrip(a, 'cave_shallow', t0);
  assert.ok(start.ok);
  assert.strictEqual(start.finishedAt, t0 + expectedDuration);

  // Belum selesai
  const early = M.settleMining(a, t0 + 1000, { manual: true });
  assert.strictEqual(early.cycles, 0);

  // Selesai manual
  const done = M.settleMining(a, t0 + expectedDuration + 1, { manual: true });
  assert.strictEqual(done.cycles, 1);
  assert.ok(Object.keys(done.claimedOres).length > 0);
  assert.strictEqual(a.mining_trip, null);
  assert.ok(done.xp > 0);
  const oreCount = Object.values(done.claimedOres).reduce((s, n) => s + n, 0);
  assert.ok(oreCount >= 4 && oreCount <= 8, 'Lv1 gua dangkal: 4-8 ore');

  // Yield naik per level Mining; bobot ore: ore pertama paling sering
  assert.ok(M.oreYieldMult(50) > M.oreYieldMult(1));
  assert.deepStrictEqual(M.caveWeights(getCave('cave_shallow')), [4, 2, 1]);
  const big = M.rollOreDrops(getCave('cave_shallow'), Math.random, 100);
  assert.ok(Object.values(big).reduce((s, n) => s + n, 0) > 8, 'Lv100 dapat lebih banyak ore');

  // Auto-Mining (Mining Lv >= 10)
  a.skills.mining.level = 10;
  a.auto_mining = true;
  M.startTrip(a, 'cave_shallow', t0);
  const autoRes = M.settleMining(a, t0 + expectedDuration * 3 + 1);
  assert.strictEqual(autoRes.cycles, 3);
  assert.ok(a.mining_trip !== null, 'auto mining lanjut siklus baru');
}

/* ---- Kapasitas Tas / Backpack ---- */
{
  const a = newAccount();
  // 1 hoe + 100 gandum = 101 slot terpakai
  assert.strictEqual(usedSlots(a), 101);
  assert.strictEqual(maxSlots(a), 1000, 'slot dasar 1000');
  assert.strictEqual(freeSlots(a), 899);

  // Upgrade tas
  assert.ok(backpackPrice(1) > backpackPrice(0), 'harga upgrade tas makin mahal');
  a.bought_backpack = 1;
  assert.strictEqual(maxSlots(a), 1100);
  assert.strictEqual(freeSlots(a), 999);

  // Tambah ore
  a.ores = { batu: 50, besi: 50 };
  assert.strictEqual(usedSlots(a), 201);
  assert.strictEqual(freeSlots(a), 899);

  // Discard / Buang item (darurat tas penuh)
  const discardables = getDiscardableItems(a);
  assert.strictEqual(discardables.length, 3, 'gandum, batu, besi (alat tidak boleh)');
  const removed = discardItem(a, 'ores', 'batu', 20);
  assert.strictEqual(removed, 20);
  assert.strictEqual(a.ores.batu, 30);
  assert.strictEqual(usedSlots(a), 181, 'slot berkurang setelah discard');

  // Buang semua sisa batu
  discardItem(a, 'ores', 'batu', 100);
  assert.strictEqual(a.ores.batu, undefined);

  // Jika tas penuh, maxBuyable dibatasi sisa slot
  a.bought_backpack = 0; // max 1000
  a.seeds.gandum = 999; // 1 hoe + 999 gandum = 1000 terpakai
  a.ores = {};
  assert.strictEqual(freeSlots(a), 0);
  const gandum = getSeed('gandum');
  a.viaz = 1000;
  assert.strictEqual(F.maxBuyable(a, gandum), 0, 'tidak bisa beli jika tas penuh');
}

/* ---- Konsistensi countdown: status layar dan settle memakai momen yang sama ---- */
{
  const a = newAccount();
  const t0 = 9_000_000; // jam game (bisa beda dari jam dinding)
  const res = F.plant(a, 'gandum', 10, t0);
  assert.ok(res.ok);
  assert.strictEqual(res.finishedAt, t0 + 60_000, 'wheat 1 menit');
  const S = require('../src/ui/farmScreens');
  // Sebelum selesai: belum siap dan settle tidak memanen.
  assert.ok(S.farmMain(a, 'en', '', t0 + 30_000).body.join('\n').includes('⏳'));
  assert.strictEqual(F.settle(a, t0 + 30_000, { manual: true }).cycles, 0);
  // Tepat saat selesai: layar bilang siap DAN settle memanen (tidak ada selisih jam).
  assert.ok(S.farmMain(a, 'en', '', t0 + 60_000).body.join('\n').includes('✅ Ready'));
  assert.strictEqual(F.settle(a, t0 + 60_000, { manual: true }).cycles, 1);
}

console.log('game-check: semua lolos (Farming + Mining + Tools + Backpack + Mutual Exclusion)');
