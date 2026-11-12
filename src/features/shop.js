'use strict';

const { saveAccount } = require('../lib/account');
const { getViazMultiplier } = require('../lib/halving');
const { round2 } = require('../lib/halvingMath');
const { farmingLevel, plotsCost, maxBuyable } = require('../lib/farmLogic');
const { buyToolTier, buyStack, sellStack } = require('../lib/shopOps');
const { getSeed, SEEDS } = require('../data/seeds');
const G = require('../config/game');
const { SHOP_PLOT_BUY_PREFIX, SHOP_TOOL_BUY_PREFIX } = require('../config/constants');
const { tr, nameOf } = require('../lib/i18n');
const { formatNumber, formatViaz } = require('../lib/format');
const { show } = require('../ui/v2');
const { viaz, label, errorText } = require('../ui/common');
const S = require('../ui/farmScreens');
const { panelAction, menuAction } = require('./handler');

/* ============ Beli benih ============ */

const buyList = async (i, { account, lang }, notice = '') => show(i, S.shopBuyList(account, lang, await getViazMultiplier(), notice));
const seedView = async (i, { account, lang }, seed, notice = '') =>
  show(i, S.shopSeed(account, seed, lang, await getViazMultiplier(), notice));

const handleShopBuyOpen = panelAction((i, ctx) => buyList(i, ctx));
const handleShopBuyBack = menuAction((i, ctx) => buyList(i, ctx));

const handleShopBuySelect = menuAction(async (i, ctx) => {
  const seed = getSeed(i.values[0]);
  if (!seed || seed.levelUnlock > farmingLevel(ctx.account)) return buyList(i, ctx, errorText(ctx.lang, 'seed_locked', { seed }));
  await seedView(i, ctx, seed);
});

const handleShopBuyDo = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const [, seedId, amountRaw] = i.customId.split(':');
  const seed = getSeed(seedId);
  if (!seed || seed.levelUnlock > farmingLevel(account)) return buyList(i, ctx, errorText(lang, 'seed_locked', { seed }));

  const max = maxBuyable(account, seed);
  const qty = Math.min(amountRaw === 'max' ? max : parseInt(amountRaw, 10) || 0, max);
  const res = buyStack(account, 'seeds', seed, seed.buyPrice, qty);
  if (!res.ok) return seedView(i, ctx, seed, errorText(lang, res.code));
  await seedView(i, ctx, seed, `✅ ${tr(lang, 'Bought', 'Membeli')} ${label(seed, lang)} ×${formatNumber(res.qty)} (${viaz(res.cost)})`);
});

/* ============ Jual panen ============ */

const sellView = async (i, { account, lang }, notice = '') => show(i, S.shopSell(account, lang, await getViazMultiplier(), notice));

function receipt(res, lang) {
  if (!res.ok) return errorText(lang, res.code);
  const items = res.sold.map(({ item, qty }) => `${item.emote} ${nameOf(item, lang)} ×${formatNumber(qty)}`).join(', ');
  const bonus = res.bonus > 1 ? ` · ✨ +${Math.round((res.bonus - 1) * 100)}%` : '';
  return `✅ ${tr(lang, 'Sold', 'Terjual')}: ${items}\n+${viaz(res.total)} (halving ×${res.halving}${bonus})`;
}

const handleShopSellOpen = panelAction((i, ctx) => sellView(i, ctx));
const handleShopSellAll = menuAction(async (i, ctx) => sellView(i, ctx, receipt(await sellStack(ctx.account, 'harvests', SEEDS), ctx.lang)));
const handleShopSellSelect = menuAction(async (i, ctx) =>
  sellView(i, ctx, receipt(await sellStack(ctx.account, 'harvests', SEEDS, [i.values[0]]), ctx.lang)));

/* ============ Beli plot ============ */

const plotView = (i, { account, lang }, notice = '') => show(i, S.shopPlots(account, lang, notice));
const handleShopPlotOpen = panelAction((i, ctx) => plotView(i, ctx));

const handleShopPlotBuy = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const requested = parseInt(i.customId.slice(SHOP_PLOT_BUY_PREFIX.length), 10) || 0;
  const qty = Math.min(requested, G.MAX_BOUGHT_PLOTS - account.bought_plots);
  if (qty < 1) return plotView(i, ctx, errorText(lang, 'max_plots'));
  const cost = plotsCost(account.bought_plots, qty);
  if (!Number.isFinite(cost) || cost > account.viaz) return plotView(i, ctx, errorText(lang, 'no_viaz'));
  account.viaz = round2(account.viaz - cost);
  account.bought_plots += qty;
  saveAccount(account);
  await plotView(i, ctx, `✅ +${formatNumber(qty)} ${tr(lang, 'plots', 'plot')} (${formatViaz(cost)} Viaz)`);
});

/* ============ Upgrade cangkul ============ */

const hoeView = (i, { account, lang }, notice = '') => show(i, S.shopHoe(account, lang, notice));
const handleShopToolOpen = panelAction((i, ctx) => hoeView(i, ctx));

const handleShopToolBuy = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const tier = parseInt(i.customId.slice(SHOP_TOOL_BUY_PREFIX.length), 10);
  const res = buyToolTier(account, 'hoe', tier, (next) => farmingLevel(account) >= next.unlockLevel);
  if (!res.ok) return hoeView(i, ctx, errorText(lang, res.code));
  await hoeView(i, ctx, `🎉 ${tr(lang, 'You got', 'Kamu mendapat')} ${res.tool.emote} **${nameOf(res.tool, lang)}** ×${res.copies}!`);
});

module.exports = {
  receipt,
  handleShopBuyOpen, handleShopBuyBack, handleShopBuySelect, handleShopBuyDo,
  handleShopSellOpen, handleShopSellAll, handleShopSellSelect,
  handleShopPlotOpen, handleShopPlotBuy, handleShopToolOpen, handleShopToolBuy,
};
