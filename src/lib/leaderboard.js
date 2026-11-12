'use strict';

/**
 * Papan peringkat lewat RPC SQL `leaderboard` (hanya N teratas, bukan menarik semua pemain).
 * Hasil di-cache 60 detik per jenis supaya klik berulang tidak membebani database.
 */

const { supabase } = require('./db');

const KINDS = ['total', 'farming', 'mining', 'fishing', 'dungeon', 'viaz', 'fish', 'prestige'];
const TTL_MS = 60_000;
const cache = new Map();
let warned = false;

async function getTop(kind, limit = 10) {
  if (!KINDS.includes(kind)) return [];
  const hit = cache.get(kind);
  const now = Date.now();
  if (hit && now < hit.expiresAt) return hit.rows;

  const { data, error } = await supabase.rpc('leaderboard', { kind, lim: limit });
  if (error || !Array.isArray(data)) {
    if (!warned) {
      console.warn('[GROWVIA] rpc leaderboard gagal:', error?.message);
      warned = true;
    }
    cache.set(kind, { rows: hit?.rows ?? [], expiresAt: now + TTL_MS });
    return hit?.rows ?? [];
  }
  const rows = data.map((r) => ({ userId: r.user_id, username: r.username, score: Number(r.score) || 0 }));
  cache.set(kind, { rows, expiresAt: now + TTL_MS });
  return rows;
}

module.exports = { KINDS, getTop };
