'use strict';

/**
 * Logika Dungeon murni (tanpa I/O). Full manual, turn-based.
 *
 * Syarat masuk: Farming Lv 30, Mining Lv 20, Fishing Lv 10, plus senjata. Bayar biaya masuk.
 * Satu run = beberapa lantai, lantai terakhir boss. Tiap giliran pemain pilih:
 *   attack  : damage normal
 *   heavy   : damage x1.8, tapi 30% meleset. Kena musuh yang sedang CHARGE = charge batal.
 *   defend  : damage masuk dipotong 60%
 *   potion  : sembuh (maks 3 per run), musuh tetap menyerang
 *   flee    : keluar, loot dari lantai yang sudah dibersihkan tetap dibawa
 * Mekanik CHARGE: musuh kadang mengumpulkan tenaga (ditampilkan di layar). Serangan berikutnya x2.5,
 * jadi pemain harus memilih Defend (aman) atau Heavy (berisiko, tapi membatalkan charge).
 * Kalah (HP 0): run berakhir, loot run hilang, setengah Viaz run hilang.
 * HP tidak pulih antar lantai (kecuali pakai ramuan) supaya ramuan & armor berarti.
 */

const G = require('../config/game');
const { getDungeon, getMonster, getPotion } = require('../data/dungeons');
const { getTool } = require('../data/tools');
const { farmingLevel } = require('./farmLogic');
const { addXp } = require('./xp');
const { record } = require('./progress');
const { effectOf } = require('./boosts');
const { now: clockNow } = require('./clock');
const { miningLevel } = require('./miningLogic');
const { fishingLevel } = require('./fishingLogic');
const { canDungeon } = require('./activityLock');
const { freeSlots } = require('./backpack');
const { price } = require('./viazRate');

const BASE_HP = 100;
const HEAVY_MULT = 1.8;
const HEAVY_MISS = 0.3;
const DEFEND_CUT = 0.6;
const CRIT_CHANCE = 0.1;
const CRIT_MULT = 1.5;
/** Batas ramuan per run: memaksa pemain memakai Defend / Heavy dengan cerdas. */
const POTIONS_PER_RUN = 3;
const CHARGE_MULT = 2.5;
const CHARGE_CHANCE = 0.22;
const BOSS_CHARGE_CHANCE = 0.32;

function dungeonLevel(account) {
  return account.skills?.dungeon?.level ?? 1;
}

function meetsRequirements(account) {
  return farmingLevel(account) >= 30 && miningLevel(account) >= 20 && fishingLevel(account) >= 10;
}

/** Statistik pemain dari level dungeon + senjata + armor. */
function playerStats(account) {
  const lvl = dungeonLevel(account);
  const weapon = getTool('weapon', account.inventory?.weapon ?? 0);
  const armor = getTool('armor', account.inventory?.armor ?? 0);
  return {
    maxHp: BASE_HP + (lvl - 1) * 8 + (armor?.hp ?? 0),
    atk: 4 + lvl * 2 + (weapon?.atk ?? 0),
    def: 1 + Math.floor(lvl / 2) + (armor?.def ?? 0),
  };
}

/** Damage = atk acak 85-115% dikurangi def, minimal 1. */
function rollDamage(atk, def, rng) {
  const raw = atk * (0.85 + rng() * 0.3);
  return Math.max(1, Math.round(raw - def));
}

const addDungeonXP = (account, xp) => addXp(account, 'dungeon', xp);

const fail = (code) => ({ ok: false, code });

/**
 * Hadiah berkurang kalau level jauh di atas dungeon (anti farming dungeon mudah):
 * penuh sampai +15 level, lalu -4% per level, minimal 20%.
 */
function overlevelMult(account, dungeon) {
  const over = dungeonLevel(account) - dungeon.unlockLevel - 15;
  return over <= 0 ? 1 : Math.max(0.2, 1 - over * 0.04);
}

function spawnFloor(run) {
  const dungeon = getDungeon(run.dungeon_id);
  const m = getMonster(dungeon.floors[run.floor]);
  run.enemy = { id: m.id, hp: m.hp, max_hp: m.hp, charging: false };
}

