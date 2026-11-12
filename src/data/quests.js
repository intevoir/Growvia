'use strict';

/**
 * Template quest harian & mingguan. Target & hadiah dihitung di lib/progress.js sesuai level pemain,
 * jadi quest tetap relevan dari pemula sampai Lv 100.
 * event = aksi yang menaikkan progres (lihat record() di lib/progress.js).
 */
const QUEST_TYPES = {
  harvest: { emote: '🌾', skill: 'farming', en: 'Harvest {n} crops', name: 'Panen {n} tanaman' },
  mine: { emote: '⛏️', skill: 'mining', en: 'Mine {n} ores', name: 'Tambang {n} ore' },
  fish: { emote: '🎣', skill: 'fishing', en: 'Catch {n} fish', name: 'Tangkap {n} ikan' },
  dungeon: { emote: '🔮', skill: 'dungeon', en: 'Clear {n} dungeons', name: 'Taklukkan {n} dungeon' },
  earn: { emote: '💰', skill: null, en: 'Earn {n} Viaz from sales and loot', name: 'Dapatkan {n} Viaz dari penjualan dan loot' },
};

const QUEST_IDS = Object.keys(QUEST_TYPES);

module.exports = { QUEST_TYPES, QUEST_IDS };
