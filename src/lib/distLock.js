'use strict';

const { getRedisClient } = require('./redis');

/**
 * Lock per user dua lapis:
 * 1. Antrian lokal (selalu aktif): aksi user yang sama diproses berurutan dalam satu proses.
 * 2. Redis (opsional, jika REDIS_URL diisi): mencegah balapan antar proses.
 *    Kalau Redis mati, otomatis jatuh ke lock lokal saja.
 */

const LOCK_PREFIX = 'growvia:lock:user:';
const LOCK_TTL_MS = 30_000;
const RENEW_INTERVAL_MS = 10_000;
const ACQUIRE_TIMEOUT_MS = 5_000;
const RETRY_MS = 50;

const releaseScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const renewScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

class LockTimeoutError extends Error {
  constructor() {
    super('Sedang diproses, coba lagi sebentar.');
    this.name = 'LockTimeoutError';
  }
}

const localTails = new Map();

async function acquireLocal(userId) {
  const prev = localTails.get(userId) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => current);
  localTails.set(userId, tail);
  await prev;
  return () => {
    release();
    if (localTails.get(userId) === tail) localTails.delete(userId);
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireRedis(userId) {
  const redis = getRedisClient();
  if (!redis) return null;

  const key = `${LOCK_PREFIX}${userId}`;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  try {
    for (;;) {
      const ok = await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
      if (ok === 'OK') break;
      if (Date.now() > deadline) throw new LockTimeoutError();
      await sleep(RETRY_MS);
    }
  } catch (e) {
    if (e instanceof LockTimeoutError) throw e;
    console.warn('[GROWVIA] Redis lock gagal, pakai lock lokal:', e.message);
    return null;
  }

  const renewTimer = setInterval(() => {
    redis.eval(renewScript, 1, key, token, LOCK_TTL_MS).catch(() => {});
  }, RENEW_INTERVAL_MS);
  if (renewTimer.unref) renewTimer.unref();

  return async () => {
    clearInterval(renewTimer);
    await redis.eval(releaseScript, 1, key, token).catch(() => {});
  };
}

async function withDistLock(userId, fn) {
  const releaseLocal = await acquireLocal(userId);
  let releaseRedis = null;
  try {
    releaseRedis = await acquireRedis(userId);
    return await fn();
  } finally {
    if (releaseRedis) await releaseRedis().catch(() => {});
    releaseLocal();
  }
}

module.exports = { withDistLock, LockTimeoutError };
