'use strict';

/**
 * Simulasi ekonomi Growvia: XP/jam dan Viaz/jam tiap aktivitas per level (main optimal, halving ×1).
 * Asumsi: alat terbaik yang terbuka di level itu, plot gratis saja (tanpa beli), auto aktif sejak Lv 10,
 * sebelum Lv 10 maksimal 12 siklus manual per jam. Dungeon disimulasikan pakai logika combat asli, 4 detik/giliran.
 *
 * Jalankan: node scripts/balance-sim.js
 */

const G = require('../src/config/game');
const { SEEDS } = require('../src/data/seeds');
const { CAVES, getOre } = require('../src/data/ores');
const { FISHES, BASE_STRIKE_MS, getUnlockedBaits } = require('../src/data/fishes');
const { POTIONS, getLoot, getUnlockedDungeons } = require('../src/data/dungeons');
const { getToolList } = require('../src/data/tools');
const { expToNext } = require('../src/lib/farmLogic');
const { oreYieldMult, caveWeights } = require('../src/lib/miningLogic');
const D = require('../src/lib/dungeonLogic');

const HOUR = 3600_000;
const MANUAL_CYCLES_PER_HOUR = 12;
const SECONDS_PER_TURN = 4;
const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function bestTool(type, level) {
  return getToolList(type).filter((t) => t.unlockLevel <= level).pop() ?? null;
}

function cyclesPerHour(ms, level, autoLevel) {
  const raw = HOUR / Math.max(1000, ms);
  return level >= autoLevel ? raw : Math.min(raw, MANUAL_CYCLES_PER_HOUR);
}

function farm(level) {
  const hoe = bestTool('hoe', level);
  const plots = G.START_PLOTS + Math.floor(level / G.MILESTONE_EVERY_LEVELS) * G.PLOTS_PER_MILESTONE;
  let best = { xp: 0, income: 0 };
  for (const s of SEEDS.filter((x) => x.levelUnlock <= level)) {
    const cph = cyclesPerHour(s.growMs * hoe.speedMult, level, G.AUTO_PLANT_LEVEL);
    const xp = plots * s.xp * cph;
    const income = plots * (s.sellPrice - s.buyPrice * (1 - G.SEED_RETURN_RATE)) * cph;
    if (xp > best.xp) best = { xp, income, pick: s.id };
  }
  return best;
}

function mining(level) {
  const pick = bestTool('pickaxe', Math.max(level, 10)) ?? bestTool('pickaxe', 10);
  let best = { xp: 0, income: 0 };
  for (const c of CAVES.filter((x) => x.unlockLevel <= level)) {
    const tph = cyclesPerHour(c.baseDurationMs * pick.speedMult, level, 10);
    const w = caveWeights(c);
    const wSum = w.reduce((a, b) => a + b, 0);
    const avgOre = c.oreIds.reduce((acc, id, i) => {
      const o = getOre(id);
      return { xp: acc.xp + (o.xp * w[i]) / wSum, price: acc.price + (o.sellPrice * w[i]) / wSum };
    }, { xp: 0, price: 0 });
    const ores = ((c.minDrop + c.maxDrop) / 2) * oreYieldMult(level);
    const xp = tph * ores * avgOre.xp;
    if (xp > best.xp) best = { xp, income: tph * ores * avgOre.price, pick: c.id };
  }
  return best;
}

function fishing(level) {
  const rod = bestTool('rod', level);
  const sph = HOUR / (BASE_STRIKE_MS * rod.speedMult);
  let best = { xp: 0, income: 0 };
  for (const b of getUnlockedBaits(level)) {
    let value = 0;
    b.pool.forEach((pct, i) => {
      const list = FISHES.filter((f) => f.rarity === RARITY[i]);
      const avg = list.reduce((s, f) => s + ((f.minLbs + f.maxLbs) / 2) * rod.weightMult * f.pricePerLb, 0) / list.length;
      value += (pct / 100) * avg;
    });
    const xp = sph * b.xp;
    const income = sph * (value - b.cost);
    if (xp > best.xp) best = { xp, income, pick: b.id };
  }
  return best;
}

