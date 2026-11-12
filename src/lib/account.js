'use strict';

const { supabase } = require('./db');
const { withDistLock } = require('./distLock');
const G = require('../config/game');
const { expToNext } = require('./xp');
const { defaultProgress, normalizeProgress } = require('./progress');
const writeBehind = require('./writeBehind');

const TABLE_PLAYERS = 'players';

/**
 * Satu proses = satu-satunya penulis tabel players, jadi cache panjang aman dan memangkas SELECT drastis.
 * Kalau REDIS_URL diisi (mode multi-proses) TTL pendek supaya antar proses tidak basi.
 */
const ACCOUNT_CACHE_TTL_MS = Number(process.env.ACCOUNT_CACHE_TTL_MS) || (process.env.REDIS_URL ? 5000 : 60_000);
/** Batas jumlah akun di memori (urutan masuk tertua dibuang dulu, kecuali yang menunggu ditulis ke DB). */
const ACCOUNT_CACHE_MAX = Number(process.env.ACCOUNT_CACHE_MAX) || 50_000;
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_CHUNK = 100;
const FLUSH_CONCURRENCY = 4;
const RATE_LIMIT_MS = 300;
const READ_LIMIT_MS = 100;
const GLOBAL_STATS_TTL_MS = 60_000;

/** Kolom tabel players (snake_case). */
const PLAYER_COLUMNS = [
  'user_id',
  'username',
  'thread_id',
  'thread_ids',
  'guild_id',
  'skills',
  'viaz',
  'seeds',
  'harvests',
  'plantings',
  'bought_plots',
  'auto_plant',
  'ores',
  'mining_trip',
  'auto_mining',
  'bought_backpack',
  'lang',
  'baits',
  'fishes',
  'fishing_session',
  'dungeon_run',
  'dungeon_loot',
  'potions',
  'inventory',
  'items',
  'boosts',
  'progress',
  'status_msg_id',
  'created_at',
  'updated_at',
  'last_thread_activity',
];

/* ============ Cache baca + buffer tulis ============ */
const accountCache = new Map();
const writeBuffer = new Map(); // userId -> { account, version }
const rateLimitMap = new Map();
const readLimitMap = new Map();
let versionCounter = 0;
let flushTimer = null;
let flushing = false;

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of accountCache) {
    if (now >= entry.expiresAt && !writeBuffer.has(id)) accountCache.delete(id);
  }
  for (const [id, last] of rateLimitMap) {
    if (now - last > 60_000) rateLimitMap.delete(id);
  }
  for (const [id, last] of readLimitMap) {
    if (now - last > 10_000) readLimitMap.delete(id);
  }
}, 60_000);
if (sweepTimer.unref) sweepTimer.unref();

