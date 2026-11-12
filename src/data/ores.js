'use strict';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * 15 Jenis Ore / Mineral Tambang (5 tingkat Rarity).
 * xp = XP Mining per ore, sellPrice = harga jual dasar (sebelum halving).
 * Di tiap gua: ore pertama paling sering, ore terakhir paling langka & mahal (bobot 4:2:1).
 */
const ORES = [
  // Common (Gua Dangkal)
  { id: 'batu', name: 'Batu Kerikil', en: 'Gravel', emote: '🪨', rarity: 'common', xp: 30, sellPrice: 35 },
  { id: 'batubara', name: 'Batubara', en: 'Coal', emote: '⬛', rarity: 'common', xp: 45, sellPrice: 50 },
  { id: 'tembaga', name: 'Tembaga', en: 'Copper', emote: '🟤', rarity: 'common', xp: 75, sellPrice: 85 },

  // Uncommon (Terowongan Lembap)
  { id: 'besi', name: 'Bijih Besi', en: 'Iron Ore', emote: '⚪', rarity: 'uncommon', xp: 220, sellPrice: 250 },
  { id: 'timah', name: 'Timah', en: 'Tin', emote: '🔘', rarity: 'uncommon', xp: 330, sellPrice: 380 },
  { id: 'perak', name: 'Perak', en: 'Silver', emote: '🪙', rarity: 'uncommon', xp: 550, sellPrice: 630 },

  // Rare (Celah Bebatuan)
  { id: 'emas', name: 'Emas', en: 'Gold', emote: '🟡', rarity: 'rare', xp: 800, sellPrice: 920 },
  { id: 'platinum', name: 'Platinum', en: 'Platinum', emote: '◽', rarity: 'rare', xp: 1200, sellPrice: 1380 },
  { id: 'amethyst', name: 'Amethyst', en: 'Amethyst', emote: '🟣', rarity: 'rare', xp: 2000, sellPrice: 2300 },

  // Epic (Ruang Kristal)
  { id: 'ruby', name: 'Ruby', en: 'Ruby', emote: '🔴', rarity: 'epic', xp: 2800, sellPrice: 3200 },
  { id: 'safir', name: 'Safir', en: 'Sapphire', emote: '🔵', rarity: 'epic', xp: 4200, sellPrice: 4800 },
  { id: 'zamrud', name: 'Zamrud', en: 'Emerald', emote: '🟢', rarity: 'epic', xp: 7000, sellPrice: 8000 },

  // Legendary (Inti Nether)
  { id: 'titanium', name: 'Titanium', en: 'Titanium', emote: '⚙️', rarity: 'legendary', xp: 7800, sellPrice: 9000 },
  { id: 'mithril', name: 'Mithril', en: 'Mithril', emote: '🌌', rarity: 'legendary', xp: 11700, sellPrice: 13500 },
  { id: 'black_diamond', name: 'Berlian Hitam', en: 'Black Diamond', emote: '🖤', rarity: 'legendary', xp: 19500, sellPrice: 22500 },
];

/**
 * 5 Tingkat Kedalaman Gua. Jumlah ore per ekspedisi = minDrop..maxDrop × bonus level Mining.
 */
const CAVES = [
  {
    id: 'cave_shallow',
    name: 'Gua Dangkal',
    en: 'Shallow Cave',
    emote: '🕳️',
    unlockLevel: 1,
    baseDurationMs: 3 * MIN,
    minDrop: 4,
    maxDrop: 8,
    oreIds: ['batu', 'batubara', 'tembaga'],
  },
  {
    id: 'cave_humid',
    name: 'Terowongan Lembap',
    en: 'Damp Tunnel',
    emote: '💧',
    unlockLevel: 10,
    baseDurationMs: 10 * MIN,
    minDrop: 5,
    maxDrop: 9,
    oreIds: ['besi', 'timah', 'perak'],
  },
  {
    id: 'cave_rocky',
    name: 'Celah Bebatuan',
    en: 'Rocky Crevice',
    emote: '⛰️',
    unlockLevel: 25,
    baseDurationMs: 30 * MIN,
    minDrop: 6,
    maxDrop: 10,
    oreIds: ['emas', 'platinum', 'amethyst'],
  },
  {
    id: 'cave_crystal',
    name: 'Ruang Kristal',
    en: 'Crystal Chamber',
    emote: '💎',
    unlockLevel: 45,
    baseDurationMs: 90 * MIN,
    minDrop: 7,
    maxDrop: 12,
    oreIds: ['ruby', 'safir', 'zamrud'],
  },
  {
    id: 'cave_nether',
    name: 'Inti Nether',
    en: 'Nether Core',
    emote: '🌋',
    unlockLevel: 70,
    baseDurationMs: 4 * HOUR,
    minDrop: 8,
    maxDrop: 14,
    oreIds: ['titanium', 'mithril', 'black_diamond'],
  },
];

function getOre(id) {
  return ORES.find((o) => o.id === id) ?? null;
}

function getCave(id) {
  return CAVES.find((c) => c.id === id) ?? null;
}

function getCaves() {
  return CAVES;
}

function getUnlockedCaves(miningLevel) {
  return CAVES.filter((c) => c.unlockLevel <= miningLevel);
}

module.exports = {
  ORES,
  CAVES,
  getOre,
  getCave,
  getCaves,
  getUnlockedCaves,
};
