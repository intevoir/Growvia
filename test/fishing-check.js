'use strict';

/**
 * self-check fishingLogic: AFK loop, pool rarity, mutual exclusion, rod buff, reel in.
 * Jalankan: node test/fishing-check.js
 */

const assert = require('node:assert');
const { getBait, getFish, BAITS, FISHES, BASE_STRIKE_MS } = require('../src/data/fishes');
const { getTool } = require('../src/data/tools');
const FL = require('../src/lib/fishingLogic');

function newAccount() {
  return {
    user_id: 'u1',
    skills: {
      farming: { level: 30, exp: 0 },
      mining: { level: 20, exp: 0 },
      fishing: { level: 1, exp: 0 },
    },
    viaz: 0,
    seeds: {},
    harvests: {},
    plantings: {},
    bought_plots: 0,
    auto_plant: false,
    ores: {},
    mining_trip: null,
    auto_mining: false,
    bought_backpack: 0,
    lang: 'en',
    baits: { cacing: 50 },
    fishes: [],
    fishing_session: null,
    inventory: { hoe: 1, pickaxe: 1, rod: 1 },
    items: { hoe_1: 1, pickaxe_1: 1, rod_1: 1 },
  };
}

const always = (v) => () => v;

/* ---- Data ikan & umpan ---- */
assert.strictEqual(FISHES.length, 15, '15 spesies ikan');
assert.strictEqual(BAITS.length, 12, '12 variasi umpan');
for (const b of BAITS) {
  assert.strictEqual(b.pool.reduce((a, c) => a + c, 0), 100, `pool umpan ${b.id} harus 100`);
  assert.ok(b.cost > 0, 'semua umpan berbayar');
}
assert.ok(getFish('kraken'));
assert.ok(getBait('darah_kraken'));

/* ---- Roll rarity dari pool ---- */
assert.strictEqual(FL.rollRarity(getBait('cacing'), always(0.99)), 'uncommon'); // 99 < 90+10 => tidak, 99 < 100 => uncommon
assert.strictEqual(FL.rollRarity(getBait('cacing'), always(0.5)), 'common');    // 50 < 90 => common
assert.strictEqual(FL.rollRarity(getBait('darah_kraken'), always(0.99)), 'legendary');

/* ---- Roll ikan & bobot ---- */
{
  const fish = FL.rollFish(getBait('cacing'), 1, always(0.5));
  assert.ok(fish.id && fish.rarity);
  const def = getFish(fish.id);
  assert.ok(fish.weight >= def.minLbs);
  assert.ok(fish.weight <= def.maxLbs);
}
{
  const fishT1 = FL.rollFish(getBait('cacing'), 1, always(0.5));
  const fishT5 = FL.rollFish(getBait('cacing'), 5, always(0.5));
  assert.ok(fishT5.weight > fishT1.weight, 'rod tier 5 menangkap ikan lebih berat');
}

/* ---- Syarat akses: Farming 30 + Mining 20 ---- */
{
  const a = newAccount();
  a.skills.farming.level = 29;
  a.skills.mining.level = 1;
  assert.strictEqual(FL.canFish(a), false);
  a.skills.farming.level = 30;
  assert.strictEqual(FL.canFish(a), false, 'mining harus 20');
  a.skills.mining.level = 20;
  assert.strictEqual(FL.canFish(a), true);
}

