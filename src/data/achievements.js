'use strict';

/**
 * Pencapaian (achievement) bertingkat. Tiap item: { id, stat, goal, reward, emote, name (ID), en, desc (ID), descEn }.
 * reward = Viaz dasar (dikali kurs halving saat diklaim). Nilai stat dibaca di lib/progress.js (statValue).
 * Satu pemain tidak akan menyelesaikan semuanya dalam waktu singkat: tier atas sengaja butuh berbulan-bulan.
 */

const fmt = (n) => Number(n).toLocaleString('en-US');

/** Label stat untuk deskripsi otomatis. */
const STAT_LABEL = {
  harvested: ['crops harvested', 'tanaman dipanen'],
  mined: ['ores mined', 'ore ditambang'],
  fished: ['fish caught', 'ikan ditangkap'],
  clears: ['dungeons cleared', 'dungeon ditaklukkan'],
  kills: ['monsters slain', 'monster dikalahkan'],
  earned: ['Viaz earned', 'Viaz didapat'],
  quests: ['quests completed', 'quest selesai'],
  streak: ['day quest streak', 'hari beruntun quest'],
  heaviest: ['lbs for a single fish', 'lbs untuk satu ikan'],
  fish_species: ['fish species caught', 'spesies ikan tertangkap'],
  ores_found: ['ore types mined', 'jenis ore ditambang'],
  mobs_found: ['monster types slain', 'jenis monster dikalahkan'],
  crops_found: ['crop types harvested', 'jenis tanaman dipanen'],
  farming_lv: ['Farming level', 'level Farming'],
  mining_lv: ['Mining level', 'level Mining'],
  fishing_lv: ['Fishing level', 'level Fishing'],
  dungeon_lv: ['Dungeon level', 'level Dungeon'],
  total_lv: ['total skill levels', 'total level skill'],
  prestige: ['Ascensions', 'Ascension'],
};

/** Kelompok untuk menu: [id, emoji, English, Indonesia] */
const CATEGORIES = [
  ['farming', '🌾', 'Farming', 'Bertani'],
  ['mining', '⛏️', 'Mining', 'Menambang'],
  ['fishing', '🎣', 'Fishing', 'Memancing'],
  ['dungeon', '🔮', 'Dungeon', 'Dungeon'],
  ['economy', '💰', 'Economy & Quests', 'Ekonomi & Quest'],
  ['collection', '📚', 'Collection', 'Koleksi'],
  ['mastery', '🏆', 'Mastery', 'Penguasaan'],
];

/**
 * rows: [goal, reward, emote, English name, nama Indonesia]
 */
function tiers(category, stat, rows) {
  return rows.map(([goal, reward, emote, en, name]) => ({
    id: `${stat}_${goal}`,
    category,
    stat,
    goal,
    reward,
    emote,
    en,
    name,
    descEn: `Reach ${fmt(goal)} ${STAT_LABEL[stat][0]}`,
    desc: `Capai ${fmt(goal)} ${STAT_LABEL[stat][1]}`,
  }));
}

