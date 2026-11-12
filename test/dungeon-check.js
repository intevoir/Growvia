'use strict';

/** Self-check logika Dungeon. Jalankan: node test/dungeon-check.js */

const assert = require('node:assert');
const { DUNGEONS, LOOT, getMonster } = require('../src/data/dungeons');
const D = require('../src/lib/dungeonLogic');
const { canPlant } = require('../src/lib/activityLock');

function newAccount() {
  return {
    user_id: 'u1',
    skills: {
      farming: { level: 30, exp: 0 },
      mining: { level: 20, exp: 0 },
      fishing: { level: 10, exp: 0 },
      dungeon: { level: 1, exp: 0 },
    },
    viaz: 100000,
    seeds: {}, harvests: {}, plantings: {}, ores: {}, baits: {}, fishes: [],
    mining_trip: null, fishing_session: null, dungeon_run: null,
    dungeon_loot: {}, potions: {},
    bought_backpack: 0,
    inventory: { hoe: 1, weapon: 1 },
    items: { hoe_1: 1, weapon_1: 1 },
  };
}

// rng berurutan supaya hasil tes pasti.
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

/* ---- Data ---- */
assert.strictEqual(DUNGEONS.length, 5);
for (const d of DUNGEONS) {
  const last = getMonster(d.floors[d.floors.length - 1]);
  assert.ok(last.boss, `lantai terakhir ${d.id} harus boss`);
  for (const l of d.loot) assert.ok(LOOT.find((x) => x.id === l.id), `loot ${l.id} harus ada`);
}

/* ---- Syarat masuk ---- */
{
  const a = newAccount();
  a.viaz = 0;
  a.skills.fishing.level = 9;
  assert.strictEqual(D.startRun(a, 'goblin_cave').code, 'locked', 'butuh Fishing Lv 10');
  a.skills.fishing.level = 10;
  a.inventory.weapon = 0;
  assert.strictEqual(D.startRun(a, 'goblin_cave').code, 'no_weapon');
  a.inventory.weapon = 1;
  assert.strictEqual(D.startRun(a, 'rotting_swamp').code, 'level', 'dungeon Lv 10 terkunci');
  a.mining_trip = { cave_id: 'x' };
  assert.strictEqual(D.startRun(a, 'goblin_cave').code, 'busy_mining');
  a.mining_trip = null;
  assert.strictEqual(D.startRun(a, 'goblin_cave').code, 'no_viaz', 'biaya masuk wajib');
  a.viaz = 1000;
  const fee = DUNGEONS[0].fee;
  assert.ok(D.startRun(a, 'goblin_cave').ok);
  assert.strictEqual(a.viaz, 1000 - fee, 'biaya masuk dipotong');
  assert.strictEqual(D.startRun(a, 'goblin_cave').code, 'in_run');
  assert.strictEqual(canPlant(a).code, 'busy_dungeon', 'dungeon mengunci farming');
}

/* ---- Statistik dari gear ---- */
{
  const a = newAccount();
  const base = D.playerStats(a);
  a.inventory.armor = 1;
  const armored = D.playerStats(a);
  assert.ok(armored.def > base.def && armored.maxHp > base.maxHp);
  a.inventory.weapon = 5;
  assert.ok(D.playerStats(a).atk > base.atk + 50);
}

/* ---- Combat: attack, defend, potion ---- */
{
  const a = newAccount();
  D.startRun(a, 'goblin_cave');
  const run = a.dungeon_run;
  const startHp = run.hp;

  // Attack: rng 0.5 => damage normal, tidak crit (0.5 > 0.1)
  const r1 = D.act(a, 'attack', seq(0.5));
  assert.ok(r1.ok);
  assert.strictEqual(r1.events[0].type, 'hit');
  assert.ok(run.enemy.hp < run.enemy.max_hp);
  assert.strictEqual(r1.events[1].type, 'enemy_hit');
  assert.ok(run.hp < startHp);

  // Defend memotong damage musuh
  const hpBefore = run.hp;
  const r2 = D.act(a, 'defend', seq(0.5));
  const defendedDmg = r2.events[1].dmg;
  const r3 = D.act(a, 'attack', seq(0.5));
  assert.ok(defendedDmg < r3.events[1].dmg, 'defend mengurangi damage');
  assert.ok(run.hp < hpBefore);

  // Potion: tanpa stok gagal, dengan stok menyembuhkan
  assert.strictEqual(D.act(a, 'potion:potion_small').code, 'no_potion');
  a.potions.potion_small = 1;
  const hpLow = run.hp;
  const r4 = D.act(a, 'potion:potion_small', seq(0.5));
  assert.strictEqual(r4.events[0].type, 'potion');
  assert.ok(r4.events[0].healed > 0);
  assert.strictEqual(a.potions.potion_small, undefined, 'stok ramuan berkurang');
  assert.ok(run.hp > hpLow - r4.events[1].dmg - 1);

  // Maksimal 3 ramuan per run
  a.potions.potion_small = 10;
  run.potions_used = D.POTIONS_PER_RUN;
  assert.strictEqual(D.act(a, 'potion:potion_small', seq(0.5)).code, 'potion_limit');
  assert.strictEqual(a.potions.potion_small, 10, 'ramuan tidak terpakai saat batas');

  // Heavy bisa meleset (rng pertama < 0.3)
  const r5 = D.act(a, 'heavy', seq(0.1, 0.5));
  assert.strictEqual(r5.events[0].type, 'miss');
}

