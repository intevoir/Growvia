'use strict';

/**
 * Teks bersama untuk semua tampilan pribadi (dua bahasa).
 * Kode gagal dari lib/*Logic diterjemahkan lewat errorText().
 */

const { VIAZ_EMOJI, ACCOUNT_CHANNEL_ID } = require('../config/constants');
const G = require('../config/game');
const { tr, nameOf } = require('../lib/i18n');
const { getRarity } = require('../data/rarity');
const { formatNumber, formatViaz } = require('../lib/format');
const { usedSlots, maxSlots, freeSlots } = require('../lib/backpack');

const viaz = (n) => `${VIAZ_EMOJI} ${formatViaz(n)}`;
const rarityTag = (rarity) => {
  const r = getRarity(rarity);
  return `${r.emoji} ${r.name}`;
};
const label = (item, lang) => `${item.emote} ${nameOf(item, lang)}`;
const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

function bagLine(account, lang) {
  return tr(
    lang,
    `🎒 Backpack: ${formatNumber(usedSlots(account))}/${formatNumber(maxSlots(account))} slots (free: ${formatNumber(freeSlots(account))})`,
    `🎒 Tas: ${formatNumber(usedSlots(account))}/${formatNumber(maxSlots(account))} slot (kosong: ${formatNumber(freeSlots(account))})`,
  );
}

function expLine(skill, need, maxed) {
  if (maxed) return 'EXP: MAX';
  return `EXP: ${formatNumber(skill.exp)} / ${formatNumber(need)} (${Math.floor((skill.exp / need) * 100)}%)`;
}

const accountMention = () => (ACCOUNT_CHANNEL_ID ? `<#${ACCOUNT_CHANNEL_ID}>` : '#play');

