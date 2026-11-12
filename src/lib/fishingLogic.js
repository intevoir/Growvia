'use strict';

/**
 * Logika fishing murni (tanpa I/O).
 * Sesi AFK: pasang pancingan + pilih umpan + jumlah bait -> strike otomatis per interval ->
 * setiap strike 1 bait habis, 1 ikan tertangkap (rarity berdasarkan pool umpan, bobot acak).
 * Sesi berhenti jika: bait habis ATAU slot tas penuh.
 * Pemain klik "Tarik Pancingan" kapan saja untuk klaim semua ikan dan sisa bait kembali.
 */

const G = require('../config/game');
const { FISHES, BAITS, BASE_STRIKE_MS, MAX_FISHING_OFFLINE_MS, getBait, getFish } = require('../data/fishes');
const { getToolSpeedMultiplier, getTool } = require('../data/tools');
const { farmingLevel } = require('./farmLogic');
const { addXp } = require('./xp');
const { miningLevel } = require('./miningLogic');
const { freeSlots } = require('./backpack');
const { canFishActivity } = require('./activityLock');
const { round2 } = require('./halvingMath');
const { record } = require('./progress');
const { effectOf } = require('./boosts');
const { now: clockNow } = require('./clock');

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function fishingLevel(account) {
  return account.skills?.fishing?.level ?? 1;
}

function canFish(account) {
  return farmingLevel(account) >= 30 && miningLevel(account) >= 20;
}

const addFishingXP = (account, xp) => addXp(account, 'fishing', xp);

/** Roll rarity ikan berdasarkan pool umpan. */
/** Geser distribusi rarity ke atas: 15% peluang tiap tier pindah ke tier di atasnya (booster hoki). */
function shiftPool(pool) {
  const out = pool.map((p, i) => {
    const up = i > 0 ? pool[i - 1] * 0.15 : 0;
    return Math.max(0, p - p * 0.15 + up);
  });
  const sum = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((p) => (p * 100) / sum);
}

function rollRarity(bait, rng = Math.random, pool = bait.pool) {
  const roll = rng() * 100;
  let cum = 0;
  for (let i = 0; i < pool.length; i++) {
    cum += pool[i];
    if (roll < cum) return RARITY_ORDER[i];
  }
  return RARITY_ORDER[RARITY_ORDER.length - 1];
}

/** Roll ikan spesifik dari rarity pool + bobot acak (lbs). Disimpan ringkas: { id, rarity, weight }. */
function rollFish(bait, rodTier = 1, rng = Math.random, luck = 1, weightMul = 1) {
  const pool = luck > 1 ? shiftPool(bait.pool) : bait.pool;
  const rarity = rollRarity(bait, rng, pool);
  const candidates = FISHES.filter((f) => f.rarity === rarity);
  const fish = candidates[Math.floor(rng() * candidates.length)];
  const rod = getTool('rod', rodTier);
  const weightMult = rod?.weightMult ?? 1.0;
  const rawWeight = fish.minLbs + rng() * (fish.maxLbs - fish.minLbs);
  const weight = Math.round(rawWeight * weightMult * weightMul * 10) / 10;
  return { id: fish.id, rarity: fish.rarity, weight };
}

function fail(code, extra = {}) {
  return { ok: false, code, ...extra };
}

function isFishingActive(account) {
  return Boolean(account.fishing_session);
}

/** Mulai sesi mancing AFK. */
function startFishing(account, baitId, qty, now = clockNow()) {
  if (!canFish(account)) return fail('fish_locked');

  const rodTier = account.inventory?.rod ?? 0;
  if (rodTier < 1) return fail('no_rod');

  const bait = getBait(baitId);
  if (!bait) return fail('not_found');

  const owned = account.baits?.[baitId] ?? 0;
  if (owned <= 0) return fail('no_bait', { bait });

  if (account.fishing_session) return fail('busy_fishing');

  const lock = canFishActivity(account);
  if (!lock.ok) return fail(lock.code);

  const amount = Math.min(Math.floor(qty), owned);
  if (amount < 1) return fail('bad_amount');

  const speedMult = getToolSpeedMultiplier('rod', rodTier);
  const strikeMs = Math.max(1000, Math.round(BASE_STRIKE_MS * speedMult));

  account.baits[baitId] = owned - amount;
  if (account.baits[baitId] <= 0) delete account.baits[baitId];

  account.fishing_session = {
    bait_id: baitId,
    baits_loaded: amount,
    baits_remaining: amount,
    rod_tier: rodTier,
    strike_ms: strikeMs,
    started_at: now,
    last_strike_at: now,
    fishes_caught: [],
  };

  return { ok: true, bait, qty: amount, strikeMs };
}

