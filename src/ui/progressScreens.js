'use strict';

/** Screen Hall: profil, quest, achievement, koleksi, peringkat, ascension (Components V2, dua bahasa). */

const C = require('../config/constants');
const G = require('../config/game');
const { ACHIEVEMENTS, CATEGORIES } = require('../data/achievements');
const { SEEDS } = require('../data/seeds');
const { ORES } = require('../data/ores');
const { FISHES } = require('../data/fishes');
const { MONSTERS, getMonster } = require('../data/dungeons');
const { QUEST_TYPES } = require('../data/quests');
const { getRarity } = require('../data/rarity');
const P = require('../lib/progress');
const { SKILLS, skillLevel, expToNext, xpMultiplier } = require('../lib/xp');
const { price } = require('../lib/viazRate');
const { now: clockNow } = require('../lib/clock');
const { usedSlots, maxSlots } = require('../lib/backpack');
const { tr, nameOf, descOf } = require('../lib/i18n');
const { formatNumber, formatViaz } = require('../lib/format');
const { btn, select, row } = require('./v2');
const { viaz, label } = require('./common');

const GOLD = 0xffb300;
const SKILL_EMOTE = { farming: '🌾', mining: '⛏️', fishing: '🎣', dungeon: '🔮' };
const SKILL_NAME = { farming: ['Farming', 'Bertani'], mining: ['Mining', 'Menambang'], fishing: ['Fishing', 'Memancing'], dungeon: ['Dungeon', 'Dungeon'] };
const MEDALS = ['🥇', '🥈', '🥉'];

const bar = (got, need, len = 10) => {
  const f = need > 0 ? Math.max(0, Math.min(len, Math.round((got / need) * len))) : 0;
  return `${'▰'.repeat(f)}${'▱'.repeat(len - f)}`;
};

/** Baris navigasi 5 tombol. */
function navRow(lang) {
  const n = (id, text, emoji) => btn(`${C.HALL_NAV_PREFIX}${id}`, text, emoji);
  return row(
    n('profile', tr(lang, 'Profile', 'Profil'), '👤'),
    n('quests', tr(lang, 'Quests', 'Quest'), '📜'),
    n('ach', tr(lang, 'Achievements', 'Pencapaian'), '🏆'),
    n('coll', tr(lang, 'Collection', 'Koleksi'), '📚'),
    n('top', tr(lang, 'Leaderboard', 'Peringkat'), '📊'),
  );
}

/** Teks pengumuman achievement baru. */
function achievementText(list, lang) {
  const lines = list.map((a) => `${a.emote} **${nameOf(a, lang)}** · ${descOf(a, lang)} · +${formatViaz(price(a.reward))} Viaz`);
  return `🏆 **${tr(lang, 'Achievement unlocked!', 'Pencapaian terbuka!')}**\n${lines.join('\n')}`.slice(0, 1900);
}

/* ============ Profil ============ */

function profileScreen(account, lang, notice = '') {
  const p = P.ensure(account);
  const s = p.stats;
  const total = P.statValue(account, 'total_lv');
  const prestige = p.prestige;
  const unlocked = Object.keys(p.ach).length;
  const best = p.best.fish ? FISHES.find((f) => f.id === p.best.fish.id) : null;
  const skillLines = SKILLS.map((k) => {
    const lvl = skillLevel(account, k);
    const exp = account.skills?.[k]?.exp ?? 0;
    const pct = lvl >= G.MAX_LEVEL ? 'MAX' : `${Math.floor((exp / expToNext(lvl)) * 100)}%`;
    return `${SKILL_EMOTE[k]} ${tr(lang, SKILL_NAME[k][0], SKILL_NAME[k][1])} **Lv ${lvl}** · ${pct}`;
  });
  return {
    title: `👤 ${account.username}${prestige ? ` ${'✨'.repeat(Math.min(prestige, 5))}` : ''}`,
    accent: GOLD,
    notice,
    body: [
      ...skillLines,
      `📈 ${tr(lang, 'Total levels', 'Total level')}: **${total}** / ${G.MAX_LEVEL * SKILLS.length}`,
      prestige ? `✨ ${tr(lang, 'Ascension', 'Ascension')} ${prestige}/${G.MAX_PRESTIGE} · +${Math.round((xpMultiplier(account) - 1) * 100)}% XP · +${Math.round((P.sellBonus(account) - 1) * 100)}% ${tr(lang, 'sales', 'hasil jual')}` : null,
      '',
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      `🎒 ${tr(lang, 'Backpack', 'Tas')}: ${formatNumber(usedSlots(account))}/${formatNumber(maxSlots(account))}`,
      '',
      `🌾 ${formatNumber(s.harvested)} · ⛏️ ${formatNumber(s.mined)} · 🎣 ${formatNumber(s.fished)} · 🔮 ${formatNumber(s.clears)} · ☠️ ${formatNumber(s.kills)}`,
      `💵 ${tr(lang, 'Lifetime earnings', 'Total pendapatan')}: ${viaz(s.earned)}`,
      best ? `🏅 ${tr(lang, 'Heaviest fish', 'Ikan terberat')}: ${best.emote} ${nameOf(best, lang)} **${p.best.fish.weight} lbs**` : null,
      `🏆 ${tr(lang, 'Achievements', 'Pencapaian')}: **${unlocked}/${ACHIEVEMENTS.length}** · 🔥 ${tr(lang, 'Quest streak', 'Streak quest')}: ${P.activeStreak(account)} ${tr(lang, 'days', 'hari')}`,
    ],
    rows: [navRow(lang), row(btn(`${C.HALL_NAV_PREFIX}boost`, tr(lang, 'Boost Shop', 'Toko Booster'), '🛍️'), btn(C.HALL_ASCEND_CUSTOM_ID, tr(lang, 'Ascension', 'Ascension'), '✨'))],
  };
}

