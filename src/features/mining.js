'use strict';

const { saveAccount } = require('../lib/account');
const { now: clockNow } = require('../lib/clock');
const { settleMining, startTrip, canAutoMine, miningLevel } = require('../lib/miningLogic');
const { farmingLevel } = require('../lib/farmLogic');
const { getViazMultiplier } = require('../lib/halving');
const { buyToolTier, sellStack } = require('../lib/shopOps');
const { ORES } = require('../data/ores');
const { MINING_SHOP_TOOL_BUY_PREFIX } = require('../config/constants');
const { tr, nameOf } = require('../lib/i18n');
const { show } = require('../ui/v2');
const { ts, label, errorText } = require('../ui/common');
const S = require('../ui/mineScreens');
const { threadAction, panelAction, menuAction, warn } = require('./handler');
const { receipt } = require('./shop');

const join = (...p) => p.filter(Boolean).join('\n');

/* ============ Thread ============ */

const mine = (fn) => threadAction((a, lang) => S.miningNotice(settleMining(a), lang, { auto: true }), fn);
const main = (i, { account, lang }, notice) => show(i, S.mineMain(account, lang, notice));

const handleMiningRefresh = mine((i, ctx) => main(i, ctx, ctx.notice));
const handleMiningInventory = mine((i, { account, lang }) => show(i, S.oreStorage(account, lang)));

const handleExpeditionOpen = mine(async (i, ctx) => {
  if (ctx.account.mining_trip) return warn(i, ctx.lang, 'busy_mining');
  await show(i, S.caveSelect(ctx.account, ctx.lang));
});

const handleExpeditionSelect = mine(async (i, ctx) => {
  const { account, lang } = ctx;
  const res = startTrip(account, i.values[0]);
  if (!res.ok) return warn(i, lang, res.code, res);
  saveAccount(account);
  await main(i, ctx, join(ctx.notice, `⛏️ ${tr(lang, 'Expedition started in', 'Ekspedisi dimulai di')} ${label(res.cave, lang)}, ${tr(lang, 'done', 'selesai')} ${ts(res.finishedAt)}`));
});

const handleMiningClaim = mine(async (i, ctx) => {
  const { account, lang } = ctx;
  const trip = account.mining_trip;
  if (!trip) return main(i, ctx, join(ctx.notice, `⛏️ ${tr(lang, 'No active expedition.', 'Tidak ada ekspedisi aktif.')}`));
  const res = settleMining(account, clockNow(), { manual: true });
  if (res.changed) saveAccount(account);
  const got = S.miningNotice(res, lang);
  await main(i, ctx, join(ctx.notice, got || (ctx.notice ? '' : `⏳ ${tr(lang, 'Still digging! Done', 'Masih menggali! Selesai')} ${ts(trip.finished_at)}`)));
});

const handleAutoMineToggle = mine(async (i, ctx) => {
  const { account, lang } = ctx;
  if (!canAutoMine(account)) return warn(i, lang, 'auto_locked');
  account.auto_mining = !account.auto_mining;
  const extra = account.auto_mining ? S.miningNotice(settleMining(account), lang, { auto: true }) : '';
  saveAccount(account);
  const msg = account.auto_mining
    ? tr(lang, '🤖 Auto-Mine on: expeditions restart automatically.', '🤖 Auto-Mine aktif: ekspedisi diulang otomatis.')
    : tr(lang, '⏸️ Auto-Mine off.', '⏸️ Auto-Mine dimatikan.');
  await main(i, ctx, join(ctx.notice, msg, extra));
});

/* ============ Toko Tambang ============ */

const sellView = async (i, { account, lang }, notice = '') => show(i, S.mineShopSell(account, lang, await getViazMultiplier(), notice));
const handleMiningShopSellOpen = panelAction((i, ctx) => sellView(i, ctx));
const handleMiningShopSellAll = menuAction(async (i, ctx) => sellView(i, ctx, receipt(await sellStack(ctx.account, 'ores', ORES), ctx.lang)));
const handleMiningShopSellSelect = menuAction(async (i, ctx) =>
  sellView(i, ctx, receipt(await sellStack(ctx.account, 'ores', ORES, [i.values[0]]), ctx.lang)));

const pickView = (i, { account, lang }, notice = '') => show(i, S.mineShopPickaxe(account, lang, notice));
const handleMiningShopToolOpen = panelAction((i, ctx) => pickView(i, ctx));

const handleMiningShopToolBuy = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const first = (account.inventory?.pickaxe ?? 0) < 1;
  const tier = parseInt(i.customId.slice(MINING_SHOP_TOOL_BUY_PREFIX.length), 10);
  const res = buyToolTier(account, 'pickaxe', tier, (next) =>
    first && tier === 1 ? farmingLevel(account) >= 10 : miningLevel(account) >= next.unlockLevel);
  if (!res.ok) return pickView(i, ctx, errorText(lang, res.code));
  await pickView(i, ctx, `🎉 ${tr(lang, 'You got', 'Kamu mendapat')} ${res.tool.emote} **${nameOf(res.tool, lang)}**!`);
});

module.exports = {
  handleMiningRefresh, handleExpeditionOpen, handleExpeditionSelect, handleMiningClaim, handleMiningInventory, handleAutoMineToggle,
  handleMiningShopSellOpen, handleMiningShopSellAll, handleMiningShopSellSelect, handleMiningShopToolOpen, handleMiningShopToolBuy,
};
