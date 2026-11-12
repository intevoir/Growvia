'use strict';

/**
 * Perintah chat di thread pribadi: `/buy gandum 100`, `/sell`, `/bag`, dst.
 * Hanya jalan di thread milik akun sendiri. Semua logika dipakai ulang dari lib/* (lock, halving, rate).
 */

const path = require('node:path');
const { loadAccount, saveAccount, withUserLock, checkRateLimit } = require('../lib/account');
const { now: clockNow } = require('../lib/clock');
const { settle, plant, maxPlantable, canAutoPlant, farmingLevel, plotsCost } = require('../lib/farmLogic');
const { settleMining, startTrip, canAutoMine, miningLevel } = require('../lib/miningLogic');
const { settleFishing, startFishing, reelIn, fishingLevel, canFish, isFishingActive } = require('../lib/fishingLogic');
const { startRun, act, dungeonLevel, meetsRequirements } = require('../lib/dungeonLogic');
const { buyStack, buyToolTier, maxStackBuy, sellStack } = require('../lib/shopOps');
const { getViazMultiplier } = require('../lib/halving');
const { freeSlots, backpacksCost, discardItem, usedSlots, maxSlots } = require('../lib/backpack');
const P = require('../lib/progress');
const G = require('../config/game');
const { SEEDS, getSeed, getUnlockedSeeds } = require('../data/seeds');
const { ORES, getCave, getCaves } = require('../data/ores');
const { BAITS, getBait, getUnlockedBaits } = require('../data/fishes');
const { DUNGEONS, LOOT, POTIONS, getDungeon, getMonster, getPotion } = require('../data/dungeons');
const { tr, nameOf, langOf } = require('../lib/i18n');
const { formatNumber, formatViaz } = require('../lib/format');
const { payload } = require('../ui/v2');
const { errorText, viaz, label } = require('../ui/common');
const { VIAZ_EMOJI } = require('../config/constants');
const { price } = require('../lib/viazRate');

const PREFIX = '/';

const t = (lang, en, id) => tr(lang, en, id);

/** Cari item data dari id ATAU nama (en/id, tanpa spasi, case-insensitive). */
function findItem(list, raw) {
  if (!raw) return null;
  const q = raw.toLowerCase().replace(/\s+/g, '');
  return list.find((x) => x.id === q) ?? list.find((x) => (x.en ?? '').toLowerCase().replace(/\s+/g, '') === q) ?? list.find((x) => (x.name ?? '').toLowerCase().replace(/\s+/g, '') === q) ?? null;
}

const num = (raw) => (String(raw).toLowerCase() === 'max' ? 'max' : Math.max(0, parseInt(raw, 10) || 0));

/** Kirim teks V2 (judul + baris-baris) ke channel thread. */
function send(message, lang, title, lines, accent = 0x4caf50) {
  const screen = { title, accent, body: lines.filter((l) => l !== null && l !== undefined) };
  return message.channel.send(payload(screen)).catch(() => {});
}

/** Kirim screen apa adanya (dari ui/*Screens) — sama persis dengan tampilan tombol. */
const sendScreen = (message, screen) => message.channel.send(payload(screen)).catch(() => {});

/** Varian error ringkas. */
const fail = (message, lang, code, extra) => send(message, lang, '❌', [errorText(lang, code, extra)]);

/** Ringkasan settle AFK (auto-tanam/auto-mine/strike tertunda). */
function settleAll(account, lang) {
  const notes = [];
  const harvest = settle(account);
  if (harvest.cycles) {
    const got = Object.entries(harvest.harvested).map(([id, n]) => `${getSeed(id)?.emote} ${nameOf(getSeed(id), lang)} ×${formatNumber(n)}`).join(', ');
    notes.push(`🧺 ${t(lang, 'Harvested', 'Dipanen')}: ${got} · ⭐ +${formatNumber(harvest.xp)} XP`);
  }
  const mined = settleMining(account);
  if (mined.cycles) notes.push(`⛏️ ${t(lang, 'Mined', 'Hasil tambang')}: ${Object.values(mined.claimedOres).reduce((s, n) => s + n, 0)} ${t(lang, 'ores', 'ore')} · ⭐ +${formatNumber(mined.xp)} XP`);
  const fished = settleFishing(account);
  if (fished.caught.length) notes.push(`🎣 ${t(lang, 'Caught', 'Tertangkap')} ${formatNumber(fished.caught.length)} ${t(lang, 'fish', 'ikan')} · ⭐ +${formatNumber(fished.xp)} XP`);
  return notes.join('\n');
}

