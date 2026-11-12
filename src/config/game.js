'use strict';

/**
 * Aturan gameplay Growvia. Angka balance lain ada di src/data/seeds.js.
 * Ubah di sini saja, jangan hardcode di tempat lain.
 */
module.exports = {
  /** Level maksimum tiap skill (sementara). */
  MAX_LEVEL: 100,

  /**
   * Kurva EXP: expToNext(level) = XP_CURVE * level^3
   * Total sampai Lv 100 sekitar 510 juta XP, sengaja berat supaya game dimainkan bertahun-tahun.
   */
  XP_CURVE: 20,

  /** Peluang benih kembali per tanaman saat dipanen (10% chance). */
  SEED_RETURN_RATE: 0.1,

  /** Plot gratis di awal, dan tambahan plot gratis tiap kelipatan level. */
  START_PLOTS: 100,
  PLOTS_PER_MILESTONE: 100,
  MILESTONE_EVERY_LEVELS: 10,

  /**
   * Plot yang dibeli pakai Viaz: harga plot ke-n = BASE * GROWTH^n (makin banyak makin mahal).
   * Plot ke-300 ± 44k, ke-600 ± 3.8M, ke-900 ± 330M: sink Viaz jangka panjang.
   */
  PLOT_BASE_PRICE: 500,
  PLOT_PRICE_GROWTH: 1.015,
  MAX_BOUGHT_PLOTS: 2000,

  /** Auto-Tanam terbuka di level ini. */
  AUTO_PLANT_LEVEL: 10,

  /** Mining: tiap level menambah jumlah ore per ekspedisi (+4%/level, Lv 100 = ~5x). */
  MINING_YIELD_PER_LEVEL: 0.04,
  /** Batas "kejar siklus" auto-tanam saat pemain offline. */
  AUTO_MAX_OFFLINE_MS: 24 * 60 * 60 * 1000,

  /** Batas beli benih per sekali klik. */
  MAX_BUY_PER_ACTION: 1000,

  /** Kapasitas tas (Backpack) */
  BASE_BACKPACK_SLOTS: 1000,
  SLOTS_PER_BACKPACK_UPGRADE: 100,
  BACKPACK_BASE_PRICE: 150,
  BACKPACK_PRICE_GROWTH: 1.35,
  MAX_BOUGHT_BACKPACK: 100,

  /**
   * Ascension (prestige): reset skill demi bonus permanen. Syarat: total 4 level skill >= ASCEND_TOTAL_LEVELS.
   * Tiap prestige: +10% XP semua skill, +5% hasil jual. Maks 10 prestige.
   */
  ASCEND_TOTAL_LEVELS: 250,
  MAX_PRESTIGE: 10,
  PRESTIGE_XP_BONUS: 0.1,
  PRESTIGE_SELL_BONUS: 0.05,

  /** Reset quest harian jam 00:00 WIB (UTC+7). */
  DAY_OFFSET_MS: 7 * 60 * 60 * 1000,
  DAILY_QUESTS: 3,
  WEEKLY_QUESTS: 2,
  STREAK_BONUS_PER_DAY: 0.02,
  STREAK_BONUS_MAX_DAYS: 30,

  /** Isi akun baru (selain Hoe). */
  START_SEEDS: { gandum: 100 },
};
