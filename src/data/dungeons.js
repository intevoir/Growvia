'use strict';

/**
 * Data Dungeon. Mode manual turn-based.
 * `name` = Indonesia, `en` = English.
 */

/**
 * Statistik monster di-tuning terhadap stat pemain pada level buka dungeon (gear terbaik saat itu):
 * pemain butuh ~6 giliran per monster biasa, ~14 per boss, dan menerima ±H/25 (boss H/16) per serangan.
 * Cek: node scripts/balance-sim.js
 */
const MONSTERS = {
  // Gua Goblin (Dungeon Lv 1)
  goblin: { name: 'Goblin', en: 'Goblin', emote: '👺', hp: 50, atk: 9, def: 3 },
  goblin_archer: { name: 'Goblin Pemanah', en: 'Goblin Archer', emote: '🏹', hp: 40, atk: 11, def: 2 },
  goblin_king: { name: 'Raja Goblin', en: 'Goblin King', emote: '👑', hp: 130, atk: 12, def: 4, boss: true },
  // Rawa Busuk (Dungeon Lv 10)
  slime: { name: 'Lendir Racun', en: 'Toxic Slime', emote: '🟢', hp: 150, atk: 21, def: 8 },
  bog_troll: { name: 'Troll Rawa', en: 'Bog Troll', emote: '🧌', hp: 200, atk: 24, def: 11 },
  swamp_hydra: { name: 'Hydra Rawa', en: 'Swamp Hydra', emote: '🐍', hp: 420, atk: 28, def: 10, boss: true },
  // Benteng Tulang (Dungeon Lv 25)
  skeleton: { name: 'Prajurit Tulang', en: 'Skeleton Warrior', emote: '💀', hp: 360, atk: 40, def: 22 },
  wraith: { name: 'Arwah Gelap', en: 'Wraith', emote: '👻', hp: 300, atk: 46, def: 16 },
  lich: { name: 'Lich', en: 'Lich', emote: '🧙', hp: 850, atk: 52, def: 22, boss: true },
  // Sarang Naga (Dungeon Lv 45)
  drake: { name: 'Drake Api', en: 'Fire Drake', emote: '🦎', hp: 580, atk: 62, def: 32 },
  wyvern: { name: 'Wyvern', en: 'Wyvern', emote: '🐲', hp: 660, atk: 68, def: 36 },
  elder_dragon: { name: 'Naga Purba', en: 'Elder Dragon', emote: '🐉', hp: 1450, atk: 85, def: 38, boss: true },
  // Kekosongan Abyss (Dungeon Lv 70)
  voidling: { name: 'Makhluk Hampa', en: 'Voidling', emote: '🌑', hp: 650, atk: 95, def: 48 },
  abyss_knight: { name: 'Ksatria Abyss', en: 'Abyss Knight', emote: '♞', hp: 720, atk: 104, def: 58 },
  void_titan: { name: 'Titan Hampa', en: 'Void Titan', emote: '🌌', hp: 1700, atk: 122, def: 56, boss: true },
};

/**
 * xp / viaz = total per clear penuh (boss berbobot 3x lantai biasa), dikali multiplier halving untuk Viaz.
 * fee = biaya masuk (sink Viaz). loot: [{ id, chance (0-1), min, max }] per lantai + bonus boss.
 */