/* ============ Perintah ============ */

const help = (m, { lang }) =>
  send(m, lang, `⌨️ ${t(lang, 'Commands', 'Perintah')}`, [
    `**${t(lang, 'Shop', 'Toko')}**`,
    `/buy <${t(lang, 'seed', 'benih')}> <id> <n|max> · /buy bait <id> <n|max> · /buy potion <id> <n>`,
    `/sell [all|harvest|ore|fish|loot] · /tool <hoe|pickaxe|rod|weapon|armor>`,
    `/slots <n> · /plots <n>`,
    '',
    `**${t(lang, 'Farming', 'Bertani')}**`,
    `/plant <id> <n|max> · /harvest · /auto`,
    '',
    `**${t(lang, 'Mining', 'Tambang')}**`,
    `/mine <caveId> · /gather · /automine`,
    '',
    `**${t(lang, 'Fishing', 'Pancing')}**`,
    `/fish <baitId> <n|max> · /reel`,
    '',
    `**${t(lang, 'Dungeon', 'Dungeon')}**`,
    `/dungeon <id> · /attack · /heavy · /defend · /potion <id> · /flee`,
    '',
    `**${t(lang, 'Bag & progress', 'Tas & progres')}**`,
    `/bag · /discard <${t(lang, 'category', 'kategori')}> <id> <n|all> · /status`,
    `/info <seed|ore|bait|dungeon|potion> <id> · /ascend`,
    `/quests · /claim · /profile · /ach [${t(lang, 'category', 'kategori')}] · /collection <fish|ore|crops|mobs> · /top [${t(lang, 'kind', 'jenis')}] · /lang <en|id>`,
    '',
    t(lang, 'Examples: /buy seed gandum 100 · /plant wortel max · /sell all · /mine cave_shallow · /bag', 'Contoh: /buy seed gandum 100 · /plant wortel max · /sell all · /mine cave_shallow · /bag'),
  ]);

const buy = (m, { account, lang }, [kind, idRaw, qtyRaw]) => {
  const qty = num(qtyRaw ?? '1');
  if (!kind || !idRaw) return fail(m, lang, 'bad_amount');

  if (kind === 'seed' || kind === 'benih') {
    const seed = findItem(getUnlockedSeeds(farmingLevel(account)), idRaw);
    if (!seed) return fail(m, lang, 'seed_locked');
    const res = buyStack(account, 'seeds', seed, seed.buyPrice, qty === 'max' ? maxStackBuy(account, seed.buyPrice) : qty);
    if (!res.ok) return fail(m, lang, res.code);
    return send(m, lang, '🌱', [`✅ ${t(lang, 'Bought', 'Membeli')} ${label(seed, lang)} ×${formatNumber(res.qty)} (${viaz(res.cost)})`]);
  }
  if (kind === 'bait' || kind === 'umpan') {
    const bait = findItem(getUnlockedBaits(fishingLevel(account)), idRaw);
    if (!bait) return fail(m, lang, 'level');
    const res = buyStack(account, 'baits', bait, bait.cost, qty === 'max' ? maxStackBuy(account, bait.cost) : qty);
    if (!res.ok) return fail(m, lang, res.code);
    return send(m, lang, '🪱', [`✅ ${t(lang, 'Bought', 'Membeli')} ${label(bait, lang)} ×${formatNumber(res.qty)} (${viaz(res.cost)})`]);
  }
  if (kind === 'potion' || kind === 'ramuan') {
    const potion = findItem(POTIONS, idRaw);
    if (!potion) return fail(m, lang, 'not_found');
    const res = buyStack(account, 'potions', potion, potion.cost, qty === 'max' ? maxStackBuy(account, potion.cost) : qty);
    if (!res.ok) return fail(m, lang, res.code);
    return send(m, lang, '🧪', [`✅ ${t(lang, 'Bought', 'Membeli')} ${label(potion, lang)} ×${formatNumber(res.qty)} (${viaz(res.cost)})`]);
  }
  return fail(m, lang, 'bad_amount');
};

