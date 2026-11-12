'use strict';

/** Screen Farming & Toko Tani (Components V2, dua bahasa). */

const C = require('../config/constants');
const G = require('../config/game');
const { SEEDS, getSeed, getUnlockedSeeds } = require('../data/seeds');
const { getTool, getToolList, toolKey } = require('../data/tools');
const { getRarity } = require('../data/rarity');
const {
  expToNext, farmingLevel, plotCapacity, usedPlots, freePlots, plotPrice, plotsCost,
  canAutoPlant, maxPlantable, maxBuyable,
} = require('../lib/farmLogic');
const { now: clockNow } = require('../lib/clock');
const { tr, nameOf, descOf } = require('../lib/i18n');
const { formatNumber, formatViaz, formatDuration } = require('../lib/format');
const { btn, select, row } = require('./v2');
const { viaz, rarityTag, label, ts, bagLine, expLine } = require('./common');
const { price } = require('../lib/viazRate');

const GREEN = 0x4caf50;

function listUnits(map, lang) {
  return Object.entries(map)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => {
      const s = getSeed(id);
      return `${s ? label(s, lang) : id} ×${formatNumber(n)}`;
    })
    .join(', ');
}

/** Ringkasan settle() (panen / auto-tanam). */
function settleNotice(res, lang, { auto = false } = {}) {
  if (!res.cycles && !res.bagFull) return '';
  const out = [];
  if (res.cycles) {
    out.push(`${auto ? '🤖 ' + tr(lang, 'Auto-Plant: ', 'Auto-Tanam: ') : ''}🧺 ${tr(lang, 'Harvested', 'Panen')}: ${listUnits(res.harvested, lang)}`);
    const back = listUnits(res.seedsBack, lang);
    if (back) out.push(`🌱 ${tr(lang, 'Seeds dropped', 'Benih jatuh')} (${Math.round(G.SEED_RETURN_RATE * 100)}% ${tr(lang, 'chance', 'peluang')}): ${back}`);
    out.push(`⭐ +${formatNumber(res.xp)} XP Farming`);
  }
  if (res.levelUps > 0) {
    const plots = res.plotsGained ? ` | 🟫 +${res.plotsGained} ${tr(lang, 'free plots', 'plot gratis')}` : '';
    out.push(`🎉 ${tr(lang, 'Level up!', 'Naik level!')} Farming Lv ${res.newLevel}${plots}`);
  }
  if (res.unlockedCave) out.push(`⛏️ ${tr(lang, 'Mining Caves unlocked! Buy a Pickaxe at the Mining Outpost.', 'Gua Tambang terbuka! Beli Beliung di Toko Tambang.')}`);
  if (res.bagFull) out.push(`⚠️ ${tr(lang, 'Some crops were not harvested: backpack full.', 'Sebagian tanaman tidak dipanen: tas penuh.')}`);
  return out.join('\n');
}

/* ============ Thread ============ */

function farmMain(account, lang, notice = '', now = clockNow()) {
  const level = farmingLevel(account);
  const hoe = getTool('hoe', account.inventory?.hoe ?? 1);
  const next = (Math.floor(level / G.MILESTONE_EVERY_LEVELS) + 1) * G.MILESTONE_EVERY_LEVELS;
  const autoOn = canAutoPlant(account) && account.auto_plant;
  const autoState = !canAutoPlant(account)
    ? `🔒 ${tr(lang, 'Unlocks at Lv', 'Terbuka di Lv')} ${G.AUTO_PLANT_LEVEL}`
    : autoOn ? tr(lang, '🤖 On', '🤖 Aktif') : tr(lang, '⏸️ Off', '⏸️ Mati');

  const crops = Object.entries(account.plantings)
    .map(([id, b]) => ({ seed: getSeed(id), b }))
    .filter((x) => x.seed)
    .sort((a, b) => a.b.finished_at - b.b.finished_at)
    .map(({ seed, b }) => `${label(seed, lang)} ×${formatNumber(b.qty)}: ${now >= b.finished_at ? tr(lang, '✅ Ready!', '✅ Siap!') : `⏳ ${ts(b.finished_at)}`}`);

  return {
    title: '🧑‍🌾 Growvia Farm',
    accent: GREEN,
    notice,
    body: [
      `<@${account.user_id}> · Farming Lv ${level}/${G.MAX_LEVEL}`,
      expLine(account.skills.farming, expToNext(level), level >= G.MAX_LEVEL),
      next <= G.MAX_LEVEL ? tr(lang, `+${G.PLOTS_PER_MILESTONE} free plots at Lv ${next}`, `+${G.PLOTS_PER_MILESTONE} plot gratis di Lv ${next}`) : null,
      '',
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      bagLine(account, lang),
      `🟫 ${tr(lang, 'Plots', 'Plot')}: ${formatNumber(usedPlots(account))}/${formatNumber(plotCapacity(account))}`,
      `🤖 ${tr(lang, 'Auto-Plant', 'Auto-Tanam')}: ${autoState}`,
      `${hoe.emote} ${nameOf(hoe, lang)} · ${descOf(hoe, lang)}`,
      '',
      `**${tr(lang, 'Crops', 'Tanaman')}**`,
      ...(crops.length ? crops : [tr(lang, '_Nothing planted yet. Press Plant._', '_Belum ada tanaman. Tekan Tanam._')]),
    ],
    rows: [
      row(
        btn(C.FARM_PLANT_OPEN_CUSTOM_ID, tr(lang, 'Plant', 'Tanam'), '🌱'),
        btn(C.FARM_HARVEST_CUSTOM_ID, tr(lang, 'Harvest', 'Panen'), '🧺'),
        btn(C.FARM_INVENTORY_CUSTOM_ID, tr(lang, 'Inventory', 'Inventaris'), '🎒'),
        btn(C.FARM_REFRESH_CUSTOM_ID, 'Refresh', '🔄'),
      ),
      row(btn(C.FARM_AUTO_CUSTOM_ID, `${tr(lang, 'Auto-Plant', 'Auto-Tanam')}: ${autoOn ? 'ON' : 'OFF'}`, '🤖', !canAutoPlant(account))),
    ],
  };
}

