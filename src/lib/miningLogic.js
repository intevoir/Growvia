'use strict';

/**
 * Logika penambangan gua murni (tanpa I/O): ekspedisi, durasi, drop ore, XP, auto-mining.
 */

const G = require('../config/game');
const { getCave, getOre } = require('../data/ores');
const { getToolSpeedMultiplier } = require('../data/tools');
const { farmingLevel } = require('./farmLogic');
const { addXp } = require('./xp');
const { record } = require('./progress');
const { effectOf } = require('./boosts');
const { now: clockNow } = require('./clock');
const { canMine } = require('./activityLock');
const { freeSlots } = require('./backpack');

function miningLevel(account) {
  return account.skills?.mining?.level ?? 1;
}

function canAutoMine(account) {
  return miningLevel(account) >= 10;
}

const addMiningXP = (account, xp) => addXp(account, 'mining', xp);

/** Pengali jumlah ore per ekspedisi dari level Mining (setara plot di Farming), dikali booster. */
function oreYieldMult(level, mul = 1) {
  return (1 + (Math.max(1, level) - 1) * G.MINING_YIELD_PER_LEVEL) * mul;
}

/** Bobot ore di gua: ore pertama paling sering, terakhir paling langka (4:2:1). */
function caveWeights(cave) {
  return cave.oreIds.map((_, i) => 2 ** (cave.oreIds.length - 1 - i));
}

const maxTripOres = (cave, level, mul = 1) => Math.round(cave.maxDrop * oreYieldMult(level, mul));

function rollOreDrops(cave, rng = Math.random, level = 1, mul = 1) {
  const drops = {};
  const base = cave.minDrop + rng() * (cave.maxDrop - cave.minDrop);
  const count = Math.max(1, Math.round(base * oreYieldMult(level, mul)));
  const weights = caveWeights(cave);
  const total = weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < count; i++) {
    let roll = rng() * total;
    let idx = 0;
    while (roll >= weights[idx] && idx < weights.length - 1) roll -= weights[idx++];
    const oreId = cave.oreIds[idx];
    drops[oreId] = (drops[oreId] ?? 0) + 1;
  }
  return drops;
}

function fail(code, extra = {}) {
  return { ok: false, code, ...extra };
}

function startTrip(account, caveId, now = clockNow()) {
  const lockCheck = canMine(account);
  if (!lockCheck.ok) return fail(lockCheck.code);

  if (farmingLevel(account) < 10) {
    return fail('mine_locked');
  }

  const pickaxeTier = account.inventory?.pickaxe ?? 0;
  if (pickaxeTier < 1) {
    return fail('no_pickaxe');
  }

  const cave = getCave(caveId);
  if (!cave) return fail('not_found');
  if (miningLevel(account) < cave.unlockLevel) {
    return fail('cave_locked', { cave });
  }

  if (account.mining_trip) {
    return fail('busy_mining');
  }

  const speedMult = getToolSpeedMultiplier('pickaxe', pickaxeTier) * effectOf(account, 'speed');
  const durationMs = Math.max(1000, Math.round(cave.baseDurationMs * speedMult));

  account.mining_trip = {
    cave_id: cave.id,
    started_at: now,
    finished_at: now + durationMs,
    duration_ms: durationMs,
  };

  return { ok: true, cave, finishedAt: now + durationMs, durationMs };
}

function settleMining(account, now = clockNow(), { manual = false, rng = Math.random } = {}) {
  const result = {
    claimedOres: {},
    xp: 0,
    cycles: 0,
    levelUps: 0,
    newLevel: miningLevel(account),
    bagFull: false,
    changed: false,
  };

  const trip = account.mining_trip;
  if (!trip) return result;

  const cave = getCave(trip.cave_id);
  if (!cave) {
    account.mining_trip = null;
    result.changed = true;
    return result;
  }

  if (now < trip.finished_at) return result;

  const auto = Boolean(account.auto_mining) && canAutoMine(account);
  if (!auto && !manual) return result;

  // Cek kapasitas tas sebelum mengambil ore
  if (freeSlots(account) < maxTripOres(cave, miningLevel(account), effectOf(account, 'yield'))) {
    result.bagFull = true;
    return result;
  }

  if (!account.ores) account.ores = {};

  const collect = () => {
    const drops = rollOreDrops(cave, rng, miningLevel(account), effectOf(account, 'yield'));
    for (const [id, qty] of Object.entries(drops)) {
      account.ores[id] = (account.ores[id] ?? 0) + qty;
      result.claimedOres[id] = (result.claimedOres[id] ?? 0) + qty;
      result.xp += qty * (getOre(id)?.xp ?? 0);
    }
    record(account, 'mine', Object.values(drops).reduce((s, n) => s + n, 0), { ores: drops });
    result.cycles += 1;
    result.changed = true;
  };

  const pickaxeTier = account.inventory?.pickaxe ?? 1;
  const speedMult = getToolSpeedMultiplier('pickaxe', pickaxeTier) * effectOf(account, 'speed');
  const durationMs = Math.max(1000, Math.round(cave.baseDurationMs * speedMult));

  if (!auto) {
    collect();
    account.mining_trip = null;
  } else {
    let finishedAt = trip.finished_at;
    let cycles = 0;
    const maxCycles = Math.max(1, Math.floor(G.AUTO_MAX_OFFLINE_MS / durationMs));

    while (finishedAt <= now && cycles < maxCycles) {
      if (cycles > 0 && freeSlots(account) < maxTripOres(cave, miningLevel(account), effectOf(account, 'yield'))) {
        result.bagFull = true;
        break;
      }
      collect();
      cycles += 1;
      finishedAt += durationMs;
    }

    if (finishedAt <= now && !result.bagFull) finishedAt = now + durationMs;
    account.mining_trip = {
      cave_id: cave.id,
      started_at: finishedAt - durationMs,
      finished_at: finishedAt,
      duration_ms: durationMs,
    };
  }

  if (result.xp > 0) {
    const gained = addMiningXP(account, result.xp);
    result.levelUps = gained.levelUps;
    result.newLevel = gained.newLevel;
  }

  return result;
}

module.exports = {
  miningLevel,
  canAutoMine,
  addMiningXP,
  rollOreDrops,
  oreYieldMult,
  caveWeights,
  maxTripOres,
  startTrip,
  settleMining,
};
