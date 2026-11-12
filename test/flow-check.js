'use strict';

/**
 * Tes alur end-to-end lewat router dengan Supabase tiruan di memori (tanpa .env / Discord / jaringan).
 * Mencakup: akun, bahasa, farming, toko tani, mining, fishing, dungeon, armory, activity lock, rate limit.
 */

for (const [k, v] of Object.entries({
  ACCOUNT_CHANNEL_ID: '1', FARM_CHANNEL_ID: '2', SHOP_CHANNEL_ID: '3', MINING_CHANNEL_ID: '4',
  MINING_SHOP_CHANNEL_ID: '5', FISHING_CHANNEL_ID: '6', FISHING_SHOP_CHANNEL_ID: '7',
  DUNGEON_CHANNEL_ID: '8', DUNGEON_SHOP_CHANNEL_ID: '9', BACKPACK_CHANNEL_ID: '10',
  SUPABASE_URL: 'http://fake', SUPABASE_SERVICE_ROLE_KEY: 'fake',
})) process.env[k] = v;
delete process.env.REDIS_URL;

const assert = require('node:assert');
const path = require('node:path');

/* Supabase tiruan di memori */
const tables = { players: new Map(), halving_state: new Map() };
function builder(table) {
  const state = { filters: {} };
  const b = {
    select: () => b,
    eq: (col, val) => ((state.filters[col] = val), b),
    not: () => b,
    or: () => b,
    limit: () => b,
    in: (col, vals) => ((state.in = vals), b),
    // select(...).in(...) dipakai langsung dengan await (pembacaan batch)
    then: (resolve, reject) => {
      const rows = (state.in ?? []).map((k) => tables[table]?.get(k)).filter(Boolean).map((r) => JSON.parse(JSON.stringify(r)));
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
    maybeSingle: async () => {
      const key = table === 'players' ? state.filters.user_id : state.filters.id;
      const row = tables[table]?.get(key);
      return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
    },
    upsert: async (rows) => {
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        const key = table === 'players' ? row.user_id : row.id;
        tables[table].set(key, { ...(tables[table].get(key) ?? {}), ...JSON.parse(JSON.stringify(row)) });
      }
      return { error: null };
    },
  };
  return b;
}
const fake = {
  from: (t) => builder(t),
  rpc: async (name) => (name === 'leaderboard'
    ? { data: [{ user_id: 'u1', username: 'tester', score: 12 }, { user_id: 'u2', username: 'rival', score: 9 }], error: null }
    : name === 'live_activity'
      ? { data: [{ farming_q: 3, mining_q: 2, fishing_q: 1, dungeon_q: 1, online_q: 4, total_q: 21 }], error: null }
      : { data: [{ player_count: 1, avg_farming_level: 1 }], error: null }),
};
const dbPath = require.resolve(path.join(__dirname, '../src/lib/db'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { supabase: fake } };

const { routeInteraction } = require('../src/bot/router');
const { loadAccount, flushNow } = require('../src/lib/account');
const { flush: flushHalving, getState } = require('../src/lib/halving');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const user = { id: 'u1', username: 'tester' };

/** Interaksi palsu. channelId = thread akun supaya cek thread lolos. */
function fakeInteraction(customId, { values, kind = 'button', channelId } = {}) {
  const i = {
    user, guildId: 'g', channelId: channelId ?? 'c', customId, values,
    deferred: false, replied: false, last: null, followUps: [],
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    deferUpdate: async () => { i.deferred = true; },
    deferReply: async () => { i.deferred = true; },
    reply: async (p) => { i.replied = true; i.last = p; },
    editReply: async (p) => { i.last = p; },
    followUp: async (p) => { i.followUps.push(p); },
  };
  return i;
}

async function press(customId, opts) {
  const i = fakeInteraction(customId, opts);
  await routeInteraction(i);
  await sleep(320); // lewati rate limit 300 ms
  return i;
}

/** Semua teks yang terlihat: isi container V2 + content + followUp. */
function text(i) {
  const parts = [i.last?.content ?? ''];
  for (const c of i.last?.components ?? []) {
    const walk = (n) => {
      if (n.type === 10) parts.push(n.content);
      if (n.type === 2 && n.label) parts.push(n.label);
      for (const o of n.options ?? []) parts.push(o.label);
      (n.components ?? []).forEach(walk);
    };
    walk(typeof c.toJSON === 'function' ? c.toJSON() : c);
  }
  for (const f of i.followUps) parts.push(f.content ?? '');
  return parts.join('\n');
}
const has = (i, s) => assert.ok(text(i).includes(s), `harus berisi "${s}":\n${text(i).slice(0, 600)}`);

(async () => {
  // 1. Akun (default English)
  let i = await press('create_account');
  has(i, 'Account created');
  has(i, 'Starter Hoe');
  i = await press('create_account');
  has(i, 'already have an account');
  const acc = await loadAccount('u1');
  assert.strictEqual(acc.lang, 'en');
  assert.deepStrictEqual(Object.keys(acc.seeds), ['gandum']);
  assert.strictEqual(acc.viaz, 0, 'starter tanpa Viaz gratis');
  assert.ok(i.last.flags & 32768, 'balasan pakai Components V2');

  // 2. Farming (English)
  i = await press('farm_plant');
  has(i, 'Wheat (x100)');
  i = await press('farm_plant_select', { kind: 'select', values: ['gandum'] });
  has(i, 'How many?');
  i = await press('farm_plant_do:gandum:max');
  has(i, 'Planted');
  has(i, 'Plots: 100/100');
  i = await press('farm_harvest');
  has(i, 'Nothing is ready');
  acc.plantings.gandum.finished_at = Date.now() - 1000;
  i = await press('farm_harvest');
  has(i, 'Harvested');
  has(i, 'Sprout'); // achievement diumumkan lewat pesan pribadi
  assert.strictEqual(acc.harvests.gandum, 100);

  // 3. Ganti bahasa ke Indonesia, layar pribadi ikut Indonesia
  i = await press('lang_set:id');
  has(i, 'Bahasa diubah');
  assert.strictEqual(acc.lang, 'id');
  i = await press('farm_inventory');
  has(i, 'Inventaris');
  has(i, 'Gandum ×100');

  // 4. Toko tani: jual, beli, plot, cangkul
  i = await press('shop_sell_all');
  has(i, 'Terjual');
  assert.strictEqual(acc.viaz, 700, '200 hasil jual + 500 hadiah achievement Sprout');
  assert.ok(acc.progress.ach.harvested_100, 'achievement tersimpan');
  acc.viaz = 200;
  assert.strictEqual((await getState()).totalViazMinted, 200);
  i = await press('shop_buy_select', { kind: 'select', values: ['wortel'] });
  has(i, 'Farming Lv 5');
  acc.skills.farming.level = 5;
  i = await press('shop_buy_select', { kind: 'select', values: ['wortel'] });
  i = await press('shop_buy_do:wortel:max');
  assert.strictEqual(acc.seeds.wortel, 40, text(i));
  assert.strictEqual(acc.viaz, 0);
  i = await press('shop_plot_buy:1');
  has(i, 'Viaz tidak cukup');
  acc.viaz = 1000;
  i = await press('shop_tool_buy:2');
  has(i, 'Kamu mendapat');
  assert.strictEqual(acc.inventory.hoe, 2);
  assert.strictEqual(acc.items.hoe_2, 1, '1 copy hoe_2');
  assert.strictEqual(acc.viaz, 500, 'Cangkul Biasa 500 Viaz');
  i = await press('shop_tool_buy:2');
  assert.strictEqual(acc.items.hoe_2, 2, 'beli berulang: copy ke-2 (untuk trade nanti)');
  i = await press('shop_tool_buy:3');
  has(i, 'Level kamu belum cukup');
  assert.strictEqual(acc.inventory.hoe, 2, 'tier 3 terkunci Farming Lv 20');

  // 5. Mining
  acc.lang = 'en';
  acc.skills.farming.level = 20;
  acc.viaz = 5000;
  i = await press('mshop_tool_buy:1');
  has(i, 'You got');
  assert.strictEqual(acc.inventory.pickaxe, 1);
  i = await press('mine_select', { kind: 'select', values: ['cave_shallow'] });
  has(i, 'Expedition started');
  // Activity lock: tidak bisa menanam saat menambang
  acc.seeds.gandum = 10;
  i = await press('farm_plant_do:gandum:5');
  has(i, 'mining expedition');
  acc.mining_trip.finished_at = Date.now() - 1000;
  i = await press('mine_claim');
  has(i, 'Mined');
  assert.ok(Object.keys(acc.ores).length > 0);
  i = await press('mshop_sell_all');
  has(i, 'Sold');
  assert.strictEqual(Object.keys(acc.ores).length, 0);

  // 6. Fishing
  acc.skills.farming.level = 30;
  acc.skills.mining.level = 20;
  acc.viaz = 20000;
  i = await press('fshop_tool_buy:1');
  has(i, 'Bamboo Rod');
  assert.strictEqual(acc.inventory.rod, 1);
  i = await press('fshop_buy_select', { kind: 'select', values: ['cacing'] });
  i = await press('fshop_buy_do:cacing:10');
  assert.strictEqual(acc.baits.cacing, 10, text(i));
  i = await press('fish_amt:cacing:10');
  has(i, 'Line cast');
  acc.fishing_session.last_strike_at -= acc.fishing_session.strike_ms * 3;
  i = await press('fish_reel');
  has(i, 'Line reeled in');
  assert.strictEqual(acc.fishes.length, 3);
  assert.strictEqual(acc.baits.cacing, 7);
  i = await press('fshop_sell_all');
  has(i, 'Sold 3 fish');

  // 7. Dungeon (butuh Fishing Lv 10 + senjata)
  i = await press('dshop_gear_buy:weapon:1');
  has(i, 'Farming 30');
  assert.strictEqual(acc.inventory.weapon ?? 0, 0, 'Fishing Lv 10 belum tercapai');
  acc.skills.fishing.level = 10;
  acc.viaz = 10000;
  i = await press('dshop_gear_buy:weapon:1');
  has(i, 'Rusty Dagger');
  assert.strictEqual(acc.inventory.weapon, 1);
  i = await press('dshop_potion_buy:potion_small:5');
  assert.strictEqual(acc.potions.potion_small, 5, text(i));
  const beforeFee = acc.viaz;
  i = await press('dg_select', { kind: 'select', values: ['goblin_cave'] });
  has(i, 'Floor 1/3');
  has(i, 'Goblin');
  assert.strictEqual(acc.viaz, beforeFee - 20, 'biaya masuk dungeon');
  // Saat di dungeon: aktivitas lain terkunci, perlengkapan tidak bisa diganti
  i = await press('fish_amt:cacing:1');
  has(i, 'inside a dungeon');
  i = await press('dg_act:attack');
  has(i, 'You hit for');
  i = await press('dg_potion', { kind: 'select', values: ['potion_small'] });
  has(i, 'Healed');
  assert.strictEqual(acc.potions.potion_small, 4);
  // Perkuat untuk menamatkan run
  acc.skills.dungeon.level = 40;
  acc.inventory.weapon = 5;
  let guard = 0;
  while (acc.dungeon_run && guard++ < 30) i = await press('dg_act:attack');
  assert.strictEqual(acc.dungeon_run, null, 'run selesai');
  has(i, 'Dungeon cleared');
  i = await press('dshop_sell_all');
  has(i, 'Sold');

  // 8. Armory: upgrade & buang item
  acc.viaz = 1000;
  i = await press('bp_buy:1');
  assert.strictEqual(acc.bought_backpack, 1, text(i));
  acc.seeds.wortel = 25;
  i = await press('bp_discard_select', { kind: 'select', values: ['seeds:wortel'] });
  has(i, 'Selected');
  i = await press('bp_discard_do:seeds:wortel:10');
  has(i, 'Discarded');
  assert.strictEqual(acc.seeds.wortel, 15);

  // 8b. Hall: profil, quest, achievement, koleksi, peringkat, ascension
  acc.lang = 'en';
  i = await press('hall_open:profile');
  has(i, 'tester');
  has(i, 'Total levels');
  i = await press('hall_nav:quests');
  has(i, 'Daily');
  has(i, 'Weekly');
  assert.ok(acc.progress.q.list.length > 0, 'quest harian dibuat');
  // Selesaikan satu quest lalu klaim
  const quest = acc.progress.q.list[0];
  quest.got = quest.need;
  const viazBefore = acc.viaz;
  i = await press('hall_claim');
  has(i, 'Claimed');
  assert.ok(acc.viaz > viazBefore, 'hadiah quest masuk');
  assert.strictEqual(acc.progress.q.streak, 1);
  i = await press('hall_claim');
  has(i, 'No finished quests');
  i = await press('hall_ach_sel', { kind: 'select', values: ['mining'] });
  has(i, 'Mining');
  i = await press('hall_coll_sel', { kind: 'select', values: ['fish'] });
  has(i, 'discovered');
  i = await press('hall_nav:top');
  has(i, 'rival');
  i = await press('hall_top_sel', { kind: 'select', values: ['viaz'] });
  has(i, 'Richest');
  i = await press('hall_asc');
  has(i, 'Ascension');
  i = await press('hall_asc_do');
  has(i, 'Ascension needs total skill levels');
  assert.strictEqual(acc.progress.prestige, 0, 'belum memenuhi syarat');
  // Penuhi syarat dan Ascend
  for (const k of ['farming', 'mining', 'fishing', 'dungeon']) acc.skills[k].level = 70;
  acc.inventory.hoe = 3;
  i = await press('hall_asc_do');
  has(i, 'Ascension 1 complete');
  assert.strictEqual(acc.progress.prestige, 1);
  assert.strictEqual(acc.skills.farming.level, 1, 'skill direset');
  assert.strictEqual(acc.inventory.hoe, 1, 'alat direset');
  assert.strictEqual(acc.seeds.gandum, 100);
  assert.strictEqual(acc.bought_backpack, 1, 'tas dipertahankan');
  assert.ok(acc.progress.ach.prestige_1, 'achievement prestige');

  // 8c. Papan aktivitas live (RPC live_activity)
  const { getLiveActivity } = require('../src/lib/liveActivity');
  const live = await getLiveActivity();
  assert.deepStrictEqual(live, { farming: 3, mining: 2, fishing: 1, dungeon: 1, online: 4, total: 21 });
  const { PANELS } = require('../src/ui/panels');
  assert.ok(JSON.stringify(PANELS.farm(live)).includes('Players farming now: **3**'));
  assert.ok(JSON.stringify(PANELS.mining(live)).includes('Players mining now: **2**'));
  assert.ok(JSON.stringify(PANELS.fishing(live)).includes('Players fishing now: **1**'));
  assert.ok(JSON.stringify(PANELS.dungeon(live)).includes('Players in dungeons now: **1**'));

  // 9. Thread orang lain ditolak
  acc.thread_id = 'my-thread';
  i = await press('farm_refresh', { channelId: 'someone-else' });
  has(i, 'own private thread');
  acc.thread_id = null;

  // 10. Rate limit
  const a = fakeInteraction('farm_harvest');
  const b = fakeInteraction('farm_harvest');
  await routeInteraction(a);
  await routeInteraction(b);
  assert.ok((b.last?.content ?? '').includes('Slow down'), 'klik cepat kena rate limit');

  // 11. Tersimpan ke "database"
  await flushNow();
  await flushHalving();
  const row = tables.players.get('u1');
  assert.strictEqual(row.inventory.hoe, 1, 'direset oleh Ascension');
  assert.strictEqual(row.inventory.weapon, 0);
  assert.strictEqual(row.progress.prestige, 1, 'prestige tersimpan ke DB');
  assert.ok(row.progress.stats.harvested >= 100);
  assert.strictEqual(row.bought_backpack, 1);
  assert.strictEqual(row.dungeon_run, null);

  console.log('flow-check: semua lolos (akun, bahasa, farming, toko, mining, fishing, dungeon, armory, lock, rate limit)');
  process.exit(0);
})().catch((e) => {
  console.error('flow-check GAGAL:', e);
  process.exit(1);
});
