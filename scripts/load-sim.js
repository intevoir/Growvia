'use strict';

/**
 * Uji beban lokal: ribuan interaksi per detik dengan banyak pemain, lewat router asli,
 * Supabase tiruan di memori dengan latensi buatan. Tanpa Discord, tanpa jaringan.
 *
 *   node scripts/load-sim.js [--players=100000] [--hot=20000] [--rate=3000] [--seconds=15] [--read-ms=15] [--write-ms=30]
 *
 * Yang diukur: throughput, latensi p50/p95/p99 (dari klik sampai balasan), event-loop lag,
 * memori, query DB per detik, dan antrean tulis. Ini mengukur satu proses Node, bukan batas Supabase.
 */

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, Number(v)]));
const PLAYERS = args.players || 100_000;
const HOT = Math.min(args.hot || 20_000, PLAYERS);
const RATE = args.rate || 3000;
const SECONDS = args.seconds || 15;
const READ_MS = args['read-ms'] ?? 15;
const WRITE_MS = args['write-ms'] ?? 30;

for (const [k, v] of Object.entries({
  ACCOUNT_CHANNEL_ID: '1', FARM_CHANNEL_ID: '2', SHOP_CHANNEL_ID: '3', MINING_CHANNEL_ID: '4',
  MINING_SHOP_CHANNEL_ID: '5', FISHING_CHANNEL_ID: '6', FISHING_SHOP_CHANNEL_ID: '7',
  DUNGEON_CHANNEL_ID: '8', DUNGEON_SHOP_CHANNEL_ID: '9', BACKPACK_CHANNEL_ID: '10', HALL_CHANNEL_ID: '11',
  SUPABASE_URL: 'http://fake', SUPABASE_SERVICE_ROLE_KEY: 'fake',
})) process.env[k] = v;
delete process.env.REDIS_URL;

const path = require('node:path');
// Sama seperti produksi (src/index.js): validasi builder dimatikan kecuali --validate=1.
if (!args.validate) require('discord.js').disableValidators();
const { monitorEventLoopDelay } = require('node:perf_hooks');

