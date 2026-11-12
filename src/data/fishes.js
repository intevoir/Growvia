'use strict';

const MIN = 60 * 1000;

/**
 * 15 Spesies Ikan (5 tier rarity) dengan bobot acak (lbs).
 * Harga jual = totalWeight × pricePerLb × halvingMultiplier.
 * pricePerLb turun untuk rarity tinggi karena bobotnya jauh lebih besar;
 * nilai per ikan (1 ikan = 1 slot tas) tetap naik tiap rarity.
 */
const FISHES = [
  // Common
  { id: 'teri', name: 'Ikan Teri', en: 'Anchovy', emote: '🐟', rarity: 'common', minLbs: 1, maxLbs: 5, pricePerLb: 70 },
  { id: 'nila', name: 'Ikan Nila', en: 'Tilapia', emote: '🐟', rarity: 'common', minLbs: 5, maxLbs: 15, pricePerLb: 70 },
  { id: 'lele', name: 'Ikan Lele', en: 'Catfish', emote: '🐟', rarity: 'common', minLbs: 10, maxLbs: 25, pricePerLb: 70 },

  // Uncommon
  { id: 'mas', name: 'Ikan Mas', en: 'Carp', emote: '🐠', rarity: 'uncommon', minLbs: 15, maxLbs: 35, pricePerLb: 50 },
  { id: 'gurame', name: 'Gurame', en: 'Gourami', emote: '🐠', rarity: 'uncommon', minLbs: 20, maxLbs: 45, pricePerLb: 50 },
  { id: 'salmon', name: 'Salmon', en: 'Salmon', emote: '🐠', rarity: 'uncommon', minLbs: 30, maxLbs: 60, pricePerLb: 50 },

  // Rare
  { id: 'kakap', name: 'Ikan Kakap', en: 'Snapper', emote: '🐡', rarity: 'rare', minLbs: 40, maxLbs: 80, pricePerLb: 32 },
  { id: 'tuna', name: 'Ikan Tuna', en: 'Tuna', emote: '🐡', rarity: 'rare', minLbs: 60, maxLbs: 120, pricePerLb: 32 },
  { id: 'marlin', name: 'Marlin', en: 'Marlin', emote: '🐡', rarity: 'rare', minLbs: 80, maxLbs: 160, pricePerLb: 32 },

  // Epic
  { id: 'pari', name: 'Pari Elektrik', en: 'Electric Ray', emote: '🦈', rarity: 'epic', minLbs: 100, maxLbs: 200, pricePerLb: 18 },
  { id: 'hiu_martil', name: 'Hiu Martil', en: 'Hammerhead Shark', emote: '🦈', rarity: 'epic', minLbs: 150, maxLbs: 300, pricePerLb: 18 },
  { id: 'cumi', name: 'Cumi Raksasa', en: 'Giant Squid', emote: '🦑', rarity: 'epic', minLbs: 200, maxLbs: 450, pricePerLb: 18 },

  // Legendary
  { id: 'hiu_putih', name: 'Hiu Putih Purba', en: 'Ancient Great White', emote: '🐋', rarity: 'legendary', minLbs: 400, maxLbs: 700, pricePerLb: 8 },
  { id: 'naga_laut', name: 'Naga Laut Dalam', en: 'Deep Sea Dragon', emote: '🐉', rarity: 'legendary', minLbs: 600, maxLbs: 1200, pricePerLb: 8 },
  { id: 'kraken', name: 'Kraken Abyss', en: 'Abyssal Kraken', emote: '🐙', rarity: 'legendary', minLbs: 1000, maxLbs: 2500, pricePerLb: 8 },
];

/**
 * 12 Variasi Umpan / Bait.
 * Setiap umpan memiliki pool distribusi rarity yang berbeda.
 * Makin mahal umpan, makin besar peluang ikan langka.
 * Pool: [common%, uncommon%, rare%, epic%, legendary%] (jumlah 100).
 * cost ≈ 25-35% nilai rata-rata tangkapan: umpan adalah sink Viaz utama fishing.
 */
