'use strict';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * Benih (tanaman asli). `name` = Indonesia, `en` = English.
 * - levelUnlock : level Farming minimum untuk beli & tanam
 * - growMs      : lama tumbuh (waktu nyata)
 * - buyPrice    : harga beli per benih (Viaz, ikut multiplier halving)
 * - sellPrice   : harga jual dasar per hasil panen (Viaz), sebelum halving
 * - xp          : XP Farming per hasil panen
 *
 * Balance: XP/jam per plot naik tiap tier (benih baru selalu lebih baik untuk level),
 * benih lambat juga lebih hemat slot tas. Cek angka dengan: node scripts/balance-sim.js
 */
const SEEDS = [
  { id: 'gandum', name: 'Gandum', en: 'Wheat', emote: '🌾', rarity: 'common', levelUnlock: 1, growMs: 1 * MIN, buyPrice: 1, sellPrice: 2, xp: 1 },
  { id: 'wortel', name: 'Wortel', en: 'Carrot', emote: '🥕', rarity: 'common', levelUnlock: 5, growMs: 5 * MIN, buyPrice: 5, sellPrice: 12, xp: 6 },
  { id: 'kentang', name: 'Kentang', en: 'Potato', emote: '🥔', rarity: 'uncommon', levelUnlock: 10, growMs: 15 * MIN, buyPrice: 15, sellPrice: 38, xp: 20 },
  { id: 'tomat', name: 'Tomat', en: 'Tomato', emote: '🍅', rarity: 'uncommon', levelUnlock: 20, growMs: 30 * MIN, buyPrice: 32, sellPrice: 82, xp: 44 },
  { id: 'jagung', name: 'Jagung', en: 'Corn', emote: '🌽', rarity: 'rare', levelUnlock: 30, growMs: 1 * HOUR, buyPrice: 70, sellPrice: 180, xp: 100 },
  { id: 'stroberi', name: 'Stroberi', en: 'Strawberry', emote: '🍓', rarity: 'rare', levelUnlock: 40, growMs: 2 * HOUR, buyPrice: 150, sellPrice: 400, xp: 225 },
  { id: 'labu', name: 'Labu', en: 'Pumpkin', emote: '🎃', rarity: 'epic', levelUnlock: 50, growMs: 4 * HOUR, buyPrice: 330, sellPrice: 880, xp: 500 },
  { id: 'semangka', name: 'Semangka', en: 'Watermelon', emote: '🍉', rarity: 'epic', levelUnlock: 60, growMs: 8 * HOUR, buyPrice: 720, sellPrice: 1950, xp: 1100 },
  { id: 'dragonfruit', name: 'Buah Naga', en: 'Dragon Fruit', emote: '🐉', rarity: 'legendary', levelUnlock: 80, growMs: 12 * HOUR, buyPrice: 1200, sellPrice: 3300, xp: 1850 },
  { id: 'vanila', name: 'Vanila', en: 'Vanilla', emote: '🌼', rarity: 'legendary', levelUnlock: 95, growMs: 24 * HOUR, buyPrice: 2700, sellPrice: 7500, xp: 4200 },
];

function getSeed(id) {
  return SEEDS.find((s) => s.id === id) ?? null;
}

function getUnlockedSeeds(level) {
  return SEEDS.filter((s) => s.levelUnlock <= level);
}

module.exports = { SEEDS, getSeed, getUnlockedSeeds };
