'use strict';

const G = require('../config/game');
const { countToolCopies } = require('../data/tools');
const { price } = require('./viazRate');

/**
 * Kapasitas tas. 1 item = 1 slot (alat, benih, panen, ore, umpan, ikan, loot dungeon, ramuan).
 * Kapasitas awal 1000 slot, tiap upgrade +100.
 */

/** Kategori tumpukan (map id -> qty) yang bisa dibuang. Ikan disimpan sebagai array, ditangani terpisah. */
const STACKS = ['seeds', 'harvests', 'ores', 'baits', 'dungeon_loot', 'potions'];

function countMap(map) {
  let total = 0;
  for (const v of Object.values(map ?? {})) total += Math.max(0, Math.floor(Number(v) || 0));
  return total;
}

function breakdown(account) {
  // 1 copy alat = 1 slot (alat bisa dibeli berulang & kelak di-trade).
  const tools = countToolCopies(account.items);
  const out = {
    tools,
    seeds: countMap(account.seeds),
    harvests: countMap(account.harvests),
    ores: countMap(account.ores),
    baits: countMap(account.baits),
    fishes: Array.isArray(account.fishes) ? account.fishes.length : 0,
    loot: countMap(account.dungeon_loot),
    potions: countMap(account.potions),
  };
  out.total = Object.values(out).reduce((s, n) => s + n, 0);
  return out;
}

const usedSlots = (account) => breakdown(account).total;

function maxSlots(account) {
  const bought = Math.max(0, Math.floor(Number(account.bought_backpack) || 0));
  return G.BASE_BACKPACK_SLOTS + bought * G.SLOTS_PER_BACKPACK_UPGRADE;
}

const freeSlots = (account) => Math.max(0, maxSlots(account) - usedSlots(account));
const canFit = (account, qty) => freeSlots(account) >= qty;

/** Harga upgrade tas berikutnya berdasarkan jumlah yang sudah dibeli (ikut kurs halving). */
function backpackPrice(bought) {
  return price(Math.floor(G.BACKPACK_BASE_PRICE * G.BACKPACK_PRICE_GROWTH ** bought));
}

function backpacksCost(bought, qty) {
  let total = 0;
  for (let i = 0; i < qty; i++) total += backpackPrice(bought + i);
  return total;
}

/** Item yang bisa dibuang darurat. Alat dikecualikan. */
function getDiscardableItems(account) {
  const items = [];
  for (const category of STACKS) {
    for (const [id, qty] of Object.entries(account[category] ?? {})) {
      if (qty > 0) items.push({ category, id, qty });
    }
  }
  const fishes = Array.isArray(account.fishes) ? account.fishes.length : 0;
  if (fishes > 0) items.push({ category: 'fishes', id: 'all_fishes', qty: fishes });
  return items;
}

function discardItem(account, category, id, qty) {
  if (category === 'fishes') {
    if (!Array.isArray(account.fishes) || account.fishes.length === 0) return 0;
    const n = Math.min(account.fishes.length, Math.max(1, Math.floor(qty || account.fishes.length)));
    account.fishes.splice(0, n);
    return n;
  }
  if (!STACKS.includes(category)) return 0;
  const current = account[category]?.[id] ?? 0;
  if (current <= 0) return 0;
  const n = Math.min(current, Math.max(1, Math.floor(qty)));
  account[category][id] = current - n;
  if (account[category][id] <= 0) delete account[category][id];
  return n;
}

module.exports = { breakdown, usedSlots, maxSlots, freeSlots, canFit, backpackPrice, backpacksCost, getDiscardableItems, discardItem };
