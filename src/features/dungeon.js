'use strict';

const { saveAccount } = require('../lib/account');
const { startRun, act, dungeonLevel, meetsRequirements } = require('../lib/dungeonLogic');
const { getViazMultiplier } = require('../lib/halving');
const { freeSlots } = require('../lib/backpack');
const { buyToolTier, buyStack, maxStackBuy, sellStack } = require('../lib/shopOps');
const { getMonster, getPotion, LOOT } = require('../data/dungeons');
const { DUNGEON_ACTION_PREFIX, DUNGEON_SHOP_GEAR_BUY_PREFIX, DUNGEON_SHOP_POTION_BUY_PREFIX } = require('../config/constants');
const { tr, nameOf } = require('../lib/i18n');
const { formatNumber } = require('../lib/format');
const { show } = require('../ui/v2');
const { viaz, label, errorText } = require('../ui/common');
const S = require('../ui/dungeonScreens');
const { threadAction, panelAction, menuAction, warn } = require('./handler');
const { receipt } = require('./shop');
const { openThread } = require('./threads');

/** Thread: tampilkan pertarungan kalau sedang run, lobi kalau tidak. */
const current = (account, lang, notice, log) =>
  account.dungeon_run ? S.dungeonFight(account, lang, log ?? (notice ? [notice] : [])) : S.dungeonLobby(account, lang, notice);

const dg = (fn) => threadAction(null, fn);

const handleDungeonBack = dg((i, { account, lang }) => show(i, current(account, lang)));

const handleDungeonSelect = dg(async (i, { account, lang }) => {
  const res = startRun(account, i.values[0]);
  if (!res.ok) return warn(i, lang, res.code === 'locked' ? 'dungeon_locked' : res.code);
  saveAccount(account);
  const m = getMonster(account.dungeon_run.enemy.id);
  const fee = res.fee ? ` (-${viaz(res.fee)})` : '';
  await show(i, S.dungeonFight(account, lang, [`🚪 ${tr(lang, 'You enter', 'Kamu memasuki')} ${label(res.dungeon, lang)}${fee}. ${m.emote} ${nameOf(m, lang)} ${tr(lang, 'appears!', 'muncul!')}`]));
});

async function turn(i, { account, lang }, action) {
  if (!account.dungeon_run) return show(i, S.dungeonLobby(account, lang, errorText(lang, 'no_run')));
  const monster = getMonster(account.dungeon_run.enemy.id);
  const res = act(account, action);
  if (!res.ok) return warn(i, lang, res.code);
  saveAccount(account);
  const log = S.eventLines(res.events, lang, monster);
  if (res.finished) return show(i, S.dungeonLobby(account, lang, [...log, '', S.runSummary(res.finished, lang)].join('\n')));
  if (res.floorCleared) {
    const next = getMonster(account.dungeon_run.enemy.id);
    log.push(`⬇️ ${tr(lang, 'Next floor:', 'Lantai berikutnya:')} ${next.boss ? '👑 ' : ''}${next.emote} ${nameOf(next, lang)}`);
  }
  await show(i, S.dungeonFight(account, lang, log));
}

const handleDungeonAction = dg((i, ctx) => {
  const action = i.customId.slice(DUNGEON_ACTION_PREFIX.length);
  if (!['attack', 'heavy', 'defend', 'flee'].includes(action)) return warn(i, ctx.lang, 'bad_action');
  return turn(i, ctx, action);
});

const handleDungeonPotion = dg((i, ctx) => turn(i, ctx, `potion:${i.values[0]}`));

/* ============ Thread opener ============ */

async function handleStartDungeon(interaction) {
  await openThread(interaction, {
    kind: 'dungeon',
    gate: (a) => {
      if (!meetsRequirements(a)) return 'dungeon_locked';
      if (!((a.inventory?.weapon ?? 0) > 0)) return 'no_weapon';
      return null;
    },
    screen: (a, lang) => current(a, lang),
  });
}

/* ============ Toko Dungeon ============ */

const gearView = (i, { account, lang }, notice = '') => show(i, S.dungeonShopWeapons(account, lang, notice));
const handleDungeonShopGearOpen = panelAction((i, ctx) => gearView(i, ctx));

const handleDungeonShopGearBuy = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const [type, tierRaw] = i.customId.slice(DUNGEON_SHOP_GEAR_BUY_PREFIX.length).split(':');
  if (!['weapon', 'armor'].includes(type)) return gearView(i, ctx, errorText(lang, 'bad_action'));
  if (account.dungeon_run) return gearView(i, ctx, errorText(lang, 'busy_dungeon'));
  const first = (account.inventory?.[type] ?? 0) < 1;
  const res = buyToolTier(account, type, parseInt(tierRaw, 10), (next) =>
    meetsRequirements(account) && (type === 'weapon' && first && parseInt(tierRaw, 10) === 1 ? true : dungeonLevel(account) >= next.unlockLevel));
  if (!res.ok) return gearView(i, ctx, errorText(lang, res.code === 'level' ? 'dungeon_locked' : res.code));
  await gearView(i, ctx, `🎉 ${tr(lang, 'You got', 'Kamu mendapat')} ${res.tool.emote} **${nameOf(res.tool, lang)}**!`);
});

const potionView = (i, { account, lang }, notice = '') => show(i, S.dungeonShopPotions(account, lang, notice));
const handleDungeonShopPotionOpen = panelAction((i, ctx) => potionView(i, ctx));

const handleDungeonShopPotionBuy = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const [id, qtyRaw] = i.customId.slice(DUNGEON_SHOP_POTION_BUY_PREFIX.length).split(':');
  const potion = getPotion(id);
  const qty = Math.max(1, Math.min(100, parseInt(qtyRaw, 10) || 1));
  if (!potion) return potionView(i, ctx, errorText(lang, 'not_found'));
  if (maxStackBuy(account, potion.cost) < qty) return potionView(i, ctx, errorText(lang, freeSlots(account) < qty ? 'bag_full' : 'no_viaz'));
  const res = buyStack(account, 'potions', potion, potion.cost, qty);
  if (!res.ok) return potionView(i, ctx, errorText(lang, res.code));
  await potionView(i, ctx, `✅ ${tr(lang, 'Bought', 'Membeli')} ${label(potion, lang)} ×${formatNumber(res.qty)} (${viaz(res.cost)})`);
});

const sellView = async (i, { account, lang }, notice = '') => show(i, S.dungeonShopSell(account, lang, await getViazMultiplier(), notice));
const handleDungeonShopSellOpen = panelAction((i, ctx) => sellView(i, ctx));
const handleDungeonShopSellAll = menuAction(async (i, ctx) => sellView(i, ctx, receipt(await sellStack(ctx.account, 'dungeon_loot', LOOT), ctx.lang)));

module.exports = {
  handleStartDungeon, handleDungeonSelect, handleDungeonAction, handleDungeonPotion, handleDungeonBack,
  handleDungeonShopGearOpen, handleDungeonShopGearBuy, handleDungeonShopPotionOpen, handleDungeonShopPotionBuy,
  handleDungeonShopSellOpen, handleDungeonShopSellAll,
};
