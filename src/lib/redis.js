'use strict';

const Redis = require('ioredis');

let client = null;

function getRedisClient() {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }

  client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
  });

  client.on('error', (e) => {
    console.warn('[GROWVIA] Redis error:', e.message);
  });

  client.connect().catch(() => {
    /* Redis ops akan gagal dengan jelas, tangani di pemanggil */
  });

  return client;
}

function isRedisAvailable() {
  return !!getRedisClient();
}

async function quit() {
  if (client) {
    try {
      await client.quit();
    } catch {
      /* abaikan */
    }
    client = null;
  }
}

module.exports = { getRedisClient, isRedisAvailable, quit };