/* ---- Supabase tiruan dengan latensi ---- */
const players = new Map();
const halving = new Map();
const ops = { reads: 0, readRows: 0, writes: 0, writeRows: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function builder(table) {
  const state = { filters: {} };
  const b = {
    select: () => b,
    eq: (col, val) => ((state.filters[col] = val), b),
    not: () => b, or: () => b, limit: () => b,
    in: (col, vals) => ((state.in = vals), b),
    then: (resolve, reject) => {
      ops.reads += 1;
      ops.readRows += (state.in ?? []).length;
      return sleep(READ_MS)
        .then(() => ({ data: (state.in ?? []).map((k) => players.get(k)).filter(Boolean).map((r) => JSON.parse(JSON.stringify(r))), error: null }))
        .then(resolve, reject);
    },
    maybeSingle: async () => {
      ops.reads += 1;
      await sleep(READ_MS);
      const key = table === 'players' ? state.filters.user_id : state.filters.id;
      const row = (table === 'players' ? players : halving).get(key);
      return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
    },
    upsert: async (rows) => {
      const list = Array.isArray(rows) ? rows : [rows];
      ops.writes += 1;
      ops.writeRows += list.length;
      await sleep(WRITE_MS + list.length * 0.05);
      for (const row of list) {
        const key = table === 'players' ? row.user_id : row.id;
        const store = table === 'players' ? players : halving;
        store.set(key, { ...(store.get(key) ?? {}), ...JSON.parse(JSON.stringify(row)) });
      }
      return { error: null };
    },
  };
  return b;
}
const fake = { from: builder, rpc: async () => ({ data: [{ player_count: PLAYERS, avg_farming_level: 5 }], error: null }) };
const dbPath = require.resolve(path.join(__dirname, '../src/lib/db'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { supabase: fake } };

/* ---- Redis tiruan (untuk --write-behind=1) ---- */
const redisHash = new Map();
const fakeRedis = {
  async hset(k, f, v) { redisHash.set(f, v); return 1; },
  async hscan() { return ['0', Array.from(redisHash.entries()).flat()]; },
  async hlen() { return redisHash.size; },
  async hdel(k, f) { return redisHash.delete(f) ? 1 : 0; },
  async eval(script, n, key, field, raw) {
    const cur = redisHash.get(field);
    if (!cur) return 0;
    if (cur === raw) { redisHash.delete(field); return 1; }
    return 0;
  },
  pipeline() {
    const cmds = [];
    const p = {
      hset: (k, f, v) => { cmds.push([f, v]); return p; },
      exec: async () => { for (const [f, v] of cmds) redisHash.set(f, v); return cmds.map(() => [null, 1]); },
    };
    return p;
  },
  async quit() {},
  on() {},
};
if (args['write-behind']) {
  process.env.WB_DRAIN_MS = '1000';
  process.env.REDIS_URL = 'redis://fake';
  process.env.WRITE_BEHIND = '1';
  const redisPath = require.resolve(path.join(__dirname, '../src/lib/redis'));
  require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: { getRedisClient: () => fakeRedis, isRedisAvailable: () => true, quit: async () => {} } };
}

const { routeInteraction } = require('../src/bot/router');
const { defaultAccount, cacheStats, flushNow } = require('../src/lib/account');
const { drain } = require('../src/lib/metrics');
const writeBehind = require('../src/lib/writeBehind');

/* ---- Isi database ---- */
console.log(`Menyiapkan ${PLAYERS.toLocaleString()} pemain...`);
for (let i = 0; i < PLAYERS; i++) {
  const a = defaultAccount({ id: `p${i}`, username: `player${i}` });
  a.skills.farming = { level: 1 + (i % 60), exp: 0 };
  a.skills.mining = { level: 1 + (i % 40), exp: 0 };
  a.viaz = i % 5000;
  a.harvests = { gandum: 50 + (i % 200) };
  a.inventory.pickaxe = i % 3 === 0 ? 1 : 0;
  players.set(a.user_id, JSON.parse(JSON.stringify(a)));
}

const ACTIONS = [
  ['farm_refresh', 40], ['farm_harvest', 20], ['farm_inventory', 10], ['mine_refresh', 8],
  ['hall_nav:profile', 7], ['hall_nav:quests', 5], ['shop_sell_open', 5], ['bp_open', 5],
];
const total = ACTIONS.reduce((s, [, w]) => s + w, 0);
function pickAction() {
  let r = Math.random() * total;
  for (const [id, w] of ACTIONS) if ((r -= w) < 0) return id;
  return ACTIONS[0][0];
}

/* ---- Interaksi palsu ---- */
const latencies = [];
let completed = 0;
let rejected = 0;
function fakeInteraction(userId, customId) {
  const started = performance.now();
  const done = () => {
    completed += 1;
    latencies.push(performance.now() - started);
  };
  const i = {
    user: { id: userId, username: userId }, guildId: 'g', channelId: 'c', customId, values: [],
    deferred: false, replied: false,
    isButton: () => true, isStringSelectMenu: () => false,
    deferUpdate: async () => { i.deferred = true; },
    deferReply: async () => { i.deferred = true; },
    reply: async (p) => { i.replied = true; if (String(p.content ?? '').includes('Slow down')) rejected += 1; done(); },
    editReply: async () => { done(); },
    followUp: async () => { done(); },
  };
  return i;
}

/* ---- Jalankan ---- */
const loop = monitorEventLoopDelay({ resolution: 10 });
const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0);
const mb = (n) => Math.round(n / 1024 / 1024);

