'use strict';

/**
 * Tingkatan alat. `name`/`desc` = Indonesia, `en`/`descEn` = English.
 * speedMult memotong durasi tunggu. Rod juga punya weightMult (bobot ikan).
 * Weapon & armor dipakai Dungeon (atk / def).
 * cost = harga dasar (dikali kurs halving), ± 3-25 jam income aktivitas itu saat terbuka.
 */
const TOOL_TIERS = {
  hoe: [
    // Tier 1 = starter gratis saat buat akun. Tidak dijual di toko.
    { tier: 1, name: 'Cangkul Pemula', en: 'Starter Hoe', emote: '🧑‍🌾', rarity: 'common', unlockLevel: 1, speedMult: 1.0, cost: 0, starter: true, desc: 'Starter, kecepatan normal (1.0x)', descEn: 'Starter, normal speed (1.0x)' },
    { tier: 2, name: 'Cangkul Biasa', en: 'Common Hoe', emote: '🧑‍🌾', rarity: 'common', unlockLevel: 1, speedMult: 0.95, cost: 500, desc: 'Waktu tumbuh -5%', descEn: 'Growth time -5%' },
    { tier: 3, name: 'Cangkul Tembaga', en: 'Copper Hoe', emote: '🌱', rarity: 'uncommon', unlockLevel: 20, speedMult: 0.85, cost: 100000, desc: 'Waktu tumbuh -15%', descEn: 'Growth time -15%' },
    { tier: 4, name: 'Cangkul Besi', en: 'Iron Hoe', emote: '🌿', rarity: 'rare', unlockLevel: 40, speedMult: 0.70, cost: 600000, desc: 'Waktu tumbuh -30%', descEn: 'Growth time -30%' },
    { tier: 5, name: 'Cangkul Emas', en: 'Golden Hoe', emote: '🌾', rarity: 'epic', unlockLevel: 60, speedMult: 0.55, cost: 2500000, desc: 'Waktu tumbuh -45%', descEn: 'Growth time -45%' },
    { tier: 6, name: 'Cangkul Kristal', en: 'Crystal Hoe', emote: '✨', rarity: 'legendary', unlockLevel: 80, speedMult: 0.40, cost: 8000000, desc: 'Waktu tumbuh -60%', descEn: 'Growth time -60%' },
  ],
  pickaxe: [
    { tier: 1, name: 'Beliung Batu', en: 'Stone Pickaxe', emote: '⛏️', rarity: 'common', unlockLevel: 10, speedMult: 1.0, cost: 5000, desc: 'Durasi tambang normal (1.0x)', descEn: 'Normal mining time (1.0x)' },
    { tier: 2, name: 'Beliung Besi', en: 'Iron Pickaxe', emote: '⛏️', rarity: 'uncommon', unlockLevel: 20, speedMult: 0.85, cost: 100000, desc: 'Durasi tambang -15%', descEn: 'Mining time -15%' },
    { tier: 3, name: 'Beliung Baja', en: 'Steel Pickaxe', emote: '⛏️', rarity: 'rare', unlockLevel: 40, speedMult: 0.70, cost: 500000, desc: 'Durasi tambang -30%', descEn: 'Mining time -30%' },
    { tier: 4, name: 'Beliung Ruby', en: 'Ruby Pickaxe', emote: '⛏️', rarity: 'epic', unlockLevel: 60, speedMult: 0.55, cost: 2000000, desc: 'Durasi tambang -45%', descEn: 'Mining time -45%' },
    { tier: 5, name: 'Beliung Nether', en: 'Nether Pickaxe', emote: '⛏️', rarity: 'legendary', unlockLevel: 80, speedMult: 0.40, cost: 7000000, desc: 'Durasi tambang -60%', descEn: 'Mining time -60%' },
  ],
  rod: [
    { tier: 1, name: 'Pancingan Bambu', en: 'Bamboo Rod', emote: '🎣', rarity: 'common', unlockLevel: 1, speedMult: 1.0, weightMult: 1.0, cost: 15000, desc: 'Strike 5 mnt, bobot 1.0x', descEn: 'Strike 5 min, weight 1.0x' },
    { tier: 2, name: 'Pancingan Serat', en: 'Fiber Rod', emote: '🎣', rarity: 'uncommon', unlockLevel: 15, speedMult: 0.9, weightMult: 1.1, cost: 120000, desc: 'Strike -10%, bobot 1.1x', descEn: 'Strike -10%, weight 1.1x' },
    { tier: 3, name: 'Pancingan Karbon', en: 'Carbon Rod', emote: '🎣', rarity: 'rare', unlockLevel: 30, speedMult: 0.8, weightMult: 1.2, cost: 600000, desc: 'Strike -20%, bobot 1.2x', descEn: 'Strike -20%, weight 1.2x' },
    { tier: 4, name: 'Pancingan Titanium', en: 'Titanium Rod', emote: '🎣', rarity: 'epic', unlockLevel: 50, speedMult: 0.7, weightMult: 1.35, cost: 2500000, desc: 'Strike -30%, bobot 1.35x', descEn: 'Strike -30%, weight 1.35x' },
    { tier: 5, name: 'Pancingan Poseidon', en: 'Poseidon Rod', emote: '🎣', rarity: 'legendary', unlockLevel: 75, speedMult: 0.6, weightMult: 1.5, cost: 10000000, desc: 'Strike -40%, bobot 1.5x', descEn: 'Strike -40%, weight 1.5x' },
  ],
  weapon: [
    { tier: 1, name: 'Belati Berkarat', en: 'Rusty Dagger', emote: '🗡️', rarity: 'common', unlockLevel: 1, atk: 6, cost: 5000, desc: 'ATK +6', descEn: 'ATK +6' },
    { tier: 2, name: 'Pedang Besi', en: 'Iron Sword', emote: '🗡️', rarity: 'uncommon', unlockLevel: 10, atk: 14, cost: 60000, desc: 'ATK +14', descEn: 'ATK +14' },
    { tier: 3, name: 'Pedang Baja', en: 'Steel Blade', emote: '⚔️', rarity: 'rare', unlockLevel: 25, atk: 26, cost: 300000, desc: 'ATK +26', descEn: 'ATK +26' },
    { tier: 4, name: 'Pedang Rune', en: 'Runeblade', emote: '⚔️', rarity: 'epic', unlockLevel: 45, atk: 42, cost: 1200000, desc: 'ATK +42', descEn: 'ATK +42' },
    { tier: 5, name: 'Pedang Abyss', en: 'Abyssal Edge', emote: '⚔️', rarity: 'legendary', unlockLevel: 70, atk: 65, cost: 6000000, desc: 'ATK +65', descEn: 'ATK +65' },
  ],
  armor: [
    { tier: 1, name: 'Rompi Kulit', en: 'Leather Vest', emote: '🛡️', rarity: 'common', unlockLevel: 1, def: 3, hp: 20, cost: 4000, desc: 'DEF +3, HP +20', descEn: 'DEF +3, HP +20' },
    { tier: 2, name: 'Zirah Rantai', en: 'Chainmail', emote: '🛡️', rarity: 'uncommon', unlockLevel: 10, def: 7, hp: 50, cost: 50000, desc: 'DEF +7, HP +50', descEn: 'DEF +7, HP +50' },
    { tier: 3, name: 'Zirah Baja', en: 'Steel Plate', emote: '🛡️', rarity: 'rare', unlockLevel: 25, def: 13, hp: 100, cost: 250000, desc: 'DEF +13, HP +100', descEn: 'DEF +13, HP +100' },
    { tier: 4, name: 'Zirah Rune', en: 'Rune Plate', emote: '🛡️', rarity: 'epic', unlockLevel: 45, def: 21, hp: 180, cost: 1000000, desc: 'DEF +21, HP +180', descEn: 'DEF +21, HP +180' },
    { tier: 5, name: 'Zirah Abyss', en: 'Abyssal Aegis', emote: '🛡️', rarity: 'legendary', unlockLevel: 70, def: 32, hp: 300, cost: 5000000, desc: 'DEF +32, HP +300', descEn: 'DEF +32, HP +300' },
  ],
};