/* ---- Mekanik charge: serangan berikutnya x2.5, Heavy membatalkan, Defend menahan ---- */
{
  const a = newAccount();
  D.startRun(a, 'goblin_cave');
  const run = a.dungeon_run;
  run.hp = run.max_hp = 9999;
  run.enemy.hp = run.enemy.max_hp = 9999;
  // rng 0.5 => tidak crit, tidak miss; 0.05 terakhir memicu charge
  const r1 = D.act(a, 'attack', seq(0.5, 0.5, 0.5, 0.05));
  assert.ok(r1.events.some((e) => e.type === 'charge'), 'musuh mulai charge');
  assert.strictEqual(run.enemy.charging, true);
  const normal = r1.events.find((e) => e.type === 'enemy_hit').dmg;
  const r2 = D.act(a, 'attack', seq(0.5));
  const charged = r2.events.find((e) => e.type === 'enemy_hit');
  assert.ok(charged.charged && charged.dmg > normal * 2, 'serangan charge jauh lebih sakit');
  assert.strictEqual(run.enemy.charging, false, 'charge tidak berturut-turut');
  // Heavy membatalkan charge
  run.enemy.charging = true;
  const r3 = D.act(a, 'heavy', seq(0.5));
  assert.ok(r3.events.some((e) => e.type === 'interrupt'));
  assert.ok(!r3.events.find((e) => e.type === 'enemy_hit').charged);
}

/* ---- Overlevel: hadiah turun kalau farming dungeon mudah ---- */
{
  const a = newAccount();
  assert.strictEqual(D.overlevelMult(a, DUNGEONS[0]), 1);
  a.skills.dungeon.level = 60;
  assert.ok(D.overlevelMult(a, DUNGEONS[0]) < 0.5);
  assert.ok(D.overlevelMult(a, DUNGEONS[0]) >= 0.2);
}

/* ---- Menang: bersihkan semua lantai ---- */
{
  const a = newAccount();
  a.skills.dungeon.level = 30; // cukup kuat untuk sekali pukul
  a.inventory.weapon = 5;
  D.startRun(a, 'goblin_cave');
  let res;
  let guard = 0;
  do {
    res = D.act(a, 'attack', seq(0.5));
    guard += 1;
  } while (!res.finished && guard < 50);
  assert.ok(res.finished, 'run harus selesai');
  assert.strictEqual(res.finished.outcome, 'win');
  assert.strictEqual(a.dungeon_run, null);
  assert.ok(res.finished.viaz > 0, 'menang dapat Viaz');
  assert.ok(Object.values(a.dungeon_loot).reduce((s, n) => s + n, 0) > 0, 'menang dapat loot');
}

/* ---- Kalah: loot hilang, setengah Viaz ---- */
{
  const a = newAccount();
  D.startRun(a, 'goblin_cave');
  const before = a.viaz;
  a.dungeon_run.viaz = 100;
  a.dungeon_run.loot = { goblin_ear: 5 };
  a.dungeon_run.hp = 1;
  const res = D.act(a, 'defend', seq(0.5));
  assert.strictEqual(res.finished.outcome, 'lose');
  assert.strictEqual(a.viaz, before + 50, 'kalah = setengah Viaz run');
  assert.strictEqual(a.dungeon_loot.goblin_ear, undefined, 'kalah = loot hilang');
}

/* ---- Kabur: bawa pulang semua ---- */
{
  const a = newAccount();
  D.startRun(a, 'goblin_cave');
  const before2 = a.viaz;
  a.dungeon_run.viaz = 80;
  a.dungeon_run.loot = { rusty_coin: 2 };
  const res = D.act(a, 'flee');
  assert.strictEqual(res.finished.outcome, 'flee');
  assert.strictEqual(a.viaz, before2 + 80);
  assert.strictEqual(a.dungeon_loot.rusty_coin, 2);
}

console.log('dungeon-check: semua lolos (syarat, gear, combat, potion, menang, kalah, kabur, activity lock)');
