'use strict';

/**
 * Validasi UI: semua screen (EN + ID) dibangun dan diserialisasi lewat discord.js.
 * Cek batas Discord: tombol abu-abu, label <= 80, maks 5 tombol per baris, maks 40 komponen,
 * teks <= 4000, dan panel publik tidak boleh mengandung kata Indonesia.
 */

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
for (const [k, v] of Object.entries({ ACCOUNT_CHANNEL_ID: '1', FARM_CHANNEL_ID: '2', SHOP_CHANNEL_ID: '3', MINING_CHANNEL_ID: '4', MINING_SHOP_CHANNEL_ID: '5', BACKPACK_CHANNEL_ID: '6', FISHING_CHANNEL_ID: '7', FISHING_SHOP_CHANNEL_ID: '8', DUNGEON_CHANNEL_ID: '9', DUNGEON_SHOP_CHANNEL_ID: '10' })) process.env[k] = v;

const assert = require('node:assert');
const { payload } = require('../src/ui/v2');
const { defaultAccount } = require('../src/lib/account');
const { PANELS } = require('../src/ui/panels');
const F = require('../src/ui/farmScreens');
const M = require('../src/ui/mineScreens');
const Fi = require('../src/ui/fishScreens');
const D = require('../src/ui/dungeonScreens');
const B = require('../src/ui/backpackScreens');
const H = require('../src/ui/progressScreens');
const PG = require('../src/lib/progress');
const { getSeed } = require('../src/data/seeds');
const { getBait } = require('../src/data/fishes');
const { startRun } = require('../src/lib/dungeonLogic');

/** Akun "maksimal": semua aktivitas terbuka, banyak item, supaya semua cabang UI teruji. */
function richAccount() {
  const a = defaultAccount({ id: '42', username: 'tester' });
  a.skills = { farming: { level: 60, exp: 5 }, mining: { level: 40, exp: 5 }, fishing: { level: 30, exp: 5 }, dungeon: { level: 20, exp: 5 } };
  a.viaz = 999999;
  a.inventory = { hoe: 3, pickaxe: 2, rod: 2, weapon: 2, armor: 1 };
  a.seeds = { gandum: 50, wortel: 20, kentang: 5 };
  a.harvests = { gandum: 30, tomat: 4 };
  a.ores = { batu: 10, emas: 3 };
  a.baits = { cacing: 40, udang: 10 };
  a.fishes = [{ id: 'tuna', name: 'Ikan Tuna', emote: '🐡', rarity: 'rare', weight: 86.4, pricePerLb: 4 }];
  a.dungeon_loot = { goblin_ear: 3 };
  a.potions = { potion_small: 2 };
  a.plantings = { gandum: { qty: 10, planted_at: 0, finished_at: Date.now() + 60000 } };
  return a;
}

const INDONESIAN = /\b(Kamu|Belum|Tanam|Panen|Beli|Jual|Kembali|benih|Gratis|Terbuka|Syarat|Harga|Pilih|Sedang|Ikan Tuna|Gandum)\b/;

const issues = [];
function check(name, screen, { english = false } = {}) {
  let json;
  try {
    json = payload(screen).components.map((c) => c.toJSON());
  } catch (e) {
    issues.push(`${name}: serialisasi gagal: ${e.message}`);
    return;
  }
  let count = 0;
  let textLen = 0;
  const walk = (node) => {
    count += 1;
    if (node.type === 10) textLen += node.content.length;
    if (node.type === 1) {
      if (node.components.length > 5) issues.push(`${name}: baris berisi ${node.components.length} komponen (>5)`);
      if (node.components.some((c) => c.type === 3) && node.components.length > 1) issues.push(`${name}: select menu tidak sendirian di baris`);
    }
    if (node.type === 2) {
      if (node.style !== 2) issues.push(`${name}: tombol "${node.label}" berwarna (style ${node.style})`);
      if ((node.label ?? '').length > 80) issues.push(`${name}: label tombol > 80`);
    }
    for (const child of node.components ?? []) walk(child);
  };
  json.forEach(walk);
  if (count > 40) issues.push(`${name}: ${count} komponen (>40)`);
  if (textLen > 4000) issues.push(`${name}: teks ${textLen} (>4000)`);
  if (english) {
    const all = JSON.stringify(json);
    const m = all.match(INDONESIAN);
    if (m) issues.push(`${name}: panel publik mengandung kata Indonesia "${m[0]}"`);
  }
}

// Panel publik: wajib English.
for (const [k, fn] of Object.entries(PANELS)) check(`panel.${k}`, fn({ playerCount: 5, avgLevel: 3 }), { english: true });