/* ============ Quest ============ */

const questText = (quest, lang) => {
  const t = QUEST_TYPES[quest.t];
  return `${t.emote} ${tr(lang, t.en, t.name).replace('{n}', formatNumber(quest.need))}`;
};

function questLine(quest, lang) {
  const state = quest.claimed ? '✅' : P.isDone(quest) ? '🎁' : '▫️';
  return [
    `${state} ${questText(quest, lang)}`,
    `　${bar(quest.got, quest.need)} ${formatNumber(quest.got)}/${formatNumber(quest.need)} · ${viaz(price(quest.reward))}`,
  ].join('\n');
}

function questsScreen(account, lang, notice = '', now = clockNow()) {
  const q = P.ensureQuests(account, now);
  const streak = P.activeStreak(account, now);
  const ready = [...q.list, ...q.wlist].filter((x) => P.isDone(x) && !x.claimed).length;
  const resetAt = Date.parse(`${q.day}T00:00:00Z`) + 86_400_000 - G.DAY_OFFSET_MS;
  const weekReset = Date.parse(`${q.week}T00:00:00Z`) + 7 * 86_400_000 - G.DAY_OFFSET_MS;
  const rel = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;
  return {
    title: `📜 ${tr(lang, 'Quests', 'Quest')}`,
    accent: GOLD,
    notice,
    body: [
      `**${tr(lang, 'Daily', 'Harian')}** · ${tr(lang, 'resets', 'reset')} ${rel(resetAt)}`,
      ...(q.list.length ? q.list.map((x) => questLine(x, lang)) : [tr(lang, '_No quests available yet._', '_Belum ada quest._')]),
      '',
      `**${tr(lang, 'Weekly', 'Mingguan')}** · ${tr(lang, 'resets', 'reset')} ${rel(weekReset)}`,
      ...(q.wlist.length ? q.wlist.map((x) => questLine(x, lang)) : [tr(lang, '_No quests available yet._', '_Belum ada quest._')]),
      '',
      `🔥 ${tr(lang, 'Streak', 'Streak')}: **${streak}** ${tr(lang, 'days', 'hari')} (+${Math.round((P.streakMult(streak) - 1) * 100)}% ${tr(lang, 'rewards', 'hadiah')})`,
      tr(lang, '_Finish every daily quest for a +50% bonus. Claim once a day to keep your streak._', '_Selesaikan semua quest harian untuk bonus +50%. Klaim tiap hari agar streak terjaga._'),
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [row(btn(C.HALL_CLAIM_CUSTOM_ID, `${tr(lang, 'Claim', 'Klaim')}${ready ? ` (${ready})` : ''}`, '🎁', !ready)), navRow(lang)],
  };
}

function claimNotice(res, lang) {
  if (!res.ok) return '';
  return `🎁 ${tr(lang, 'Claimed', 'Diklaim')} ${res.count} ${tr(lang, 'quests', 'quest')}: **+${viaz(res.total)}**${res.bonus ? ` (${tr(lang, 'incl. daily bonus', 'termasuk bonus harian')})` : ''}${res.streak > 1 ? ` · 🔥 ${res.streak}` : ''}`;
}

/* ============ Achievement ============ */

function achScreen(account, lang, category = 'farming', notice = '') {
  const p = P.ensure(account);
  const list = ACHIEVEMENTS.filter((a) => a.category === category);
  const menu = select(
    C.HALL_ACH_SELECT_CUSTOM_ID,
    tr(lang, 'Choose a category...', 'Pilih kategori...'),
    CATEGORIES.map(([id, emoji, en, name]) => {
      const all = ACHIEVEMENTS.filter((a) => a.category === id);
      return { label: tr(lang, en, name), value: id, description: `${all.filter((a) => p.ach[a.id]).length}/${all.length}`, emoji };
    }),
  );
  const cat = CATEGORIES.find((c) => c[0] === category) ?? CATEGORIES[0];
  return {
    title: `🏆 ${tr(lang, 'Achievements', 'Pencapaian')} · ${cat[1]} ${tr(lang, cat[2], cat[3])}`,
    accent: GOLD,
    notice,
    body: [
      `**${Object.keys(p.ach).length}/${ACHIEVEMENTS.length}** ${tr(lang, 'unlocked', 'terbuka')}`,
      '',
      ...list.map((a) => {
        const done = Boolean(p.ach[a.id]);
        const val = Math.min(P.statValue(account, a.stat), a.goal);
        return `${done ? '✅' : '🔒'} ${a.emote} **${nameOf(a, lang)}**\n　${descOf(a, lang)} ${done ? '' : `(${formatNumber(Math.floor(val))}/${formatNumber(a.goal)})`} · ${viaz(price(a.reward))}`;
      }),
    ],
    rows: [row(menu), navRow(lang)],
  };
}

/* ============ Koleksi ============ */

const COLL = {
  crops: { emoji: '🥕', en: 'Crops', name: 'Tanaman', items: () => SEEDS, key: 'crops', show: (v, lang) => `×${formatNumber(v)}` },
  ores: { emoji: '💎', en: 'Ores', name: 'Ore', items: () => ORES, key: 'ores', show: (v) => `×${formatNumber(v)}` },
  fish: { emoji: '🐟', en: 'Fish', name: 'Ikan', items: () => FISHES, key: 'fish', show: (v) => `${v} lbs` },
  mobs: { emoji: '👺', en: 'Monsters', name: 'Monster', items: () => Object.keys(MONSTERS).map(getMonster), key: 'mobs', show: (v) => `×${formatNumber(v)}` },
};

function collScreen(account, lang, cat = 'fish', notice = '') {
  const p = P.ensure(account);
  const c = COLL[cat] ?? COLL.fish;
  const items = c.items();
  const found = items.filter((it) => p.coll[c.key][it.id] !== undefined).length;
  const menu = select(
    C.HALL_COLL_SELECT_CUSTOM_ID,
    tr(lang, 'Choose a collection...', 'Pilih koleksi...'),
    Object.entries(COLL).map(([id, x]) => ({ label: tr(lang, x.en, x.name), value: id, description: `${x.items().filter((it) => p.coll[x.key][it.id] !== undefined).length}/${x.items().length}`, emoji: x.emoji })),
  );
  return {
    title: `📚 ${tr(lang, 'Collection', 'Koleksi')} · ${c.emoji} ${tr(lang, c.en, c.name)}`,
    accent: GOLD,
    notice,
    body: [
      `**${found}/${items.length}** ${tr(lang, 'discovered', 'ditemukan')} · ${tr(lang, 'completing sets grants achievements', 'melengkapi set memberi pencapaian')}`,
      '',
      ...items.map((it) => {
        const v = p.coll[c.key][it.id];
        return v === undefined ? `❔ ${getRarity(it.rarity ?? 'common').emoji} ???` : `${label(it, lang)} ${it.rarity ? getRarity(it.rarity).emoji : it.boss ? '👑' : ''} · ${c.show(v, lang)}`;
      }),
    ],
    rows: [row(menu), navRow(lang)],
  };
}

/* ============ Peringkat ============ */

const TOP_KINDS = {
  total: { emoji: '📈', en: 'Total Levels', name: 'Total Level', fmt: (n) => `Lv ${n}` },
  farming: { emoji: '🌾', en: 'Farming', name: 'Bertani', fmt: (n) => `Lv ${n}` },
  mining: { emoji: '⛏️', en: 'Mining', name: 'Menambang', fmt: (n) => `Lv ${n}` },
  fishing: { emoji: '🎣', en: 'Fishing', name: 'Memancing', fmt: (n) => `Lv ${n}` },
  dungeon: { emoji: '🔮', en: 'Dungeon', name: 'Dungeon', fmt: (n) => `Lv ${n}` },
  viaz: { emoji: '💰', en: 'Richest', name: 'Terkaya', fmt: (n) => formatViaz(n) },
  fish: { emoji: '🐋', en: 'Heaviest Fish', name: 'Ikan Terberat', fmt: (n) => `${n} lbs` },
  prestige: { emoji: '✨', en: 'Ascensions', name: 'Ascension', fmt: (n) => `✨ ${n}` },
};

function topLines(kind, rows) {
  const k = TOP_KINDS[kind] ?? TOP_KINDS.total;
  return rows.map((r, i) => `${MEDALS[i] ?? `**${i + 1}.**`} ${r.username} · ${k.fmt(r.score)}`);
}

function topScreen(lang, kind, rows, notice = '') {
  const k = TOP_KINDS[kind] ?? TOP_KINDS.total;
  const menu = select(
    C.HALL_TOP_SELECT_CUSTOM_ID,
    tr(lang, 'Choose a ranking...', 'Pilih peringkat...'),
    Object.entries(TOP_KINDS).map(([id, x]) => ({ label: tr(lang, x.en, x.name), value: id, emoji: x.emoji })),
  );
  return {
    title: `📊 ${tr(lang, 'Leaderboard', 'Peringkat')} · ${k.emoji} ${tr(lang, k.en, k.name)}`,
    accent: GOLD,
    notice,
    body: rows.length ? [...topLines(kind, rows), '', tr(lang, '_Updated every minute._', '_Diperbarui tiap menit._')] : [tr(lang, '_No data yet._', '_Belum ada data._')],
    rows: [row(menu), navRow(lang)],
  };
}

/* ============ Ascension ============ */

function ascendScreen(account, lang, notice = '') {
  const total = P.statValue(account, 'total_lv');
  const prestige = account.progress?.prestige ?? 0;
  const check = P.ascendCheck(account);
  const next = prestige + 1;
  return {
    title: `✨ ${tr(lang, 'Ascension', 'Ascension')}`,
    accent: 0x7e57c2,
    notice,
    body: [
      tr(lang, 'Reset your journey in exchange for permanent power.', 'Ulangi perjalananmu demi kekuatan permanen.'),
      '',
      `**${tr(lang, 'You gain', 'Kamu mendapat')}** (${tr(lang, 'Ascension', 'Ascension')} ${next}/${G.MAX_PRESTIGE})`,
      `• +${Math.round(G.PRESTIGE_XP_BONUS * next * 100)}% XP ${tr(lang, 'on every skill', 'di semua skill')}`,
      `• +${Math.round(G.PRESTIGE_SELL_BONUS * next * 100)}% ${tr(lang, 'on everything you sell', 'untuk semua yang kamu jual')}`,
      `• ✨ ${tr(lang, 'Prestige achievements and profile mark', 'Pencapaian prestige dan tanda di profil')}`,
      '',
      `**${tr(lang, 'Reset', 'Direset')}**: ${tr(lang, 'all skill levels, Viaz, seeds, crops, ores, bait, fish, loot, potions and tools (you restart with the Starter Hoe and 100 Wheat).', 'semua level skill, Viaz, benih, panen, ore, umpan, ikan, loot, ramuan, dan alat (kamu mulai lagi dengan Cangkul Pemula dan 100 Gandum).')}`,
      `**${tr(lang, 'Kept', 'Dipertahankan')}**: ${tr(lang, 'backpack upgrades, bought plots, achievements, collection, stats, quest streak.', 'upgrade tas, plot yang dibeli, pencapaian, koleksi, statistik, streak quest.')}`,
      '',
      `${tr(lang, 'Requirement', 'Syarat')}: ${tr(lang, 'total skill levels', 'total level skill')} ${total}/${G.ASCEND_TOTAL_LEVELS} · ${tr(lang, 'no active activity', 'tidak ada aktivitas berjalan')}`,
      check.ok ? `✅ ${tr(lang, 'Ready to ascend.', 'Siap Ascension.')}` : '',
    ],
    rows: [
      row(btn(C.HALL_ASCEND_DO_CUSTOM_ID, tr(lang, 'Ascend now', 'Ascension sekarang'), '✨', !check.ok)),
      row(btn(`${C.HALL_NAV_PREFIX}profile`, tr(lang, 'Back', 'Kembali'), '⬅️')),
    ],
  };
}

module.exports = {
  navRow, achievementText, profileScreen, questsScreen, claimNotice, achScreen, collScreen, topScreen, topLines, ascendScreen,
  TOP_KINDS, COLL, CATEGORIES,
};