const sellReceipt = async (m, account, lang, kind) => {
  const mult = await getViazMultiplier();
  if (kind === 'ore' || kind === 'ores') {
    const res = await sellStack(account, 'ores', ORES);
    if (!res.ok) return fail(m, lang, res.code);
    return send(m, lang, '💎', [`✅ ${t(lang, 'Sold', 'Terjual')} ${res.sold.map((x) => `${label(x.item, lang)} ×${formatNumber(x.qty)}`).join(', ')}\n+${viaz(res.total)} (halving ×${res.halving})`]);
  }
  if (kind === 'fish' || kind === 'ikan') {
    if (!account.fishes?.length) return fail(m, lang, 'nothing_to_sell');
    const { round2 } = require('../lib/halvingMath');
    const { fishValue } = require('../lib/fishingLogic');
    const total = round2(account.fishes.reduce((s, f) => s + fishValue(f, mult), 0));
    const count = account.fishes.length;
    const { record } = P;
    account.fishes = [];
    account.viaz = round2(account.viaz + total);
    record(account, 'earn', total);
    saveAccount(account);
    const { addViazMinted } = require('../lib/halving');
    await addViazMinted(total);
    return send(m, lang, '🐟', [`✅ ${t(lang, 'Sold', 'Terjual')} ${formatNumber(count)} ${t(lang, 'fish', 'ikan')}\n+${viaz(total)} (halving ×${mult})`]);
  }
  if (kind === 'loot') {
    const res = await sellStack(account, 'dungeon_loot', LOOT);
    if (!res.ok) return fail(m, lang, res.code);
    return send(m, lang, '🎁', [`✅ ${t(lang, 'Sold', 'Terjual')} ${res.sold.map((x) => `${label(x.item, lang)} ×${formatNumber(x.qty)}`).join(', ')}\n+${viaz(res.total)} (halving ×${res.halving})`]);
  }
  const res = await sellStack(account, 'harvests', SEEDS);
  if (!res.ok) return fail(m, lang, res.code);
  return send(m, lang, '🌾', [`✅ ${t(lang, 'Sold', 'Terjual')} ${res.sold.map((x) => `${label(x.item, lang)} ×${formatNumber(x.qty)}`).join(', ')}\n+${viaz(res.total)} (halving ×${res.halving})`]);
};

const sell = (m, ctx, [kind]) => sellReceipt(m, ctx.account, ctx.lang, kind ?? 'all');

const TOOL_TYPES = { hoe: 'hoe', cangkul: 'hoe', pickaxe: 'pickaxe', beliung: 'pickaxe', rod: 'rod', pancingan: 'rod', pancing: 'rod', weapon: 'weapon', senjata: 'weapon', armor: 'armor' };
const TOOL_SKILL = { hoe: 'farming', pickaxe: 'mining', rod: 'fishing', weapon: 'dungeon', armor: 'dungeon' };

const tool = (m, { account, lang }, [type, tierRaw]) => {
  const kind = TOOL_TYPES[String(type ?? '').toLowerCase()];
  if (!kind) return fail(m, lang, 'bad_amount');
  const { getNextToolTier } = require('../data/tools');
  const wanted = tierRaw !== undefined && tierRaw !== '' ? parseInt(tierRaw, 10) : (getNextToolTier(kind, account.inventory?.[kind] ?? 0)?.tier ?? (account.inventory?.[kind] ?? 0));
  if (!Number.isFinite(wanted) || wanted < 1) return fail(m, lang, 'max_tier');
  const res = buyToolTier(account, kind, wanted, () => true);
  if (!res.ok) return fail(m, lang, res.code);
  return send(m, lang, '🎉', [`${res.tool.emote} **${nameOf(res.tool, lang)}** ×${res.copies} · ${viaz(res.cost)}`]);
};

const plantCmd = (m, { account, lang }, [idRaw, qtyRaw]) => {
  const seed = findItem(getUnlockedSeeds(farmingLevel(account)), idRaw);
  if (!seed) return fail(m, lang, 'not_found');
  const qty = qtyRaw === 'max' ? maxPlantable(account, seed.id) : num(qtyRaw ?? '1');
  const res = plant(account, seed.id, qty === 'max' ? 0 : qty);
  if (!res.ok) return fail(m, lang, res.code, res);
  saveAccount(account);
  return send(m, lang, '🌱', [`${label(seed, lang)} ×${formatNumber(res.qty)} · ${t(lang, 'ready', 'siap')} <t:${Math.floor(res.finishedAt / 1000)}:R>`]);
};

