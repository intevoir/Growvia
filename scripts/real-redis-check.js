'use strict';
/* Uji write-behind melawan Redis asli (docker compose up -d) + Supabase tiruan.
 *   REDIS_URL=redis://127.0.0.1:6379 node scripts/real-redis-check.js */
process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
process.env.WRITE_BEHIND = '1';

const assert = require('node:assert');
const path = require('node:path');

const upserts = [];
const dbPath = require.resolve(path.join(__dirname, 'src/lib/db'));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { supabase: { from: () => ({ upsert: async (rows) => { upserts.push(rows); return { error: null }; } }) } },
};

const wb = require('./src/lib/writeBehind');

(async () => {
  const { getRedisClient } = require('./src/lib/redis');
  const redis = getRedisClient();
  await redis.flushdb();

  const entries = Array.from({ length: 250 }, (_, i) => [`u${i}`, { version: `v${i}`, account: { user_id: `u${i}` } }]);
  const ok = await wb.enqueue(entries, (e) => ({ user_id: e.account.user_id, viaz: 42 }));
  assert.strictEqual(ok, true);
  assert.strictEqual(await redis.hlen('growvia:wb:players'), 250);

  const drained = await wb.drainOnce();
  assert.strictEqual(drained, 250);
  assert.strictEqual(upserts.length, 3, '250 baris dalam 3 batch (100/100/50)');
  assert.strictEqual(upserts[0].length, 100);
  assert.strictEqual(await redis.hlen('growvia:wb:players'), 0, 'antrean kosong');

  // compare-and-delete: simulasikan tulis baru tepat setelah dibaca
  await wb.enqueue([['uX', { version: 'old', account: { user_id: 'uX' } }]], () => ({ user_id: 'uX', viaz: 1 }));
  const raw = await redis.hget('growvia:wb:players', 'uX');
  await wb.enqueue([['uX', { version: 'new', account: { user_id: 'uX' } }]], () => ({ user_id: 'uX', viaz: 2 }));
  const raw2 = await redis.hget('growvia:wb:players', 'uX');
  assert.notStrictEqual(raw, raw2);
  const d2 = await wb.drainOnce();
  assert.strictEqual(d2, 1);
  assert.strictEqual(upserts[upserts.length - 1][0].viaz, 2, 'versi terbaru yang terkirim');
  assert.strictEqual(await redis.hlen('growvia:wb:players'), 0);

  await redis.quit();
  console.log('real-redis check: semua lolos');
  process.exit(0);
})().catch((e) => { console.error('GAGAL:', e); process.exit(1); });