const BAITS = [
  // Common tier baits (3 variasi)
  { id: 'cacing', name: 'Cacing Tanah', en: 'Earthworm', descEn: 'Basic bait, small common fish', emote: '🪱', rarity: 'common', cost: 200, pool: [90, 10, 0, 0, 0], xp: 40, desc: 'Umpan dasar, ikan kecil biasa' },
  { id: 'jangkrik', name: 'Jangkrik', en: 'Cricket', descEn: 'Slightly better than worms', emote: '🦗', rarity: 'common', cost: 240, pool: [80, 18, 2, 0, 0], xp: 70, desc: 'Sedikit lebih baik dari cacing' },
  { id: 'roti', name: 'Remah Roti', en: 'Bread Crumbs', descEn: 'Attracts mid-sized river fish', emote: '🍞', rarity: 'common', cost: 280, pool: [70, 25, 5, 0, 0], xp: 100, desc: 'Memancing ikan sungai menengah' },

  // Uncommon tier baits (3 variasi)
  { id: 'udang', name: 'Udang Rawa', en: 'Marsh Shrimp', descEn: 'A favorite of carp & gourami', emote: '🦐', rarity: 'uncommon', cost: 500, pool: [20, 65, 13, 2, 0], xp: 220, desc: 'Favorit ikan mas & gurame' },
  { id: 'cumi_kecil', name: 'Cumi Kecil', en: 'Baby Squid', descEn: 'Lures mid-tier predators', emote: '🦑', rarity: 'uncommon', cost: 600, pool: [15, 55, 25, 5, 0], xp: 330, desc: 'Menarik ikan predator menengah' },
  { id: 'ikan_kecil', name: 'Ikan Umpan Hidup', en: 'Live Baitfish', descEn: 'Live bait, irresistible', emote: '🐟', rarity: 'uncommon', cost: 700, pool: [10, 50, 30, 10, 0], xp: 450, desc: 'Umpan hidup, tak tertahankan' },

  // Rare tier baits (2 variasi)
  { id: 'kumbang', name: 'Kumbang Laut', en: 'Sea Beetle', descEn: 'Strong scent draws big fish', emote: '🪲', rarity: 'rare', cost: 1000, pool: [5, 15, 60, 18, 2], xp: 900, desc: 'Aroma kuat menarik ikan besar' },
  { id: 'gurita_kecil', name: 'Gurita Kecil', en: 'Baby Octopus', descEn: 'Made for open-sea predators', emote: '🐙', rarity: 'rare', cost: 1250, pool: [0, 10, 55, 30, 5], xp: 1400, desc: 'Cocok untuk predator laut lepas' },

  // Epic tier baits (2 variasi)
  { id: 'pelet_kristal', name: 'Pelet Kristal', en: 'Crystal Pellet', descEn: 'Glows underwater, lures rare fish', emote: '🌟', rarity: 'epic', cost: 1800, pool: [0, 5, 20, 60, 15], xp: 3000, desc: 'Bersinar dalam air, menarik ikan langka' },
  { id: 'ubur_neon', name: 'Ubur-Ubur Neon', en: 'Neon Jellyfish', descEn: 'Only the strongest predators dare', emote: '🪼', rarity: 'epic', cost: 2200, pool: [0, 0, 15, 60, 25], xp: 4800, desc: 'Hanya berani dimakan predator terkuat' },

  // Legendary tier baits (2 variasi)
  { id: 'umpan_abyss', name: 'Umpan Abyss', en: 'Abyss Lure', descEn: 'Pulled from the ocean abyss', emote: '🌌', rarity: 'legendary', cost: 3400, pool: [0, 0, 5, 25, 70], xp: 5500, desc: 'Berasal dari dasar jurang laut' },
  { id: 'darah_kraken', name: 'Darah Kraken', en: 'Kraken Blood', descEn: 'Only legendary sea monsters come close', emote: '🩸', rarity: 'legendary', cost: 4200, pool: [0, 0, 0, 15, 85], xp: 8000, desc: 'Hanya monster laut legendaris yang mendekat' },
];

/** Durasi dasar 1 strike (ms). Rod speedMult mengurangi ini. */
const BASE_STRIKE_MS = 5 * MIN;

/** Max sesi offline yang dikejar (24 jam). */
const MAX_FISHING_OFFLINE_MS = 24 * 60 * MIN;

function getFish(id) {
  return FISHES.find((f) => f.id === id) ?? null;
}

function getBait(id) {
  return BAITS.find((b) => b.id === id) ?? null;
}

function getUnlockedBaits(fishingLevel) {
  // Semua umpan dibuka berdasarkan rarity: common Lv1, uncommon Lv10, rare Lv20, epic Lv40, legendary Lv60
  const rarityUnlock = { common: 1, uncommon: 10, rare: 20, epic: 40, legendary: 60 };
  return BAITS.filter((b) => fishingLevel >= (rarityUnlock[b.rarity] ?? 1));
}

module.exports = { FISHES, BAITS, BASE_STRIKE_MS, MAX_FISHING_OFFLINE_MS, getFish, getBait, getUnlockedBaits };