const harvestCmd = (m, { account, lang }) => {
  const res = settle(account, clockNow(), { manual: true });
  if (res.changed) saveAccount(account);
  if (!res.cycles) return send(m, lang, '🌾', [t(lang, 'Nothing is ready to harvest yet.', 'Belum ada tanaman yang siap dipanen.')]);
  const got = Object.entries(res.harvested).map(([id, n]) => `${getSeed(id)?.emote} ${nameOf(getSeed(id), lang)} ×${formatNumber(n)}`).join(', ');
  return send(m, lang, '🌾', [`🧺 ${t(lang, 'Harvested', 'Dipanen')}: ${got} · ⭐ +${formatNumber(res.xp)} XP`]);
};

const autoCmd = (m, { account, lang }) => {
  if (!canAutoPlant(account)) return fail(m, lang, 'auto_locked');
  account.auto_plant = !account.auto_plant;
  saveAccount(account);
  return send(m, lang, '🤖', [account.auto_plant ? t(lang, 'Auto-Plant ON', 'Auto-Tanam AKTIF') : t(lang, 'Auto-Plant OFF', 'Auto-Tanam MATI')]);
};

const mineCmd = (m, { account, lang }, [idRaw]) => {
  const cave = findItem(getCaves(), idRaw);
  if (!cave) return fail(m, lang, 'not_found');
  const res = startTrip(account, cave.id);
  if (!res.ok) return fail(m, lang, res.code, res);
  saveAccount(account);
  return send(m, lang, '⛏️', [`${label(cave, lang)} · ${t(lang, 'done', 'selesai')} <t:${Math.floor(res.finishedAt / 1000)}:R>`]);
};

const gatherCmd = (m, { account, lang }) => {
  const res = settleMining(account, clockNow(), { manual: true });
  if (res.changed) saveAccount(account);
  if (!res.cycles) return send(m, lang, '⛏️', [t(lang, 'Still digging!', 'Masih menggali!')]);
  const got = Object.entries(res.claimedOres).map(([id, n]) => `${id} ×${formatNumber(n)}`).join(', ');
  return send(m, lang, '⛏️', [`💎 ${t(lang, 'Mined', 'Hasil tambang')}: ${got} · ⭐ +${formatNumber(res.xp)} XP`]);
};

const automineCmd = (m, { account, lang }) => {
  if (!canAutoMine(account)) return fail(m, lang, 'auto_locked');
  account.auto_mining = !account.auto_mining;
  saveAccount(account);
  return send(m, lang, '🤖', [account.auto_mining ? t(lang, 'Auto-Mine ON', 'Auto-Mine AKTIF') : t(lang, 'Auto-Mine OFF', 'Auto-Mine MATI')]);
};

const fishCmd = (m, { account, lang }, [idRaw, qtyRaw]) => {
  const bait = findItem(getUnlockedBaits(fishingLevel(account)), idRaw);
  if (!bait) return fail(m, lang, 'not_found');
  const owned = account.baits?.[bait.id] ?? 0;
  const res = startFishing(account, bait.id, qtyRaw === 'max' ? owned : num(qtyRaw ?? '1'));
  if (!res.ok) return fail(m, lang, res.code, res);
  saveAccount(account);
  return send(m, lang, '🎣', [`${label(bait, lang)} ×${formatNumber(res.qty)} · ${t(lang, 'strike every', 'strike tiap')} ${Math.round(res.strikeMs / 60000)}m`]);
};

const reelCmd = (m, { account, lang }) => {
  if (!isFishingActive(account)) return send(m, lang, '🎣', [t(lang, 'Your line is not in the water.', 'Pancingan tidak sedang dilempar.')]);
  const res = reelIn(account);
  saveAccount(account);
  return send(m, lang, '🎣', [`🎣 ${t(lang, 'Caught', 'Tertangkap')} ${formatNumber(res.caught.length)} ${t(lang, 'fish', 'ikan')} · ⭐ +${formatNumber(res.xp)} XP`]);
};

