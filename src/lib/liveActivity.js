'use strict';

/**
 * Hitungan aktivitas live lewat RPC SQL `live_activity` (satu baris agregat, tanpa menarik semua pemain).
 * Di-cache 60 detik karena papan diperbarui tiap menit.
 */

const { supabase } = require('./db');

const TTL_MS = 60_000;
let cache = { rows: null, expiresAt: 0 };
let warned = false;

async function getLiveActivity() {
  const now = Date.now();
  if (cache.rows && now < cache.expiresAt) return cache.rows;

  const { data, error } = await supabase.rpc('live_activity');
  if (error || !Array.isArray(data) || !data[0]) {
    if (!warned) {
      console.warn('[GROWVIA] rpc live_activity gagal:', error?.message);
      warned = true;
    }
    cache = { rows: cache.rows ?? { farming: 0, mining: 0, fishing: 0, dungeon: 0, online: 0, total: 0 }, expiresAt: now + TTL_MS };
    return cache.rows;
  }
  const r = data[0];
  cache = {
    rows: {
      farming: Number(r.farming_q) || 0,
      mining: Number(r.mining_q) || 0,
      fishing: Number(r.fishing_q) || 0,
      dungeon: Number(r.dungeon_q) || 0,
      online: Number(r.online_q) || 0,
      total: Number(r.total_q) || 0,
    },
    expiresAt: now + TTL_MS,
  };
  return cache.rows;
}

module.exports = { getLiveActivity };
