'use strict';

/**
 * Logika farming murni (tanpa I/O): level, plot, tanam, panen, auto-tanam.
 * Semua fungsi memutasi `account` di memori; penyimpanan dilakukan pemanggil.
 */

const G = require('../config/game');
const { getSeed } = require('../data/seeds');
const { getToolSpeedMultiplier } = require('../data/tools');
const { canPlant } = require('./activityLock');
const { freeSlots } = require('./backpack');
const { price } = require('./viazRate');
const { expToNext, skillLevel, addXp } = require('./xp');
const { record } = require('./progress');
const { now: clockNow } = require('./clock');
const { effectOf } = require('./boosts');

/* ============ Level ============ */

function farmingLevel(account) {
  return skillLevel(account, 'farming');
}

/** Tambah XP Farming. Mengembalikan { levelUps, newLevel, plotsGained, unlockedCave }. */
function addFarmingXP(account, xp) {
  const oldLevel = farmingLevel(account);
  const { levelUps, newLevel } = addXp(account, 'farming', xp);
  const milestones =
    Math.floor(newLevel / G.MILESTONE_EVERY_LEVELS) - Math.floor(oldLevel / G.MILESTONE_EVERY_LEVELS);
  return {
    levelUps,
    newLevel,
    plotsGained: milestones * G.PLOTS_PER_MILESTONE,
    unlockedCave: oldLevel < 10 && newLevel >= 10,
  };
}

/* ============ Plot ============ */

/** Total plot = plot awal + bonus tiap kelipatan level + plot yang dibeli. */
function plotCapacity(account) {
  const milestones = Math.floor(farmingLevel(account) / G.MILESTONE_EVERY_LEVELS);
  return G.START_PLOTS + milestones * G.PLOTS_PER_MILESTONE + (account.bought_plots ?? 0);
}

function usedPlots(account) {
  let used = 0;
  for (const batch of Object.values(account.plantings ?? {})) used += batch?.qty ?? 0;
  return used;
}

function freePlots(account) {
  return Math.max(0, plotCapacity(account) - usedPlots(account));
}

/** Harga plot berikutnya jika sudah membeli `bought` plot (ikut kurs halving). */
function plotPrice(bought) {
  return price(Math.floor(G.PLOT_BASE_PRICE * G.PLOT_PRICE_GROWTH ** bought));
}

function plotsCost(bought, qty) {
  let total = 0;
  for (let i = 0; i < qty; i++) total += plotPrice(bought + i);
  return total;
}

function canAutoPlant(account) {
  return farmingLevel(account) >= G.AUTO_PLANT_LEVEL;
}

/**
 * Jumlah benih terbanyak yang boleh dibeli sekali klik.
 * Dibatasi saldo Viaz pemain.
 */
function maxBuyable(account, seed) {
  const freeBag = freeSlots(account);
  if (seed.buyPrice <= 0) {
    const held = (account.seeds?.[seed.id] ?? 0) + (account.plantings?.[seed.id]?.qty ?? 0);
    return Math.max(0, Math.min(G.MAX_BUY_PER_ACTION, plotCapacity(account) - held, freeBag));
  }
  const affordable = Math.floor(account.viaz / price(seed.buyPrice));
  return Math.max(0, Math.min(G.MAX_BUY_PER_ACTION, affordable, freeBag));
}

/* ============ Tanam ============ */

/**
 * Peluang 10% per tanaman untuk menjatuhkan benih kembali saat dipanen (chance, bukan pasti).
 */
function seedsReturned(qty, rng = Math.random, rate = G.SEED_RETURN_RATE) {
  let returned = 0;
  const count = Math.max(0, Math.floor(qty));
  for (let i = 0; i < count; i++) {
    if (rng() < rate) returned += 1;
  }
  return returned;
}

function maxPlantable(account, seedId) {
  return Math.max(0, Math.min(account.seeds?.[seedId] ?? 0, freePlots(account)));
}

function fail(code, extra = {}) {
  return { ok: false, code, ...extra };
}

