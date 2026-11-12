'use strict';

const C = require('../config/constants');
const { checkRateLimit, checkReadLimit } = require('../lib/account');
const { inc } = require('../lib/metrics');
const account = require('../features/account');
const start = require('../features/start');
const farming = require('../features/farming');
const mining = require('../features/mining');
const fishing = require('../features/fishing');
const dungeon = require('../features/dungeon');
const shop = require('../features/shop');
const backpack = require('../features/backpack');
const hall = require('../features/progress');
const feedback = require('../features/feedback');
const { MODAL_SUGGEST, MODAL_REPORT } = require('../ui/feedback');
const { errorText } = require('../ui/common');

/** Tombol & select dengan custom ID persis. */
const EXACT = new Map([
  [C.CREATE_ACCOUNT_CUSTOM_ID, account.handleCreateAccount],
  [C.LANGUAGE_OPEN_CUSTOM_ID, account.handleLanguageOpen],
  [C.START_FARMING_CUSTOM_ID, start.handleStartFarming],
  [C.START_MINING_CUSTOM_ID, start.handleStartMining],
  [C.START_FISHING_CUSTOM_ID, start.handleStartFishing],
  [C.START_DUNGEON_CUSTOM_ID, dungeon.handleStartDungeon],

  // Thread farming
  [C.FARM_PLANT_OPEN_CUSTOM_ID, farming.handlePlantOpen],
  [C.FARM_PLANT_SELECT_CUSTOM_ID, farming.handlePlantSelect],
  [C.FARM_HARVEST_CUSTOM_ID, farming.handleHarvest],
  [C.FARM_INVENTORY_CUSTOM_ID, farming.handleInventory],
  [C.FARM_BACK_CUSTOM_ID, farming.handleFarmRefresh],
  [C.FARM_REFRESH_CUSTOM_ID, farming.handleFarmRefresh],
  [C.FARM_AUTO_CUSTOM_ID, farming.handleAutoToggle],

  // Thread mining
  [C.MINE_EXPEDITION_OPEN_CUSTOM_ID, mining.handleExpeditionOpen],
  [C.MINE_EXPEDITION_SELECT_CUSTOM_ID, mining.handleExpeditionSelect],
  [C.MINE_CLAIM_CUSTOM_ID, mining.handleMiningClaim],
  [C.MINE_INVENTORY_CUSTOM_ID, mining.handleMiningInventory],
  [C.MINE_BACK_CUSTOM_ID, mining.handleMiningRefresh],
  [C.MINE_REFRESH_CUSTOM_ID, mining.handleMiningRefresh],
  [C.MINE_AUTO_CUSTOM_ID, mining.handleAutoMineToggle],

  // Thread fishing
  [C.FISH_SESSION_OPEN_CUSTOM_ID, fishing.handleBaitOpen],
  [C.FISH_SESSION_SELECT_CUSTOM_ID, fishing.handleBaitSelect],
  [C.FISH_REEL_CUSTOM_ID, fishing.handleReel],
  [C.FISH_INVENTORY_CUSTOM_ID, fishing.handleFishInventory],
  [C.FISH_REFRESH_CUSTOM_ID, fishing.handleFishingRefresh],
  [C.FISH_BACK_CUSTOM_ID, fishing.handleFishingRefresh],

  // Thread dungeon
  [C.DUNGEON_SELECT_CUSTOM_ID, dungeon.handleDungeonSelect],
  [C.DUNGEON_POTION_SELECT_CUSTOM_ID, dungeon.handleDungeonPotion],
  [C.DUNGEON_BACK_CUSTOM_ID, dungeon.handleDungeonBack],

  // Toko tani
  [C.SHOP_BUY_OPEN_CUSTOM_ID, shop.handleShopBuyOpen],
  [C.SHOP_BUY_BACK_CUSTOM_ID, shop.handleShopBuyBack],
  [C.SHOP_BUY_SELECT_CUSTOM_ID, shop.handleShopBuySelect],
  [C.SHOP_SELL_OPEN_CUSTOM_ID, shop.handleShopSellOpen],
  [C.SHOP_SELL_ALL_CUSTOM_ID, shop.handleShopSellAll],
  [C.SHOP_SELL_SELECT_CUSTOM_ID, shop.handleShopSellSelect],
  [C.SHOP_PLOT_OPEN_CUSTOM_ID, shop.handleShopPlotOpen],
  [C.SHOP_TOOL_OPEN_CUSTOM_ID, shop.handleShopToolOpen],

  // Toko tambang
  [C.MINING_SHOP_SELL_OPEN_CUSTOM_ID, mining.handleMiningShopSellOpen],
  [C.MINING_SHOP_SELL_ALL_CUSTOM_ID, mining.handleMiningShopSellAll],
  [C.MINING_SHOP_SELL_SELECT_CUSTOM_ID, mining.handleMiningShopSellSelect],
  [C.MINING_SHOP_TOOL_OPEN_CUSTOM_ID, mining.handleMiningShopToolOpen],

  // Toko pancing
  [C.FISHING_SHOP_BUY_OPEN_CUSTOM_ID, fishing.handleFishingShopBuyOpen],
  [C.FISHING_SHOP_BUY_BACK_CUSTOM_ID, fishing.handleFishingShopBuyBack],
  [C.FISHING_SHOP_BUY_SELECT_CUSTOM_ID, fishing.handleFishingShopBuySelect],
  [C.FISHING_SHOP_SELL_OPEN_CUSTOM_ID, fishing.handleFishingShopSellOpen],
  [C.FISHING_SHOP_SELL_ALL_CUSTOM_ID, fishing.handleFishingShopSellAll],
  [C.FISHING_SHOP_SELL_SELECT_CUSTOM_ID, fishing.handleFishingShopSellSelect],
  [C.FISHING_SHOP_TOOL_OPEN_CUSTOM_ID, fishing.handleFishingShopToolOpen],

  // Toko dungeon
  [C.DUNGEON_SHOP_GEAR_OPEN_CUSTOM_ID, dungeon.handleDungeonShopGearOpen],
  [C.DUNGEON_SHOP_POTION_OPEN_CUSTOM_ID, dungeon.handleDungeonShopPotionOpen],
  [C.DUNGEON_SHOP_SELL_OPEN_CUSTOM_ID, dungeon.handleDungeonShopSellOpen],
  [C.DUNGEON_SHOP_SELL_ALL_CUSTOM_ID, dungeon.handleDungeonShopSellAll],

  // Hall
  [C.HALL_CLAIM_CUSTOM_ID, hall.handleClaim],
  [C.HALL_ACH_SELECT_CUSTOM_ID, hall.handleAchSelect],
  [C.HALL_COLL_SELECT_CUSTOM_ID, hall.handleCollSelect],
  [C.HALL_TOP_SELECT_CUSTOM_ID, hall.handleTopSelect],
  [C.HALL_ASCEND_CUSTOM_ID, hall.handleAscend],
  [C.HALL_ASCEND_DO_CUSTOM_ID, hall.handleAscendDo],

  // Armory
  [C.BACKPACK_UPGRADE_OPEN_CUSTOM_ID, backpack.handleBackpackOpen],
  [C.BACKPACK_REFRESH_CUSTOM_ID, backpack.handleBackpackRefresh],
  [C.BACKPACK_DISCARD_OPEN_CUSTOM_ID, backpack.handleBackpackDiscardOpen],
  [C.BACKPACK_DISCARD_BACK_CUSTOM_ID, backpack.handleBackpackDiscardBack],
  [C.BACKPACK_DISCARD_SELECT_CUSTOM_ID, backpack.handleBackpackDiscardSelect],
]);