/**
 * Settle sesi mancing (lazy loop): hitung semua strike yang terlewat sampai `now`.
 * Setiap strike: 1 bait habis, 1 ikan ditangkap (jika slot tersedia).
 * Sesi berhenti jika bait habis atau slot penuh.
 */
function settleFishing(account, now = clockNow(), { rng = Math.random } = {}) {
  const result = {
    caught: [],
    xp: 0,
    baitsUsed: 0,
    baitsReturned: 0,
    levelUps: 0,
    newLevel: fishingLevel(account),
    sessionEnded: false,
    bagFull: false,
    changed: false,
  };

  const session = account.fishing_session;
  if (!session) return result;

  const bait = getBait(session.bait_id);
  if (!bait) {
    account.fishing_session = null;
    result.changed = true;
    return result;
  }

  if (!Array.isArray(account.fishes)) account.fishes = [];

  const strikeMs = session.strike_ms;
  let lastStrike = session.last_strike_at;
  let remaining = session.baits_remaining;
  const maxStrikes = Math.floor(MAX_FISHING_OFFLINE_MS / strikeMs);
  let strikes = 0;

  while (lastStrike + strikeMs <= now && remaining > 0 && strikes < maxStrikes) {
    // Cek slot tas (1 ikan = 1 slot)
    if (freeSlots(account) < 1) {
      result.bagFull = true;
      break;
    }

    lastStrike += strikeMs;
    remaining -= 1;
    strikes += 1;

    const fish = rollFish(bait, session.rod_tier, rng, effectOf(account, 'luck'), effectOf(account, 'weight'));
    account.fishes.push(fish);
    result.caught.push(fish);
    result.xp += bait.xp;
    result.baitsUsed += 1;
    result.changed = true;
    record(account, 'fish', 1, { fish });
  }

  session.last_strike_at = lastStrike;
  session.baits_remaining = remaining;

  // Sesi berakhir jika bait habis atau tas penuh
  if (remaining <= 0 || result.bagFull) {
    // Kembalikan sisa bait ke tas
    if (remaining > 0) {
      if (!account.baits) account.baits = {};
      account.baits[session.bait_id] = (account.baits[session.bait_id] ?? 0) + remaining;
      result.baitsReturned = remaining;
    }
    account.fishing_session = null;
    result.sessionEnded = true;
    result.changed = true;
  }

  if (result.xp > 0) {
    const gained = addFishingXP(account, result.xp);
    result.levelUps = gained.levelUps;
    result.newLevel = gained.newLevel;
  }

  return result;
}

/** Tarik pancingan secara manual (klaim semua ikan + sisa bait kembali). */
function reelIn(account, now = clockNow(), { rng = Math.random } = {}) {
  // Settle dulu semua strike yang tertunda
  const settleResult = settleFishing(account, now, { rng });

  // Jika sesi masih berjalan (bait belum habis & tas belum penuh), akhiri manual
  if (account.fishing_session) {
    const session = account.fishing_session;
    const remaining = session.baits_remaining;
    if (remaining > 0) {
      if (!account.baits) account.baits = {};
      account.baits[session.bait_id] = (account.baits[session.bait_id] ?? 0) + remaining;
      settleResult.baitsReturned += remaining;
    }
    account.fishing_session = null;
    settleResult.sessionEnded = true;
    settleResult.changed = true;
  }

  return settleResult;
}

/** Nilai jual 1 ikan = bobot × harga per lbs (definisi terkini) × multiplier halving. */
function fishValue(fish, multiplier = 1) {
  const perLb = getFish(fish.id)?.pricePerLb ?? Number(fish.pricePerLb) ?? 0;
  return round2((Number(fish.weight) || 0) * (Number(perLb) || 0) * multiplier);
}

module.exports = {
  fishValue,
  fishingLevel,
  canFish,
  addFishingXP,
  rollRarity,
  rollFish,
  isFishingActive,
  startFishing,
  settleFishing,
  reelIn,
};
