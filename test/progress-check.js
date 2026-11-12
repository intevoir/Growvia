'use strict';

/**
 * Self-check sistem retensi: statistik, achievement, koleksi, quest + streak, Ascension.
 * Murni logika, tanpa .env / Supabase / Discord. Jalankan: node test/progress-check.js
 */

const assert = require('node:assert');
process.env.GROWVIA_CLOCK_FILE = require('node:path').join(__dirname, 'clock-test.json'); // isolasi file jam selama tes
const G = require('../src/config/game');
const P = require('../src/lib/progress');
const { addXp, xpMultiplier } = require('../src/lib/xp');
const { price, setRate } = require('../src/lib/viazRate');
const { ACHIEVEMENTS, getAchievement } = require('../src/data/achievements');
const { QUEST_TYPES } = require('../src/data/quests');

function newAccount(id = 'u1') {
  return {
    user_id: id,
    username: 'tester',
    skills: { farming: { level: 1, exp: 0 }, mining: { level: 1, exp: 0 }, fishing: { level: 1, exp: 0 }, dungeon: { level: 1, exp: 0 } },
    viaz: 0,
    seeds: { ...G.START_SEEDS },
    harvests: {}, plantings: {}, ores: {}, baits: {}, fishes: [], dungeon_loot: {}, potions: {},
    bought_plots: 0, bought_backpack: 0, auto_plant: false, auto_mining: false,
    mining_trip: null, fishing_session: null, dungeon_run: null,
    inventory: { hoe: 1, pickaxe: 0, rod: 0, weapon: 0, armor: 0 },
    progress: P.defaultProgress(),
  };
}

const DAY = 86_400_000;
const T0 = Date.UTC(2030, 0, 10, 12, 0, 0); // siang UTC = sore WIB, hari yang sama di WIB

/* ---- Data achievement ---- */
{
  const ids = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(!ids.has(a.id), `id ganda ${a.id}`);
    ids.add(a.id);
    assert.ok(a.goal > 0 && a.reward > 0 && a.name && a.en && a.desc && a.descEn, `data lengkap ${a.id}`);
  }
  assert.ok(ACHIEVEMENTS.length >= 60, 'cukup banyak pencapaian untuk retensi jangka panjang');
  // Reward naik per tier dalam satu stat.
  const byStat = {};
  for (const a of ACHIEVEMENTS) (byStat[a.stat] ??= []).push(a);
  for (const [stat, list] of Object.entries(byStat)) {
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].goal > list[i - 1].goal && list[i].reward > list[i - 1].reward, `tier ${stat} harus naik`);
    }
  }
}

/* ---- normalize: data rusak jadi aman ---- */
{
  const n = P.normalizeProgress({ stats: { harvested: 'abc', mined: -5 }, ach: [], unseen: ['bukan_id', 'harvested_100'], prestige: 999, q: { streak: 'x' } });
  assert.strictEqual(n.stats.harvested, 0);
  assert.strictEqual(n.stats.mined, 0);
  assert.deepStrictEqual(n.ach, {});
  assert.deepStrictEqual(n.unseen, ['harvested_100']);
  assert.strictEqual(n.prestige, G.MAX_PRESTIGE);
  assert.strictEqual(n.q.streak, 0);
  assert.deepStrictEqual(P.normalizeProgress(null), P.defaultProgress());
}

/* ---- record + achievement ---- */
{
  setRate(1);
  const a = newAccount();
  P.record(a, 'harvest', 60, { seedId: 'gandum' });
  assert.strictEqual(a.viaz, 0, 'belum mencapai 100');
  P.record(a, 'harvest', 60, { seedId: 'wortel' });
  assert.strictEqual(a.progress.stats.harvested, 120);
  assert.ok(a.progress.ach.harvested_100, 'achievement 100 panen terbuka');
  assert.strictEqual(a.viaz, getAchievement('harvested_100').reward, 'hadiah Viaz masuk');
  assert.strictEqual(a.progress.coll.crops.gandum, 60);
  const news = P.drainUnseen(a);
  assert.deepStrictEqual(news.map((x) => x.id), ['harvested_100']);
  assert.deepStrictEqual(P.drainUnseen(a), [], 'unseen dikosongkan');
  P.record(a, 'harvest', 10, { seedId: 'gandum' });
  assert.strictEqual(a.viaz, getAchievement('harvested_100').reward, 'tidak dobel hadiah');

  // Hadiah ikut kurs halving
  setRate(0.5);
  const b = newAccount();
  P.record(b, 'harvest', 100, { seedId: 'gandum' });
  assert.strictEqual(b.viaz, price(getAchievement('harvested_100').reward));
  assert.strictEqual(b.viaz, 250);
  setRate(1);
}