function getToolList(type) {
  return TOOL_TIERS[type] ?? [];
}

function getTool(type, tier = 1) {
  const list = getToolList(type);
  if (tier < 1) return null;
  const t = Math.max(1, Math.min(tier, list.length));
  return list[t - 1] ?? list[0];
}

function getNextToolTier(type, currentTier = 0) {
  const list = getToolList(type);
  if (currentTier >= list.length) return null;
  return list[currentTier]; // currentTier = 0 -> list[0] (Tier 1)
}

/**
 * Kepemilikan alat per copy (untuk pembelian berulang & trade antar pemain nanti).
 * Kunci item: "<type>_<tier>", mis. hoe_2 = 2x Cangkul Biasa. `inventory` tetap menunjukkan
 * alat yang TERPASANG (tier tertinggi yang dimiliki); `items` adalah stok yang bisa di-trade.
 */
const TOOL_TYPES = ['hoe', 'pickaxe', 'rod', 'weapon', 'armor'];
const toolKey = (type, tier) => `${type}_${tier}`;
const isToolKey = (key) => TOOL_TYPES.some((type) => key.startsWith(`${type}_`)) && /^\d+$/.test(key.split('_')[1]);

function parseToolKey(key) {
  const [type, tierRaw] = String(key).split('_');
  return TOOL_TYPES.includes(type) && Number.isFinite(Number(tierRaw)) ? { type, tier: Number(tierRaw) } : null;
}

/** Jumlah total copy alat (semua tier) — dipakai untuk hitung slot tas. */
function countToolCopies(items) {
  let total = 0;
  for (const [key, qty] of Object.entries(items ?? {})) if (isToolKey(key)) total += Math.max(0, Math.floor(Number(qty) || 0));
  return total;
}

/** Jumlah copy tier tertentu yang dimiliki. */
function countCopies(items, type, tier) {
  return Math.max(0, Math.floor(Number(items?.[toolKey(type, tier)]) || 0));
}

function getToolSpeedMultiplier(type, tier = 1) {
  const tool = getTool(type, tier);
  return tool?.speedMult ?? 1.0;
}

module.exports = { TOOL_TIERS, TOOL_TYPES, getToolList, getTool, getNextToolTier, getToolSpeedMultiplier, toolKey, isToolKey, parseToolKey, countToolCopies, countCopies };