const ACHIEVEMENTS = [
  ...tiers('farming', 'harvested', [
    [100, 500, '🌱', 'Sprout', 'Tunas'],
    [1000, 5000, '🌿', 'Gardener', 'Tukang Kebun'],
    [10000, 50000, '🌾', 'Harvester', 'Pemanen'],
    [100000, 500000, '🚜', 'Agronomist', 'Ahli Agronomi'],
    [1000000, 5000000, '👑', 'Harvest Titan', 'Titan Panen'],
  ]),
  ...tiers('mining', 'mined', [
    [50, 500, '🪨', 'Pebble Picker', 'Pemungut Kerikil'],
    [500, 5000, '⛏️', 'Digger', 'Penggali'],
    [5000, 50000, '💎', 'Miner', 'Penambang'],
    [50000, 500000, '🌋', 'Deep Delver', 'Penjelajah Dalam'],
    [500000, 5000000, '👑', 'Mountain Breaker', 'Pemecah Gunung'],
  ]),
  ...tiers('fishing', 'fished', [
    [25, 500, '🐟', 'Novice Angler', 'Pemancing Pemula'],
    [250, 5000, '🎣', 'Angler', 'Pemancing'],
    [2500, 50000, '🐋', 'Sea Hunter', 'Pemburu Laut'],
    [25000, 500000, '🦈', 'Ocean Master', 'Penguasa Samudra'],
    [100000, 5000000, '👑', 'Leviathan', 'Leviathan'],
  ]),
  ...tiers('fishing', 'heaviest', [
    [50, 500, '⚖️', 'Decent Catch', 'Tangkapan Lumayan'],
    [200, 5000, '🐠', 'Big Catch', 'Tangkapan Besar'],
    [500, 25000, '🐡', 'Whale of a Catch', 'Tangkapan Raksasa'],
    [1000, 100000, '🐙', 'Monster Catch', 'Tangkapan Monster'],
    [2000, 500000, '🦑', 'Legend of the Deep', 'Legenda Laut Dalam'],
  ]),
  ...tiers('dungeon', 'clears', [
    [1, 500, '🗡️', 'First Blood', 'Darah Pertama'],
    [10, 5000, '⚔️', 'Delver', 'Penjelajah Dungeon'],
    [100, 50000, '🛡️', 'Dungeon Veteran', 'Veteran Dungeon'],
    [500, 500000, '🏰', 'Dungeon Lord', 'Penguasa Dungeon'],
    [2000, 5000000, '👑', 'Dungeon God', 'Dewa Dungeon'],
  ]),
  ...tiers('dungeon', 'kills', [
    [1, 500, '💀', 'Monster Hunter', 'Pemburu Monster'],
    [25, 5000, '🐲', 'Slayer', 'Pembantai'],
    [250, 50000, '🧙', 'Executioner', 'Algojo'],
    [1000, 500000, '👹', 'Bane of Monsters', 'Momok Monster'],
  ]),
  ...tiers('economy', 'earned', [
    [10000, 500, '🪙', 'Pocket Money', 'Uang Saku'],
    [100000, 5000, '💰', 'Merchant', 'Pedagang'],
    [1000000, 50000, '🏦', 'Tycoon', 'Taipan'],
    [10000000, 500000, '💎', 'Magnate', 'Konglomerat'],
    [100000000, 5000000, '👑', 'Viaz Baron', 'Baron Viaz'],
  ]),
  ...tiers('economy', 'quests', [
    [1, 300, '📜', 'Errand Runner', 'Pelari Tugas'],
    [25, 5000, '📋', 'Reliable Hand', 'Tangan Andalan'],
    [100, 50000, '📚', 'Contract Master', 'Master Kontrak'],
    [365, 500000, '🎖️', 'Guild Legend', 'Legenda Guild'],
  ]),
  ...tiers('economy', 'streak', [
    [3, 500, '🔥', 'Warming Up', 'Mulai Panas'],
    [7, 5000, '🔥', 'On Fire', 'Membara'],
    [30, 100000, '☄️', 'Unstoppable', 'Tak Terhentikan'],
    [100, 2000000, '🌟', 'Eternal Flame', 'Api Abadi'],
  ]),
  ...tiers('collection', 'crops_found', [
    [5, 1000, '🥕', 'Crop Collector', 'Kolektor Tanaman'],
    [10, 25000, '📗', 'Master Farmer', 'Petani Master'],
  ]),
  ...tiers('collection', 'ores_found', [
    [5, 1000, '🪨', 'Rock Hound', 'Pemburu Batu'],
    [10, 15000, '💠', 'Gem Seeker', 'Pencari Permata'],
    [15, 100000, '📘', 'Geologist', 'Ahli Geologi'],
  ]),
  ...tiers('collection', 'fish_species', [
    [5, 1000, '🐟', 'Fish Collector', 'Kolektor Ikan'],
    [10, 15000, '🐠', 'Aquarist', 'Aquarist'],
    [15, 100000, '📙', 'Ichthyologist', 'Ahli Ikan'],
  ]),
  ...tiers('collection', 'mobs_found', [
    [5, 1000, '👺', 'Bestiary I', 'Bestiary I'],
    [10, 15000, '👻', 'Bestiary II', 'Bestiary II'],
    [15, 100000, '📕', 'Bestiary Complete', 'Bestiary Lengkap'],
  ]),
  ...tiers('farming', 'farming_lv', [
    [10, 1000, '🌱', 'Farmhand', 'Buruh Tani'],
    [25, 10000, '🌿', 'Farmer', 'Petani'],
    [50, 100000, '🌾', 'Master Farmer', 'Petani Master'],
    [75, 500000, '🚜', 'Farm Baron', 'Baron Tani'],
    [100, 3000000, '👑', 'Farming Legend', 'Legenda Tani'],
  ]),
  ...tiers('mining', 'mining_lv', [
    [10, 1000, '🪨', 'Apprentice Miner', 'Magang Tambang'],
    [25, 10000, '⛏️', 'Miner', 'Penambang'],
    [50, 100000, '💎', 'Master Miner', 'Master Tambang'],
    [75, 500000, '🌋', 'Mine Baron', 'Baron Tambang'],
    [100, 3000000, '👑', 'Mining Legend', 'Legenda Tambang'],
  ]),
  ...tiers('fishing', 'fishing_lv', [
    [10, 1000, '🎣', 'Deckhand', 'Awak Kapal'],
    [25, 10000, '🐠', 'Fisher', 'Nelayan'],
    [50, 100000, '🐋', 'Master Angler', 'Master Pemancing'],
    [75, 500000, '🚢', 'Sea Baron', 'Baron Laut'],
    [100, 3000000, '👑', 'Fishing Legend', 'Legenda Pancing'],
  ]),
  ...tiers('dungeon', 'dungeon_lv', [
    [10, 1000, '🗡️', 'Squire', 'Pengawal'],
    [25, 10000, '⚔️', 'Knight', 'Ksatria'],
    [50, 100000, '🛡️', 'Champion', 'Juara'],
    [75, 500000, '🏰', 'Warlord', 'Panglima'],
    [100, 3000000, '👑', 'Dungeon Legend', 'Legenda Dungeon'],
  ]),
  ...tiers('mastery', 'total_lv', [
    [100, 5000, '🥉', 'Jack of All Trades', 'Serba Bisa'],
    [200, 50000, '🥈', 'Seasoned Adventurer', 'Petualang Berpengalaman'],
    [300, 500000, '🥇', 'Grand Adventurer', 'Petualang Agung'],
    [400, 10000000, '🏅', 'Perfect Mastery', 'Penguasaan Sempurna'],
  ]),
  ...tiers('mastery', 'prestige', [
    [1, 5000, '✨', 'Ascended', 'Terlahir Kembali'],
    [5, 20000, '🌠', 'Transcendent', 'Transenden'],
    [10, 50000, '🌌', 'Eternal', 'Abadi'],
  ]),
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
const BY_STAT = new Map();
for (const a of ACHIEVEMENTS) {
  if (!BY_STAT.has(a.stat)) BY_STAT.set(a.stat, []);
  BY_STAT.get(a.stat).push(a);
}

const getAchievement = (id) => BY_ID.get(id) ?? null;

module.exports = { ACHIEVEMENTS, CATEGORIES, STAT_LABEL, BY_STAT, getAchievement };
