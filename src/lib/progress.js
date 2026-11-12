'use strict';

/**
 * Sistem retensi (murni, tanpa I/O): statistik seumur hidup, koleksi, achievement,
 * quest harian/mingguan + streak, dan Ascension (prestige).
 * Semua tersimpan di satu kolom jsonb `players.progress`.
 *
 * Titik masuk: record(account, event, amount, extra). Dipanggil dari logika game (panen, tambang,
 * pancing, dungeon, jual). Pemanggil tetap bertugas menyimpan account.
 */

const G = require('../config/game');
const { now: clockNow } = require('./clock');
const { ACHIEVEMENTS, BY_STAT, getAchievement } = require('../data/achievements');
const { QUEST_TYPES, QUEST_IDS } = require('../data/quests');
const { SKILLS, skillLevel, hooks } = require('./xp');
const { price } = require('./viazRate');
const { effectOf } = require('./boosts');

const lazy = (path) => require(path); // hindari import melingkar (farmLogic <-> progress)
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/* ============ Bentuk data ============ */

function defaultProgress() {
  return {
    stats: { harvested: 0, mined: 0, fished: 0, clears: 0, kills: 0, earned: 0, quests: 0 },
    best: { fish: null },
    coll: { crops: {}, ores: {}, fish: {}, mobs: {} },
    ach: {},
    unseen: [],
    q: { day: '', list: [], week: '', wlist: [], streak: 0, best: 0, last: '', bonusDay: '' },
    prestige: 0,
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Lengkapi / bersihkan data dari DB (data lama atau rusak). */
function normalizeProgress(raw) {
  const d = defaultProgress();
  const p = isObj(raw) ? raw : {};
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  for (const k of Object.keys(d.stats)) d.stats[k] = Math.max(0, num(p.stats?.[k]));
  d.best.fish = isObj(p.best?.fish) ? { id: String(p.best.fish.id), weight: num(p.best.fish.weight) } : null;
  for (const k of Object.keys(d.coll)) d.coll[k] = isObj(p.coll?.[k]) ? p.coll[k] : {};
  d.ach = isObj(p.ach) ? p.ach : {};
  d.unseen = Array.isArray(p.unseen) ? p.unseen.filter((id) => getAchievement(id)).slice(0, 50) : [];
  const q = isObj(p.q) ? p.q : {};
  d.q = {
    day: String(q.day ?? ''),
    list: Array.isArray(q.list) ? q.list : [],
    week: String(q.week ?? ''),
    wlist: Array.isArray(q.wlist) ? q.wlist : [],
    streak: Math.max(0, Math.floor(num(q.streak))),
    best: Math.max(0, Math.floor(num(q.best))),
    last: String(q.last ?? ''),
    bonusDay: String(q.bonusDay ?? ''),
  };
  d.prestige = Math.min(G.MAX_PRESTIGE, Math.max(0, Math.floor(num(p.prestige))));
  return d;
}

function ensure(account) {
  if (!account.progress) account.progress = defaultProgress();
  return account.progress;
}

const prestigeOf = (account) => account.progress?.prestige ?? 0;
/** Pengali hasil jual dari prestige. */
const sellBonus = (account) => (1 + G.PRESTIGE_SELL_BONUS * prestigeOf(account)) * effectOf(account, 'sell');

/* ============ Achievement ============ */

function statValue(account, stat) {
  const p = ensure(account);
  const s = p.stats;
  switch (stat) {
    case 'harvested': return s.harvested;
    case 'mined': return s.mined;
    case 'fished': return s.fished;
    case 'clears': return s.clears;
    case 'kills': return s.kills;
    case 'earned': return s.earned;
    case 'quests': return s.quests;
    case 'streak': return p.q.best;
    case 'heaviest': return p.best.fish?.weight ?? 0;
    case 'fish_species': return Object.keys(p.coll.fish).length;
    case 'ores_found': return Object.keys(p.coll.ores).length;
    case 'mobs_found': return Object.keys(p.coll.mobs).length;
    case 'crops_found': return Object.keys(p.coll.crops).length;
    case 'total_lv': return SKILLS.reduce((sum, k) => sum + skillLevel(account, k), 0);
    case 'prestige': return p.prestige;
    default:
      return stat.endsWith('_lv') ? skillLevel(account, stat.slice(0, -3)) : 0;
  }
}

/** Buka achievement yang syaratnya terpenuhi untuk stat yang berubah. Hadiah Viaz langsung masuk. */
function check(account, stats) {
  const p = ensure(account);
  const unlocked = [];
  for (const stat of stats) {
    const list = BY_STAT.get(stat);
    if (!list) continue;
    const value = statValue(account, stat);
    for (const a of list) {
      if (p.ach[a.id] || value < a.goal) continue;
      p.ach[a.id] = Date.now();
      account.viaz = round2((account.viaz ?? 0) + price(a.reward));
      if (p.unseen.length < 50) p.unseen.push(a.id);
      unlocked.push(a);
    }
  }
  return unlocked;
}

/** Ambil & kosongkan achievement yang belum diumumkan ke pemain. */
function drainUnseen(account) {
  const p = account.progress;
  if (!p?.unseen?.length) return [];
  const list = p.unseen.map(getAchievement).filter(Boolean);
  p.unseen = [];
  return list;
}

hooks.onLevel = (account) => check(account, ['farming_lv', 'mining_lv', 'fishing_lv', 'dungeon_lv', 'total_lv']);

/* ============ Quest ============ */

const dayKey = (now) => new Date(now + G.DAY_OFFSET_MS).toISOString().slice(0, 10);
const prevDay = (key) => new Date(Date.parse(`${key}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
function weekKey(now) {
  const d = new Date(now + G.DAY_OFFSET_MS);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

/** RNG deterministik dari string (quest tiap pemain konsisten sepanjang hari). */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quest apa saja yang sudah terbuka untuk pemain ini. */
function eligibleTypes(account) {
  const types = ['harvest', 'earn'];
  if (skillLevel(account, 'farming') >= 10) types.push('mine');
  if (lazy('./fishingLogic').canFish(account)) types.push('fish');
  if (lazy('./dungeonLogic').meetsRequirements(account)) types.push('dungeon');
  return types;
}

function questLevel(account, type) {
  const skill = QUEST_TYPES[type].skill;
  return skill ? skillLevel(account, skill) : Math.max(...SKILLS.map((k) => skillLevel(account, k)));
}

/** Target quest sesuai kemampuan pemain (dikali `span` untuk mingguan). */
function questTarget(account, type, span = 1) {
  const lvl = questLevel(account, type);
  let n;
  switch (type) {
    case 'harvest': {
      const plots = G.START_PLOTS + Math.floor(skillLevel(account, 'farming') / G.MILESTONE_EVERY_LEVELS) * G.PLOTS_PER_MILESTONE + (account.bought_plots ?? 0);
      n = Math.round((plots * 1.5) / 10) * 10;
      break;
    }
    case 'mine': n = Math.round(6 * lazy('./miningLogic').oreYieldMult(lvl) * 3); break;
    case 'fish': n = 15; break;
    case 'dungeon': n = 2; break;
    default: n = Math.round(1500 * (1 + lvl) ** 1.2 / 100) * 100; // earn
  }
  return Math.max(1, n * span);
}

const questReward = (account, type, span) => Math.round(250 * (1 + questLevel(account, type)) ** 1.2 * (span > 1 ? span * 0.85 : 1));

function buildQuests(account, seedKey, count, span) {
  const rng = seeded(`${account.user_id}:${seedKey}`);
  const pool = eligibleTypes(account);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((t) => ({ t, need: questTarget(account, t, span), got: 0, reward: questReward(account, t, span), claimed: false }));
}

/** Pastikan quest hari ini / minggu ini ada (reset otomatis tengah malam WIB). */
function ensureQuests(account, now = clockNow()) {
  const q = ensure(account).q;
  const today = dayKey(now);
  if (q.day !== today) {
    q.day = today;
    q.list = buildQuests(account, today, G.DAILY_QUESTS, 1);
  }
  const wk = weekKey(now);
  if (q.week !== wk) {
    q.week = wk;
    q.wlist = buildQuests(account, `w${wk}`, G.WEEKLY_QUESTS, 7);
  }
  return q;
}

function bumpQuests(account, type, amount) {
  const q = ensureQuests(account);
  for (const quest of [...q.list, ...q.wlist]) {
    if (quest.t === type && quest.got < quest.need) quest.got = Math.min(quest.need, quest.got + amount);
  }
}

/** Streak yang masih berlaku (putus kalau kemarin tidak klaim). */
function activeStreak(account, now = clockNow()) {
  const q = ensure(account).q;
  return q.last === dayKey(now) || q.last === prevDay(dayKey(now)) ? q.streak : 0;
}

const streakMult = (streak) => 1 + Math.min(streak, G.STREAK_BONUS_MAX_DAYS) * G.STREAK_BONUS_PER_DAY;
const isDone = (quest) => quest.got >= quest.need;

/** Klaim semua quest selesai. Mengembalikan { ok, count, total, bonus, streak, mult } atau { ok:false, code }. */
function claimQuests(account, now = clockNow()) {
  const q = ensureQuests(account, now);
  const ready = [...q.list, ...q.wlist].filter((x) => isDone(x) && !x.claimed);
  if (!ready.length) return { ok: false, code: 'nothing_to_claim' };

  const today = dayKey(now);
  const claimingDaily = ready.some((x) => q.list.includes(x));
  if (claimingDaily && q.last !== today) {
    q.streak = q.last === prevDay(today) ? q.streak + 1 : 1;
    q.best = Math.max(q.best, q.streak);
    q.last = today;
  }
  const streak = activeStreak(account, now);
  const mult = streakMult(streak);

  let total = 0;
  for (const x of ready) {
    x.claimed = true;
    total += x.reward;
  }
  let bonus = 0;
  if (q.list.length && q.list.every((x) => x.claimed) && q.bonusDay !== today) {
    q.bonusDay = today;
    bonus = Math.round(q.list.reduce((s, x) => s + x.reward, 0) * 0.5);
  }

  const gross = Math.round((total + bonus) * mult);
  const paid = price(gross);
  account.viaz = round2((account.viaz ?? 0) + paid);
  ensure(account).stats.quests += ready.length;
  check(account, ['quests', 'streak']);
  return { ok: true, count: ready.length, total: paid, bonus: price(Math.round(bonus * mult)), streak, mult };
}

/* ============ Ascension (prestige) ============ */

function ascendCheck(account) {
  if (prestigeOf(account) >= G.MAX_PRESTIGE) return { ok: false, code: 'max_prestige' };
  if (statValue(account, 'total_lv') < G.ASCEND_TOTAL_LEVELS) return { ok: false, code: 'ascend_locked' };
  const busy = Object.keys(account.plantings ?? {}).length || account.mining_trip || account.fishing_session || account.dungeon_run;
  if (busy) return { ok: false, code: 'ascend_busy' };
  return { ok: true };
}

/** Reset skill & harta, simpan koleksi, achievement, tas, plot, dan beri bonus permanen. */
function ascend(account) {
  const can = ascendCheck(account);
  if (!can.ok) return can;
  const p = ensure(account);
  p.prestige += 1;
  for (const k of SKILLS) account.skills[k] = { level: 1, exp: 0 };
  account.viaz = 0;
  account.seeds = { ...G.START_SEEDS };
  account.harvests = {};
  account.plantings = {};
  account.ores = {};
  account.baits = {};
  account.fishes = [];
  account.dungeon_loot = {};
  account.potions = {};
  account.auto_plant = false;
  account.auto_mining = false;
  account.inventory = { hoe: 1, pickaxe: 0, rod: 0, weapon: 0, armor: 0 };
  p.q.list = [];
  p.q.wlist = [];
  p.q.day = '';
  p.q.week = '';
  check(account, ['prestige', 'total_lv']);
  return { ok: true, prestige: p.prestige };
}

/* ============ Titik masuk ============ */

const QUEST_EVENT = { harvest: 'harvest', mine: 'mine', fish: 'fish', clear: 'dungeon', earn: 'earn' };

/**
 * record(account, event, amount, extra)
 *   harvest {seedId} | mine {ores} | fish {fish} | clear {dungeonId} | kill {monster} | earn
 */
function record(account, event, amount = 1, extra = {}) {
  if (!(amount > 0)) return;
  const p = ensure(account);
  const s = p.stats;
  const touched = [];
  switch (event) {
    case 'harvest':
      s.harvested += amount;
      if (extra.seedId) p.coll.crops[extra.seedId] = (p.coll.crops[extra.seedId] ?? 0) + amount;
      touched.push('harvested', 'crops_found');
      break;
    case 'mine':
      s.mined += amount;
      for (const [id, n] of Object.entries(extra.ores ?? {})) p.coll.ores[id] = (p.coll.ores[id] ?? 0) + n;
      touched.push('mined', 'ores_found');
      break;
    case 'fish': {
      s.fished += amount;
      const f = extra.fish;
      if (f) {
        p.coll.fish[f.id] = Math.max(p.coll.fish[f.id] ?? 0, f.weight);
        if (!p.best.fish || f.weight > p.best.fish.weight) p.best.fish = { id: f.id, weight: f.weight };
      }
      touched.push('fished', 'fish_species', 'heaviest');
      break;
    }
    case 'clear':
      s.clears += amount;
      touched.push('clears');
      break;
    case 'kill':
      s.kills += amount;
      if (extra.monster) p.coll.mobs[extra.monster] = (p.coll.mobs[extra.monster] ?? 0) + amount;
      touched.push('kills', 'mobs_found');
      break;
    case 'earn':
      s.earned = round2(s.earned + amount);
      touched.push('earned');
      break;
    default:
      return;
  }
  if (QUEST_EVENT[event]) bumpQuests(account, QUEST_EVENT[event], amount);
  check(account, touched);
}

module.exports = {
  defaultProgress, normalizeProgress, ensure, prestigeOf, sellBonus,
  statValue, check, drainUnseen,
  dayKey, weekKey, ensureQuests, claimQuests, activeStreak, streakMult, isDone, questTarget, questReward, QUEST_TYPES, QUEST_IDS,
  ascendCheck, ascend, record, ACHIEVEMENTS,
};