const DUNGEONS = [
  {
    id: 'goblin_cave', name: 'Gua Goblin', en: 'Goblin Cave', emote: '🕳️', rarity: 'common',
    unlockLevel: 1, floors: ['goblin', 'goblin_archer', 'goblin_king'],
    xp: 230, viaz: [10, 25], fee: 20,
    loot: [{ id: 'goblin_ear', chance: 0.8, min: 1, max: 2 }, { id: 'rusty_coin', chance: 0.4, min: 1, max: 3 }],
  },
  {
    id: 'rotting_swamp', name: 'Rawa Busuk', en: 'Rotting Swamp', emote: '🌿', rarity: 'uncommon',
    unlockLevel: 10, floors: ['slime', 'bog_troll', 'slime', 'swamp_hydra'],
    xp: 1150, viaz: [40, 80], fee: 120,
    loot: [{ id: 'slime_gel', chance: 0.8, min: 1, max: 3 }, { id: 'troll_hide', chance: 0.4, min: 1, max: 1 }],
  },
  {
    id: 'bone_fortress', name: 'Benteng Tulang', en: 'Bone Fortress', emote: '🏰', rarity: 'rare',
    unlockLevel: 25, floors: ['skeleton', 'wraith', 'skeleton', 'wraith', 'lich'],
    xp: 2400, viaz: [100, 200], fee: 300,
    loot: [{ id: 'bone_dust', chance: 0.8, min: 1, max: 3 }, { id: 'soul_shard', chance: 0.35, min: 1, max: 1 }],
  },
  {
    id: 'dragon_lair', name: 'Sarang Naga', en: "Dragon's Lair", emote: '🌋', rarity: 'epic',
    unlockLevel: 45, floors: ['drake', 'wyvern', 'drake', 'wyvern', 'drake', 'elder_dragon'],
    xp: 7900, viaz: [250, 450], fee: 900,
    loot: [{ id: 'dragon_scale', chance: 0.7, min: 1, max: 2 }, { id: 'dragon_heart', chance: 0.2, min: 1, max: 1 }],
  },
  {
    id: 'abyss_void', name: 'Kekosongan Abyss', en: 'Abyssal Void', emote: '🌌', rarity: 'legendary',
    unlockLevel: 70, floors: ['voidling', 'abyss_knight', 'voidling', 'abyss_knight', 'voidling', 'abyss_knight', 'void_titan'],
    xp: 24000, viaz: [600, 1000], fee: 3000,
    loot: [{ id: 'void_essence', chance: 0.7, min: 1, max: 2 }, { id: 'titan_core', chance: 0.15, min: 1, max: 1 }],
  },
];

/** Loot dungeon (dijual di Dungeon Loot shop, ikut halving). 1 item = 1 slot tas. */
const LOOT = [
  { id: 'goblin_ear', name: 'Telinga Goblin', en: 'Goblin Ear', emote: '👂', rarity: 'common', sellPrice: 25 },
  { id: 'rusty_coin', name: 'Koin Berkarat', en: 'Rusty Coin', emote: '🪙', rarity: 'common', sellPrice: 40 },
  { id: 'slime_gel', name: 'Gel Lendir', en: 'Slime Gel', emote: '🟩', rarity: 'uncommon', sellPrice: 130 },
  { id: 'troll_hide', name: 'Kulit Troll', en: 'Troll Hide', emote: '🟫', rarity: 'uncommon', sellPrice: 380 },
  { id: 'bone_dust', name: 'Debu Tulang', en: 'Bone Dust', emote: '🦴', rarity: 'rare', sellPrice: 240 },
  { id: 'soul_shard', name: 'Pecahan Jiwa', en: 'Soul Shard', emote: '🔮', rarity: 'rare', sellPrice: 760 },
  { id: 'dragon_scale', name: 'Sisik Naga', en: 'Dragon Scale', emote: '🐉', rarity: 'epic', sellPrice: 950 },
  { id: 'dragon_heart', name: 'Jantung Naga', en: 'Dragon Heart', emote: '❤️‍🔥', rarity: 'epic', sellPrice: 3800 },
  { id: 'void_essence', name: 'Esensi Hampa', en: 'Void Essence', emote: '🌀', rarity: 'legendary', sellPrice: 2400 },
  { id: 'titan_core', name: 'Inti Titan', en: 'Titan Core', emote: '💠', rarity: 'legendary', sellPrice: 12000 },
];

/** Ramuan penyembuh (dibeli di Dungeon shop). Tidak bisa dibeli di dalam dungeon. Maks 3 diminum per run. */
const POTIONS = [
  { id: 'potion_small', name: 'Ramuan Kecil', en: 'Small Potion', emote: '🧪', heal: 50, cost: 50 },
  { id: 'potion_large', name: 'Ramuan Besar', en: 'Large Potion', emote: '⚗️', heal: 180, cost: 250 },
  { id: 'potion_elixir', name: 'Eliksir', en: 'Elixir', emote: '🍷', heal: 450, cost: 1000 },
];

function getMonster(id) {
  return MONSTERS[id] ? { id, ...MONSTERS[id] } : null;
}
function getDungeon(id) {
  return DUNGEONS.find((d) => d.id === id) ?? null;
}
function getLoot(id) {
  return LOOT.find((l) => l.id === id) ?? null;
}
function getPotion(id) {
  return POTIONS.find((p) => p.id === id) ?? null;
}
function getUnlockedDungeons(level) {
  return DUNGEONS.filter((d) => d.unlockLevel <= level);
}

module.exports = { MONSTERS, DUNGEONS, LOOT, POTIONS, getMonster, getDungeon, getLoot, getPotion, getUnlockedDungeons };
