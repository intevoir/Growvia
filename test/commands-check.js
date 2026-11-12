'use strict';

/**
 * Tes perintah chat `!...` di thread pribadi (pakai Supabase tiruan, tanpa Discord/jaringan).
 * Mencakup: akun, help, beli, tanam, panen, jual, tambang, tas, perintah asing, thread orang lain, rate limit.
 */

for (const [k, v] of Object.entries({
  ACCOUNT_CHANNEL_ID: '1', FARM_CHANNEL_ID: '2', SHOP_CHANNEL_ID: '3', MINING_CHANNEL_ID: '4',
  MINING_SHOP_CHANNEL_ID: '5', FISHING_CHANNEL_ID: '6', FISHING_SHOP_CHANNEL_ID: '7',
  DUNGEON_CHANNEL_ID: '8', DUNGEON_SHOP_CHANNEL_ID: '9', BACKPACK_CHANNEL_ID: '10', HALL_CHANNEL_ID: '11',
  SUPABASE_URL: 'http://fake', SUPABASE_SERVICE_ROLE_KEY: 'fake',
})) process.env[k] = v;
delete process.env.REDIS_URL;

const assert = require('node:assert');
const path = require('node:path');

const tables = { players: new Map(), halving_state: new Map() };
function builder(table) {
  const state = { filters: {} };
  const b = {
    select: () => b,
    eq: (col, val) => ((state.filters[col] = val), b),
    not: () => b, or: () => b, limit: () => b,
    in: (col, vals) => ((state.in = vals), b),
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
const fake = { from: (t) => builder(t), rpc: async (name) => (name === 'leaderboard' ? { data: [{ user_id: 'u1', username: 'tester', score: 12 }], error: null } : { data: [{ player_count: 1, avg_farming_level: 1 }], error: null }) };
const dbPath = require.resolve(path.join(__dirname, '../src/lib/db'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { supabase: fake } };

const { handleMessage } = require('../src/features/commands');
const { defaultAccount, loadAccount, flushNow } = require('../src/lib/account');
const { flush: flushHalving } = require('../src/lib/halving');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pesan palsu. channelId default = thread akun. */
function msg(content, { channelId = 'thread-1' } = {}) {
  const m = {
    author: { id: 'u1', username: 'tester', bot: false },
    content,
    channelId,
    guild: { id: 'g' },
    sent: [],
    channel: { id: channelId, send: async (p) => { m.sent.push(p); return p; } },
  };
  return m;
}

function text(m) {
  return m.sent.map((p) => {
    if (typeof p === 'string') return p;
    const parts = [];
    for (const c of p.components ?? []) {
      const walk = (n) => { if (n.type === 10) parts.push(n.content); for (const ch of n.components ?? []) walk(ch); };
      walk(typeof c.toJSON === 'function' ? c.toJSON() : c);
    }
    return parts.join('\n');
  }).join('\n---\n');
}

async function say(content, opts) {
  const m = msg(content, opts);
  await handleMessage(m);
  await sleep(320); // lewati rate limit antar perintah
  return m;
}

(async () => {
  // Akun warga
  const acc = defaultAccount({ id: 'u1', username: 'tester' });
  acc.thread_id = 'thread-1';
  acc.viaz = 1000;
  acc.skills.farming.level = 10;
  acc.inventory.pickaxe = 1;
  tables.players.set('u1', JSON.parse(JSON.stringify(acc)));
  const account = await loadAccount('u1');

  // Bukan perintah -> diam
  let m = await say('halo semua');
  assert.strictEqual(m.sent.length, 0, 'pesan biasa diabaikan');

  // help
  m = await say('/help');
  assert.ok(text(m).includes('Commands'), text(m).slice(0, 300));

  // beli benih
  m = await say('/buy seed gandum 50');
  assert.ok(text(m).includes('Wheat'), text(m).slice(0, 300));
  assert.strictEqual(account.seeds.gandum, 150, '100 awal + 50');
  assert.strictEqual(account.viaz, 950);

  // tanam + panen + jual
  m = await say('/plant gandum max');
  assert.ok(text(m).includes('Wheat'), text(m).slice(0, 200));
  account.plantings.gandum.finished_at = Date.now() - 1000;
  m = await say('/harvest');
  assert.ok(text(m).includes('Harvested'), text(m).slice(0, 200));
  assert.strictEqual(account.harvests.gandum, 150, 'semua 150 gandum ditanam (200 plot di Lv 10)');
  m = await say('/sell');
  assert.ok(text(m).includes('Sold'), text(m).slice(0, 200));
  assert.strictEqual(account.viaz, 1750, '950 + 300 jual + 500 achievement Sprout');
  assert.strictEqual(Object.keys(account.harvests).length, 0);

  // tambang (butuh Farming 10 + beliung: sudah)
  m = await say('/mine cave_shallow');
  assert.ok(text(m).includes('Shallow Cave'), text(m).slice(0, 300));
  account.mining_trip.finished_at = Date.now() - 1000;
  m = await say('/gather');
  assert.ok(text(m).includes('Mined'), text(m).slice(0, 300));

  // tas
  m = await say('/bag');
  assert.ok(text(m).includes('slots'), text(m).slice(0, 300));

  // perintah asing
  m = await say('/ngawur');
  assert.ok(text(m).includes('Unknown command'), text(m).slice(0, 200));

  // thread orang lain -> ditolak
  m = await say('/bag', { channelId: 'thread-orang-lain' });
  assert.ok(text(m).includes('own private thread'), text(m).slice(0, 200));

  // thread kedua milik pemain sendiri (bukan thread terakhir) -> tetap boleh
  account.thread_ids = ['thread-1', 'thread-2'];
  account.thread_id = 'thread-1';
  m = await say('/bag', { channelId: 'thread-2' });
  assert.ok(text(m).includes('slots'), text(m).slice(0, 200));

  // rate limit: dua perintah sekaligus, yang kedua diam
  const a = msg('/bag');
  const b = msg('/help');
  await Promise.all([handleMessage(a), handleMessage(b)]);
  assert.ok(a.sent.length + b.sent.length <= 1, 'klik cepat: hanya satu yang dijawab');
  await sleep(320); // lewati jendela rate limit sebelum perintah berikut

  // status (sedang tidak ada aktivitas aktif)
  m = await say('/status');
  assert.ok(text(m).includes('No active activity'), text(m).slice(0, 200));

  // info item
  m = await say('/info seed gandum');
  assert.ok(text(m).includes('Wheat'), text(m).slice(0, 200));

  // upgrade alat: cangkul 1 -> 2 (500 Viaz)
  m = await say('/tool hoe');
  assert.ok(text(m).includes('Common Hoe'), text(m).slice(0, 200));
  assert.strictEqual(account.inventory.hoe, 2);

  // quest + claim
  m = await say('/quests');
  assert.ok(text(m).includes('Daily'), text(m).slice(0, 200));
  const harvestQ = account.progress.q.list.find((x) => x.t === 'harvest');
  harvestQ.got = harvestQ.need;
  const beforeClaim = account.viaz;
  m = await say('/claim');
  assert.ok(text(m).includes('Claimed'), text(m).slice(0, 200));
  assert.ok(account.viaz > beforeClaim);

  // hall lewat chat
  m = await say('/ach mining');
  assert.ok(text(m).includes('Mining'), text(m).slice(0, 200));
  m = await say('/collection fish');
  assert.ok(text(m).includes('Fish'), text(m).slice(0, 200));
  m = await say('/top total');
  assert.ok(text(m).includes('tester'), text(m).slice(0, 200));

  // ascend: terkunci dulu, lalu penuhi syarat
  m = await say('/ascend');
  assert.ok(text(m).includes('Ascension'), text(m).slice(0, 200));
  assert.strictEqual(account.progress.prestige, 0);
  for (const k of Object.keys(account.skills)) account.skills[k].level = 70;
  m = await say('/ascend');
  assert.ok(text(m).includes('Ascension 1 complete'), text(m).slice(0, 200));
  assert.strictEqual(account.progress.prestige, 1);
  assert.strictEqual(account.skills.farming.level, 1);

  // tanpa akun
  const noAcc = msg('/help');
  noAcc.author = { id: 'u-tanpa-akun', username: 'x', bot: false };
  await handleMessage(noAcc);
  assert.ok(text(noAcc).includes('No account'), text(noAcc).slice(0, 200));

  await flushNow();
  await flushHalving();
  const row = tables.players.get('u1');
  assert.ok((row.seeds.gandum ?? 0) <= 100, `benih konsisten (dipakai tanam, lalu reset Ascension ke 100): ${row.seeds.gandum}`);
  assert.strictEqual(row.harvests.gandum ?? 0, 0, 'panen sudah terjual');
  assert.ok((row.progress?.stats?.mined ?? 0) > 0, 'statistik tambang tersimpan (ore ikut ter-reset Ascension)');

  console.log('commands-check: semua lolos (help, beli, tanam, panen, jual, tambang, tas, thread, rate limit)');
  process.exit(0);
})().catch((e) => { console.error('commands-check GAGAL:', e); process.exit(1); });
