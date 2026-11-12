'use strict';

/** Screen Fishing & Toko Pancing (Components V2, dua bahasa). */

const C = require('../config/constants');
const G = require('../config/game');
const { BAITS, getBait, getFish, getUnlockedBaits, BASE_STRIKE_MS } = require('../data/fishes');
const { getTool } = require('../data/tools');
const { getRarity } = require('../data/rarity');
const { fishingLevel, canFish, fishValue } = require('../lib/fishingLogic');
const { now: clockNow } = require('../lib/clock');
const { expToNext } = require('../lib/farmLogic');
const { freeSlots } = require('../lib/backpack');
const { tr, nameOf, descOf } = require('../lib/i18n');
const { formatNumber, formatViaz, formatDuration } = require('../lib/format');
const { btn, select, row } = require('./v2');
const { viaz, rarityTag, label, ts, bagLine, expLine } = require('./common');
const { price } = require('../lib/viazRate');
const { toolScreen } = require('./farmScreens');

const BLUE = 0x2196f3;
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Nama ikan dalam bahasa akun (data ikan tersimpan ringkas, ambil nama & emoji dari definisi). */
const fishName = (f, lang) => nameOf(getFish(f.id) ?? f, lang);
const fishEmote = (f) => getFish(f.id)?.emote ?? f.emote ?? '🐟';
const fishLine = (f, lang) => `${fishEmote(f)} ${fishName(f, lang)} **${f.weight} lbs** ${getRarity(f.rarity).emoji}`;

function maxBaitBuyable(account, bait) {
  return Math.max(0, Math.min(G.MAX_BUY_PER_ACTION, Math.floor(account.viaz / price(bait.cost)), freeSlots(account)));
}

function fishingNotice(res, lang) {
  if (!res.caught.length && !res.baitsReturned && !res.bagFull) return '';
  const out = [];
  if (res.caught.length) {
    const top = [...res.caught].sort((a, b) => b.weight - a.weight).slice(0, 8);
    out.push(`🎣 ${tr(lang, 'Caught', 'Tertangkap')} ${formatNumber(res.caught.length)}:`, ...top.map((f) => `• ${fishLine(f, lang)}`));
    if (res.caught.length > top.length) out.push(`• ${tr(lang, '...and', '...dan')} ${formatNumber(res.caught.length - top.length)} ${tr(lang, 'more', 'lainnya')}`);
    out.push(`⭐ +${formatNumber(res.xp)} XP Fishing`);
  }
  if (res.levelUps > 0) out.push(`🎉 ${tr(lang, 'Level up!', 'Naik level!')} Fishing Lv ${res.newLevel}`);
  if (res.baitsReturned > 0) out.push(`🪱 ${formatNumber(res.baitsReturned)} ${tr(lang, 'bait returned to your bag.', 'umpan kembali ke tas.')}`);
  if (res.bagFull) out.push(`⚠️ ${tr(lang, 'Backpack full! Line reeled in automatically.', 'Tas penuh! Pancingan ditarik otomatis.')}`);
  return out.join('\n');
}

function fishMain(account, lang, notice = '', now = clockNow()) {
  const level = fishingLevel(account);
  const rodTier = account.inventory?.rod ?? 0;
  const rod = rodTier > 0 ? getTool('rod', rodTier) : null;
  const s = account.fishing_session;
  let session = [tr(lang, '_Line not cast. Press Cast._', '_Pancingan belum dilempar. Tekan Lempar._')];
  if (s) {
    const bait = getBait(s.bait_id);
    session = [
      `🎣 ${tr(lang, 'Fishing AFK with', 'Memancing AFK dengan')} ${bait ? label(bait, lang) : s.bait_id}`,
      `🪱 ${tr(lang, 'Bait left', 'Sisa umpan')}: ${formatNumber(s.baits_remaining)} / ${formatNumber(s.baits_loaded)}`,
      `⏱️ ${tr(lang, 'Next strike', 'Strike berikutnya')}: ${ts(Math.max(s.last_strike_at + s.strike_ms, now))} (${tr(lang, 'every', 'tiap')} ${formatDuration(s.strike_ms, lang)})`,
      `🏁 ${tr(lang, 'Bait runs out', 'Umpan habis')}: ${ts(s.last_strike_at + s.strike_ms * s.baits_remaining)}`,
    ];
  }
  return {
    title: `🎣 ${tr(lang, 'Fishing Dock', 'Dermaga Pancing')}`,
    accent: BLUE,
    notice,
    body: [
      `<@${account.user_id}> · Fishing Lv ${level}/${G.MAX_LEVEL}`,
      expLine(account.skills.fishing ?? { exp: 0 }, expToNext(level), level >= G.MAX_LEVEL),
      '',
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      bagLine(account, lang),
      `🐟 ${tr(lang, 'Fish in bag', 'Ikan di tas')}: ${formatNumber(account.fishes?.length ?? 0)}`,
      rod ? `${rod.emote} ${nameOf(rod, lang)} · ${descOf(rod, lang)}` : `❌ ${tr(lang, 'No rod', 'Belum punya pancingan')}`,
      '',
      `**${tr(lang, 'Session', 'Sesi')}**`,
      ...session,
    ],
    rows: [
      row(
        btn(C.FISH_SESSION_OPEN_CUSTOM_ID, tr(lang, 'Cast', 'Lempar'), '🎣', Boolean(s)),
        btn(C.FISH_REEL_CUSTOM_ID, tr(lang, 'Reel In', 'Tarik'), '🪝', !s),
        btn(C.FISH_INVENTORY_CUSTOM_ID, tr(lang, 'Basket', 'Keranjang'), '🧺'),
        btn(C.FISH_REFRESH_CUSTOM_ID, 'Refresh', '🔄'),
      ),
    ],
  };
}

