'use strict';

/** Tombol "Start ..." di panel publik tiap aktivitas. */

const { settle } = require('../lib/farmLogic');
const { settleMining } = require('../lib/miningLogic');
const { settleFishing, canFish } = require('../lib/fishingLogic');
const { farmingLevel } = require('../lib/farmLogic');
const { openThread } = require('./threads');
const { settleNotice, farmMain } = require('../ui/farmScreens');
const { miningNotice, mineMain } = require('../ui/mineScreens');
const { fishingNotice, fishMain } = require('../ui/fishScreens');

const handleStartFarming = (i) =>
  openThread(i, {
    kind: 'farm',
    settle: (a, lang) => settleNotice(settle(a), lang, { auto: true }),
    screen: farmMain,
  });

const handleStartMining = (i) =>
  openThread(i, {
    kind: 'mining',
    gate: (a) => (farmingLevel(a) < 10 ? 'mine_locked' : (a.inventory?.pickaxe ?? 0) < 1 ? 'no_pickaxe' : null),
    settle: (a, lang) => miningNotice(settleMining(a), lang, { auto: true }),
    screen: mineMain,
  });

const handleStartFishing = (i) =>
  openThread(i, {
    kind: 'fishing',
    gate: (a) => (!canFish(a) ? 'fish_locked' : (a.inventory?.rod ?? 0) < 1 ? 'no_rod' : null),
    settle: (a, lang) => fishingNotice(settleFishing(a), lang),
    screen: fishMain,
  });

module.exports = { handleStartFarming, handleStartMining, handleStartFishing };
