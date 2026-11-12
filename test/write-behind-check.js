'use strict';

/**
 * Self-check write-behind Redis: enqueue -> drain -> Supabase, compare-and-delete,
 * payload rusak dibuang, dan fallback ke tulis langsung bila Redis gagal.
 * Tanpa jaringan (Supabase & Redis tiruan di memori).
 * Jalankan: node test/write-behind-check.js
 */

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.REDIS_URL = 'redis://fake';
process.env.WRITE_BEHIND = '1';

const assert = require('node:assert');
const path = require('node:path');

/* ---- Supabase tiruan ---- */
const upserts = [];
const fakeSupabase = {
  from: () => ({
    upsert: async (rows) => {
      upserts.push(Array.isArray(rows) ? rows : [rows]);
      return { error: null };
    },
  }),
};
const dbPath = require.resolve(path.join(__dirname, '../src/lib/db'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { supabase: fakeSupabase } };

/* ---- Redis tiruan ---- */
const hash = new Map();
let failExec = false;
const fakeRedis = {
  async hset(k, f, v) { hash.set(f, v); return 1; },
  async hscan() { return ['0', Array.from(hash.entries()).flat()]; },
  async hlen() { return hash.size; },
  async hdel(k, f) { return hash.delete(f) ? 1 : 0; },
  async eval(script, n, key, field, raw) {
    const cur = hash.get(field);
    if (!cur) return 0;
    if (cur === raw) { hash.delete(field); return 1; }
    return 0;
  },
  pipeline() {
    const cmds = [];
    const p = {
      hset: (k, f, v) => { cmds.push([f, v]); return p; },
      exec: async () => {
        if (failExec) throw new Error('redis down');
        for (const [f, v] of cmds) hash.set(f, v);
        return cmds.map(() => [null, 1]);
      },
    };
    return p;
  },
  async quit() {},
  on() {},
};
const redisPath = require.resolve(path.join(__dirname, '../src/lib/redis'));
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: { getRedisClient: () => fakeRedis, isRedisAvailable: () => true, quit: async () => {} } };

const wb = require('../src/lib/writeBehind');
const account = require('../src/lib/account');
const { defaultAccount } = account;

(async () => {
/* ---- Compare-and-delete: semantik skrip Lua ---- */
hash.set('u1', '{"v":"a","row":{"user_id":"u1"}}');
assert.strictEqual(await fakeRedis.eval('', 1, 'k', 'u1', '{"v":"x"}'), 0, 'versi beda -> tidak dihapus');
assert.strictEqual(hash.size, 1);
assert.strictEqual(await fakeRedis.eval('', 1, 'k', 'u1', '{"v":"a","row":{"user_id":"u1"}}'), 1, 'versi sama -> dihapus');
assert.strictEqual(hash.size, 0);

/* ---- enqueue + drain lewat jalur account ---- */
assert.ok(wb.isEnabled());
const acc = defaultAccount({ id: 'u1', username: 'tester' });
account.saveAccount(acc);
await account.flushWrites(true);
assert.strictEqual(upserts.length, 0, 'belum ke Supabase (masih di Redis)');
assert.strictEqual(hash.size, 1, 'satu field di hash');

const drained = await wb.drainOnce();
assert.strictEqual(drained, 1);
assert.strictEqual(upserts.length, 1);
assert.strictEqual(upserts[0][0].user_id, 'u1');
assert.strictEqual(upserts[0][0].username, 'tester');
assert.strictEqual(hash.size, 0, 'hash kosong setelah drain');

/* ---- Tulisan terbaru menang (gabung burst) ---- */
acc.viaz = 111; account.saveAccount(acc);
await account.flushWrites(true);
acc.viaz = 222; account.saveAccount(acc);
await account.flushWrites(true);
assert.strictEqual(hash.size, 1, 'dua tulis jadi satu field');
await wb.drainOnce();
assert.strictEqual(upserts[upserts.length - 1][0].viaz, 222, 'hanya versi terakhir yang terkirim');

/* ---- Payload rusak dibuang, tidak nyangkut ---- */
hash.set('bad', 'bukan-json');
assert.strictEqual(await wb.drainOnce(), 0);
assert.strictEqual(hash.size, 0, 'payload rusak dibuang');

/* ---- Fallback: Redis gagal -> enqueue false, flush menulis langsung ---- */
failExec = true;
const ok = await wb.enqueue([['u2', { version: 'v', account: { user_id: 'u2' } }]], (e) => ({ user_id: e.account.user_id }));
assert.strictEqual(ok, false, 'enqueue gagal mengembalikan false');
failExec = false;

failExec = true; // Redis mati saat flush: harus jatuh ke tulis langsung
const acc2 = defaultAccount({ id: 'u2', username: 'fallback' });
account.saveAccount(acc2);
await account.flushWrites(true);
assert.strictEqual(upserts.length, 3, 'fallback: langsung ke Supabase');
assert.strictEqual(upserts[upserts.length - 1][0].user_id, 'u2');

console.log(`write-behind-check: semua lolos (enqueue ${wb.stats.enqueued}, drain ${wb.stats.drained}, error ${wb.stats.errors})`);

process.exit(0);
})().catch((e) => { console.error('write-behind-check GAGAL:', e); process.exit(1); });