function plantMenu(account, lang) {
  const owned = getUnlockedSeeds(farmingLevel(account)).filter((s) => (account.seeds[s.id] ?? 0) > 0 && !account.plantings[s.id]);
  const menu = select(
    C.FARM_PLANT_SELECT_CUSTOM_ID,
    tr(lang, 'Choose a seed...', 'Pilih benih...'),
    owned.map((s) => ({
      label: `${nameOf(s, lang)} (x${account.seeds[s.id]})`,
      value: s.id,
      description: `${getRarity(s.rarity).name} | ${formatDuration(s.growMs, lang)} | +${s.xp} XP`,
      emoji: s.emote,
    })),
  );
  return {
    title: `🌱 ${tr(lang, 'Plant', 'Tanam')}`,
    accent: GREEN,
    body: [
      owned.length ? tr(lang, 'Pick the seed to plant.', 'Pilih benih yang mau ditanam.') : tr(lang, '_You have no plantable seeds. Buy some at the farm shop._', '_Tidak ada benih yang bisa ditanam. Beli di toko tani._'),
      `🟫 ${tr(lang, 'Free plots', 'Plot kosong')}: ${formatNumber(freePlots(account))}`,
    ],
    rows: [row(menu), row(btn(C.FARM_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️'))],
  };
}

function plantAmount(account, seed, lang) {
  const max = maxPlantable(account, seed.id);
  return {
    title: `🌱 ${label(seed, lang)}`,
    accent: getRarity(seed.rarity).color,
    body: [
      `${rarityTag(seed.rarity)} · ${formatDuration(seed.growMs, lang)} · +${seed.xp} XP`,
      `${tr(lang, 'Seeds', 'Benih')}: ${formatNumber(account.seeds[seed.id] ?? 0)} · ${tr(lang, 'Free plots', 'Plot kosong')}: ${formatNumber(freePlots(account))}`,
      '',
      tr(lang, `How many? Each crop has a ${Math.round(G.SEED_RETURN_RATE * 100)}% chance to drop a seed.`, `Berapa banyak? Tiap tanaman punya peluang ${Math.round(G.SEED_RETURN_RATE * 100)}% menjatuhkan benih.`),
    ],
    rows: [
      row(
        ...[1, 10, 50, 100].map((n) => btn(`${C.FARM_PLANT_DO_PREFIX}${seed.id}:${n}`, String(n), null, n > max)),
        btn(`${C.FARM_PLANT_DO_PREFIX}${seed.id}:max`, `Max (${max})`, null, max < 1),
      ),
      row(btn(C.FARM_PLANT_OPEN_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️')),
    ],
  };
}

function farmInventory(account, lang) {
  const hoe = getTool('hoe', account.inventory?.hoe ?? 1);
  const seeds = SEEDS.filter((s) => (account.seeds[s.id] ?? 0) > 0).map((s) => `${label(s, lang)} ×${formatNumber(account.seeds[s.id])}`);
  const crops = SEEDS.filter((s) => (account.harvests[s.id] ?? 0) > 0).map((s) => `${label(s, lang)} ×${formatNumber(account.harvests[s.id])}`);
  return {
    title: `🎒 ${tr(lang, 'Inventory', 'Inventaris')}`,
    accent: GREEN,
    body: [
      `**${tr(lang, 'Tool', 'Alat')}**`,
      `${hoe.emote} ${nameOf(hoe, lang)} (${rarityTag(hoe.rarity)})`,
      '',
      `**${tr(lang, 'Seeds', 'Benih')}**`,
      ...(seeds.length ? seeds : [tr(lang, '_(empty)_', '_(kosong)_')]),
      '',
      `**${tr(lang, 'Harvest', 'Hasil Panen')}**`,
      ...(crops.length ? crops : [tr(lang, '_(empty, sell at the farm shop)_', '_(kosong, jual di toko tani)_')]),
      '',
      bagLine(account, lang),
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [row(btn(C.FARM_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️'))],
  };
}

/* ============ Toko Tani ============ */

function shopBuyList(account, lang, mult, notice = '') {
  const level = farmingLevel(account);
  const lines = SEEDS.map((s) =>
    s.levelUnlock > level
      ? `🔒 ${label(s, lang)} · Farming Lv ${s.levelUnlock}`
      : `${label(s, lang)} ${getRarity(s.rarity).emoji} · ${tr(lang, 'buy', 'beli')} ${formatViaz(price(s.buyPrice))} · ${tr(lang, 'sell', 'jual')} ${formatViaz(s.sellPrice * mult)} · ${formatDuration(s.growMs, lang)}`,
  );
  const menu = select(
    C.SHOP_BUY_SELECT_CUSTOM_ID,
    tr(lang, 'Choose a seed...', 'Pilih benih...'),
    getUnlockedSeeds(level).map((s) => ({ label: nameOf(s, lang), value: s.id, description: `${formatViaz(price(s.buyPrice))} Viaz | ${formatDuration(s.growMs, lang)}`, emoji: s.emote })),
  );
  return {
    title: `🌱 ${tr(lang, 'Seed Shop', 'Toko Benih')}`,
    accent: GREEN,
    notice,
    body: [`${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`, '', ...lines],
    rows: [row(menu)],
  };
}

function shopSeed(account, seed, lang, mult, notice = '') {
  const max = maxBuyable(account, seed);
  return {
    title: `🌱 ${label(seed, lang)}`,
    accent: getRarity(seed.rarity).color,
    notice,
    body: [
      `${rarityTag(seed.rarity)} · ${formatDuration(seed.growMs, lang)} · +${seed.xp} XP`,
      `${tr(lang, 'Price', 'Harga')}: ${viaz(price(seed.buyPrice))} · ${tr(lang, 'Harvest sells for', 'Panen dijual')} ${viaz(seed.sellPrice * mult)} (×${mult} halving)`,
      '',
      `${tr(lang, 'Owned', 'Dimiliki')}: ${formatNumber(account.seeds[seed.id] ?? 0)} · ${tr(lang, 'Can buy', 'Bisa beli')}: ${formatNumber(max)}`,
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
      bagLine(account, lang),
    ],
    rows: [
      row(
        ...[1, 10, 100].map((n) => btn(`${C.SHOP_BUY_DO_PREFIX}${seed.id}:${n}`, `${tr(lang, 'Buy', 'Beli')} ${n}`, null, n > max)),
        btn(`${C.SHOP_BUY_DO_PREFIX}${seed.id}:max`, `Max (${max})`, null, max < 1),
      ),
      row(btn(C.SHOP_BUY_BACK_CUSTOM_ID, tr(lang, 'Back', 'Kembali'), '⬅️')),
    ],
  };
}

function shopSell(account, lang, mult, notice = '') {
  const owned = SEEDS.filter((s) => (account.harvests[s.id] ?? 0) > 0);
  const total = owned.reduce((sum, s) => sum + account.harvests[s.id] * s.sellPrice * mult, 0);
  const menu = select(
    C.SHOP_SELL_SELECT_CUSTOM_ID,
    tr(lang, 'Or sell one type...', 'Atau jual satu jenis...'),
    owned.map((s) => ({ label: `${nameOf(s, lang)} (x${account.harvests[s.id]})`, value: s.id, emoji: s.emote })),
  );
  return {
    title: `💰 ${tr(lang, 'Sell Harvest', 'Jual Panen')}`,
    accent: GREEN,
    notice,
    body: [
      `${tr(lang, 'Halving multiplier', 'Multiplier halving')}: **×${mult}**`,
      '',
      ...(owned.length
        ? owned.map((s) => `${s.emote} ${nameOf(s, lang)} ×${formatNumber(account.harvests[s.id])} · ${viaz(account.harvests[s.id] * s.sellPrice * mult)}`)
        : [tr(lang, '_Nothing to sell._', '_Tidak ada yang bisa dijual._')]),
      '',
      `${tr(lang, 'Total', 'Total')}: ${viaz(total)}`,
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [row(btn(C.SHOP_SELL_ALL_CUSTOM_ID, tr(lang, 'Sell All', 'Jual Semua'), '💰', !owned.length)), row(menu)],
  };
}

function shopPlots(account, lang, notice = '') {
  const bought = account.bought_plots;
  return {
    title: `🟫 ${tr(lang, 'Expand Plots', 'Beli Plot')}`,
    accent: GREEN,
    notice,
    body: [
      `${tr(lang, 'Total plots', 'Total plot')}: **${formatNumber(plotCapacity(account))}** (${tr(lang, 'bought', 'dibeli')}: ${formatNumber(bought)})`,
      `${tr(lang, 'In use', 'Terpakai')}: ${formatNumber(usedPlots(account))} · ${tr(lang, 'Free', 'Kosong')}: ${formatNumber(freePlots(account))}`,
      '',
      `${tr(lang, 'Next plot', 'Plot berikutnya')}: ${viaz(plotPrice(bought))} (${tr(lang, 'price rises per plot', 'harga naik tiap plot')})`,
      `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    ],
    rows: [
      row(
        ...[1, 10, 100].map((n) => {
          const cost = plotsCost(bought, n);
          return btn(`${C.SHOP_PLOT_BUY_PREFIX}${n}`, `+${n} (${Number.isFinite(cost) ? formatViaz(cost) : '-'})`, '🟫', bought + n > G.MAX_BOUGHT_PLOTS || cost > account.viaz);
        }),
      ),
    ],
  };
}

/**
 * Screen toko alat generik (cangkul / beliung / pancingan / senjata / armor).
 * Semua tier bisa dibeli berulang (per copy, tampil jumlah milik) — model siap trade antar pemain.
 * Yang terpasang = tier tertinggi yang dimiliki.
 */
function toolScreen({ type, account, lang, notice = '', title, accent, levelOk, reqText, buyPrefix, emoji }) {
  const cur = account.inventory?.[type] ?? 0;
  const tool = cur > 0 ? getTool(type, cur) : null;
  const items = account.items ?? {};
  const tiers = getToolList(type).filter((x) => !x.starter);
  const body = [
    tool
      ? `${tr(lang, 'Equipped', 'Terpasang')}: **${tool.emote} ${nameOf(tool, lang)}** (${rarityTag(tool.rarity)}) · ${descOf(tool, lang)}`
      : `${tr(lang, 'Equipped', 'Terpasang')}: ❌ **${tr(lang, 'None', 'Belum punya')}**`,
    '',
    ...tiers.map((x) => {
      const owned = items[toolKey(type, x.tier)] ?? 0;
      const eq = cur === x.tier ? ` · ${tr(lang, 'equipped', 'terpasang')}` : '';
      return `${x.emote} **${nameOf(x, lang)}** ×${owned}${eq} · ${descOf(x, lang)}
　${tr(lang, 'Req', 'Syarat')}: ${reqText(x)} · ${viaz(price(x.cost))}`;
    }),
    '',
    `${C.VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
    bagLine(account, lang),
  ];
  const rows = [];
  for (let i = 0; i < tiers.length; i += 2) {
    rows.push(row(...tiers.slice(i, i + 2).map((x) =>
      btn(`${buyPrefix}${x.tier}`, `${tr(lang, 'Buy', 'Beli')} ${nameOf(x, lang)}`, emoji, !levelOk(x) || account.viaz < price(x.cost)),
    )));
  }
  return { title, accent, notice, body, rows };
}

function shopHoe(account, lang, notice = '') {
  return toolScreen({
    type: 'hoe', account, lang, notice,
    title: `🧑‍🌾 ${tr(lang, 'Upgrade Hoe', 'Upgrade Cangkul')}`,
    accent: GREEN,
    levelOk: (next) => farmingLevel(account) >= next.unlockLevel,
    reqText: (next) => `Farming Lv ${next.unlockLevel}`,
    buyPrefix: C.SHOP_TOOL_BUY_PREFIX,
    emoji: '🧑‍🌾',
  });
}

module.exports = {
  settleNotice, farmMain, plantMenu, plantAmount, farmInventory,
  shopBuyList, shopSeed, shopSell, shopPlots, shopHoe, toolScreen,
};