/** Modal submit (form saran & laporan bug). */
/** Custom ID berparameter (prefix:args). */
const PREFIXES = [
  [C.LANGUAGE_SET_PREFIX, account.handleLanguageSet],
  [C.HALL_OPEN_PREFIX, hall.handleHallOpen],
  [C.HALL_NAV_PREFIX, hall.handleHallNav],
  [C.HALL_BOOST_BUY_PREFIX, hall.handleBoostBuy],
  [C.BOOSTS_OPEN_CUSTOM_ID, hall.handleBoostsOpen],
  [C.FB_OPEN_SUGGEST_CUSTOM_ID, feedback.handleOpenSuggest],
  [C.FB_OPEN_REPORT_CUSTOM_ID, feedback.handleOpenReport],
  [C.FARM_PLANT_DO_PREFIX, farming.handlePlantDo],
  [C.FISH_SESSION_AMOUNT_PREFIX, fishing.handleCast],
  [C.DUNGEON_ACTION_PREFIX, dungeon.handleDungeonAction],
  [C.SHOP_BUY_DO_PREFIX, shop.handleShopBuyDo],
  [C.SHOP_PLOT_BUY_PREFIX, shop.handleShopPlotBuy],
  [C.SHOP_TOOL_BUY_PREFIX, shop.handleShopToolBuy],
  [C.MINING_SHOP_TOOL_BUY_PREFIX, mining.handleMiningShopToolBuy],
  [C.FISHING_SHOP_BUY_DO_PREFIX, fishing.handleFishingShopBuyDo],
  [C.FISHING_SHOP_TOOL_BUY_PREFIX, fishing.handleFishingShopToolBuy],
  [C.DUNGEON_SHOP_GEAR_BUY_PREFIX, dungeon.handleDungeonShopGearBuy],
  [C.DUNGEON_SHOP_POTION_BUY_PREFIX, dungeon.handleDungeonShopPotionBuy],
  [C.BACKPACK_UPGRADE_BUY_PREFIX, backpack.handleBackpackBuy],
  [C.BACKPACK_DISCARD_DO_PREFIX, backpack.handleBackpackDiscardDo],
];