const bagCmd = (m, { account, lang }) => {
  const { breakdown } = require('../lib/backpack');
  const bd = breakdown(account);
  return send(m, lang, '🎒', [
    `**${formatNumber(usedSlots(account))}/${formatNumber(maxSlots(account))}** ${t(lang, 'slots', 'slot')} · ${t(lang, 'free', 'kosong')} ${formatNumber(freeSlots(account))}`,
    '',
    `🧑‍🌾 ${t(lang, 'Tools', 'Alat')}: ${bd.tools} · 🌱 ${t(lang, 'Seeds', 'Benih')}: ${formatNumber(bd.seeds)} · 🌾 ${t(lang, 'Crops', 'Panen')}: ${formatNumber(bd.harvests)}`,
    `💎 Ore: ${formatNumber(bd.ores)} · 🪱 ${t(lang, 'Bait', 'Umpan')}: ${formatNumber(bd.baits)} · 🐟 ${t(lang, 'Fish', 'Ikan')}: ${formatNumber(bd.fishes)}`,
    `🎁 ${t(lang, 'Loot', 'Loot')}: ${formatNumber(bd.loot)} · 🧪 ${t(lang, 'Potions', 'Ramuan')}: ${formatNumber(bd.potions)}`,
    `${VIAZ_EMOJI}: ${formatViaz(account.viaz)}`,
  ], 0x9c27b0);
};

const discardCmd = (m, { account, lang }, [cat, idRaw, qtyRaw]) => {
  const cats = { seeds: 'seeds', benih: 'seeds', harvests: 'harvests', panen: 'harvests', ores: 'ores', ore: 'ores', baits: 'baits', umpan: 'baits', fishes: 'fishes', ikan: 'fishes', loot: 'dungeon_loot', potions: 'potions', ramuan: 'potions' };
  const category = cats[String(cat ?? '').toLowerCase()];
  if (!category) return fail(m, lang, 'bad_amount');
  const removed = discardItem(account, category, idRaw, qtyRaw === 'all' ? Infinity : num(qtyRaw ?? '1'));
  if (!removed) return fail(m, lang, 'not_found');
  saveAccount(account);
  return send(m, lang, '🗑️', [`${t(lang, 'Discarded', 'Dibuang')} ×${formatNumber(removed)}`], 0xd32f2f);
};

const slotsCmd = (m, { account, lang }, [qtyRaw]) => {
  const qty = Math.max(1, Math.min(100, num(qtyRaw ?? '1')));
  const bought = account.bought_backpack ?? 0;
  if (bought + qty > G.MAX_BOUGHT_BACKPACK) return fail(m, lang, 'max_backpack');
  const cost = backpacksCost(bought, qty);
  if (!Number.isFinite(cost) || account.viaz < cost) return fail(m, lang, 'no_viaz');
  account.viaz = Math.round((account.viaz - cost) * 100) / 100;
  account.bought_backpack = bought + qty;
  saveAccount(account);
  return send(m, lang, '🎒', [`🎉 +${formatNumber(qty * G.SLOTS_PER_BACKPACK_UPGRADE)} ${t(lang, 'slots', 'slot')} (${viaz(cost)})`], 0x9c27b0);
};

const plotsCmd = (m, { account, lang }, [qtyRaw]) => {
  const qty = Math.max(1, Math.min(1000, num(qtyRaw ?? '1')));
  if (account.bought_plots + qty > G.MAX_BOUGHT_PLOTS) return fail(m, lang, 'max_plots');
  const cost = plotsCost(account.bought_plots, qty);
  if (!Number.isFinite(cost) || account.viaz < cost) return fail(m, lang, 'no_viaz');
  account.viaz = Math.round((account.viaz - cost) * 100) / 100;
  account.bought_plots += qty;
  saveAccount(account);
  return send(m, lang, '🟫', [`🎉 +${formatNumber(qty)} ${t(lang, 'plots', 'plot')} (${viaz(cost)})`]);
};

const dungeonCmd = (m, { account, lang }, [idRaw]) => {
  const d = findItem(DUNGEONS, idRaw);
  if (!d) return fail(m, lang, 'not_found');
  const res = startRun(account, d.id);
  if (!res.ok) return fail(m, lang, res.code === 'locked' ? 'dungeon_locked' : res.code);
  saveAccount(account);
  const mo = getMonster(account.dungeon_run.enemy.id);
  return send(m, lang, '🔮', [`🚪 ${label(d, lang)}${res.fee ? ` (-${viaz(res.fee)})` : ''} · ${mo.emote} ${nameOf(mo, lang)}`, t(lang, 'Use /attack / /heavy / /defend / /potion <id> / /flee.', 'Pakai /attack / /heavy / /defend / /potion <id> / /flee.')], 0xb71c1c);
};

