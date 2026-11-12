'use strict';

const { saveAccount } = require('../lib/account');
const { settleFishing, startFishing, reelIn, fishingLevel, canFish, fishValue } = require('../lib/fishingLogic');
const { getViazMultiplier, addViazMinted } = require('../lib/halving');
const { round2 } = require('../lib/halvingMath');
const { record, sellBonus } = require('../lib/progress');
const { buyToolTier, buyStack } = require('../lib/shopOps');
const { getBait, getUnlockedBaits } = require('../data/fishes');
const { FISH_SESSION_AMOUNT_PREFIX, FISHING_SHOP_BUY_DO_PREFIX, FISHING_SHOP_TOOL_BUY_PREFIX } = require('../config/constants');
const { tr, nameOf } = require('../lib/i18n');
const { formatNumber, formatDuration } = require('../lib/format');
const { show } = require('../ui/v2');
const { viaz, label, errorText } = require('../ui/common');
const S = require('../ui/fishScreens');
const { threadAction, panelAction, menuAction, warn } = require('./handler');

const join = (...p) => p.filter(Boolean).join('\n');

/* ============ Thread ============ */

const fish = (fn) => threadAction((a, lang) => S.fishingNotice(settleFishing(a), lang), fn);
const main = (i, { account, lang }, notice) => show(i, S.fishMain(account, lang, notice));

const handleFishingRefresh = fish((i, ctx) => main(i, ctx, ctx.notice));

const handleBaitOpen = fish(async (i, ctx) => {
  if (ctx.account.fishing_session) return warn(i, ctx.lang, 'busy_fishing');
  await show(i, S.baitSelect(ctx.account, ctx.lang));
});

const handleBaitSelect = fish(async (i, { account, lang }) => {
  const bait = getBait(i.values[0]);
  if (!bait) return warn(i, lang, 'not_found');
  await show(i, S.baitAmount(account, bait, lang));
});

const handleCast = fish(async (i, ctx) => {
  const { account, lang } = ctx;
  const [baitId, amountRaw] = i.customId.slice(FISH_SESSION_AMOUNT_PREFIX.length).split(':');
  const owned = account.baits?.[baitId] ?? 0;
  const res = startFishing(account, baitId, amountRaw === 'max' ? owned : parseInt(amountRaw, 10) || 0);
  if (!res.ok) return warn(i, lang, res.code, res);
  saveAccount(account);
  await main(i, ctx, join(ctx.notice, `🎣 ${tr(lang, 'Line cast with', 'Pancingan dilempar dengan')} ${label(res.bait, lang)} ×${formatNumber(res.qty)}. ` +
    `${tr(lang, 'Strike every', 'Strike tiap')} ${formatDuration(res.strikeMs, lang)}, AFK ±${formatDuration(res.strikeMs * res.qty, lang)}.`));
});

const handleReel = fish(async (i, ctx) => {
  const { account, lang } = ctx;
  if (!account.fishing_session) return main(i, ctx, join(ctx.notice, `🎣 ${tr(lang, 'Your line is not in the water.', 'Pancingan tidak sedang dilempar.')}`));
  const res = reelIn(account);
  saveAccount(account);
  await main(i, ctx, join(ctx.notice, `🪝 ${tr(lang, 'Line reeled in.', 'Pancingan ditarik.')}`, S.fishingNotice(res, lang)));
});

const handleFishInventory = fish(async (i, { account, lang }) => show(i, S.fishBasket(account, lang, await getViazMultiplier())));

/* ============ Toko Pancing ============ */

const unlocked = (account, bait) => getUnlockedBaits(fishingLevel(account)).some((b) => b.id === bait.id);
const buyList = (i, { account, lang }, notice = '') => show(i, S.fishShopBuyList(account, lang, notice));
const baitView = (i, { account, lang }, bait, notice = '') => show(i, S.fishShopBait(account, bait, lang, notice));

const handleFishingShopBuyOpen = panelAction((i, ctx) => buyList(i, ctx));
const handleFishingShopBuyBack = menuAction((i, ctx) => buyList(i, ctx));

const handleFishingShopBuySelect = menuAction(async (i, ctx) => {
  const bait = getBait(i.values[0]);
  if (!bait || !unlocked(ctx.account, bait)) return buyList(i, ctx, errorText(ctx.lang, 'level'));
  await baitView(i, ctx, bait);
});