/** Masuk dungeon. Kode gagal diterjemahkan di UI. */
function startRun(account, dungeonId, now = clockNow()) {
  if (!meetsRequirements(account)) return fail('locked');
  if (!((account.inventory?.weapon ?? 0) > 0)) return fail('no_weapon');
  if (account.dungeon_run) return fail('in_run');
  const lock = canDungeon(account);
  if (!lock.ok) return fail(lock.code);
  const dungeon = getDungeon(dungeonId);
  if (!dungeon) return fail('not_found');
  if (dungeonLevel(account) < dungeon.unlockLevel) return fail('level');
  const fee = price(dungeon.fee ?? 0);
  if ((account.viaz ?? 0) < fee) return fail('no_viaz');
  account.viaz = Math.round((account.viaz - fee) * 100) / 100;

  const stats = playerStats(account);
  account.dungeon_run = {
    dungeon_id: dungeon.id,
    floor: 0,
    hp: stats.maxHp,
    max_hp: stats.maxHp,
    defending: false,
    potions_used: 0,
    loot: {},
    viaz: 0,
    xp: 0,
    log: [],
    started_at: now,
  };
  spawnFloor(account.dungeon_run);
  return { ok: true, dungeon, fee };
}

function rollLoot(dungeon, rng, luck = 1) {
  const got = {};
  for (const l of dungeon.loot) {
    if (rng() < Math.min(0.95, l.chance * luck)) got[l.id] = (got[l.id] ?? 0) + l.min + Math.floor(rng() * (l.max - l.min + 1));
  }
  return got;
}

/** Selesaikan run: bawa pulang (win/flee) atau hilang (lose). Viaz run ikut kurs halving. */
function endRun(account, outcome) {
  const run = account.dungeon_run;
  const summary = { outcome, loot: {}, lootDropped: {}, viaz: 0, xp: 0, levelUps: 0, newLevel: dungeonLevel(account) };
  if (!run) return summary;

  const earned = price(run.viaz);
  if (outcome === 'lose') {
    summary.viaz = Math.floor(earned * 50) / 100;
  } else {
    summary.viaz = earned;
    if (!account.dungeon_loot) account.dungeon_loot = {};
    // Loot dibawa sebanyak sisa slot tas; sisanya tertinggal.
    for (const [id, qty] of Object.entries(run.loot)) {
      const fit = Math.min(qty, freeSlots(account));
      if (fit > 0) account.dungeon_loot[id] = (account.dungeon_loot[id] ?? 0) + fit;
      if (fit > 0) summary.loot[id] = fit;
      if (qty - fit > 0) summary.lootDropped[id] = qty - fit;
    }
  }
  summary.xp = outcome === 'lose' ? Math.floor(run.xp / 2) : run.xp;
  account.viaz = Math.round((account.viaz + summary.viaz) * 100) / 100;
  record(account, 'earn', summary.viaz);
  if (outcome === 'win') record(account, 'clear', 1, { dungeonId: run.dungeon_id });
  const gained = addDungeonXP(account, summary.xp);
  summary.levelUps = gained.levelUps;
  summary.newLevel = gained.newLevel;
  account.dungeon_run = null;
  return summary;
}

/**
 * Satu giliran. action: attack | heavy | defend | potion:<id> | flee
 * Mengembalikan { ok, events: [{type, ...}], floorCleared?, finished?: summary, code? }
 */
