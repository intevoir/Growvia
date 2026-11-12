'use strict';

/**
 * XP & level bersama untuk semua skill (farming, mining, fishing, dungeon).
 * Satu-satunya tempat yang menambah XP, jadi bonus prestige dan hook retensi hanya ada di sini.
 */

const G = require('../config/game');
const { skillXpMult } = require('./boosts');
const { effectOf } = require('./boosts');

/** EXP untuk naik dari `level` ke `level + 1`. */
function expToNext(level) {
  return Math.round(G.XP_CURVE * level ** 3);
}

const SKILLS = ['farming', 'mining', 'fishing', 'dungeon'];

function skillLevel(account, skill) {
  return account.skills?.[skill]?.level ?? 1;
}

/** Bonus XP permanen dari prestige (Ascension). */
function xpMultiplier(account) {
  return (1 + G.PRESTIGE_XP_BONUS * (account.progress?.prestige ?? 0)) * effectOf(account, 'xp');
}

/** Hook opsional (diisi lib/progress.js) dipanggil setelah level berubah. Menghindari import melingkar. */
const hooks = { onLevel: null };

/**
 * Tambah XP ke satu skill. Naik level bisa beberapa kali sekaligus.
 * Mengembalikan { levelUps, newLevel }.
 */
function addXp(account, skill, xp) {
  if (!account.skills) account.skills = {};
  if (!account.skills[skill]) account.skills[skill] = { level: 1, exp: 0 };
  const s = account.skills[skill];
  const old = s.level;
  if (old >= G.MAX_LEVEL || !(xp > 0)) return { levelUps: 0, newLevel: old };

  s.exp += Math.round(xp * xpMultiplier(account) * skillXpMult(account, skill));
  while (s.level < G.MAX_LEVEL && s.exp >= expToNext(s.level)) {
    s.exp -= expToNext(s.level);
    s.level += 1;
  }
  if (s.level >= G.MAX_LEVEL) s.exp = 0;
  if (s.level !== old && hooks.onLevel) hooks.onLevel(account, skill);
  return { levelUps: s.level - old, newLevel: s.level };
}

module.exports = { expToNext, SKILLS, skillLevel, xpMultiplier, addXp, hooks };