/** rng deterministik supaya hasil sim stabil antar run. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dungeon(level, runs = 150, onlyId = null) {
  const weapon = bestTool('weapon', level);
  const armor = bestTool('armor', level);
  let best = { xp: 0, income: 0, win: 0 };
  for (const d of getUnlockedDungeons(level).filter((x) => !onlyId || x.id === onlyId)) {
    const rng = mulberry(level * 1000 + d.unlockLevel);
    let turns = 0;
    let xp = 0;
    let income = 0;
    let wins = 0;
    for (let r = 0; r < runs; r++) {
      const acc = {
        skills: { farming: { level: 30 }, mining: { level: 20 }, fishing: { level: 10 }, dungeon: { level, exp: 0 } },
        inventory: { weapon: weapon?.tier ?? 0, armor: armor?.tier ?? 0 },
        potions: Object.fromEntries(POTIONS.map((p) => [p.id, 99])),
        dungeon_loot: {},
        viaz: 1e12,
        bought_backpack: 100,
      };
      const res0 = D.startRun(acc, d.id, 0);
      if (!res0.ok) break;
      income -= res0.fee ?? 0;
      let finished = null;
      for (let t = 0; t < 400 && !finished; t++) {
        const run = acc.dungeon_run;
        // Strategi sederhana: ramuan terkecil yang cukup menutup HP hilang, sisanya serang.
        const missing = run.max_hp - run.hp;
        const pick = POTIONS.find((p) => p.heal >= missing * 0.8) ?? POTIONS[POTIONS.length - 1];
        const usePotion = run.hp < run.max_hp * 0.4 && (run.potions_used ?? 0) < D.POTIONS_PER_RUN;
        if (usePotion) income -= pick.cost;
        const action = usePotion ? `potion:${pick.id}` : run.enemy.charging ? 'defend' : 'attack';
        const res = D.act(acc, action, rng);
        turns += 1;
        finished = res.finished ?? null;
      }
      if (!finished) break;
      if (finished.outcome === 'win') wins += 1;
      xp += finished.xp;
      income += finished.viaz;
      for (const [id, q] of Object.entries(finished.loot)) income += (getLoot(id)?.sellPrice ?? 0) * q;
    }
    const hours = (turns * SECONDS_PER_TURN) / 3600;
    if (!hours) continue;
    const xph = xp / hours;
    if (xph > best.xp) best = { xp: xph, income: income / hours, win: wins / runs, pick: d.id, runsPerHour: runs / hours, turnsPerRun: turns / runs };
  }
  return best;
}

/** Jam untuk naik dari Lv 1 ke `target` dengan fungsi laju `rate(level).xp`. */
function hoursTo(target, rate, start = 1) {
  let h = 0;
  for (let l = start; l < target; l++) h += expToNext(l) / Math.max(1e-9, rate(l).xp);
  return h;
}

function report() {
  const levels = [1, 5, 10, 20, 30, 40, 50, 60, 75, 90, 100];
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0)).padStart(8);
  console.log('Lv  | farm XP  farm Vz | mine XP  mine Vz | fish XP  fish Vz | dung XP  dung Vz  win');
  for (const L of levels) {
    const f = farm(L), m = mining(L), fi = fishing(L), d = dungeon(L, 60);
    console.log(`${String(L).padStart(3)} |${fmt(f.xp)}${fmt(f.income)} |${fmt(m.xp)}${fmt(m.income)} |${fmt(fi.xp)}${fmt(fi.income)} |${fmt(d.xp)}${fmt(d.income)} ${(d.win * 100).toFixed(0).padStart(3)}%`);
  }
  console.log('\nJam main untuk mencapai level:');
  for (const T of [10, 20, 30, 50, 100]) {
    console.log(`Lv ${String(T).padStart(3)}: farm ${hoursTo(T, farm).toFixed(0)}h · mine ${hoursTo(T, mining).toFixed(0)}h · fish ${hoursTo(T, fishing).toFixed(0)}h · dungeon ${hoursTo(T, (l) => dungeon(l, 30)).toFixed(0)}h`);
  }
}

if (require.main === module) report();

module.exports = { farm, mining, fishing, dungeon, hoursTo, bestTool };