const handleFishingShopBuyDo = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const [baitId, amountRaw] = i.customId.slice(FISHING_SHOP_BUY_DO_PREFIX.length).split(':');
  const bait = getBait(baitId);
  if (!bait || !unlocked(account, bait)) return buyList(i, ctx, errorText(lang, 'level'));
  const max = S.maxBaitBuyable(account, bait);
  const qty = Math.min(amountRaw === 'max' ? max : parseInt(amountRaw, 10) || 0, max);
  const res = buyStack(account, 'baits', bait, bait.cost, qty);
  if (!res.ok) return baitView(i, ctx, bait, errorText(lang, res.code));
  await baitView(i, ctx, bait, `✅ ${tr(lang, 'Bought', 'Membeli')} ${label(bait, lang)} ×${formatNumber(res.qty)} (${viaz(res.cost)})`);
});

async function sellFishes(account, lang, rarity) {
  const halving = await getViazMultiplier();
  const mult = halving * sellBonus(account);
  const fishes = account.fishes ?? [];
  const sold = fishes.filter((f) => !rarity || f.rarity === rarity);
  if (!sold.length) return errorText(lang, 'nothing_to_sell');
  const total = round2(sold.reduce((s, f) => s + fishValue(f, mult), 0));
  const lbs = sold.reduce((s, f) => s + (Number(f.weight) || 0), 0);
  const top = sold.reduce((m, f) => (f.weight > m.weight ? f : m), sold[0]);
  account.fishes = rarity ? fishes.filter((f) => f.rarity !== rarity) : [];
  account.viaz = round2(account.viaz + total);
  record(account, 'earn', total);
  saveAccount(account);
  await addViazMinted(total);
  return `✅ ${tr(lang, 'Sold', 'Terjual')} ${formatNumber(sold.length)} ${tr(lang, 'fish', 'ikan')} (${formatNumber(Math.round(lbs))} lbs)\n` +
    `🏆 ${tr(lang, 'Heaviest', 'Terberat')}: ${S.fishEmote(top)} ${S.fishName(top, lang)} ${top.weight} lbs\n+${viaz(total)} (halving ×${halving}${sellBonus(account) > 1 ? ` · ✨ +${Math.round((sellBonus(account) - 1) * 100)}%` : ''})`;
}

const sellView = async (i, { account, lang }, notice = '') => show(i, S.fishShopSell(account, lang, await getViazMultiplier(), notice));
const handleFishingShopSellOpen = panelAction((i, ctx) => sellView(i, ctx));
const handleFishingShopSellAll = menuAction(async (i, ctx) => sellView(i, ctx, await sellFishes(ctx.account, ctx.lang, null)));
const handleFishingShopSellSelect = menuAction(async (i, ctx) => {
  const r = i.values[0];
  await sellView(i, ctx, S.RARITIES.includes(r) ? await sellFishes(ctx.account, ctx.lang, r) : errorText(ctx.lang, 'bad_action'));
});

const rodView = (i, { account, lang }, notice = '') => show(i, S.fishShopRod(account, lang, notice));
const handleFishingShopToolOpen = panelAction((i, ctx) => rodView(i, ctx));

const handleFishingShopToolBuy = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const first = (account.inventory?.rod ?? 0) < 1;
  const tier = parseInt(i.customId.slice(FISHING_SHOP_TOOL_BUY_PREFIX.length), 10);
  const res = buyToolTier(account, 'rod', tier, (next) => (first && tier === 1 ? canFish(account) : fishingLevel(account) >= next.unlockLevel));
  if (!res.ok) return rodView(i, ctx, errorText(lang, res.code));
  await rodView(i, ctx, `🎉 ${tr(lang, 'You got', 'Kamu mendapat')} ${res.tool.emote} **${nameOf(res.tool, lang)}**!`);
});

module.exports = {
  handleFishingRefresh, handleBaitOpen, handleBaitSelect, handleCast, handleReel, handleFishInventory,
  handleFishingShopBuyOpen, handleFishingShopBuyBack, handleFishingShopBuySelect, handleFishingShopBuyDo,
  handleFishingShopSellOpen, handleFishingShopSellAll, handleFishingShopSellSelect, handleFishingShopToolOpen, handleFishingShopToolBuy,
};