function cacheSet(userId, account) {
  accountCache.delete(userId); // pindahkan ke ujung urutan
  accountCache.set(userId, { account, expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS });
  if (accountCache.size > ACCOUNT_CACHE_MAX) {
    for (const id of accountCache.keys()) {
      if (!writeBuffer.has(id)) {
        accountCache.delete(id);
        if (accountCache.size <= ACCOUNT_CACHE_MAX) break;
      }
    }
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pickColumns(account, updatedAt) {
  const row = {};
  for (const col of PLAYER_COLUMNS) {
    if (account[col] !== undefined) row[col] = account[col];
  }
  row.updated_at = updatedAt;
  return row;
}

function defaultAccount(user) {
  const now = new Date().toISOString();
  return {
    user_id: user.id,
    username: user.username,
    thread_id: null,
    thread_ids: [],
    guild_id: null,
    skills: {
      farming: { level: 1, exp: 0 },
      mining: { level: 1, exp: 0 },
      fishing: { level: 1, exp: 0 },
      dungeon: { level: 1, exp: 0 },
    },
    viaz: 0,
    seeds: { ...G.START_SEEDS },
    harvests: {},
    plantings: {},
    bought_plots: 0,
    auto_plant: false,
    ores: {},
    mining_trip: null,
    auto_mining: false,
    bought_backpack: 0,
    lang: 'en',
    baits: {},
    fishes: [],
    fishing_session: null,
    dungeon_run: null,
    dungeon_loot: {},
    potions: {},
    inventory: { hoe: 1, pickaxe: 0, rod: 0, weapon: 0, armor: 0 },
    items: { hoe_1: 1 },
    boosts: {},
    progress: defaultProgress(),
    status_msg_id: null,
    created_at: now,
    last_thread_activity: null,
    updated_at: now,
  };
}

/** Pastikan semua field ada dan valid (data lama / hasil migrasi). */
function normalizeAccount(acc) {
  const skills = isPlainObject(acc.skills) ? acc.skills : {};

  // Farming skill
  const farming = isPlainObject(skills.farming) ? skills.farming : {};
  const farmLevel = Math.min(G.MAX_LEVEL, Math.max(1, Math.floor(Number(farming.level) || 1)));
  let farmExp = Math.max(0, Number(farming.exp) || 0);
  farmExp = farmLevel >= G.MAX_LEVEL ? 0 : Math.min(farmExp, expToNext(farmLevel) - 1);
  skills.farming = { level: farmLevel, exp: farmExp };

  // Mining skill
  const mining = isPlainObject(skills.mining) ? skills.mining : {};
  const mineLevel = Math.min(G.MAX_LEVEL, Math.max(1, Math.floor(Number(mining.level) || 1)));
  let mineExp = Math.max(0, Number(mining.exp) || 0);
  mineExp = mineLevel >= G.MAX_LEVEL ? 0 : Math.min(mineExp, expToNext(mineLevel) - 1);
  skills.mining = { level: mineLevel, exp: mineExp };

  // Fishing skill
  const fishing = isPlainObject(skills.fishing) ? skills.fishing : {};
  const fishLevel = Math.min(G.MAX_LEVEL, Math.max(1, Math.floor(Number(fishing.level) || 1)));
  let fishExp = Math.max(0, Number(fishing.exp) || 0);
  fishExp = fishLevel >= G.MAX_LEVEL ? 0 : Math.min(fishExp, expToNext(fishLevel) - 1);
  skills.fishing = { level: fishLevel, exp: fishExp };

  if (!Array.isArray(acc.thread_ids)) acc.thread_ids = [];
  if (acc.thread_id && !acc.thread_ids.includes(acc.thread_id)) acc.thread_ids = [acc.thread_id, ...acc.thread_ids];
  acc.thread_ids = acc.thread_ids.filter((id) => typeof id === 'string');

  acc.skills = skills;

  // Dungeon skill
  const dg = isPlainObject(skills.dungeon) ? skills.dungeon : {};
  const dgLevel = Math.min(G.MAX_LEVEL, Math.max(1, Math.floor(Number(dg.level) || 1)));
  let dgExp = Math.max(0, Number(dg.exp) || 0);
  dgExp = dgLevel >= G.MAX_LEVEL ? 0 : Math.min(dgExp, expToNext(dgLevel) - 1);
  skills.dungeon = { level: dgLevel, exp: dgExp };

  for (const key of ['seeds', 'harvests', 'plantings', 'inventory', 'items', 'boosts', 'ores', 'baits', 'dungeon_loot', 'potions']) {
    if (!isPlainObject(acc[key])) acc[key] = {};
  }
  if (!Array.isArray(acc.fishes)) acc.fishes = [];

  // Alat bawaan
  if (!((acc.inventory.hoe ?? 0) > 0)) acc.inventory.hoe = 1;
  for (const tool of ['pickaxe', 'rod', 'weapon', 'armor']) {
    acc.inventory[tool] = Math.max(0, Math.floor(Number(acc.inventory[tool]) || 0));
  }

  acc.viaz = Number(acc.viaz) || 0;
  acc.bought_plots = Math.max(0, Math.floor(Number(acc.bought_plots) || 0));
  acc.bought_backpack = Math.max(0, Math.floor(Number(acc.bought_backpack) || 0));
  acc.auto_plant = Boolean(acc.auto_plant);
  acc.mining_trip = isPlainObject(acc.mining_trip) ? acc.mining_trip : null;
  acc.auto_mining = Boolean(acc.auto_mining);
  acc.fishing_session = isPlainObject(acc.fishing_session) ? acc.fishing_session : null;
  acc.dungeon_run = isPlainObject(acc.dungeon_run) ? acc.dungeon_run : null;
  acc.lang = ['id', 'en'].includes(acc.lang) ? acc.lang : 'en';
  acc.progress = normalizeProgress(acc.progress);

  return acc;
}

/**
 * Pembacaan digabung (micro-batch): puluhan pemain yang butuh data dalam jendela 4 ms
 * diambil dengan SATU query `in (...)`, bukan puluhan round-trip.
 */
const READ_BATCH_WINDOW_MS = 4;
const READ_BATCH_MAX = 150;
const pendingReads = new Map(); // userId -> [{ resolve, reject }]
let readTimer = null;

async function runReadBatch() {
  readTimer = null;
  const ids = Array.from(pendingReads.keys());
  const waiting = new Map(pendingReads);
  pendingReads.clear();
  for (let i = 0; i < ids.length; i += READ_BATCH_MAX) {
    const part = ids.slice(i, i + READ_BATCH_MAX);
    try {
      const { data, error } = await supabase.from(TABLE_PLAYERS).select('*').in('user_id', part);
      if (error) throw error;
      const rows = new Map((data ?? []).map((r) => [r.user_id, r]));
      for (const id of part) for (const w of waiting.get(id)) w.resolve(rows.get(id) ?? null);
    } catch (e) {
      for (const id of part) for (const w of waiting.get(id)) w.reject(e);
    }
  }
}

function fetchRow(userId) {
  return new Promise((resolve, reject) => {
    const list = pendingReads.get(userId);
    if (list) list.push({ resolve, reject });
    else pendingReads.set(userId, [{ resolve, reject }]);
    if (!readTimer) readTimer = setTimeout(runReadBatch, READ_BATCH_WINDOW_MS);
  });
}

async function loadAccount(userId) {
  const buffered = writeBuffer.get(userId);
  if (buffered) return buffered.account;

  const now = Date.now();
  const cached = accountCache.get(userId);
  if (cached && now < cached.expiresAt) return cached.account;

  const data = await fetchRow(userId);
  if (!data) return null;

  const racedBuffered = writeBuffer.get(userId);
  if (racedBuffered) return racedBuffered.account;
  const racedCached = accountCache.get(userId);
  if (racedCached && Date.now() < racedCached.expiresAt) return racedCached.account;

  const account = normalizeAccount(data);
  cacheSet(userId, account);
  return account;
}

/** Simpan akun baru langsung ke DB (dipakai saat membuat akun). */
async function insertAccount(account) {
  await saveAccountNow(account);
  cacheSet(account.user_id, account);
}

async function saveAccountNow(account) {
  const row = pickColumns(account, new Date().toISOString());
  const { error } = await supabase.from(TABLE_PLAYERS).upsert(row, { onConflict: 'user_id' });
  if (error) {
    console.error('[GROWVIA] gagal simpan account', account.user_id, error.message);
    throw error;
  }
}

/** Token versi unik per proses supaya compare-and-delete write-behind aman di multi-proses. */
const nextVersion = () => `${Date.now()}:${process.pid}:${++versionCounter}`;

/** Simpan ke buffer (sinkron). Penulisan ke DB terjadi di flushWrites. */
function saveAccount(account) {
  const prev = writeBuffer.get(account.user_id);
  writeBuffer.set(account.user_id, { account, version: nextVersion(), since: prev?.since ?? Date.now() });
  cacheSet(account.user_id, account);
  if (!flushTimer) {
    flushTimer = setInterval(() => flushWrites(), FLUSH_INTERVAL_MS);
    if (flushTimer.unref) flushTimer.unref();
  }
}

/** Tulis satu potongan; berhasil -> hapus dari buffer (kalau belum ada versi lebih baru). */
async function writeChunk(chunk, now) {
  const rows = chunk.map(([, entry]) => pickColumns(entry.account, now));
  const { error } = await supabase.from(TABLE_PLAYERS).upsert(rows, { onConflict: 'user_id' });
  if (error) throw error;
  for (const [userId, entry] of chunk) {
    const current = writeBuffer.get(userId);
    if (!current) continue;
    if (current.version === entry.version) writeBuffer.delete(userId);
    else current.since = Date.now(); // ada perubahan baru selama menulis: mulai hitung umur lagi
  }
}

/**
 * Peredam beban: makin panjang antrean tulis, makin lama sebuah perubahan ditahan sebelum ditulis
 * (banyak klik pemain yang sama jadi satu tulisan). Antrean normal tetap ditulis tiap detik.
 */
const minWriteAge = (size) => (size > 8000 ? 4000 : size > 2000 ? 2000 : 0);

async function flushWrites(force = false) {
  if (flushing) return;
  flushing = true;
  try {
    const age = force ? 0 : minWriteAge(writeBuffer.size);
    const cutoff = Date.now() - age;
    const entries = Array.from(writeBuffer.entries()).filter(([, e]) => e.since <= cutoff);
    const now = new Date().toISOString();

    // Jalur cepat: serahkan ke write-behind Redis (di-drain ke Supabase tiap beberapa detik).
    if (entries.length && writeBehind.isEnabled()) {
      const ok = await writeBehind.enqueue(entries, (entry) => pickColumns(entry.account, now));
      if (ok) {
        for (const [userId, entry] of entries) {
          const current = writeBuffer.get(userId);
          if (current && current.version === entry.version) writeBuffer.delete(userId);
        }
        return;
      }
      // Gagal: lanjut ke jalur langsung di bawah.
    }

    const chunks = [];
    for (let i = 0; i < entries.length; i += FLUSH_CHUNK) chunks.push(entries.slice(i, i + FLUSH_CHUNK));
    let next = 0;
    const worker = async () => {
      while (next < chunks.length) {
        const chunk = chunks[next++];
        try {
          await writeChunk(chunk, now);
        } catch (e) {
          console.error('[GROWVIA] flush account gagal:', e.message);
          // Satu baris bermasalah tidak boleh menahan ratusan pemain lain: coba satu per satu.
          if (chunk.length > 1) {
            for (const one of chunk) await writeChunk([one], now).catch((err) => console.error('[GROWVIA] flush baris gagal:', one[0], err.message));
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(FLUSH_CONCURRENCY, chunks.length) }, worker));
  } catch (e) {
    console.error('[GROWVIA] flush account error:', e.message);
  } finally {
    flushing = false;
    if (writeBuffer.size === 0 && flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }
}

async function flushNow() {
  while (flushing) await new Promise((resolve) => setTimeout(resolve, 25));
  await flushWrites(true);
  if (writeBehind.isEnabled()) await writeBehind.drainNow(); // pastikan tidak ada yang tertinggal di Redis
}

/* ============ Statistik global (cache 60 detik) ============ */
let globalStats = { playerCount: 0, avgLevel: 1, expiresAt: 0 };
let statsWarned = false;

async function getGlobalStats() {
  const now = Date.now();
  if (now < globalStats.expiresAt) return globalStats;

  const { data, error } = await supabase.rpc('player_stats');
  if (error || !Array.isArray(data) || !data[0]) {
    if (!statsWarned) {
      console.warn('[GROWVIA] rpc player_stats gagal:', error?.message);
      statsWarned = true;
    }
    globalStats = { ...globalStats, expiresAt: now + GLOBAL_STATS_TTL_MS };
    return globalStats;
  }
  globalStats = {
    playerCount: Number(data[0].player_count) || 0,
    avgLevel: Math.max(1, Math.floor(Number(data[0].avg_farming_level) || 1)),
    expiresAt: now + GLOBAL_STATS_TTL_MS,
  };
  return globalStats;
}

async function getIdleThreadUserIds(cutoffIso, limit = 200) {
  const { data, error } = await supabase
    .from(TABLE_PLAYERS)
    .select('user_id')
    .not('thread_id', 'is', null)
    .or(`last_thread_activity.is.null,last_thread_activity.lt.${cutoffIso}`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => row.user_id);
}

/* ============ Lock, rate limit, kepemilikan thread ============ */
function withUserLock(userId, fn) {
  return withDistLock(userId, fn);
}

/** Aksi yang mengubah data: min 300 ms antar klik per pemain. */
function checkRateLimit(userId) {
  const now = Date.now();
  const last = rateLimitMap.get(userId);
  if (last && now - last < RATE_LIMIT_MS) return false;
  rateLimitMap.set(userId, now);
  return true;
}

/** Aksi baca (buka menu, refresh): batas longgar 100 ms supaya spam klik tidak menumpuk antrean lock. */
function checkReadLimit(userId) {
  const now = Date.now();
  const last = readLimitMap.get(userId);
  if (last && now - last < READ_LIMIT_MS) return false;
  readLimitMap.set(userId, now);
  return true;
}

const cacheStats = () => ({ cached: accountCache.size, buffered: writeBuffer.size });

module.exports = {
  defaultAccount,
  loadAccount,
  insertAccount,
  saveAccount,
  saveAccountNow,
  getGlobalStats,
  getIdleThreadUserIds,
  withUserLock,
  checkRateLimit,
  checkReadLimit,
  cacheStats,
  flushNow,
  flushWrites,
};