for (const lang of ['en', 'id']) {
  const a = richAccount();
  const mult = 0.5;
  const screens = {
    farmMain: F.farmMain(a, lang, 'notice'),
    plantMenu: F.plantMenu(a, lang),
    plantAmount: F.plantAmount(a, getSeed('wortel'), lang),
    farmInventory: F.farmInventory(a, lang),
    shopBuyList: F.shopBuyList(a, lang, mult),
    shopSeed: F.shopSeed(a, getSeed('gandum'), lang, mult),
    shopSell: F.shopSell(a, lang, mult),
    shopPlots: F.shopPlots(a, lang),
    shopHoe: F.shopHoe(a, lang),
    mineMain: M.mineMain(a, lang),
    caveSelect: M.caveSelect(a, lang),
    oreStorage: M.oreStorage(a, lang),
    mineShopSell: M.mineShopSell(a, lang, mult),
    mineShopPickaxe: M.mineShopPickaxe(a, lang),
    fishMain: Fi.fishMain(a, lang),
    baitSelect: Fi.baitSelect(a, lang),
    baitAmount: Fi.baitAmount(a, getBait('cacing'), lang),
    fishBasket: Fi.fishBasket(a, lang, mult),
    fishShopBuyList: Fi.fishShopBuyList(a, lang),
    fishShopBait: Fi.fishShopBait(a, getBait('udang'), lang),
    fishShopSell: Fi.fishShopSell(a, lang, mult),
    fishShopRod: Fi.fishShopRod(a, lang),
    dungeonLobby: D.dungeonLobby(a, lang),
    dungeonShopWeapons: D.dungeonShopWeapons(a, lang),
    dungeonShopPotions: D.dungeonShopPotions(a, lang),
    dungeonShopSell: D.dungeonShopSell(a, lang, mult),
    backpackMain: B.backpackMain(a, lang),
    backpackDiscard: B.backpackDiscard(a, lang),
    backpackDiscardSel: B.backpackDiscard(a, lang, { category: 'seeds', id: 'gandum', qty: 50 }),
    profile: H.profileScreen(a, lang),
    quests: H.questsScreen(a, lang),
    ascend: H.ascendScreen(a, lang),
    top: H.topScreen(lang, 'total', [{ username: 'alice', score: 99 }, { username: 'bob', score: 80 }, { username: 'cy', score: 70 }, { username: 'dee', score: 1 }]),
    topEmpty: H.topScreen(lang, 'fish', []),
  };
  for (const [id] of H.CATEGORIES) screens[`ach.${id}`] = H.achScreen(a, lang, id);
  for (const id of Object.keys(H.COLL)) screens[`coll.${id}`] = H.collScreen(a, lang, id);
  for (const id of Object.keys(H.TOP_KINDS)) screens[`top.${id}`] = H.topScreen(lang, id, [{ username: 'alice', score: 12.5 }]);
  screens.questsDone = (() => {
    const done = richAccount();
    for (const q of [...PG.ensureQuests(done).list, ...PG.ensureQuests(done).wlist]) q.got = q.need;
    return H.questsScreen(done, lang);
  })();
  screens.profilePrestige = (() => {
    const p = richAccount();
    p.progress.prestige = 3;
    p.progress.best.fish = { id: 'tuna', weight: 120.5 };
    return H.profileScreen(p, lang);
  })();
  // Layar pertarungan butuh run aktif.
  const fighter = richAccount();
  fighter.plantings = {};
  assert.ok(startRun(fighter, 'goblin_cave').ok);
  screens.dungeonFight = D.dungeonFight(fighter, lang, ['log line']);

  // Akun baru (kosong): cabang "belum punya".
  const fresh = defaultAccount({ id: '7', username: 'new' });
  screens.freshMine = M.mineMain(fresh, lang);
  screens.freshFish = Fi.fishMain(fresh, lang);
  screens.freshDungeon = D.dungeonLobby(fresh, lang);
  screens.freshRod = Fi.fishShopRod(fresh, lang);

  for (const [name, s] of Object.entries(screens)) check(`${lang}.${name}`, s, { english: false });

  // Layar EN tidak boleh bocor kata Indonesia (kecuali nama data yang memang dari user).
  if (lang === 'en') {
    for (const [name, s] of Object.entries(screens)) {
      const text = JSON.stringify(payload(s).components.map((c) => c.toJSON()));
      const m = text.match(/\b(Kamu|Belum|Tanam|Panen|Kembali|Gratis|Terbuka|Syarat|Harga|Pilih|Sedang|kosong|Dimiliki)\b/);
      if (m) issues.push(`en.${name}: kata Indonesia "${m[0]}" di layar English`);
    }
  }
}

if (issues.length) {
  console.error(`ui-check GAGAL (${issues.length}):\n- ${issues.join('\n- ')}`);
  process.exit(1);
}
console.log('ui-check: semua lolos (V2 valid, tombol abu-abu, batas Discord, panel publik English)');