async function main() {
  console.log(`Beban: ${RATE}/dtk selama ${SECONDS} dtk · ${HOT.toLocaleString()} pemain aktif dari ${PLAYERS.toLocaleString()} · DB baca ${READ_MS}ms tulis ${WRITE_MS}ms${args['write-behind'] ? ' · write-behind Redis aktif' : ''}`);
  writeBehind.startLoop();
  loop.enable();
  const t0 = performance.now();
  let issued = 0;
  let peakBuffer = 0;
  let peakRss = 0;
  const tick = setInterval(() => {
    const perTick = Math.round((RATE * 10) / 1000);
    for (let n = 0; n < perTick; n++) {
      const userId = `p${Math.floor(Math.random() ** 1.5 * HOT)}`;
      issued += 1;
      routeInteraction(fakeInteraction(userId, pickAction()));
    }
    const { buffered } = cacheStats();
    peakBuffer = Math.max(peakBuffer, buffered);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 10);
  await sleep(SECONDS * 1000);
  clearInterval(tick);
  const issuedElapsed = (performance.now() - t0) / 1000;

  // Beri waktu menyelesaikan antrean, lalu hitung apa yang tersisa.
  const drainStart = performance.now();
  while (completed < issued && performance.now() - drainStart < 30_000) await sleep(100);
  await flushNow();
  // Tunggu tulis tertunda (buffer + Redis) benar-benar habis.
  const settleStart = performance.now();
  while (performance.now() - settleStart < 15_000) {
    await flushNow();
    if ((await writeBehind.queueDepth()) === 0 && cacheStats().buffered === 0) break;
    await sleep(200);
  }
  const drainSec = (performance.now() - drainStart) / 1000;
  loop.disable();

  latencies.sort((a, b) => a - b);
  const m = drain();
  console.log('\n===== HASIL =====');
  console.log(`Dikirim ${issued.toLocaleString()} (${Math.round(issued / issuedElapsed)}/dtk) · terjawab ${completed.toLocaleString()} · termasuk ditolak rate-limit ${rejected.toLocaleString()} · error ${m.errors}`);
  console.log(`Latensi klik->balasan: p50 ${pct(latencies, 50).toFixed(0)} ms · p95 ${pct(latencies, 95).toFixed(0)} ms · p99 ${pct(latencies, 99).toFixed(0)} ms · max ${pct(latencies, 100).toFixed(0)} ms`);
  console.log(`Event-loop lag: rata-rata ${(loop.mean / 1e6).toFixed(1)} ms · p99 ${(loop.percentile(99) / 1e6).toFixed(1)} ms · max ${(loop.max / 1e6).toFixed(0)} ms`);
  console.log(`DB: ${ops.reads.toLocaleString()} query baca / ${ops.readRows.toLocaleString()} baris (${Math.round(ops.reads / (issuedElapsed + drainSec))} query/dtk) · ${ops.writes.toLocaleString()} batch tulis, ${ops.writeRows.toLocaleString()} baris (${Math.round(ops.writeRows / (issuedElapsed + drainSec))} baris/dtk)`);
  console.log(`Memori: RSS puncak ${mb(peakRss)} MB · antrean tulis puncak ${peakBuffer.toLocaleString()} · cache akhir ${cacheStats().cached.toLocaleString()}`);
  if (args['write-behind']) console.log(`Redis: ${writeBehind.stats.enqueued.toLocaleString()} masuk · ${writeBehind.stats.drained.toLocaleString()} ter-drain · sisa antrean ${redisHash.size} · error ${writeBehind.stats.errors}`);
  console.log(`Waktu menguras antrean setelah beban berhenti: ${drainSec.toFixed(1)} dtk`);
  const ok = completed >= issued * 0.999 && pct(latencies, 95) < 1000;
  console.log(ok ? '\n✅ LULUS: antrean habis dan p95 < 1 dtk' : '\n❌ GAGAL: ada interaksi menumpuk atau p95 >= 1 dtk');
  process.exit(ok ? 0 : 1);
}

main();