function baitSelect(account, lang) {
  const owned = getUnlockedBaits(fishingLevel(account)).filter((b) => (account.baits?.[b.id] ?? 0) > 0);
  const menu = select(
    C.FISH_SESSION_SELECT_CUSTOM_ID,
    tr(lang, 'Choose bait...', 'Pilih umpan...'),
    owned.map((b) => ({ label: `${nameOf(b, lang)} (x${account.baits[b.id]})`, value: b.id, description: `${getRarity(b.rarity).name} | C/U/R/E/L ${b.pool.join('/')}`, emoji: b.emote })),
  );
  return {
    title: `🎣 ${tr(lang, 'Cast Line', 'Lempar Pancingan')}`,
    accent: BLUE,
    body: owned.length
      ? [tr(lang, 'Pick your bait. Better bait means rarer fish.', 'Pilih umpan. Umpan lebih bagus = ikan lebih langka.')]
      : [tr(lang, '_No bait. Buy some at Fishing Supplies._', '_Tidak ada umpan. Beli di Toko Pancing._')],
    rows: [row(menu), row(btn(C.FISH_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️'))],
  };
}

function baitAmount(account, bait, lang) {
  const owned = account.baits?.[bait.id] ?? 0;
  const strike = Math.round(BASE_STRIKE_MS * (getTool('rod', account.inventory?.rod ?? 1)?.speedMult ?? 1));
  return {
    title: `🎣 ${label(bait, lang)}`,
    accent: getRarity(bait.rarity).color,
    body: [
      `${rarityTag(bait.rarity)} · ${descOf(bait, lang)}`,
      `C/U/R/E/L: ${bait.pool.join(' / ')} %`,
      `${tr(lang, 'Owned', 'Dimiliki')}: ${formatNumber(owned)} · ${tr(lang, 'Strike every', 'Strike tiap')} ${formatDuration(strike, lang)}`,
      '',
      tr(lang, `1 bait = 1 strike = 1 fish. 100 bait ≈ ${formatDuration(strike * 100, 'en')} AFK.`, `1 umpan = 1 strike = 1 ikan. 100 umpan ≈ ${formatDuration(strike * 100, 'id')} AFK.`),
    ],
    rows: [
      row(
        ...[10, 50, 100].map((n) => btn(`${C.FISH_SESSION_AMOUNT_PREFIX}${bait.id}:${n}`, String(n), null, n > owned)),
        btn(`${C.FISH_SESSION_AMOUNT_PREFIX}${bait.id}:max`, `${tr(lang, 'All', 'Semua')} (${owned})`, null, owned < 1),
      ),
      row(btn(C.FISH_SESSION_OPEN_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️')),
    ],
  };
}

function fishBasket(account, lang, mult) {
  const fishes = account.fishes ?? [];
  const top = [...fishes].sort((a, b) => b.weight - a.weight).slice(0, 15);
  const baits = BAITS.filter((b) => (account.baits?.[b.id] ?? 0) > 0).map((b) => `${label(b, lang)} ×${formatNumber(account.baits[b.id])}`);
  return {
    title: `🧺 ${tr(lang, 'Fish Basket', 'Keranjang Ikan')}`,
    accent: BLUE,
    body: [
      `**${tr(lang, 'Fish', 'Ikan')} (${formatNumber(fishes.length)})** · ${tr(lang, 'top 15 by weight', '15 terberat')}`,
      ...(top.length ? top.map((f) => `• ${fishLine(f, lang)}`) : [tr(lang, '_(empty)_', '_(kosong)_')]),
      '',
      `${tr(lang, 'Estimated value', 'Estimasi nilai')}: ${viaz(fishes.reduce((s, f) => s + fishValue(f, mult), 0))}`,
      '',
      `**${tr(lang, 'Bait', 'Umpan')}**`,
      ...(baits.length ? baits : [tr(lang, '_(empty)_', '_(kosong)_')]),
      '',
      bagLine(account, lang),
    ],
    rows: [row(btn(C.FISH_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️'))],
  };
}

/* ============ Toko ============ */

function fishShopBuyList(account, lang, notice = '') {
  const unlocked = new Set(getUnlockedBaits(fishingLevel(account)).map((b) => b.id));
  const menu = select(
    C.FISHING_SHOP_BUY_SELECT_CUSTOM_ID,
    tr(lang, 'Choose bait...', 'Pilih umpan...'),
    BAITS.filter((b) => unlocked.has(b.id)).map((b) => ({ label: nameOf(b, lang), value: b.id, description: `${getRarity(b.rarity).name} | ${formatViaz(price(b.cost))} Viaz`, emoji: b.emote })),
  );
  return {
    title: `🪱 ${tr(lang, 'Bait Shop', 'Toko Umpan')}`,
    accent: BLUE,
    notice,
    body: [
      tr(lang, 'Bait rarity unlocks: Common Lv1, Uncommon Lv10, Rare Lv20, Epic Lv40, Legendary Lv60 (Fishing).', 'Rarity umpan terbuka: Common Lv1, Uncommon Lv10, Rare Lv20, Epic Lv40, Legendary Lv60 (Fishing).'),
      '',
      ...BAITS.map((b) => (unlocked.has(b.id) ? `${label(b, lang)} ${getRarity(b.rarity).emoji} · ${formatViaz(price(b.cost))} Viaz · ${b.pool.join('/')}` : `🔒 ${label(b, lang)}`)),
      '',
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      bagLine(account, lang),
    ],
    rows: [row(menu)],
  };
}

function fishShopBait(account, bait, lang, notice = '') {
  const max = maxBaitBuyable(account, bait);
  return {
    title: `🪱 ${label(bait, lang)}`,
    accent: getRarity(bait.rarity).color,
    notice,
    body: [
      `${rarityTag(bait.rarity)} · ${descOf(bait, lang)}`,
      `${tr(lang, 'Price', 'Harga')}: ${viaz(price(bait.cost))} · C/U/R/E/L ${bait.pool.join(' / ')} %`,
      '',
      `${tr(lang, 'Owned', 'Dimiliki')}: ${formatNumber(account.baits?.[bait.id] ?? 0)} · ${tr(lang, 'Can buy', 'Bisa beli')}: ${formatNumber(max)}`,
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      bagLine(account, lang),
    ],
    rows: [
      row(
        ...[10, 50, 100].map((n) => btn(`${C.FISHING_SHOP_BUY_DO_PREFIX}${bait.id}:${n}`, `${tr(lang, 'Buy', 'Beli')} ${n}`, null, n > max)),
        btn(`${C.FISHING_SHOP_BUY_DO_PREFIX}${bait.id}:max`, `Max (${max})`, null, max < 1),
      ),
      row(btn(C.FISHING_SHOP_BUY_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️')),
    ],
  };
}

function fishShopSell(account, lang, mult, notice = '') {
  const fishes = account.fishes ?? [];
  const groups = RARITIES.map((r) => {
    const list = fishes.filter((f) => f.rarity === r);
    return { r, count: list.length, lbs: list.reduce((s, f) => s + (Number(f.weight) || 0), 0), value: list.reduce((s, f) => s + fishValue(f, mult), 0) };
  }).filter((g) => g.count);
  const menu = select(
    C.FISHING_SHOP_SELL_SELECT_CUSTOM_ID,
    tr(lang, 'Or sell by rarity...', 'Atau jual per rarity...'),
    groups.map((g) => ({ label: `${getRarity(g.r).name} (x${g.count})`, value: g.r, emoji: getRarity(g.r).emoji })),
  );
  return {
    title: `💰 ${tr(lang, 'Sell Fish', 'Jual Ikan')}`,
    accent: BLUE,
    notice,
    body: [
      tr(lang, 'Price = weight (lbs) × rarity price per lb × halving.', 'Harga = bobot (lbs) × harga per lbs rarity × halving.'),
      `${tr(lang, 'Halving multiplier', 'Multiplier halving')}: **×${mult}**`,
      '',
      ...(groups.length
        ? groups.map((g) => `${rarityTag(g.r)} · ${formatNumber(g.count)} · ${formatNumber(Math.round(g.lbs))} lbs · ${viaz(g.value)}`)
        : [tr(lang, '_Nothing to sell._', '_Tidak ada yang bisa dijual._')]),
      '',
      `Total: ${viaz(groups.reduce((s, g) => s + g.value, 0))}`,
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [row(btn(C.FISHING_SHOP_SELL_ALL_CUSTOM_ID, tr(lang, 'Sell All', 'Jual Semua'), '💰', !fishes.length)), row(menu)],
  };
}

function fishShopRod(account, lang, notice = '') {
  const first = (account.inventory?.rod ?? 0) < 1;
  return toolScreen({
    type: 'rod', account, lang, notice,
    title: `🎣 ${tr(lang, 'Fishing Rods', 'Pancingan')}`,
    accent: BLUE,
    levelOk: (next) => (first ? canFish(account) : fishingLevel(account) >= next.unlockLevel),
    reqText: (next) => (first ? 'Farming Lv 30 + Mining Lv 20' : `Fishing Lv ${next.unlockLevel}`),
    buyPrefix: C.FISHING_SHOP_TOOL_BUY_PREFIX,
    emoji: '🎣',
  });
}

module.exports = {
  RARITIES, maxBaitBuyable, fishName, fishEmote, fishingNotice, fishMain, baitSelect, baitAmount, fishBasket,
  fishShopBuyList, fishShopBait, fishShopSell, fishShopRod,
};