/* ---- Ikan: koleksi + ikan terberat ---- */
{
  const a = newAccount();
  P.record(a, 'fish', 1, { fish: { id: 'tuna', rarity: 'rare', weight: 60 } });
  P.record(a, 'fish', 1, { fish: { id: 'tuna', rarity: 'rare', weight: 40 } });
  P.record(a, 'fish', 1, { fish: { id: 'teri', rarity: 'common', weight: 3 } });
  assert.strictEqual(a.progress.coll.fish.tuna, 60, 'simpan bobot terberat per spesies');
  assert.deepStrictEqual(a.progress.best.fish, { id: 'tuna', weight: 60 });
  assert.ok(a.progress.ach.heaviest_50);
  assert.ok(!a.progress.ach.heaviest_200);
  assert.strictEqual(P.statValue(a, 'fish_species'), 2);
}

/* ---- Level naik membuka achievement level ---- */
{
  const a = newAccount();
  const { expToNext } = require('../src/lib/xp');
  let need = 0;
  for (let l = 1; l < 10; l++) need += expToNext(l);
  addXp(a, 'farming', need);
  assert.strictEqual(a.skills.farming.level, 10);
  assert.ok(a.progress.ach.farming_lv_10, 'level 10 membuka achievement');
}

/* ---- Quest: deterministik, reset harian, target sesuai level ---- */
{
  const a = newAccount('quest-user');
  const q1 = P.ensureQuests(a, T0);
  assert.ok(q1.list.length >= 1 && q1.list.length <= G.DAILY_QUESTS);
  const snapshot = JSON.stringify(q1.list);
  const again = newAccount('quest-user');
  assert.strictEqual(JSON.stringify(P.ensureQuests(again, T0).list), snapshot, 'pemain sama + hari sama = quest sama');
  assert.strictEqual(P.ensureQuests(a, T0 + 1000).list, q1.list, 'tidak dibuat ulang di hari yang sama');
  const next = P.ensureQuests(a, T0 + DAY);
  assert.notStrictEqual(P.ensureQuests(a, T0 + DAY).day, P.dayKey(T0));
  assert.strictEqual(next.day, P.dayKey(T0 + DAY));

  // Quest hanya jenis yang terbuka
  const fresh = newAccount();
  for (const x of P.ensureQuests(fresh, T0).list) assert.ok(['harvest', 'earn'].includes(x.t), `pemula tidak dapat quest ${x.t}`);

  // Target dan hadiah naik dengan level
  const high = newAccount();
  for (const k of Object.keys(high.skills)) high.skills[k].level = 80;
  assert.ok(P.questTarget(high, 'harvest') > P.questTarget(fresh, 'harvest'));
  assert.ok(P.questTarget(high, 'earn') > P.questTarget(fresh, 'earn'));
  assert.ok(P.questReward(high, 'earn', 1) > P.questReward(fresh, 'earn', 1));
  assert.ok(P.questTarget(high, 'earn', 7) === P.questTarget(high, 'earn', 1) * 7);
  assert.deepStrictEqual(P.ensureQuests(high, T0).list.map((x) => x.t).sort().length, G.DAILY_QUESTS);
  for (const t of Object.keys(QUEST_TYPES)) assert.ok(QUEST_TYPES[t].en.includes('{n}') && QUEST_TYPES[t].name.includes('{n}'));
}