async function dungeonTurn(m, { account, lang }, action) {
  if (!account.dungeon_run) return fail(m, lang, 'no_run');
  const res = act(account, action);
  saveAccount(account);
  if (!res.ok) return fail(m, lang, res.code);
  const run = account.dungeon_run;
  const lines = res.events.map((e) => {
    switch (e.type) {
      case 'hit': return `⚔️ **${e.dmg}**${e.crit ? ' 💥' : ''}${e.heavy ? ' (heavy)' : ''}`;
      case 'miss': return `💨 ${t(lang, 'Missed!', 'Meleset!')}`;
      case 'defend': return `🛡️ ${t(lang, 'Defending.', 'Bertahan.')}`;
      case 'potion': return `🧪 +${e.healed} HP`;
      case 'interrupt': return `💢 ${t(lang, 'Charge interrupted!', 'Charge dibatalkan!')}`;
      case 'charge': return `⚡ ${t(lang, 'Enemy is charging!', 'Musuh mengisi tenaga!')}`;
      case 'enemy_hit': return `🩸 -${e.dmg} HP${e.charged ? ' ⚡' : ''}`;
      case 'kill': return `☠️ +${viaz(e.viaz)} · +${e.xp} XP`;
      case 'flee': return `🏃 ${t(lang, 'Fled.', 'Kabur.')}`;
      default: return '';
    }
  }).filter(Boolean);
  if (res.finished) {
    const s = res.finished;
    lines.push('', s.outcome === 'win' ? `🏆 ${t(lang, 'Dungeon cleared!', 'Dungeon ditaklukkan!')}` : s.outcome === 'flee' ? `🏃 ${viaz(s.viaz)} · +${s.xp} XP` : `💀 +${viaz(s.viaz)} · +${s.xp} XP`);
    return send(m, lang, '🔮', lines, 0xb71c1c);
  }
  if (run) {
    const mo = getMonster(run.enemy.id);
    lines.push('', `❤️ HP ${run.hp}/${run.max_hp} · ${mo.emote} ${nameOf(mo, lang)} ${run.enemy.hp}/${run.enemy.max_hp}${run.enemy.charging ? ' ⚡' : ''}`);
  }
  return send(m, lang, '🔮', lines, 0xb71c1c);
}

const potionCmd = (m, ctx, [idRaw]) => {
  const potion = findItem(POTIONS, idRaw);
  if (!potion) return fail(m, ctx.lang, 'not_found');
  return dungeonTurn(m, ctx, `potion:${potion.id}`);
};

const questsCmd = (m, { account, lang }) => {
  const S = require('../ui/progressScreens');
  saveAccount(account); // quest harian/mingguan baru dibuat saat dibuka
  return sendScreen(m, S.questsScreen(account, lang));
};

const claimCmd = async (m, { account, lang }) => {
  const res = P.claimQuests(account);
  if (!res.ok) return fail(m, lang, res.code);
  saveAccount(account);
  return send(m, lang, '🎁', [`✅ ${t(lang, 'Claimed', 'Diklaim')} ${res.count} ${t(lang, 'quests', 'quest')}: **+${viaz(res.total)}**`], 0xffb300);
};

const profileCmd = (m, { account, lang }) => {
  const S = require('../ui/progressScreens');
  return sendScreen(m, S.profileScreen(account, lang));
};

const achCmd = (m, { account, lang }, [catRaw]) => {
  const S = require('../ui/progressScreens');
  const cat = S.CATEGORIES.some(([id]) => id === catRaw) ? catRaw : 'farming';
  return sendScreen(m, S.achScreen(account, lang, cat));
};

const collCmd = (m, { account, lang }, [catRaw]) => {
  const S = require('../ui/progressScreens');
  const map = { crops: 'crops', tanaman: 'crops', ores: 'ores', ore: 'ores', fish: 'fish', ikan: 'fish', mobs: 'mobs', monster: 'mobs' };
  return sendScreen(m, S.collScreen(account, lang, map[catRaw] ?? 'fish'));
};

const ascendCmd = (m, { account, lang }) => {
  const S = require('../ui/progressScreens');
  const check = P.ascendCheck(account);
  if (!check.ok) return sendScreen(m, S.ascendScreen(account, lang, errorText(lang, check.code)));
  const res = P.ascend(account);
  if (!res.ok) return sendScreen(m, S.ascendScreen(account, lang, errorText(lang, res.code)));
  saveAccount(account);
  return sendScreen(m, S.profileScreen(account, lang, `✨ ${t(lang, `Ascension ${res.prestige} complete!`, `Ascension ${res.prestige} selesai!`)}`));
};

