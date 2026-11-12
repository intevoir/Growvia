'use strict';

/** Screen Mining & Toko Tambang (Components V2, dua bahasa). */

const C = require('../config/constants');
const G = require('../config/game');
const { getCave, getCaves, getUnlockedCaves, getOre, ORES } = require('../data/ores');
const { getTool } = require('../data/tools');
const { getRarity } = require('../data/rarity');
const { miningLevel, canAutoMine, oreYieldMult } = require('../lib/miningLogic');
const { now: clockNow } = require('../lib/clock');
const { expToNext, farmingLevel } = require('../lib/farmLogic');
const { tr, nameOf, descOf } = require('../lib/i18n');
const { formatNumber, formatViaz, formatDuration } = require('../lib/format');
const { btn, select, row } = require('./v2');
const { viaz, rarityTag, label, ts, bagLine, expLine } = require('./common');
const { toolScreen } = require('./farmScreens');

const BROWN = 0x8d6e63;

function miningNotice(res, lang, { auto = false } = {}) {
  if (!res.cycles && !res.bagFull) return '';
  const out = [];
  if (res.cycles) {
    const ores = Object.entries(res.claimedOres)
      .map(([id, n]) => `${label(getOre(id), lang)} ×${formatNumber(n)}`)
      .join(', ');
    out.push(`${auto ? '🤖 Auto-Mine: ' : ''}⛏️ ${tr(lang, 'Mined', 'Hasil galian')}: ${ores}`, `⭐ +${formatNumber(res.xp)} XP Mining`);
  }
  if (res.levelUps > 0) out.push(`🎉 ${tr(lang, 'Level up!', 'Naik level!')} Mining Lv ${res.newLevel}`);
  if (res.bagFull) out.push(`⚠️ ${tr(lang, 'Ores left behind: backpack full.', 'Ore tertinggal: tas penuh.')}`);
  return out.join('\n');
}

function mineMain(account, lang, notice = '', now = clockNow()) {
  const level = miningLevel(account);
  const pickTier = account.inventory?.pickaxe ?? 0;
  const pick = pickTier > 0 ? getTool('pickaxe', pickTier) : null;
  const autoOn = canAutoMine(account) && account.auto_mining;
  const trip = account.mining_trip;
  let tripLine = tr(lang, '_No expedition. Press Start Mining._', '_Belum ada ekspedisi. Tekan Mulai Gali._');
  if (trip) {
    const cave = getCave(trip.cave_id);
    const name = cave ? label(cave, lang) : '?';
    tripLine = now >= trip.finished_at
      ? `${name}: ${tr(lang, '✅ Done! Press Claim.', '✅ Selesai! Tekan Klaim.')}`
      : `${name}: ⏳ ${ts(trip.finished_at)}`;
  }
  return {
    title: `⛏️ ${tr(lang, 'Growvia Mine', 'Tambang Growvia')}`,
    accent: BROWN,
    notice,
    body: [
      `<@${account.user_id}> · Mining Lv ${level}/${G.MAX_LEVEL}`,
      expLine(account.skills.mining, expToNext(level), level >= G.MAX_LEVEL),
      '',
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      bagLine(account, lang),
      pick ? `${pick.emote} ${nameOf(pick, lang)} · ${descOf(pick, lang)}` : `❌ ${tr(lang, 'No pickaxe', 'Belum punya beliung')}`,
      `🤖 Auto-Mine: ${!canAutoMine(account) ? `🔒 Mining Lv 10` : autoOn ? 'ON' : 'OFF'}`,
      '',
      `**${tr(lang, 'Expedition', 'Ekspedisi')}**`,
      tripLine,
    ],
    rows: [
      row(
        btn(C.MINE_EXPEDITION_OPEN_CUSTOM_ID, tr(lang, 'Start Mining', 'Mulai Gali'), '⛏️', Boolean(trip)),
        btn(C.MINE_CLAIM_CUSTOM_ID, tr(lang, 'Claim', 'Klaim'), '💎', !trip),
        btn(C.MINE_INVENTORY_CUSTOM_ID, tr(lang, 'Ore Storage', 'Gudang Ore'), '🎒'),
        btn(C.MINE_REFRESH_CUSTOM_ID, 'Refresh', '🔄'),
      ),
      row(btn(C.MINE_AUTO_CUSTOM_ID, `Auto-Mine: ${autoOn ? 'ON' : 'OFF'}`, '🤖', !canAutoMine(account))),
    ],
  };
}