/* ---- Quest: progres, klaim, bonus, streak ---- */
{
  setRate(1);
  const a = newAccount('streaker');
  const q = P.ensureQuests(a, T0);
  assert.deepStrictEqual(P.claimQuests(a, T0), { ok: false, code: 'nothing_to_claim' });

  // Selesaikan semua quest harian lewat record() (harvest + earn)
  const harvestQ = q.list.find((x) => x.t === 'harvest');
  const earnQ = q.list.find((x) => x.t === 'earn');
  assert.ok(harvestQ && earnQ, 'pemula dapat harvest + earn');
  const realNow = Date.now;
  Date.now = () => T0;
  try {
    P.record(a, 'harvest', harvestQ.need, { seedId: 'gandum' });
    P.record(a, 'earn', earnQ.need);
  } finally {
    Date.now = realNow;
  }
  assert.ok(P.isDone(harvestQ) && P.isDone(earnQ));
  const before = a.viaz;
  const res = P.claimQuests(a, T0);
  assert.ok(res.ok && res.count >= 2);
  assert.ok(res.bonus > 0, 'semua quest harian selesai = bonus');
  assert.strictEqual(res.streak, 1);
  assert.ok(a.viaz > before + res.total - 1);
  assert.strictEqual(a.progress.stats.quests, res.count);
  assert.strictEqual(P.claimQuests(a, T0).code, 'nothing_to_claim', 'tidak bisa klaim dua kali');
  assert.ok(q.list.every((x) => x.claimed));

  // Hari berikutnya: streak naik
  const q2 = P.ensureQuests(a, T0 + DAY);
  q2.list[0].got = q2.list[0].need;
  assert.strictEqual(P.claimQuests(a, T0 + DAY).streak, 2, 'klaim hari beruntun = streak 2');
  assert.ok(P.streakMult(2) > P.streakMult(1));
  assert.strictEqual(a.progress.q.best, 2);

  // Lewat 2 hari tanpa klaim: streak putus
  assert.strictEqual(P.activeStreak(a, T0 + 3 * DAY), 0);
  const q3 = P.ensureQuests(a, T0 + 3 * DAY);
  q3.list[0].got = q3.list[0].need;
  assert.strictEqual(P.claimQuests(a, T0 + 3 * DAY).streak, 1, 'streak mulai lagi dari 1');
  assert.strictEqual(a.progress.q.best, 2, 'rekor streak tetap tersimpan');

  // Bonus streak dibatasi
  assert.strictEqual(P.streakMult(1000), 1 + G.STREAK_BONUS_MAX_DAYS * G.STREAK_BONUS_PER_DAY);
}

/* ---- Zona waktu: reset jam 00:00 WIB ---- */
{
  const justBefore = Date.UTC(2030, 0, 10, 16, 59, 0); // 23:59 WIB
  const justAfter = Date.UTC(2030, 0, 10, 17, 1, 0); // 00:01 WIB hari berikutnya
  assert.notStrictEqual(P.dayKey(justBefore), P.dayKey(justAfter));
  assert.strictEqual(P.weekKey(Date.UTC(2030, 0, 7, 0, 0, 0)), P.weekKey(Date.UTC(2030, 0, 9, 0, 0, 0)), 'Senin-Rabu satu minggu');
  assert.notStrictEqual(P.weekKey(Date.UTC(2030, 0, 13, 12, 0, 0)), P.weekKey(Date.UTC(2030, 0, 14, 12, 0, 0)), 'Minggu vs Senin beda minggu');
}

/* ---- Ascension ---- */
{
  const a = newAccount();
  assert.strictEqual(P.ascendCheck(a).code, 'ascend_locked');
  for (const k of Object.keys(a.skills)) a.skills[k].level = 63; // 252 total
  assert.ok(P.ascendCheck(a).ok);
  a.plantings = { gandum: { qty: 1, planted_at: 0, finished_at: 0 } };
  assert.strictEqual(P.ascendCheck(a).code, 'ascend_busy', 'tidak bisa saat ada aktivitas');
  a.plantings = {};

  a.viaz = 12345;
  a.inventory = { hoe: 4, pickaxe: 3, rod: 2, weapon: 2, armor: 2 };
  a.bought_backpack = 7;
  a.bought_plots = 30;
  a.progress.stats.harvested = 5000;
  assert.ok(P.ascend(a).ok);
  assert.strictEqual(a.progress.prestige, 1);
  assert.strictEqual(P.statValue(a, 'total_lv'), 4, 'skill kembali Lv 1');
  assert.strictEqual(a.viaz, getAchievement('prestige_1').reward, 'Viaz direset, hanya hadiah Ascension');
  assert.deepStrictEqual(a.inventory, { hoe: 1, pickaxe: 0, rod: 0, weapon: 0, armor: 0 });
  assert.deepStrictEqual(a.seeds, { gandum: 100 });
  assert.strictEqual(a.bought_backpack, 7, 'tas dipertahankan');
  assert.strictEqual(a.bought_plots, 30, 'plot dipertahankan');
  assert.strictEqual(a.progress.stats.harvested, 5000, 'statistik dipertahankan');

  // Bonus permanen
  assert.strictEqual(xpMultiplier(a), 1 + G.PRESTIGE_XP_BONUS);
  assert.strictEqual(P.sellBonus(a), 1 + G.PRESTIGE_SELL_BONUS);
  a.skills.mining.level = 50;
  addXp(a, 'mining', 100);
  assert.strictEqual(a.skills.mining.exp, Math.round(100 * (1 + G.PRESTIGE_XP_BONUS)));

  // Batas maksimum
  a.progress.prestige = G.MAX_PRESTIGE;
  for (const k of Object.keys(a.skills)) a.skills[k].level = 100;
  assert.strictEqual(P.ascendCheck(a).code, 'max_prestige');
}

console.log(`progress-check: semua lolos (${ACHIEVEMENTS.length} achievement, koleksi, quest, streak WIB, Ascension)`);
