'use strict';

/**
 * Write-behind via Redis untuk skala besar (10k+ pemain aktif).
 *
 * Cara kerja:
 * - flushWrites() di lib/account.js menulis baris pemain ke hash Redis `growvia:wb:players`
 *   (satu field per userId, jadi tulisan terbaru menang dan burst klik digabung otomatis).
 * - Drainer membaca hash itu, mengupsert ke Supabase dalam potongan 100 baris, lalu menghapus
 *   field HANYA bila isinya masih versi yang sama dengan yang dibaca (skrip Lua compare-and-delete).
 *   Bila pemain menulis lagi di tengah jalan, versi baru tetap di Redis untuk drain berikutnya.
 * - Kalau Redis mati / enqueue gagal, pemanggil kembali ke jalur tulis langsung (tidak ada data hilang).
 *
 * Aktif bila REDIS_URL diisi dan WRITE_BEHIND !== '0'. Tanpa itu: jalur langsung seperti sebelumnya.
 */

const { supabase } = require('./db');
const { getRedisClient } = require('./redis');

const HASH_KEY = 'growvia:wb:players';
const TABLE_PLAYERS = 'players';
const DRAIN_INTERVAL_MS = Number(process.env.WB_DRAIN_MS) || 5000;
const SCAN_COUNT = 300;
const UPSERT_CHUNK = 100;

const DEL_IF_VERSION = `
  local cur = redis.call("hget", KEYS[1], ARGV[1])
  if not cur then return 0 end
  if cur == ARGV[2] then return redis.call("hdel", KEYS[1], ARGV[1]) else return 0 end
`;

const stats = { enqueued: 0, drained: 0, errors: 0 };

let loopTimer = null;
let draining = false;

const isEnabled = () => Boolean(process.env.REDIS_URL) && process.env.WRITE_BEHIND !== '0';
const client = () => (isEnabled() ? getRedisClient() : null);

/**
 * Masukkan baris ke Redis. `entries`: [[userId, entry]], `buildRow(entry) -> row`.
 * Mengembalikan true kalau semua masuk; false kalau Redis bermasalah (pemanggil harus tulis langsung).
 */
async function enqueue(entries, buildRow) {
  const redis = client();
  if (!redis) return false;
  try {
    const pipe = redis.pipeline();
    for (const [userId, entry] of entries) {
      pipe.hset(HASH_KEY, userId, JSON.stringify({ v: entry.version, row: buildRow(entry) }));
    }
    const results = await pipe.exec();
    for (const [err] of results) if (err) throw err;
    stats.enqueued += entries.length;
    return true;
  } catch (e) {
    stats.errors += 1;
    console.error('[GROWVIA] write-behind enqueue gagal, kembali ke tulis langsung:', e.message);
    return false;
  }
}

/** Baca semua field, tulis ke Supabase, hapus yang versinya tidak berubah. */
async function drainOnce() {
  const redis = client();
  if (!redis || draining) return 0;
  draining = true;
  try {
    const items = [];
    let cursor = '0';
    for (;;) {
      const [next, pairs] = await redis.hscan(HASH_KEY, cursor, 'COUNT', SCAN_COUNT);
      cursor = String(next);
      for (let i = 0; i < pairs.length; i += 2) {
        try {
          items.push({ userId: pairs[i], raw: pairs[i + 1], ...JSON.parse(pairs[i + 1]) });
        } catch {
          await redis.hdel(HASH_KEY, pairs[i]).catch(() => {}); // payload rusak: buang supaya tidak nyangkut
        }
      }
      if (cursor === '0') break;
    }
    if (!items.length) return 0;

    let done = 0;
    for (let i = 0; i < items.length; i += UPSERT_CHUNK) {
      const part = items.slice(i, i + UPSERT_CHUNK);
      const rows = part.map((x) => x.row);
      const { error } = await supabase.from(TABLE_PLAYERS).upsert(rows, { onConflict: 'user_id' });
      if (error) throw error;
      for (const x of part) await redis.eval(DEL_IF_VERSION, 1, HASH_KEY, x.userId, x.raw).catch(() => {});
      done += part.length;
    }
    stats.drained += done;
    return done;
  } catch (e) {
    stats.errors += 1;
    console.error('[GROWVIA] write-behind drain gagal:', e.message);
    return 0;
  } finally {
    draining = false;
  }
}

/** Kuras sampai kosong (untuk shutdown). Terbatas supaya tidak gantung selamanya. */
async function drainNow(maxRounds = 50) {
  for (let i = 0; i < maxRounds; i++) {
    const n = await drainOnce();
    if (n === 0) return;
  }
}

async function queueDepth() {
  const redis = client();
  if (!redis) return 0;
  try {
    return await redis.hlen(HASH_KEY);
  } catch {
    return 0;
  }
}

function startLoop() {
  if (!isEnabled()) return null;
  if (loopTimer) return loopTimer;
  loopTimer = setInterval(() => drainOnce(), DRAIN_INTERVAL_MS);
  if (loopTimer.unref) loopTimer.unref();
  console.log('[GROWVIA] write-behind Redis aktif (drain tiap ' + DRAIN_INTERVAL_MS + ' ms)');
  return loopTimer;
}

module.exports = { isEnabled, enqueue, drainOnce, drainNow, queueDepth, startLoop, stats };
