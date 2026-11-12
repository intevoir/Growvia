'use strict';

/**
 * Pengunci aktivitas tunggal: Farming, Mining, Fishing, Dungeon saling eksklusif.
 * Mengembalikan kode (di-terjemahkan di UI) plus pesan Indonesia untuk kode lama.
 */

const isFarmingActive = (a) => Object.keys(a.plantings ?? {}).length > 0;
const isMiningActive = (a) => Boolean(a.mining_trip);
const isFishingActive = (a) => Boolean(a.fishing_session);
const isDungeonActive = (a) => Boolean(a.dungeon_run);

const REASON = {
  busy_farming: 'Kamu sedang menanam di Farm! Panen dulu.',
  busy_mining: 'Kamu sedang menjalankan ekspedisi tambang! Selesaikan dulu.',
  busy_fishing: 'Kamu sedang memancing! Tarik pancingan dulu.',
  busy_dungeon: 'Kamu sedang di dalam dungeon! Selesaikan atau kabur dulu.',
};

/** Cek semua aktivitas kecuali `self`. */
function check(account, self) {
  const active = [
    ['farming', isFarmingActive],
    ['mining', isMiningActive],
    ['fishing', isFishingActive],
    ['dungeon', isDungeonActive],
  ];
  for (const [name, fn] of active) {
    if (name !== self && fn(account)) {
      const code = `busy_${name}`;
      return { ok: false, code, reason: REASON[code] };
    }
  }
  return { ok: true };
}

const canPlant = (a) => check(a, 'farming');
const canMine = (a) => check(a, 'mining');
const canFishActivity = (a) => check(a, 'fishing');
const canDungeon = (a) => check(a, 'dungeon');

module.exports = {
  isFarmingActive,
  isMiningActive,
  isFishingActive,
  isDungeonActive,
  canPlant,
  canMine,
  canFishActivity,
  canDungeon,
};
