'use strict';

const { THREAD_IDLE_CLOSE_MS } = require('../config/constants');
const {
  getIdleThreadUserIds,
  loadAccount,
  saveAccount,
  withUserLock,
} = require('../lib/account');

const BATCH = 200;
const MAX_BATCHES_PER_TICK = 5;
const CONCURRENCY = 5;

/** Hapus satu thread idle (dengan lock pemain). */
async function sweepUser(client, userId) {
  await withUserLock(userId, async () => {
    const account = await loadAccount(userId);
    if (!account?.thread_id) return;

    if (!account.last_thread_activity) {
      account.last_thread_activity = new Date().toISOString();
      saveAccount(account);
      return;
    }
    const idleFor = Date.now() - new Date(account.last_thread_activity).getTime();
    if (idleFor <= THREAD_IDLE_CLOSE_MS) return; // ada aktivitas baru yang belum ter-flush

    // Hapus SEMUA thread pribadi pemain (bukan cuma yang terakhir).
    const ids = [account.thread_id, ...(account.thread_ids ?? [])].filter(Boolean);
    for (const tid of ids) {
      const thread = await client.channels.fetch(tid).catch(() => null);
      if (thread) await thread.delete().catch(() => {});
    }
    account.thread_id = null;
    account.thread_ids = [];
    account.status_msg_id = null;
    saveAccount(account);
  }).catch((e) => console.warn('[GROWVIA] sweeper user gagal:', userId, e.message));
}

/**
 * Hapus thread idle. Hanya query pemain yang memang punya thread idle (bukan semua pemain),
 * dalam beberapa batch per putaran dengan sedikit paralelisme, jadi ribuan thread idle sekaligus
 * (mis. setelah event ramai) tidak menumpuk. Discord REST sendiri sudah mengantre sesuai rate limit.
 */
async function sweepOnce(client) {
  const cutoff = new Date(Date.now() - THREAD_IDLE_CLOSE_MS).toISOString();
  for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch++) {
    const userIds = await getIdleThreadUserIds(cutoff, BATCH);
    if (!userIds.length) return;

    let next = 0;
    const worker = async () => {
      while (next < userIds.length) await sweepUser(client, userIds[next++]);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, userIds.length) }, worker));
    // Batch tidak penuh = antrean habis. Penulisan buffer ke DB menyusul, jadi jangan loop ulang pemain yang sama.
    if (userIds.length < BATCH) return;
  }
}

function startThreadSweeper(client, ms = 60 * 1000) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sweepOnce(client);
    } catch (e) {
      console.warn('[GROWVIA] sweeper gagal:', e.message);
    } finally {
      running = false;
    }
  }, ms);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { startThreadSweeper, sweepOnce };
