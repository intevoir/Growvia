'use strict';

/** Hall: profil, quest, achievement, koleksi, peringkat, Ascension. Panel publik membuka menu pribadi. */

const { saveAccount } = require('../lib/account');
const { now: clockNow } = require('../lib/clock');
const P = require('../lib/progress');
const { getTop, KINDS } = require('../lib/leaderboard');
const { buyBoost } = require('../lib/boosts');
const { HALL_OPEN_PREFIX, HALL_NAV_PREFIX, HALL_BOOST_BUY_PREFIX, BOOSTS_OPEN_CUSTOM_ID } = require('../config/constants');
const { tr } = require('../lib/i18n');
const { show } = require('../ui/v2');
const { errorText, viaz } = require('../ui/common');
const S = require('../ui/progressScreens');
const BS = require('../ui/boostScreens');
const { panelAction, menuAction } = require('./handler');

/** Layar tiap tujuan navigasi. */
const SCREENS = {
  profile: (account, lang, notice) => S.profileScreen(account, lang, notice),
  quests: (account, lang, notice) => {
    const screen = S.questsScreen(account, lang, notice);
    saveAccount(account); // quest harian/mingguan baru dibuat saat dibuka
    return screen;
  },
  ach: (account, lang, notice) => S.achScreen(account, lang, 'farming', notice),
  coll: (account, lang, notice) => S.collScreen(account, lang, 'fish', notice),
  top: async (account, lang, notice) => S.topScreen(lang, 'total', await getTop('total'), notice),
  boost: (account, lang, notice) => BS.boostShop(account, lang, notice),
};

async function render(i, { account, lang }, target, notice = '') {
  const build = SCREENS[target] ?? SCREENS.profile;
  await show(i, await build(account, lang, notice));
}

const targetOf = (id, prefix) => id.slice(prefix.length);

const handleHallOpen = panelAction((i, ctx) => render(i, ctx, targetOf(i.customId, HALL_OPEN_PREFIX)));
const handleHallNav = menuAction((i, ctx) => render(i, ctx, targetOf(i.customId, HALL_NAV_PREFIX)));

const handleClaim = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const res = P.claimQuests(account);
  if (!res.ok) return show(i, S.questsScreen(account, lang, errorText(lang, res.code)));
  saveAccount(account);
  await show(i, S.questsScreen(account, lang, S.claimNotice(res, lang)));
});

const handleAchSelect = menuAction((i, { account, lang }) => show(i, S.achScreen(account, lang, i.values[0])));
const handleCollSelect = menuAction((i, { account, lang }) => show(i, S.collScreen(account, lang, i.values[0])));

const handleTopSelect = menuAction(async (i, { lang }) => {
  const kind = KINDS.includes(i.values[0]) ? i.values[0] : 'total';
  await show(i, S.topScreen(lang, kind, await getTop(kind)));
});

const handleAscend = menuAction((i, { account, lang }) => show(i, S.ascendScreen(account, lang)));

const handleAscendDo = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const res = P.ascend(account);
  if (!res.ok) return show(i, S.ascendScreen(account, lang, errorText(lang, res.code)));
  saveAccount(account);
  await show(i, S.profileScreen(account, lang, `✨ ${tr(lang, `Ascension ${res.prestige} complete! Your journey begins anew, stronger than before.`, `Ascension ${res.prestige} selesai! Perjalananmu dimulai lagi, lebih kuat dari sebelumnya.`)}`));
});

const handleBoostsOpen = panelAction(async (i, { account, lang }) => {
  await show(i, BS.boostShop(account, lang, '', clockNow(), null));
});

const handleBoostBuy = menuAction(async (i, ctx) => {
  const { account, lang } = ctx;
  const id = i.customId.slice(HALL_BOOST_BUY_PREFIX.length);
  const res = buyBoost(account, id);
  if (!res.ok) return show(i, BS.boostShop(account, lang, errorText(lang, res.code)));
  saveAccount(account);
  await show(i, BS.boostShop(account, lang, `✅ ${res.boost.emote} **${nameOf(res.boost, lang)}** ×${res.boost.durationMs / 3600000}h (${viaz(res.cost)})`));
});

module.exports = {
  handleHallOpen, handleHallNav, handleClaim, handleAchSelect, handleCollSelect, handleTopSelect, handleAscend, handleAscendDo, handleBoostsOpen, handleBoostBuy,
};