const statusCmd = (m, { account, lang }) => {
  const lines = [];
  const plants = Object.entries(account.plantings ?? {});
  if (plants.length) lines.push(`🧑‍🌾 ${t(lang, 'Farming', 'Bertani')}: ${plants.map(([id, b]) => `${getSeed(id)?.emote} ${nameOf(getSeed(id), lang)} ×${formatNumber(b.qty)}`).join(', ')}`);
  if (account.mining_trip) { const c = getCave(account.mining_trip.cave_id); lines.push(`⛏️ ${t(lang, 'Mining', 'Tambang')}: ${c ? label(c, lang) : '?'} · ${t(lang, 'done', 'selesai')} <t:${Math.floor(account.mining_trip.finished_at / 1000)}:R>`); }
  if (account.fishing_session) { const b = getBait(account.fishing_session.bait_id); lines.push(`🎣 ${t(lang, 'Fishing', 'Pancing')}: ${b ? label(b, lang) : '?'} ×${formatNumber(account.fishing_session.baits_remaining)} ${t(lang, 'bait left', 'umpan sisa')}`); }
  if (account.dungeon_run) lines.push(`🔮 ${t(lang, 'Dungeon', 'Dungeon')}: ${account.dungeon_run.dungeon_id} · floor ${account.dungeon_run.floor + 1}`);
  if (!lines.length) lines.push(t(lang, 'No active activity. One at a time: farming, mining, fishing or dungeon.', 'Tidak ada aktivitas berjalan. Satu dalam satu waktu: bertani, tambang, pancing, atau dungeon.'));
  return send(m, lang, '📊', lines);
};

const infoCmd = (m, { account, lang }, [kind, idRaw]) => {
  const kindMap = { seed: 'seed', benih: 'seed', ore: 'ore', bait: 'bait', umpan: 'bait', dungeon: 'dungeon', potion: 'potion', ramuan: 'potion' };
  const k = kindMap[String(kind ?? '').toLowerCase()];
  if (!k) return fail(m, lang, 'bad_amount');
  if (k === 'seed') {
    const it = findItem(SEEDS, idRaw);
    if (!it) return fail(m, lang, 'not_found');
    return send(m, lang, '🌱', [`${label(it, lang)} · Lv ${it.levelUnlock} · ${it.growMs / 60000}m · +${it.xp} XP`, `${t(lang, 'Buy', 'Beli')} ${viaz(price(it.buyPrice))} · ${t(lang, 'Sell', 'Jual')} ${viaz(price(it.sellPrice))}`]);
  }
  if (k === 'ore') {
    const it = findItem(ORES, idRaw);
    if (!it) return fail(m, lang, 'not_found');
    return send(m, lang, '💎', [`${label(it, lang)} · ${t(lang, 'Sells for', 'Dijual')} ${viaz(price(it.sellPrice))}`]);
  }
  if (k === 'bait') {
    const it = findItem(BAITS, idRaw);
    if (!it) return fail(m, lang, 'not_found');
    return send(m, lang, '🪱', [`${label(it, lang)} · ${viaz(price(it.cost))} · C/U/R/E/L ${it.pool.join('/')}`]);
  }
  if (k === 'dungeon') {
    const it = findItem(DUNGEONS, idRaw);
    if (!it) return fail(m, lang, 'not_found');
    return send(m, lang, '🔮', [`${label(it, lang)} · Lv ${it.unlockLevel} · ${it.floors.length} ${t(lang, 'floors', 'lantai')} · ${t(lang, 'fee', 'biaya')} ${viaz(price(it.fee ?? 0))}`]);
  }
  const it = findItem(POTIONS, idRaw);
  if (!it) return fail(m, lang, 'not_found');
  return send(m, lang, '🧪', [`${label(it, lang)} · +${it.heal} HP · ${viaz(price(it.cost))}`]);
};

const boostCmd = async (m, { account, lang }, [sub, idRaw]) => {
  const { buyBoost } = require('../lib/boosts');
  const BS = require('../ui/boostScreens');
  if (sub === 'buy' && idRaw) {
    const res = buyBoost(account, idRaw.toLowerCase());
    if (!res.ok) return fail(m, lang, res.code);
    saveAccount(account);
    return sendScreen(m, BS.boostShop(account, lang, `✅ ${res.boost.emote} **${nameOf(res.boost, lang)}**`));
  }
  return sendScreen(m, BS.boostShop(account, lang));
};