/* ---- Mulai sesi AFK ---- */
{
  const a = newAccount();
  const t0 = 10_000_000;
  const res = FL.startFishing(a, 'cacing', 20, t0);
  assert.ok(res.ok, res.reason);
  assert.strictEqual(res.qty, 20);
  assert.strictEqual(a.baits.cacing, 30, '50 - 20 = 30 sisa');
  assert.strictEqual(a.fishing_session.baits_remaining, 20);

  // Tidak bisa mulai lagi saat sesi berjalan
  assert.ok(!FL.startFishing(a, 'cacing', 5, t0).ok);

  // Strike tiap 5 menit (rod T1)
  const one = FL.settleFishing(a, t0 + BASE_STRIKE_MS, { rng: always(0.5) });
  assert.strictEqual(one.caught.length, 1);
  assert.strictEqual(one.baitsUsed, 1);
  assert.strictEqual(a.fishing_session.baits_remaining, 19);
  assert.strictEqual(a.fishes.length, 1);
  assert.ok(a.fishes[0].weight > 0);

  // 10 strike sekaligus
  const ten = FL.settleFishing(a, t0 + BASE_STRIKE_MS * 11, { rng: always(0.5) });
  assert.strictEqual(ten.caught.length, 10);
  assert.strictEqual(a.fishes.length, 11);

  // Tas penuh -> sesi berhenti & sisa bait kembali
  a.bought_backpack = 1; // 1100 slot
  a.fishes = new Array(1068).fill({ id: 'teri', weight: 5 }); // 1 rod + 30 bait + 1068 ikan = 1099 -> sisa 1 slot
  const beforeBaits = a.baits.cacing ?? 0;
  const stop = FL.settleFishing(a, t0 + BASE_STRIKE_MS * 20, { rng: always(0.5) });
  assert.ok(stop.bagFull, 'bagFull terdeteksi');
  assert.ok(stop.sessionEnded);
  assert.strictEqual(a.fishing_session, null);
  assert.ok((a.baits.cacing ?? 0) > beforeBaits, 'sisa bait kembali');
}

/* ---- Reel In (tarik pancingan manual) ---- */
{
  const a = newAccount();
  const t0 = 20_000_000;
  a.baits = { udang: 10 };
  FL.startFishing(a, 'udang', 10, t0);
  // 3 strike
  const res = FL.reelIn(a, t0 + BASE_STRIKE_MS * 3, { rng: always(0.5) });
  assert.strictEqual(res.caught.length, 3);
  assert.ok(res.sessionEnded);
  assert.strictEqual(a.fishing_session, null);
  assert.strictEqual(a.baits.udang, 7, '10 - 3 = 7 bait kembali');
  assert.strictEqual(a.fishes.length, 3);
  assert.ok(res.xp > 0);
}

/* ---- Rod buff mempercepat strike ---- */
{
  const a = newAccount();
  const t0 = 30_000_000;
  a.inventory.rod = 5; // speedMult 0.60
  const res = FL.startFishing(a, 'cacing', 5, t0);
  assert.ok(res.ok);
  assert.strictEqual(res.strikeMs, Math.round(BASE_STRIKE_MS * getTool('rod', 5).speedMult));
}

/* ---- Mutual exclusion ---- */
{
  const a = newAccount();
  const t0 = 40_000_000;

  // Sedang bertani -> tidak boleh mancing
  a.plantings = { gandum: { qty: 5, planted_at: t0, finished_at: t0 + 60000 } };
  assert.ok(!FL.startFishing(a, 'cacing', 5, t0).ok);
  delete a.plantings.gandum;

  // Sedang tambang -> tidak boleh mancing
  a.mining_trip = { cave_id: 'cave_shallow', started_at: t0, finished_at: t0 + 60000, duration_ms: 60000 };
  assert.ok(!FL.startFishing(a, 'cacing', 5, t0).ok);
  a.mining_trip = null;

  // Normal
  assert.ok(FL.startFishing(a, 'cacing', 5, t0).ok);
}

/* ---- XP Fishing naik level ---- */
{
  const a = newAccount();
  a.skills.fishing = { level: 9, exp: 0 };
  const { expToNext } = require('../src/lib/farmLogic');
  a.skills.fishing.exp = expToNext(9) - 1;
  const gained = FL.addFishingXP(a, 5);
  assert.strictEqual(gained.levelUps, 1);
  assert.strictEqual(gained.newLevel, 10);
}

console.log('fishing-check: semua lolos (BAITS pool, roll ikan, AFK loop, reel in, syarat akses, mutual exclusion)');
