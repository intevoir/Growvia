'use strict';

/**
 * Pekerja settle latar: tiap menit menyelesaikan progres AFK untuk pemain yang sedang
 * menjalankan aktivitas (auto-tanam, auto-mine, sesi pancing), pakai fungsi settle yang sama
 * dengan tombol. Jadi hasil tidak "tertunda" sampai pemain kembali menekan tombol: panen,
 * tambang, dan strike pancing benar-benar jalan terus (dengan batas offline 24 jam seperti biasa).
 */

const { supabase } = require('../lib/db');
const { loadAccount, saveAccount, withUserLock } = require('../lib/account');
const { settle } = require('../lib/farmLogic');
const { settleMining } = require('../lib/miningLogic');
const { settleFishing } = require('../lib/fishingLogic');

const INTERVAL_MS = 60_000;
const BATCH = Number(process.env.SETTLE_BATCH) || 200;

/** userId pemain yang sedang menjalankan aktivitas (satu query RPC). */
async function activeUserIds(limit = BATCH) {
  const { data, error } = await supabase.rpc('active_players', { lim: limit });
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id);
}

async function settleUser(userId) {
  await withUserLock(userId, async () => {
    const account = await loadAccount(userId);
    if (!account) return;
    const farm = settle(account);
    const mine = settleMining(account);
    const fish = settleFishing(account);
    if (farm.changed || mine.changed || fish.changed) saveAccount(account);
  }).catch((e) => console.warn('[GROWVIA] settle user gagal:', userId, e.message));
}

async function tick() {
  const ids = await activeUserIds();
  let next = 0;
  const worker = async () => {
    while (next < ids.length) await settleUser(ids[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(10, ids.length) }, worker));
}

function startSettleWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (e) {
      console.warn('[GROWVIA] settle worker gagal:', e.message);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { startSettleWorker, activeUserIds, tick };