const topCmd = async (m, { account, lang }, [kindRaw]) => {
  const { getTop, KINDS } = require('../lib/leaderboard');
  const S = require('../ui/progressScreens');
  const kind = KINDS.includes(kindRaw) ? kindRaw : 'total';
  return sendScreen(m, S.topScreen(lang, kind, await getTop(kind)));
};

const langCmd = (m, { account, lang }, [to]) => {
  const next = to === 'id' ? 'id' : 'en';
  account.lang = next;
  saveAccount(account);
  return send(m, next, '🌐', [t(next, 'Language set to English.', 'Bahasa diubah ke Bahasa Indonesia.')]);
};

/* ============ Router pesan ============ */

const COMMANDS = {
  help: help, bantuan: help, menu: help,
  buy: buy, beli: buy,
  sell: sell, jual: sell,
  tool: tool, alat: tool,
  plant: plantCmd, tanam: plantCmd,
  harvest: harvestCmd, panen: harvestCmd,
  auto: autoCmd,
  mine: mineCmd, tambang: mineCmd, gali: mineCmd,
  claim: claimCmd, klaim: claimCmd,
  gather: gatherCmd, ambil: gatherCmd,
  automine: automineCmd,
  fish: fishCmd, pancing: fishCmd,
  reel: reelCmd, tarik: reelCmd,
  bag: bagCmd, tas: bagCmd, inventory: bagCmd,
  discard: discardCmd, buang: discardCmd,
  slots: slotsCmd, slot: slotsCmd,
  plots: plotsCmd, plot: plotsCmd,
  dungeon: dungeonCmd,
  attack: (m, ctx) => dungeonTurn(m, ctx, 'attack'),
  serang: (m, ctx) => dungeonTurn(m, ctx, 'attack'),
  heavy: (m, ctx) => dungeonTurn(m, ctx, 'heavy'),
  defend: (m, ctx) => dungeonTurn(m, ctx, 'defend'),
  bertahan: (m, ctx) => dungeonTurn(m, ctx, 'defend'),
  flee: (m, ctx) => dungeonTurn(m, ctx, 'flee'),
  kabur: (m, ctx) => dungeonTurn(m, ctx, 'flee'),
  potion: potionCmd, ramuan: potionCmd,
  quests: questsCmd, quest: questsCmd,
  profile: profileCmd, profil: profileCmd,
  ach: achCmd, achievements: achCmd, pencapaian: achCmd,
  collection: collCmd, koleksi: collCmd,
  ascend: ascendCmd,
  status: statusCmd,
  info: infoCmd,
  upgrade: tool, alat2: tool,
  boost: boostCmd, booster: boostCmd,
  top: topCmd, peringkat: topCmd,
  lang: langCmd, bahasa: langCmd,
};

async function handleMessage(message) {
  try {
    if (!message.author || message.author.bot || !message.guild) return;
    const content = String(message.content ?? '');
    if (!content.startsWith(PREFIX)) return;

    const { withUserLock, loadAccount } = require('../lib/account');
    await withUserLock(message.author.id, async () => {
      const account = await loadAccount(message.author.id);
      if (!account) {
        await message.channel.send(errorText('en', 'no_account')).catch(() => {});
        return;
      }
      const { isOwnThread } = require('./handler');
      if (!(await isOwnThread({ channelId: message.channelId, channel: message.channel, user: message.author }, account))) {
        await message.channel.send(errorText(langOf(account), 'wrong_thread')).catch(() => {});
        return;
      }
      if (!checkRateLimit(message.author.id)) return; // diam, jangan spam

      const lang = langOf(account);
      account.last_thread_activity = new Date().toISOString();
      const notes = settleAll(account, lang);
      const parts = content.slice(PREFIX.length).trim().split(/\s+/);
      const cmd = (parts[0] ?? '').toLowerCase();
      const args = parts.slice(1);
      const handler = COMMANDS[cmd];
      if (!handler) {
        if (notes) saveAccount(account);
        await send(message, lang, '❓', [`${t(lang, `Unknown command: ${cmd}. Type /help`, `Perintah tidak dikenal: ${cmd}. Ketik /help`)}`]);
        return;
      }
      await handler(message, { account, lang }, args);
      // loadAccount mengembalikan objek yang sama dari cache, jadi satu saveAccount menutup settle + perintah.
      saveAccount(account);
    });
  } catch (e) {
    console.warn('[GROWVIA] Command error:', e.stack || e.message);
  }
}

module.exports = { handleMessage, COMMANDS, findItem };