/** Aksi yang mengubah data: kena rate limit per user. */
const MUTATING_EXACT = new Set([
  C.CREATE_ACCOUNT_CUSTOM_ID,
  C.FARM_HARVEST_CUSTOM_ID, C.FARM_AUTO_CUSTOM_ID,
  C.MINE_CLAIM_CUSTOM_ID, C.MINE_AUTO_CUSTOM_ID, C.MINE_EXPEDITION_SELECT_CUSTOM_ID,
  C.FISH_REEL_CUSTOM_ID,
  C.DUNGEON_SELECT_CUSTOM_ID, C.DUNGEON_POTION_SELECT_CUSTOM_ID,
  C.SHOP_SELL_ALL_CUSTOM_ID, C.SHOP_SELL_SELECT_CUSTOM_ID,
  C.MINING_SHOP_SELL_ALL_CUSTOM_ID, C.MINING_SHOP_SELL_SELECT_CUSTOM_ID,
  C.FISHING_SHOP_SELL_ALL_CUSTOM_ID, C.FISHING_SHOP_SELL_SELECT_CUSTOM_ID,
  C.DUNGEON_SHOP_SELL_ALL_CUSTOM_ID,
  C.HALL_CLAIM_CUSTOM_ID, C.HALL_ASCEND_DO_CUSTOM_ID,
]);
const MUTATING_PREFIXES = [C.HALL_BOOST_BUY_PREFIX, 
  C.FARM_PLANT_DO_PREFIX, C.FISH_SESSION_AMOUNT_PREFIX, C.DUNGEON_ACTION_PREFIX,
  C.SHOP_BUY_DO_PREFIX, C.SHOP_PLOT_BUY_PREFIX, C.SHOP_TOOL_BUY_PREFIX,
  C.MINING_SHOP_TOOL_BUY_PREFIX, C.FISHING_SHOP_BUY_DO_PREFIX, C.FISHING_SHOP_TOOL_BUY_PREFIX,
  C.DUNGEON_SHOP_GEAR_BUY_PREFIX, C.DUNGEON_SHOP_POTION_BUY_PREFIX,
  C.BACKPACK_UPGRADE_BUY_PREFIX, C.BACKPACK_DISCARD_DO_PREFIX,
];

const isMutating = (id) => MUTATING_EXACT.has(id) || MUTATING_PREFIXES.some((p) => id.startsWith(p));
const findHandler = (id) => EXACT.get(id) ?? PREFIXES.find(([p]) => id.startsWith(p))?.[1] ?? null;

const MODALS = new Map([
  [MODAL_SUGGEST, feedback.handleSuggestSubmit],
  [MODAL_REPORT, feedback.handleReportSubmit],
]);

async function routeInteraction(interaction) {
  try {
    if (typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit()) {
      const handler = MODALS.get(interaction.customId);
      if (handler) await handler(interaction);
      return;
    }
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    const handler = findHandler(interaction.customId);
    if (!handler) return;

    inc('interactions');
    const allowed = isMutating(interaction.customId) ? checkRateLimit(interaction.user.id) : checkReadLimit(interaction.user.id);
    if (!allowed) {
      inc('rateLimited');
      await interaction.reply({ content: errorText('en', 'rate_limited'), flags: C.EPHEMERAL }).catch(() => {});
      return;
    }
    const started = Date.now();
    await handler(interaction);
    if (Date.now() - started > 2000) inc('slow');
  } catch (e) {
    inc('errors');
    console.warn('[GROWVIA] Interaction error:', e.message);
    const payload = { content: errorText('en', 'error'), flags: C.EPHEMERAL };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch {
      /* abaikan */
    }
  }
}

module.exports = { routeInteraction };
