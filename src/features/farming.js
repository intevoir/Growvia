'use strict';

const { saveAccount } = require('../lib/account');
const { now: clockNow } = require('../lib/clock');
const { settle, plant, maxPlantable, canAutoPlant } = require('../lib/farmLogic');
const { getSeed } = require('../data/seeds');
const { tr, nameOf } = require('../lib/i18n');
const { formatNumber } = require('../lib/format');
const { show } = require('../ui/v2');
const { ts } = require('../ui/common');
const S = require('../ui/farmScreens');
const { threadAction, warn } = require('./handler');

const join = (...p) => p.filter(Boolean).join('\n');

/** Jalankan auto-tanam tertunda setiap kali thread disentuh. */
const settleFarm = (account, lang) => S.settleNotice(settle(account), lang, { auto: true });
const farm = (fn) => threadAction(settleFarm, fn);

const main = (i, { account, lang }, notice) => show(i, S.farmMain(account, lang, notice));

const handleFarmRefresh = farm((i, ctx) => main(i, ctx, ctx.notice));
const handlePlantOpen = farm((i, { account, lang }) => show(i, S.plantMenu(account, lang)));
const handleInventory = farm((i, { account, lang }) => show(i, S.farmInventory(account, lang)));

const handlePlantSelect = farm(async (i, { account, lang }) => {
  const seed = getSeed(i.values[0]);
  if (!seed) return warn(i, lang, 'not_found');
  await show(i, S.plantAmount(account, seed, lang));
});

const handlePlantDo = farm(async (i, ctx) => {
  const { account, lang } = ctx;
  const [, seedId, amountRaw] = i.customId.split(':');
  const requested = amountRaw === 'max' ? maxPlantable(account, seedId) : parseInt(amountRaw, 10);
  const res = plant(account, seedId, requested || 0);
  if (!res.ok) return warn(i, lang, res.code, res);
  saveAccount(account);
  await main(i, ctx, join(ctx.notice, `🌱 ${tr(lang, 'Planted', 'Menanam')} ${res.seed.emote} ${nameOf(res.seed, lang)} ×${formatNumber(res.qty)}, ${tr(lang, 'ready', 'siap')} ${ts(res.finishedAt)}`));
});

const handleHarvest = farm(async (i, ctx) => {
  const { account, lang } = ctx;
  const res = settle(account, clockNow(), { manual: true });
  if (res.changed) saveAccount(account);
  const harvested = S.settleNotice(res, lang);
  await main(i, ctx, join(ctx.notice, harvested || (ctx.notice ? '' : `🌾 ${tr(lang, 'Nothing is ready to harvest yet.', 'Belum ada tanaman yang siap dipanen.')}`)));
});

const handleAutoToggle = farm(async (i, ctx) => {
  const { account, lang } = ctx;
  if (!canAutoPlant(account)) return warn(i, lang, 'auto_locked');
  account.auto_plant = !account.auto_plant;
  const extra = account.auto_plant ? S.settleNotice(settle(account), lang, { auto: true }) : '';
  saveAccount(account);
  const msg = account.auto_plant
    ? tr(lang, '🤖 Auto-Plant on: ready crops are harvested and replanted while seeds last.', '🤖 Auto-Tanam aktif: tanaman siap dipanen dan ditanam ulang selama benih cukup.')
    : tr(lang, '⏸️ Auto-Plant off.', '⏸️ Auto-Tanam dimatikan.');
  await main(i, ctx, join(ctx.notice, msg, extra));
});

module.exports = {
  handleFarmRefresh, handlePlantOpen, handlePlantSelect, handlePlantDo, handleHarvest, handleInventory, handleAutoToggle,
};
