'use strict';

const { saveAccount } = require('../lib/account');
const { round2 } = require('../lib/halvingMath');
const { backpacksCost, discardItem } = require('../lib/backpack');
const G = require('../config/game');
const { BACKPACK_UPGRADE_BUY_PREFIX, BACKPACK_DISCARD_DO_PREFIX } = require('../config/constants');
const { tr } = require('../lib/i18n');
const { formatNumber } = require('../lib/format');
const { show } = require('../ui/v2');
const { viaz, errorText } = require('../ui/common');
const S = require('../ui/backpackScreens');
const { panelAction, menuAction } = require('./handler');

const DISCARDABLE = ['seeds', 'harvests', 'ores', 'baits', 'fishes', 'dungeon_loot', 'potions'];

const mainView = (i, { account, lang }, notice = '') => show(i, S.backpackMain(account, lang, notice));
const discardView = (i, { account, lang }, selected = null, notice = '') => show(i, S.backpackDiscard(account, lang, selected, notice));

const handleBackpackOpen = panelAction((i, ctx) => mainView(i, ctx));
const handleBackpackRefresh = menuAction((i, ctx) => mainView(i, ctx));
const handleBackpackDiscardOpen = menuAction((i, ctx) => discardView(i, ctx));
const handleBackpackDiscardBack = menuAction((i, ctx) => mainView(i, ctx));

const handleBackpackBuy = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const qty = parseInt(i.customId.slice(BACKPACK_UPGRADE_BUY_PREFIX.length), 10) || 1;
  const bought = account.bought_backpack ?? 0;
  if (bought + qty > G.MAX_BOUGHT_BACKPACK) return mainView(i, ctx, errorText(lang, 'max_backpack'));
  const cost = backpacksCost(bought, qty);
  if (!Number.isFinite(cost) || account.viaz < cost) return mainView(i, ctx, errorText(lang, 'no_viaz'));
  account.viaz = round2(account.viaz - cost);
  account.bought_backpack = bought + qty;
  saveAccount(account);
  await mainView(i, ctx, `🎉 +${formatNumber(qty * G.SLOTS_PER_BACKPACK_UPGRADE)} ${tr(lang, 'slots', 'slot')} (${viaz(cost)})`);
});

/** Jumlah item di kategori (ikan = panjang array). */
function stockOf(account, category, id) {
  if (category === 'fishes') return Array.isArray(account.fishes) ? account.fishes.length : 0;
  return account[category]?.[id] ?? 0;
}

const handleBackpackDiscardSelect = menuAction(async (i, ctx) => {
  const [category, id] = i.values[0].split(':');
  const qty = DISCARDABLE.includes(category) ? stockOf(ctx.account, category, id) : 0;
  if (qty <= 0) return discardView(i, ctx, null, errorText(ctx.lang, 'not_found'));
  await discardView(i, ctx, { category, id, qty });
});

const handleBackpackDiscardDo = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const [category, id, amountRaw] = i.customId.slice(BACKPACK_DISCARD_DO_PREFIX.length).split(':');
  const current = DISCARDABLE.includes(category) ? stockOf(account, category, id) : 0;
  if (current <= 0) return discardView(i, ctx, null, errorText(lang, 'not_found'));
  const removed = discardItem(account, category, id, amountRaw === 'all' ? current : parseInt(amountRaw, 10) || 1);
  saveAccount(account);
  const m = S.itemMeta(category, id, lang);
  await discardView(i, ctx, null, `🗑️ ${tr(lang, 'Discarded', 'Dibuang')} ${m.emote} **${m.name}** ×${formatNumber(removed)}`);
});

module.exports = {
  handleBackpackOpen, handleBackpackRefresh, handleBackpackBuy,
  handleBackpackDiscardOpen, handleBackpackDiscardBack, handleBackpackDiscardSelect, handleBackpackDiscardDo,
};
