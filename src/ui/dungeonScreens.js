'use strict';

/** Screen Dungeon & Dungeon Loot shop (Components V2, dua bahasa). */

const C = require('../config/constants');
const G = require('../config/game');
const { DUNGEONS, LOOT, POTIONS, getDungeon, getMonster, getLoot, getPotion, getUnlockedDungeons } = require('../data/dungeons');
const { getTool } = require('../data/tools');
const { getRarity } = require('../data/rarity');
const { dungeonLevel, playerStats, meetsRequirements, overlevelMult, POTIONS_PER_RUN } = require('../lib/dungeonLogic');
const { expToNext } = require('../lib/farmLogic');
const { freeSlots } = require('../lib/backpack');
const { tr, nameOf, descOf } = require('../lib/i18n');
const { formatNumber, formatViaz } = require('../lib/format');
const { btn, select, row } = require('./v2');
const { viaz, rarityTag, label, bagLine, expLine } = require('./common');
const { price } = require('../lib/viazRate');
const { toolScreen } = require('./farmScreens');

const RED = 0xb71c1c;

/** Bar HP teks 10 blok. */
function hpBar(hp, max) {
  const filled = Math.max(0, Math.min(10, Math.round((hp / max) * 10)));
  return `${'🟥'.repeat(filled)}${'⬛'.repeat(10 - filled)} ${formatNumber(hp)}/${formatNumber(max)}`;
}

