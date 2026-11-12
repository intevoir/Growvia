'use strict';

/**
 * Booster berbayar Viaz (konsumsi sementara berbayar Viaz — sink ekonomi + jalan pintas XP/Viaz).
 * effect: pengali yang dipakai logika game (lihat src/lib/boosts.js).
 *   xp          : semua XP x2
 *   xp_farming / xp_mining / xp_fishing / xp_dungeon : XP skill itu x2
 *   sell        : hasil penjualan +50%
 *   luck        : peluang langka (fishing pool, dungeon loot) naik + benih kembali x2
 *   seeds       : peluang benih kembali tambahan x2
 *   yield       : jumlah ore per ekspedisi x1.5
 *   weight      : bobot ikan x1.5
 *   loot        : peluang loot dungeon x1.5
 *   speed       : waktu tumbuh & tambang -20%
 * `skill` = skill acuan untuk syarat level & skala harga. Harga = payHours jam pendapatan di level
 * skill itu (lihat incomePerHour di lib/boosts.js): murah untuk pemain baru/server baru (level rendah),
 * mahal menjelang level tinggi (sink jangka panjang).
 */
const HOUR = 60 * 60 * 1000;

const BOOSTS = [
  // Global
  { id: 'xp', name: 'XP Doubling', en: 'XP Doubling', emote: '⭐', skill: null, unlockLevel: 1, durationMs: 6 * HOUR, payHours: 2, effect: { xp: 2 }, desc: 'Semua XP x2 selama 6 jam', descEn: 'All XP x2 for 6 hours' },
  { id: 'sell', name: 'Viaz Rush', en: 'Viaz Rush', emote: '💰', skill: null, unlockLevel: 1, durationMs: 6 * HOUR, payHours: 2, effect: { sell: 1.5 }, desc: 'Hasil jual +50% selama 6 jam', descEn: 'Sell prices +50% for 6 hours' },
  { id: 'luck', name: 'Lucky Hour', en: 'Lucky Hour', emote: '🍀', skill: null, unlockLevel: 1, durationMs: 6 * HOUR, payHours: 2, effect: { luck: 2 }, desc: 'Peluang langka naik + benih kembali x2 selama 6 jam', descEn: 'Better rare chances and 2x seed returns for 6 hours' },
  { id: 'speed', name: 'Overdrive', en: 'Overdrive', emote: '⚡', skill: null, unlockLevel: 1, durationMs: 6 * HOUR, payHours: 1.5, effect: { speed: 0.8 }, desc: 'Waktu tumbuh & tambang -20% selama 6 jam', descEn: 'Growth and mining time -20% for 6 hours' },
  // Farming
  { id: 'feast', name: 'Pesta Panen', en: "Farmer's Feast", emote: '🌾', skill: 'farming', unlockLevel: 1, durationMs: 4 * HOUR, payHours: 1.5, effect: { xp_farming: 2 }, desc: 'XP Farming x2 selama 4 jam', descEn: 'Farming XP x2 for 4 hours' },
  { id: 'bumper', name: 'Benih Berkah', en: 'Bumper Seeds', emote: '🌰', skill: 'farming', unlockLevel: 10, durationMs: 8 * HOUR, payHours: 1, effect: { seeds: 4 }, desc: 'Peluang benih kembali x4 selama 8 jam', descEn: 'Seed return chance x4 for 8 hours' },
  // Mining
  { id: 'gloves', name: 'Sarung Tambang', en: "Miner's Gloves", emote: '⛏️', skill: 'mining', unlockLevel: 10, durationMs: 4 * HOUR, payHours: 1.5, effect: { xp_mining: 2 }, desc: 'XP Mining x2 selama 4 jam', descEn: 'Mining XP x2 for 4 hours' },
  { id: 'magnet', name: 'Magnet Ore', en: 'Ore Magnet', emote: '🧲', skill: 'mining', unlockLevel: 20, durationMs: 4 * HOUR, payHours: 1.5, effect: { yield: 1.5 }, desc: 'Jumlah ore per ekspedisi x1.5 selama 4 jam', descEn: 'Ores per expedition x1.5 for 4 hours' },
  // Fishing
  { id: 'charm', name: 'Jimat Pancing', en: 'Lucky Charm', emote: '🎣', skill: 'fishing', unlockLevel: 1, durationMs: 4 * HOUR, payHours: 1.5, effect: { xp_fishing: 2 }, desc: 'XP Fishing x2 selama 4 jam', descEn: 'Fishing XP x2 for 4 hours' },
  { id: 'caller', name: 'Pemanggil Raksasa', en: 'Deep Caller', emote: '🐋', skill: 'fishing', unlockLevel: 20, durationMs: 8 * HOUR, payHours: 1, effect: { weight: 1.5 }, desc: 'Berat ikan x1.5 selama 8 jam', descEn: 'Fish weight x1.5 for 8 hours' },
  // Dungeon
  { id: 'drums', name: 'Genderang Perang', en: 'War Drums', emote: '⚔️', skill: 'dungeon', unlockLevel: 1, durationMs: 4 * HOUR, payHours: 1.5, effect: { xp_dungeon: 2 }, desc: 'XP Dungeon x2 selama 4 jam', descEn: 'Dungeon XP x2 for 4 hours' },
  { id: 'sense', name: 'Indra Harta', en: 'Treasure Sense', emote: '🎁', skill: 'dungeon', unlockLevel: 10, durationMs: 4 * HOUR, payHours: 1.5, effect: { loot: 1.5 }, desc: 'Peluang loot dungeon x1.5 selama 4 jam', descEn: 'Dungeon loot chance x1.5 for 4 hours' },
];

const getBoost = (id) => BOOSTS.find((b) => b.id === id) ?? null;

module.exports = { BOOSTS, getBoost };
