'use strict';

/** Screen Ransel / Armory (Components V2, dua bahasa). */

const C = require('../config/constants');
const G = require('../config/game');
const { getSeed } = require('../data/seeds');
const { getOre } = require('../data/ores');
const { getBait } = require('../data/fishes');
const { getLoot, getPotion } = require('../data/dungeons');
const { breakdown, usedSlots, maxSlots, freeSlots, backpackPrice, backpacksCost, getDiscardableItems } = require('../lib/backpack');
const { tr, nameOf } = require('../lib/i18n');
const { formatNumber, formatViaz } = require('../lib/format');
const { btn, select, row } = require('./v2');
const { viaz } = require('./common');

const PURPLE = 0x9c27b0;

/** Nama + emoji item tas per kategori. */
function itemMeta(category, id, lang) {
  const lookup = { seeds: getSeed, harvests: getSeed, ores: getOre, baits: getBait, dungeon_loot: getLoot, potions: getPotion }[category];
  if (category === 'fishes') return { name: tr(lang, 'All caught fish', 'Semua ikan tangkapan'), emote: '🐟' };
  const it = lookup ? lookup(id) : null;
  const base = it ? nameOf(it, lang) : id;
  const prefix = { seeds: tr(lang, 'Seed: ', 'Benih: '), harvests: tr(lang, 'Crop: ', 'Panen: '), baits: tr(lang, 'Bait: ', 'Umpan: ') }[category] ?? '';
  return { name: `${prefix}${base}`, emote: it?.emote ?? '📦' };
}

function backpackMain(account, lang, notice = '') {
  const bd = breakdown(account);
  const used = usedSlots(account);
  const max = maxSlots(account);
  const bought = account.bought_backpack ?? 0;
  const cost1 = backpackPrice(bought);
  const cost5 = backpacksCost(bought, 5);
  return {
    title: `🎒 ${tr(lang, 'Backpack', 'Ransel')}`,
    accent: PURPLE,
    notice,
    body: [
      `**${formatNumber(used)} / ${formatNumber(max)}** ${tr(lang, 'slots', 'slot')} (${Math.floor((used / max) * 100)}%) · ${tr(lang, 'free', 'kosong')} ${formatNumber(freeSlots(account))}`,
      '',
      `⚒️ ${tr(lang, 'Tools', 'Alat')}: ${formatNumber(bd.tools)}`,
      `🌱 ${tr(lang, 'Seeds', 'Benih')}: ${formatNumber(bd.seeds)}`,
      `🌾 ${tr(lang, 'Crops', 'Panen')}: ${formatNumber(bd.harvests)}`,
      `💎 Ore: ${formatNumber(bd.ores)}`,
      `🪱 ${tr(lang, 'Bait', 'Umpan')}: ${formatNumber(bd.baits)}`,
      `🐟 ${tr(lang, 'Fish', 'Ikan')}: ${formatNumber(bd.fishes)}`,
      `🎁 ${tr(lang, 'Dungeon loot', 'Loot dungeon')}: ${formatNumber(bd.loot)}`,
      `🧪 ${tr(lang, 'Potions', 'Ramuan')}: ${formatNumber(bd.potions)}`,
      '',
      `${tr(lang, 'Upgrades bought', 'Upgrade dibeli')}: ${formatNumber(bought)} (+${formatNumber(bought * G.SLOTS_PER_BACKPACK_UPGRADE)})`,
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [
      row(
        btn(`${C.BACKPACK_UPGRADE_BUY_PREFIX}1`, `+${G.SLOTS_PER_BACKPACK_UPGRADE} (${formatViaz(cost1)})`, '🎒', account.viaz < cost1 || bought >= G.MAX_BOUGHT_BACKPACK),
        btn(`${C.BACKPACK_UPGRADE_BUY_PREFIX}5`, `+${G.SLOTS_PER_BACKPACK_UPGRADE * 5} (${formatViaz(cost5)})`, '📦', account.viaz < cost5 || bought + 5 > G.MAX_BOUGHT_BACKPACK),
      ),
      row(
        btn(C.BACKPACK_DISCARD_OPEN_CUSTOM_ID, tr(lang, 'Discard Items', 'Buang Item'), '🗑️'),
        btn(C.BACKPACK_REFRESH_CUSTOM_ID, 'Refresh', '🔄'),
      ),
    ],
  };
}

function backpackDiscard(account, lang, selected = null, notice = '') {
  const body = [
    tr(lang, 'Discard unwanted items to free slots. Tools cannot be discarded.', 'Buang item yang tidak diinginkan untuk mengosongkan slot. Alat tidak bisa dibuang.'),
    `⚠️ **${tr(lang, 'Discarded items are gone forever!', 'Item yang dibuang hilang permanen!')}**`,
    '',
    `🎒 ${formatNumber(usedSlots(account))} / ${formatNumber(maxSlots(account))}`,
  ];
  const rows = [];
  if (!selected) {
    rows.push(row(select(
      C.BACKPACK_DISCARD_SELECT_CUSTOM_ID,
      tr(lang, 'Pick an item to discard...', 'Pilih item untuk dibuang...'),
      getDiscardableItems(account).map((it) => {
        const m = itemMeta(it.category, it.id, lang);
        return { label: `${m.name} (x${it.qty})`, value: `${it.category}:${it.id}`, emoji: m.emote };
      }),
    )));
    rows.push(row(btn(C.BACKPACK_DISCARD_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️')));
  } else {
    const m = itemMeta(selected.category, selected.id, lang);
    body.push('', `${tr(lang, 'Selected', 'Dipilih')}: ${m.emote} **${m.name}** (${formatNumber(selected.qty)})`);
    const prefix = `${C.BACKPACK_DISCARD_DO_PREFIX}${selected.category}:${selected.id}:`;
    rows.push(row(
      ...[10, 50, 100].filter((n) => n < selected.qty).map((n) => btn(`${prefix}${n}`, `${tr(lang, 'Discard', 'Buang')} ${n}`)),
      btn(`${prefix}all`, `${tr(lang, 'Discard all', 'Buang semua')} (${selected.qty})`, '🗑️'),
    ));
    rows.push(row(btn(C.BACKPACK_DISCARD_OPEN_CUSTOM_ID, tr(lang, 'Cancel', 'Batal'), '⬅️')));
  }
  return { title: `🗑️ ${tr(lang, 'Discard Items', 'Buang Item')}`, accent: 0xd32f2f, notice, body, rows };
}

module.exports = { itemMeta, backpackMain, backpackDiscard };