function lootList(map, lang) {
  return Object.entries(map ?? {})
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${label(getLoot(id), lang)} ×${formatNumber(n)}`)
    .join(', ');
}

/** Teks event combat satu giliran. */
function eventLines(events, lang, monster) {
  const mName = monster ? `${monster.emote} ${nameOf(monster, lang)}` : '';
  return events.map((e) => {
    switch (e.type) {
      case 'hit': return `⚔️ ${tr(lang, 'You hit for', 'Kamu menyerang')} **${e.dmg}**${e.crit ? ` 💥 ${tr(lang, 'CRITICAL!', 'KRITIS!')}` : ''}${e.heavy ? ` (${tr(lang, 'heavy', 'berat')})` : ''}`;
      case 'miss': return `💨 ${tr(lang, 'Your heavy strike missed!', 'Serangan beratmu meleset!')}`;
      case 'defend': return `🛡️ ${tr(lang, 'You brace for the hit.', 'Kamu bertahan.')}`;
      case 'potion': return `🧪 ${tr(lang, 'Healed', 'Sembuh')} **+${e.healed}** HP`;
      case 'enemy_hit': return `🩸 ${mName} ${e.charged ? tr(lang, 'unleashes a CHARGED attack for', 'melepas serangan CHARGE') : tr(lang, 'hits you for', 'menyerangmu')} **${e.dmg}**${e.defended ? ` (${tr(lang, 'blocked', 'ditahan')})` : ''}`;
      case 'charge': return `⚡ ${mName} ${tr(lang, 'is charging a powerful attack! Defend, or Heavy Strike to interrupt.', 'mengumpulkan tenaga! Bertahan, atau Serangan Berat untuk membatalkan.')}`;
      case 'interrupt': return `💢 ${tr(lang, 'Charge interrupted!', 'Charge dibatalkan!')}`;
      case 'kill': {
        const loot = lootList(e.loot, lang);
        return `☠️ ${tr(lang, 'Defeated', 'Mengalahkan')} ${mName}! +${viaz(e.viaz)} · +${e.xp} XP${loot ? ` · ${loot}` : ''}`;
      }
      case 'flee': return `🏃 ${tr(lang, 'You fled the dungeon.', 'Kamu kabur dari dungeon.')}`;
      default: return '';
    }
  }).filter(Boolean);
}

function runSummary(s, lang) {
  const title = {
    win: `🏆 ${tr(lang, 'Dungeon cleared!', 'Dungeon berhasil ditaklukkan!')}`,
    flee: `🏃 ${tr(lang, 'You escaped with your loot.', 'Kamu kabur membawa loot.')}`,
    lose: `💀 ${tr(lang, 'You were defeated! Loot lost, half the Viaz kept.', 'Kamu kalah! Loot hilang, setengah Viaz tersisa.')}`,
  }[s.outcome];
  const loot = lootList(s.loot, lang);
  const dropped = lootList(s.lootDropped, lang);
  return [
    title,
    `+${viaz(s.viaz)} · +${formatNumber(s.xp)} XP Dungeon`,
    loot ? `🎁 ${loot}` : null,
    dropped ? `⚠️ ${tr(lang, 'Left behind (bag full)', 'Tertinggal (tas penuh)')}: ${dropped}` : null,
    s.levelUps > 0 ? `🎉 ${tr(lang, 'Level up!', 'Naik level!')} Dungeon Lv ${s.newLevel}` : null,
  ].filter(Boolean).join('\n');
}

/** Lobi: status & pilih dungeon. */
function dungeonLobby(account, lang, notice = '') {
  const level = dungeonLevel(account);
  const stats = playerStats(account);
  const weapon = getTool('weapon', account.inventory?.weapon ?? 0);
  const armor = getTool('armor', account.inventory?.armor ?? 0);
  const potions = POTIONS.filter((p) => (account.potions?.[p.id] ?? 0) > 0).map((p) => `${label(p, lang)} ×${account.potions[p.id]}`);
  const menu = select(
    C.DUNGEON_SELECT_CUSTOM_ID,
    tr(lang, 'Enter a dungeon...', 'Masuk dungeon...'),
    getUnlockedDungeons(level).map((d) => ({ label: nameOf(d, lang), value: d.id, description: `${getRarity(d.rarity).name} | ${d.floors.length} ${tr(lang, 'floors', 'lantai')} | ${tr(lang, 'fee', 'biaya')} ${formatViaz(price(d.fee ?? 0))}`, emoji: d.emote })),
  );
  return {
    title: `🔮 ${tr(lang, 'Dungeon Gate', 'Gerbang Dungeon')}`,
    accent: RED,
    notice,
    body: [
      `<@${account.user_id}> · Dungeon Lv ${level}/${G.MAX_LEVEL}`,
      expLine(account.skills.dungeon ?? { exp: 0 }, expToNext(level), level >= G.MAX_LEVEL),
      '',
      `❤️ HP ${stats.maxHp} · ⚔️ ATK ${stats.atk} · 🛡️ DEF ${stats.def}`,
      weapon ? `${weapon.emote} ${nameOf(weapon, lang)} · ${descOf(weapon, lang)}` : `❌ ${tr(lang, 'No weapon (required)', 'Belum punya senjata (wajib)')}`,
      armor ? `${armor.emote} ${nameOf(armor, lang)} · ${descOf(armor, lang)}` : `▫️ ${tr(lang, 'No armor', 'Belum punya armor')}`,
      `🧪 ${potions.length ? potions.join(', ') : tr(lang, 'No potions', 'Tidak ada ramuan')}`,
      bagLine(account, lang),
      '',
      `**${tr(lang, 'Dungeons', 'Dungeon')}**`,
      ...DUNGEONS.map((d) =>
        d.unlockLevel > level
          ? `🔒 ${label(d, lang)} · Dungeon Lv ${d.unlockLevel}`
          : `${label(d, lang)} ${getRarity(d.rarity).emoji} · ${d.floors.length} ${tr(lang, 'floors', 'lantai')} · ${tr(lang, 'boss', 'boss')}: ${getMonster(d.floors[d.floors.length - 1]).emote} · ${tr(lang, 'fee', 'biaya')} ${viaz(price(d.fee ?? 0))}${overlevelMult(account, d) < 1 ? ` · 📉 ${Math.round(overlevelMult(account, d) * 100)}%` : ''}`),
      '',
      tr(lang, `_HP does not regenerate between floors. Max ${POTIONS_PER_RUN} potions per run. Watch for ⚡ charged attacks!_`, `_HP tidak pulih antar lantai. Maks ${POTIONS_PER_RUN} ramuan per run. Waspadai serangan ⚡ charge!_`),
    ],
    rows: [row(menu)],
  };
}

/** Layar pertarungan. log = baris kejadian giliran terakhir. */
function dungeonFight(account, lang, log = []) {
  const run = account.dungeon_run;
  const dungeon = getDungeon(run.dungeon_id);
  const monster = getMonster(run.enemy.id);
  const owned = POTIONS.filter((p) => (account.potions?.[p.id] ?? 0) > 0);
  const potionMenu = select(
    C.DUNGEON_POTION_SELECT_CUSTOM_ID,
    tr(lang, 'Drink a potion...', 'Minum ramuan...'),
    owned.map((p) => ({ label: `${nameOf(p, lang)} (x${account.potions[p.id]})`, value: p.id, description: `+${p.heal} HP`, emoji: p.emote })),
  );
  return {
    title: `${dungeon.emote} ${nameOf(dungeon, lang)} · ${tr(lang, 'Floor', 'Lantai')} ${run.floor + 1}/${dungeon.floors.length}`,
    accent: monster.boss ? 0x4a148c : RED,
    body: [
      `${monster.boss ? '👑 **BOSS** ' : ''}${monster.emote} **${nameOf(monster, lang)}** · ⚔️ ${monster.atk} · 🛡️ ${monster.def}`,
      hpBar(run.enemy.hp, run.enemy.max_hp),
      run.enemy.charging ? `⚡ **${tr(lang, 'CHARGING: next hit deals x2.5!', 'CHARGE: serangan berikutnya x2.5!')}**` : null,
      '',
      `🧍 ${tr(lang, 'You', 'Kamu')} · 🧪 ${run.potions_used ?? 0}/${POTIONS_PER_RUN}`,
      hpBar(run.hp, run.max_hp),
      '',
      `💰 ${tr(lang, 'Run loot', 'Loot run')}: ${viaz(run.viaz)}${lootList(run.loot, lang) ? ` · ${lootList(run.loot, lang)}` : ''}`,
      ...(log.length ? ['', ...log] : []),
    ],
    rows: [
      row(
        btn(`${C.DUNGEON_ACTION_PREFIX}attack`, tr(lang, 'Attack', 'Serang'), '⚔️'),
        btn(`${C.DUNGEON_ACTION_PREFIX}heavy`, tr(lang, 'Heavy Strike', 'Serangan Berat'), '💥'),
        btn(`${C.DUNGEON_ACTION_PREFIX}defend`, tr(lang, 'Defend', 'Bertahan'), '🛡️'),
        btn(`${C.DUNGEON_ACTION_PREFIX}flee`, tr(lang, 'Flee', 'Kabur'), '🏃'),
      ),
      row(potionMenu),
    ],
  };
}

/* ============ Toko Dungeon ============ */

function dungeonShopWeapons(account, lang, notice = '') {
  const first = (account.inventory?.weapon ?? 0) < 1;
  const weaponScreen = toolScreen({
    type: 'weapon', account, lang, notice,
    title: `⚔️ ${tr(lang, 'Weapons & Armor', 'Senjata & Armor')}`,
    accent: RED,
    levelOk: (next) => (first ? meetsRequirements(account) : dungeonLevel(account) >= next.unlockLevel),
    reqText: (next) => (first ? 'Farming 30 · Mining 20 · Fishing 10' : `Dungeon Lv ${next.unlockLevel}`),
    buyPrefix: `${C.DUNGEON_SHOP_GEAR_BUY_PREFIX}weapon:`,
    emoji: '⚔️',
  });
  const armor = toolScreen({
    type: 'armor', account, lang,
    title: '', accent: RED,
    levelOk: (next) => meetsRequirements(account) && dungeonLevel(account) >= next.unlockLevel,
    reqText: (next) => `Dungeon Lv ${next.unlockLevel}`,
    buyPrefix: `${C.DUNGEON_SHOP_GEAR_BUY_PREFIX}armor:`,
    emoji: '🛡️',
  });
  return {
    ...weaponScreen,
    body: [`**${tr(lang, 'Weapon', 'Senjata')}**`, ...weaponScreen.body.slice(0, -2), '', `**Armor**`, ...armor.body],
    rows: [...weaponScreen.rows, ...armor.rows],
  };
}

function dungeonShopPotions(account, lang, notice = '') {
  const max = (p) => Math.max(0, Math.min(100, Math.floor(account.viaz / price(p.cost)), freeSlots(account)));
  return {
    title: `🧪 ${tr(lang, 'Potions', 'Ramuan')}`,
    accent: RED,
    notice,
    body: [
      ...POTIONS.map((p) => `${label(p, lang)} · +${p.heal} HP · ${viaz(price(p.cost))} · ${tr(lang, 'owned', 'dimiliki')} ${account.potions?.[p.id] ?? 0}`),
      '',
      tr(lang, '_Potions can only be bought here, never inside a dungeon._', '_Ramuan hanya bisa dibeli di sini, tidak di dalam dungeon._'),
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      bagLine(account, lang),
    ],
    rows: POTIONS.map((p) =>
      row(
        btn(`${C.DUNGEON_SHOP_POTION_BUY_PREFIX}${p.id}:1`, `${nameOf(p, lang)} ×1`, p.emote, max(p) < 1),
        btn(`${C.DUNGEON_SHOP_POTION_BUY_PREFIX}${p.id}:5`, '×5', null, max(p) < 5),
        btn(`${C.DUNGEON_SHOP_POTION_BUY_PREFIX}${p.id}:10`, '×10', null, max(p) < 10),
      )),
  };
}

function dungeonShopSell(account, lang, mult, notice = '') {
  const owned = LOOT.filter((l) => (account.dungeon_loot?.[l.id] ?? 0) > 0);
  const total = owned.reduce((s, l) => s + account.dungeon_loot[l.id] * l.sellPrice * mult, 0);
  return {
    title: `💰 ${tr(lang, 'Sell Dungeon Loot', 'Jual Loot Dungeon')}`,
    accent: RED,
    notice,
    body: [
      `${tr(lang, 'Halving multiplier', 'Multiplier halving')}: **×${mult}**`,
      '',
      ...(owned.length
        ? owned.map((l) => `${label(l, lang)} ×${formatNumber(account.dungeon_loot[l.id])} (${rarityTag(l.rarity)}) · ${viaz(account.dungeon_loot[l.id] * l.sellPrice * mult)}`)
        : [tr(lang, '_Nothing to sell._', '_Tidak ada yang bisa dijual._')]),
      '',
      `Total: ${viaz(total)}`,
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [row(btn(C.DUNGEON_SHOP_SELL_ALL_CUSTOM_ID, tr(lang, 'Sell All', 'Jual Semua'), '💰', !owned.length))],
  };
}

module.exports = { hpBar, eventLines, runSummary, dungeonLobby, dungeonFight, dungeonShopWeapons, dungeonShopPotions, dungeonShopSell, getPotion };