function caveSelect(account, lang) {
  const level = miningLevel(account);
  const mult = getTool('pickaxe', account.inventory?.pickaxe ?? 1)?.speedMult ?? 1;
  const ores = (c) => `${Math.round(c.minDrop * oreYieldMult(level))}-${Math.round(c.maxDrop * oreYieldMult(level))} ore`;
  const lines = getCaves().map((c) =>
    c.unlockLevel > level
      ? `🔒 ${label(c, lang)} · Mining Lv ${c.unlockLevel}`
      : `${label(c, lang)} · ${formatDuration(c.baseDurationMs * mult, lang)} · ${ores(c)} · ${c.oreIds.map((id) => getOre(id).emote).join('')}`,
  );
  const menu = select(
    C.MINE_EXPEDITION_SELECT_CUSTOM_ID,
    tr(lang, 'Choose a cave...', 'Pilih gua...'),
    getUnlockedCaves(level).map((c) => ({ label: nameOf(c, lang), value: c.id, description: `${formatDuration(c.baseDurationMs * mult, lang)} | ${ores(c)}`, emoji: c.emote })),
  );
  return {
    title: `🕳️ ${tr(lang, 'Choose a Cave', 'Pilih Gua')}`,
    accent: BROWN,
    body: [...lines, '', tr(lang, `_Ore per trip grows with Mining level (×${oreYieldMult(level).toFixed(2)})._`, `_Ore per ekspedisi naik dengan level Mining (×${oreYieldMult(level).toFixed(2)})._`)],
    rows: [row(menu), row(btn(C.MINE_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️'))],
  };
}

function oreStorage(account, lang) {
  const owned = ORES.filter((o) => (account.ores?.[o.id] ?? 0) > 0);
  return {
    title: `🎒 ${tr(lang, 'Ore Storage', 'Gudang Ore')}`,
    accent: BROWN,
    body: [
      ...(owned.length ? owned.map((o) => `${label(o, lang)} ×${formatNumber(account.ores[o.id])} (${rarityTag(o.rarity)})`) : [tr(lang, '_(empty)_', '_(kosong)_')]),
      '',
      bagLine(account, lang),
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [row(btn(C.MINE_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️'))],
  };
}

function mineShopSell(account, lang, mult, notice = '') {
  const owned = ORES.filter((o) => (account.ores?.[o.id] ?? 0) > 0);
  const total = owned.reduce((s, o) => s + account.ores[o.id] * o.sellPrice * mult, 0);
  const menu = select(
    C.MINING_SHOP_SELL_SELECT_CUSTOM_ID,
    tr(lang, 'Or sell one type...', 'Atau jual satu jenis...'),
    owned.map((o) => ({ label: `${nameOf(o, lang)} (x${account.ores[o.id]})`, value: o.id, emoji: o.emote })),
  );
  return {
    title: `💰 ${tr(lang, 'Sell Ores', 'Jual Ore')}`,
    accent: BROWN,
    notice,
    body: [
      `${tr(lang, 'Halving multiplier', 'Multiplier halving')}: **×${mult}**`,
      '',
      ...(owned.length ? owned.map((o) => `${label(o, lang)} ×${formatNumber(account.ores[o.id])} · ${viaz(account.ores[o.id] * o.sellPrice * mult)}`) : [tr(lang, '_Nothing to sell._', '_Tidak ada yang bisa dijual._')]),
      '',
      `Total: ${viaz(total)}`,
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [row(btn(C.MINING_SHOP_SELL_ALL_CUSTOM_ID, tr(lang, 'Sell All', 'Jual Semua'), '💰', !owned.length)), row(menu)],
  };
}

function mineShopPickaxe(account, lang, notice = '') {
  const first = (account.inventory?.pickaxe ?? 0) < 1;
  return toolScreen({
    type: 'pickaxe', account, lang, notice,
    title: `⛏️ ${tr(lang, 'Pickaxes', 'Beliung')}`,
    accent: BROWN,
    levelOk: (next) => (first ? farmingLevel(account) >= 10 : miningLevel(account) >= next.unlockLevel),
    reqText: (next) => (first ? 'Farming Lv 10' : `Mining Lv ${next.unlockLevel}`),
    buyPrefix: C.MINING_SHOP_TOOL_BUY_PREFIX,
    emoji: '⛏️',
  });
}

module.exports = { miningNotice, mineMain, caveSelect, oreStorage, mineShopSell, mineShopPickaxe, getRarity };
