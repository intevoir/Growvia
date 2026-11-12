'use strict';

/**
 * Panel publik. Dilihat semua orang, jadi SELALU English.
 * Tombol abu-abu di dalam container (Components V2).
 */

const C = require('../config/constants');
const G = require('../config/game');
const { formatNumber } = require('../lib/format');
const { btn, row } = require('./v2');
const { topLines } = require('./progressScreens');

const ch = (id, fallback) => (id ? `<#${id}>` : fallback);
const RULE = '📌 Only **1 activity** at a time: Farming, Mining, Fishing, or Dungeon.';

const PANELS = {
  account: (stats = {}) => ({
    title: '🌱 Welcome to Growvia',
    accent: 0x4caf50,
    body: [
      'A farming, mining, fishing & dungeon idle game on Discord.',
      'Grow crops, dig ores, catch fish, clear dungeons and build your **Viaz** fortune.',
      '',
      `👥 Players: ${formatNumber(stats.playerCount ?? 0)} · 🌍 Average Farming Lv: ${stats.avgLevel ?? 1}`,
      '',
      'Press **Create Account** to begin. You start with a **Starter Hoe** and **100 Wheat seeds**.',
      `Then head to ${ch(C.FARM_CHANNEL_ID, 'the farming channel')}.`,
      '',
      '🌐 Your private menus can be shown in English or Bahasa Indonesia.',
    ],
    rows: [row(btn(C.CREATE_ACCOUNT_CUSTOM_ID, 'Create Account', '📝'), btn(C.LANGUAGE_OPEN_CUSTOM_ID, 'Language / Bahasa', '🌐'))],
  }),

  farm: (a = {}) => ({
    title: '🧑‍🌾 Farming',
    accent: 0x4caf50,
    body: [
      'Open your private farm thread to plant seeds and harvest crops.',
      `Crops grow in real time. **Auto-Plant** unlocks at Farming Lv ${G.AUTO_PLANT_LEVEL}.`,
      '',
      `🧑‍🌾 Players farming now: **${a.farming ?? 0}**`,
      RULE,
      `🌱 Seeds & selling: ${ch(C.SHOP_CHANNEL_ID, 'the farming goods channel')}`,
    ],
    rows: [row(btn(C.START_FARMING_CUSTOM_ID, 'Start Farming', '🌱'))],
  }),

  farmShop: () => ({
    title: '🏪 Farming Goods',
    accent: 0x4caf50,
    body: [
      '**Buy Seeds** · **Sell Harvest** · **Upgrade Hoe** · **Expand Plots**',
      '',
      'All menus open privately (only you can see them).',
    ],
    rows: [
      row(
        btn(C.SHOP_BUY_OPEN_CUSTOM_ID, 'Buy Seeds', '🌱'),
        btn(C.SHOP_SELL_OPEN_CUSTOM_ID, 'Sell Harvest', '💰'),
      ),
      row(
        btn(C.SHOP_PLOT_OPEN_CUSTOM_ID, 'Expand Plots', '🟫'),
        btn(C.SHOP_TOOL_OPEN_CUSTOM_ID, 'Upgrade Hoe', '🧑‍🌾'),
      ),
    ],
  }),

  mining: (a = {}) => ({
    title: '⛏️ Mining Caves',
    accent: 0x8d6e63,
    body: [
      'Send expeditions into 5 caves and dig up 15 kinds of ore.',
      '⚠️ **Requires:** Farming Lv 10 and a Pickaxe.',
      '**Auto-Mine** unlocks at Mining Lv 10.',
      '',
      `⛏️ Players mining now: **${a.mining ?? 0}**`,
      RULE,
      `⚒️ Pickaxes & selling: ${ch(C.MINING_SHOP_CHANNEL_ID, 'the raw materials channel')}`,
    ],
    rows: [row(btn(C.START_MINING_CUSTOM_ID, 'Start Mining', '⛏️'))],
  }),

  miningShop: () => ({
    title: '⚒️ Raw Materials',
    accent: 0x8d6e63,
    body: [
      '• **Sell Ores**: trade minerals for **Viaz** at the current Halving rate.',
      '• **Pickaxes**: your first pickaxe, then upgrades up to -60% expedition time.',
      '',
      'All menus open privately.',
    ],
    rows: [row(btn(C.MINING_SHOP_SELL_OPEN_CUSTOM_ID, 'Sell Ores', '💰'), btn(C.MINING_SHOP_TOOL_OPEN_CUSTOM_ID, 'Pickaxes', '⛏️'))],
  }),

  fishing: (a = {}) => ({
    title: '🎣 Fishing Dock',
    accent: 0x2196f3,
    body: [
      'Cast your line and go AFK. Your rod keeps fishing while you have bait.',
      '⚠️ **Requires:** Farming Lv 30, Mining Lv 20 and a Fishing Rod.',
      '🍀 Better bait = rarer fish. Better rod = heavier fish (lbs).',
      '🎒 1 fish = 1 backpack slot. Your line is reeled in when the bag is full.',
      '',
      `🎣 Players fishing now: **${a.fishing ?? 0}**`,
      RULE,
      `🪱 Rods, bait & fish market: ${ch(C.FISHING_SHOP_CHANNEL_ID, 'the fishing supplies channel')}`,
    ],
    rows: [row(btn(C.START_FISHING_CUSTOM_ID, 'Start Fishing', '🎣'))],
  }),

  fishingShop: () => ({
    title: '🎣 Fishing Supplies',
    accent: 0x2196f3,
    body: [
      '• **Buy Bait**: 12 bait types across 5 rarities.',
      '• **Sell Fish**: value = weight (lbs) × rarity price × Halving rate.',
      '• **Rods**: faster strikes and heavier catches, up to -60% strike time and 3× weight.',
      '',
      'All menus open privately.',
    ],
    rows: [row(
      btn(C.FISHING_SHOP_BUY_OPEN_CUSTOM_ID, 'Buy Bait', '🪱'),
      btn(C.FISHING_SHOP_SELL_OPEN_CUSTOM_ID, 'Sell Fish', '💰'),
      btn(C.FISHING_SHOP_TOOL_OPEN_CUSTOM_ID, 'Rods', '🎣'),
    )],
  }),

  dungeon: (a = {}) => ({
    title: '🔮 Dungeons',
    accent: 0xb71c1c,
    body: [
      'Fight your way through floors of monsters and defeat the boss. **Fully manual, turn-based.**',
      '⚠️ **Requires:** Farming Lv 30, Mining Lv 20, Fishing Lv 10 and a weapon.',
      '',
      `🔮 Players in dungeons now: **${a.dungeon ?? 0}**`,
      '⚔️ **Attack** · 💥 **Heavy Strike** (×1.8, 30% miss, interrupts charges) · 🛡️ **Defend** (-60% damage) · 🧪 **Potion** (max 3 per run) · 🏃 **Flee** (keep loot)',
      '⚡ Monsters sometimes **charge** a ×2.5 attack. Read the fight and react.',
      '💀 HP does not regenerate between floors. Fall in battle and you lose the run\'s loot plus half its Viaz.',
      '🎟️ Each dungeon has an entry fee. Rewards shrink if you outlevel a dungeon by more than 15.',
      '',
      RULE,
      `🗡️ Gear, potions & loot market: ${ch(C.DUNGEON_SHOP_CHANNEL_ID, 'the dungeon loot channel')}`,
    ],
    rows: [row(btn(C.START_DUNGEON_CUSTOM_ID, 'Enter Dungeon', '🔮'))],
  }),

  dungeonShop: () => ({
    title: '💀 Dungeon Loot',
    accent: 0xb71c1c,
    body: [
      '• **Weapons & Armor**: 5 tiers each. A weapon is required to enter.',
      '• **Potions**: heal during a fight. Only sold here, never inside a dungeon.',
      '• **Sell Loot**: trade monster drops for **Viaz** at the current Halving rate.',
      '',
      'All menus open privately.',
    ],
    rows: [row(
      btn(C.DUNGEON_SHOP_GEAR_OPEN_CUSTOM_ID, 'Weapons & Armor', '⚔️'),
      btn(C.DUNGEON_SHOP_POTION_OPEN_CUSTOM_ID, 'Potions', '🧪'),
      btn(C.DUNGEON_SHOP_SELL_OPEN_CUSTOM_ID, 'Sell Loot', '💰'),
    )],
  }),

  hall: (stats = {}) => ({
    title: '🏛️ Growvia Hall',
    accent: 0xffb300,
    body: [
      'Your profile, quests, achievements, collections and the rankings, all in one place.',
      '',
      '📜 **Quests** reset every day at 00:00 WIB. Keep your streak for bigger rewards.',
      '🏆 **Achievements** and 📚 **Collections** reward long-term play.',
      `✨ **Ascension** unlocks at ${G.ASCEND_TOTAL_LEVELS} total skill levels: reset for permanent bonuses.`,
      '',
      ...(stats.top?.length ? ['**📊 Top players (total levels)**', ...topLines('total', stats.top.slice(0, 5))] : []),
    ],
    rows: [row(
      btn(`${C.HALL_OPEN_PREFIX}profile`, 'Profile', '👤'),
      btn(`${C.HALL_OPEN_PREFIX}quests`, 'Quests', '📜'),
      btn(`${C.HALL_OPEN_PREFIX}ach`, 'Achievements', '🏆'),
      btn(`${C.HALL_OPEN_PREFIX}coll`, 'Collection', '📚'),
      btn(`${C.HALL_OPEN_PREFIX}top`, 'Leaderboard', '📊'),
    )],
  }),

  boosts: () => ({
    title: '🍔 Viaz Boosts',
    accent: 0x9c27b0,
    body: [
      'Temporary boosts paid with **Viaz**: faster XP, better luck, higher sales, more ore and more loot.',
      'Prices rise with your skill level, so early boosts are cheap and late ones are a real Viaz sink.',
      '',
      'All menus open privately.',
    ],
    rows: [row(btn(C.BOOSTS_OPEN_CUSTOM_ID, 'Boost Shop', '🍔'))],
  }),

  feedback: () => ({
    title: '💡 Suggestions & Reports',
    accent: 0xf9a825,
    body: [
      'Have an idea to make Growvia better, or found something broken? Tell us!',
      '',
      '💡 **Suggest** — new features, balance ideas, quality of life.',
      '🐛 **Report a bug** — what happened, what you expected.',
      '',
      '_Submissions are posted here publicly, so write clearly and no personal details._',
    ],
    rows: [row(
      btn(C.FB_OPEN_SUGGEST_CUSTOM_ID, '💡 Suggest', '💡'),
      btn(C.FB_OPEN_REPORT_CUSTOM_ID, '🐛 Report Bug', '🐛'),
    )],
  }),

  armory: () => ({
    title: '🎒 Armory',
    accent: 0x9c27b0,
    body: [
      `📦 Base capacity: **${formatNumber(G.BASE_BACKPACK_SLOTS)}** slots · +${G.SLOTS_PER_BACKPACK_UPGRADE} per upgrade`,
      '⚖️ 1 item = 1 slot (tools, seeds, crops, ores, bait, fish, loot, potions).',
      '🗑️ Bag full and out of Viaz? Discard items for free.',
    ],
    rows: [row(btn(C.BACKPACK_UPGRADE_OPEN_CUSTOM_ID, 'Manage Backpack', '🎒'))],
  }),
};

module.exports = { PANELS };