function act(account, action, rng = Math.random) {
  const run = account.dungeon_run;
  if (!run) return fail('no_run');
  const dungeon = getDungeon(run.dungeon_id);
  const stats = playerStats(account);
  const monster = getMonster(run.enemy.id);
  const events = [];

  if (action === 'flee') {
    events.push({ type: 'flee' });
    return { ok: true, events, finished: endRun(account, 'flee') };
  }

  let defending = false;
  if (action === 'attack' || action === 'heavy') {
    const heavy = action === 'heavy';
    if (heavy && rng() < HEAVY_MISS) {
      events.push({ type: 'miss' });
    } else {
      let dmg = rollDamage(stats.atk * (heavy ? HEAVY_MULT : 1), monster.def, rng);
      const crit = rng() < CRIT_CHANCE;
      if (crit) dmg = Math.round(dmg * CRIT_MULT);
      run.enemy.hp = Math.max(0, run.enemy.hp - dmg);
      events.push({ type: 'hit', dmg, crit, heavy });
      if (heavy && run.enemy.charging) {
        run.enemy.charging = false;
        events.push({ type: 'interrupt' });
      }
    }
  } else if (action === 'defend') {
    defending = true;
    events.push({ type: 'defend' });
  } else if (action.startsWith('potion:')) {
    const potion = getPotion(action.slice(7));
    if (!potion) return fail('not_found');
    if (!((account.potions?.[potion.id] ?? 0) > 0)) return fail('no_potion');
    if ((run.potions_used ?? 0) >= POTIONS_PER_RUN) return fail('potion_limit');
    run.potions_used = (run.potions_used ?? 0) + 1;
    account.potions[potion.id] -= 1;
    if (account.potions[potion.id] <= 0) delete account.potions[potion.id];
    const healed = Math.min(potion.heal, run.max_hp - run.hp);
    run.hp += healed;
    events.push({ type: 'potion', potion: potion.id, healed });
  } else {
    return fail('bad_action');
  }

  // Musuh kalah: hadiah lantai, lanjut atau selesai.
  if (run.enemy.hp <= 0) {
    // dungeon.xp / dungeon.viaz = total per clear; boss berbobot 3x lantai biasa.
    const boss = Boolean(monster.boss);
    const weight = (boss ? 3 : 1) / (dungeon.floors.length + 2);
    const reward = overlevelMult(account, dungeon);
    const [vmin, vmax] = dungeon.viaz;
    const viaz = Math.round((vmin + rng() * (vmax - vmin)) * weight * reward);
    const xp = Math.max(1, Math.round(dungeon.xp * weight * reward));
    run.viaz += viaz;
    run.xp += xp;
    const luck = effectOf(account, 'luck') * effectOf(account, 'loot');
    const loot = rollLoot(dungeon, rng, luck);
    if (boss) for (const [id, q] of Object.entries(rollLoot(dungeon, rng, luck))) loot[id] = (loot[id] ?? 0) + q;
    for (const [id, q] of Object.entries(loot)) run.loot[id] = (run.loot[id] ?? 0) + q;
    events.push({ type: 'kill', monster: monster.id, viaz, xp, loot });
    record(account, 'kill', 1, { monster: monster.id, boss });

    run.floor += 1;
    if (run.floor >= dungeon.floors.length) {
      return { ok: true, events, floorCleared: true, finished: endRun(account, 'win') };
    }
    spawnFloor(run);
    return { ok: true, events, floorCleared: true };
  }

  // Giliran musuh.
  const charged = Boolean(run.enemy.charging);
  let dmg = rollDamage(monster.atk * (charged ? CHARGE_MULT : 1), stats.def, rng);
  if (defending) dmg = Math.max(1, Math.round(dmg * (1 - DEFEND_CUT)));
  run.hp = Math.max(0, run.hp - dmg);
  run.enemy.charging = false;
  events.push({ type: 'enemy_hit', dmg, defended: defending, charged });
  if (run.hp <= 0) {
    return { ok: true, events, finished: endRun(account, 'lose') };
  }
  // Musuh mungkin mulai charge untuk giliran berikutnya (tidak dua kali berturut-turut).
  if (!charged && rng() < (monster.boss ? BOSS_CHARGE_CHANCE : CHARGE_CHANCE)) {
    run.enemy.charging = true;
    events.push({ type: 'charge' });
  }
  return { ok: true, events };
}

module.exports = {
  BASE_HP,
  POTIONS_PER_RUN,
  CHARGE_MULT,
  dungeonLevel,
  overlevelMult,
  meetsRequirements,
  playerStats,
  addDungeonXP,
  startRun,
  act,
  endRun,
};