/** Tanam `qty` benih (dipotong ke batas benih dan plot kosong). */
function plant(account, seedId, qty, now = clockNow()) {
  const lockCheck = canPlant(account);
  if (!lockCheck.ok) return fail(lockCheck.code);

  const seed = getSeed(seedId);
  if (!seed) return fail('not_found');
  if (farmingLevel(account) < seed.levelUnlock) {
    return fail('seed_locked', { seed });
  }
  if (!((account.inventory?.hoe ?? 0) > 0)) return fail('no_hoe');
  if (account.plantings[seedId]) return fail('already_growing', { seed });

  const owned = account.seeds[seedId] ?? 0;
  if (owned <= 0) return fail('no_seeds', { seed });
  if (freePlots(account) <= 0) return fail('no_plots');

  const amount = Math.min(Math.floor(qty), owned, freePlots(account));
  if (!(amount >= 1)) return fail('bad_amount');

  const hoeTier = account.inventory?.hoe ?? 1;
  const speedMult = getToolSpeedMultiplier('hoe', hoeTier) * effectOf(account, 'speed');
  const growMs = Math.max(1000, Math.round(seed.growMs * speedMult));

  account.seeds[seedId] = owned - amount;
  if (account.seeds[seedId] <= 0) delete account.seeds[seedId];
  account.plantings[seedId] = { qty: amount, planted_at: now, finished_at: now + growMs };
  return { ok: true, seed, qty: amount, finishedAt: now + growMs };
}

/* ============ Panen & Auto-Tanam ============ */

/**
 * Proses tanaman yang sudah selesai tumbuh.
 * Mengembalikan ringkasan { harvested, seedsBack, xp, cycles, levelUps, newLevel, plotsGained, unlockedPickaxe, changed }.
 */
function settle(account, now = clockNow(), { manual = false, rng = Math.random } = {}) {
  const result = {
    harvested: {},
    seedsBack: {},
    xp: 0,
    cycles: 0,
    levelUps: 0,
    newLevel: farmingLevel(account),
    plotsGained: 0,
    unlockedCave: false,
    bagFull: false,
    changed: false,
  };
  const auto = Boolean(account.auto_plant) && canAutoPlant(account);

  const collect = (seed, qty) => {
    const back = seedsReturned(qty, rng, Math.min(1, G.SEED_RETURN_RATE * effectOf(account, 'luck') * effectOf(account, 'seeds')));
    account.harvests[seed.id] = (account.harvests[seed.id] ?? 0) + qty;
    if (back > 0) account.seeds[seed.id] = (account.seeds[seed.id] ?? 0) + back;
    result.harvested[seed.id] = (result.harvested[seed.id] ?? 0) + qty;
    if (back > 0) result.seedsBack[seed.id] = (result.seedsBack[seed.id] ?? 0) + back;
    result.xp += qty * seed.xp;
    result.cycles += 1;
    result.changed = true;
    record(account, 'harvest', qty, { seedId: seed.id });
  };

  const hoeTier = account.inventory?.hoe ?? 1;
  const speedMult = getToolSpeedMultiplier('hoe', hoeTier) * effectOf(account, 'speed');

  for (const [seedId, batch] of Object.entries(account.plantings)) {
    const seed = getSeed(seedId);
    if (!seed || !(batch?.qty > 0)) {
      delete account.plantings[seedId];
      result.changed = true;
      continue;
    }
    if (now < batch.finished_at) continue;
    if (!auto && !manual) continue;

    // Cek kapasitas tas sebelum memanen
    const neededSpace = batch.qty + Math.floor(batch.qty * G.SEED_RETURN_RATE);
    if (freeSlots(account) < neededSpace) {
      result.bagFull = true;
      continue;
    }

    if (!auto) {
      collect(seed, batch.qty);
      delete account.plantings[seedId];
      continue;
    }

    const growMs = Math.max(1000, Math.round(seed.growMs * speedMult));
    let qty = batch.qty;
    let finishedAt = batch.finished_at;
    let cycles = 0;
    let alive = true;
    const maxCycles = Math.max(1, Math.floor(G.AUTO_MAX_OFFLINE_MS / growMs));

    while (finishedAt <= now && cycles < maxCycles) {
      collect(seed, qty);
      cycles += 1;
      const take = Math.min(qty, account.seeds[seedId] ?? 0);
      if (take <= 0) {
        alive = false;
        break;
      }
      account.seeds[seedId] -= take;
      if (account.seeds[seedId] <= 0) delete account.seeds[seedId];
      qty = take;
      finishedAt += growMs;
    }

    if (!alive) {
      delete account.plantings[seedId];
    } else {
      if (finishedAt <= now) finishedAt = now + growMs;
      account.plantings[seedId] = {
        qty,
        planted_at: finishedAt - growMs,
        finished_at: finishedAt,
      };
    }
  }

  if (result.xp > 0) {
    const gained = addFarmingXP(account, result.xp);
    result.levelUps = gained.levelUps;
    result.newLevel = gained.newLevel;
    result.plotsGained = gained.plotsGained;
    result.unlockedCave = gained.unlockedCave;
  }
  return result;
}

module.exports = {
  expToNext,
  farmingLevel,
  addFarmingXP,
  plotCapacity,
  usedPlots,
  freePlots,
  plotPrice,
  plotsCost,
  canAutoPlant,
  maxBuyable,
  seedsReturned,
  maxPlantable,
  plant,
  settle,
};