/** Terjemahan kode error (dari lib/*Logic, activityLock, dan handler). */
function errorText(lang, code, extra = {}) {
  const seed = extra.seed ? nameOf(extra.seed, lang) : '';
  const cave = extra.cave ? nameOf(extra.cave, lang) : '';
  const bait = extra.bait ? nameOf(extra.bait, lang) : '';
  const map = {
    no_account: [`No account yet. Register at ${accountMention()} first.`, `Belum ada akun. Daftar dulu di ${accountMention()}.`],
    wrong_thread: ['Use your own private thread!', 'Gunakan thread pribadi milikmu sendiri!'],
    not_owner: ['This is not your thread!', 'Ini bukan thread milikmu!'],
    busy_farming: ['You have crops growing on your farm. Harvest them first.', 'Kamu sedang menanam di Farm. Panen dulu.'],
    busy_mining: ['You are on a mining expedition. Finish or claim it first.', 'Kamu sedang ekspedisi tambang. Selesaikan atau klaim dulu.'],
    busy_fishing: ['Your line is in the water. Reel it in first.', 'Pancinganmu sedang dilempar. Tarik dulu.'],
    busy_dungeon: ['You are inside a dungeon. Finish or flee first.', 'Kamu sedang di dalam dungeon. Selesaikan atau kabur dulu.'],
    not_found: ['Item not found.', 'Item tidak ditemukan.'],
    bad_amount: ['Invalid amount.', 'Jumlah tidak valid.'],
    seed_locked: [`${seed} unlocks at Farming Lv ${extra.seed?.levelUnlock}.`, `${seed} terbuka di Farming Lv ${extra.seed?.levelUnlock}.`],
    no_hoe: ['You need a Hoe to plant.', 'Kamu butuh Cangkul untuk menanam.'],
    already_growing: [`${seed} is already growing. Harvest it first.`, `${seed} sedang tumbuh. Panen dulu.`],
    no_seeds: [`You have no ${seed} seeds. Buy some at the farm shop.`, `Kamu tidak punya benih ${seed}. Beli di toko tani.`],
    no_plots: ['All plots are in use. Harvest or buy more plots.', 'Semua plot terpakai. Panen dulu atau beli plot.'],
    mine_locked: ['Mining Caves unlock at Farming Lv 10.', 'Gua Tambang terbuka di Farming Lv 10.'],
    no_pickaxe: ['You need a Pickaxe. Buy one at the Mining Outpost.', 'Kamu butuh Beliung. Beli di Toko Tambang.'],
    cave_locked: [`${cave} unlocks at Mining Lv ${extra.cave?.unlockLevel}.`, `${cave} terbuka di Mining Lv ${extra.cave?.unlockLevel}.`],
    fish_locked: ['Fishing unlocks at Farming Lv 30 and Mining Lv 20.', 'Memancing terbuka di Farming Lv 30 dan Mining Lv 20.'],
    no_rod: ['You need a Fishing Rod. Buy one at Fishing Supplies.', 'Kamu butuh Pancingan. Beli di Toko Pancing.'],
    no_bait: [`You have no ${bait}. Buy some at Fishing Supplies.`, `Kamu tidak punya ${bait}. Beli di Toko Pancing.`],
    dungeon_locked: ['Dungeons unlock at Farming Lv 30, Mining Lv 20 and Fishing Lv 10.', 'Dungeon terbuka di Farming Lv 30, Mining Lv 20, dan Fishing Lv 10.'],
    no_weapon: ['You need a weapon. Buy one at Dungeon Loot.', 'Kamu butuh senjata. Beli di Dungeon Loot.'],
    in_run: ['You are already inside a dungeon.', 'Kamu sudah berada di dalam dungeon.'],
    level: ['Your level is too low for this.', 'Level kamu belum cukup.'],
    no_run: ['You are not in a dungeon.', 'Kamu tidak sedang di dalam dungeon.'],
    no_potion: ['You have no potion of that type.', 'Kamu tidak punya ramuan itu.'],
    potion_limit: ['Potion limit reached for this run (max 3).', 'Batas ramuan untuk run ini tercapai (maks 3).'],
    bad_action: ['Unknown action.', 'Aksi tidak dikenal.'],
    no_viaz: ['Not enough Viaz.', 'Viaz tidak cukup.'],
    bag_full: ['Backpack is full! Sell items, discard, or upgrade at the Armory.', 'Tas penuh! Jual, buang item, atau upgrade di Armory.'],
    max_tier: ['Already at the highest tier.', 'Sudah tingkat tertinggi.'],
    stale: ['This menu is outdated, please try again.', 'Menu kedaluwarsa, coba lagi.'],
    max_plots: ['Plot purchase limit reached.', 'Batas pembelian plot tercapai.'],
    max_backpack: ['Backpack upgrade limit reached.', 'Batas upgrade tas tercapai.'],
    auto_locked: ['Unlocks at Lv 10.', 'Terbuka di Lv 10.'],
    nothing_to_sell: ['Nothing to sell.', 'Tidak ada yang bisa dijual.'],
    nothing_to_claim: ['No finished quests to claim yet.', 'Belum ada quest selesai untuk diklaim.'],
    ascend_locked: [`Ascension needs total skill levels of ${G.ASCEND_TOTAL_LEVELS}.`, `Ascension butuh total level skill ${G.ASCEND_TOTAL_LEVELS}.`],
    ascend_busy: ['Finish your current activity first (harvest, claim, reel in, leave the dungeon).', 'Selesaikan aktivitas yang berjalan dulu (panen, klaim, tarik pancing, keluar dungeon).'],
    max_prestige: ['You reached the maximum Ascension.', 'Kamu sudah mencapai Ascension maksimum.'],
    rate_limited: ['⏳ Slow down a little.', '⏳ Tunggu sebentar.'],
    error: ['Something went wrong. Please try again.', 'Terjadi error. Coba lagi sebentar.'],
    guild_only: ['This only works inside the server.', 'Hanya bisa di dalam server.'],
    thread_failed: ['Could not create your thread. The channel must allow private threads.', 'Gagal membuat thread. Channel harus mengizinkan private thread.'],
  };
  const pair = map[code] ?? map.error;
  return `❌ ${tr(lang, pair[0], pair[1])}`;
}

module.exports = { viaz, rarityTag, label, ts, bagLine, expLine, errorText };
