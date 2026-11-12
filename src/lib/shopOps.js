'use strict';

/**
 * Transaksi toko yang dipakai berulang (beli alat bertingkat, jual tumpukan item).
 * Semua mengembalikan { ok, code?, ... } supaya UI bisa menerjemahkan.
 */

const { saveAccount } = require('./account');
const { getViazMultiplier, addViazMinted } = require('./halving');
const { round2 } = require('./halvingMath');
const { getToolList, toolKey } = require('../data/tools');
const { freeSlots } = require('./backpack');
const { price } = require('./viazRate');
const { record, sellBonus } = require('./progress');
const G = require('../config/game');

/**
 * Beli 1 copy alat tier tertentu (boleh berulang, sesuai level). Copy tersimpan di account.items
 * dengan kunci "<type>_<tier>" — model siap trade antar pemain. Alat terpasang = tier tertinggi dimiliki.
 * levelOk(def): syarat level untuk tier itu.
 */
function buyToolTier(account, type, tier, levelOk) {
  const def = getToolList(type).find((x) => x.tier === tier);
  if (!def) return { ok: false, code: 'not_found' };
  if (!levelOk(def)) return { ok: false, code: 'level' };
  if (freeSlots(account) < 1) return { ok: false, code: 'bag_full' };
  const cost = price(def.cost);
  if (account.viaz < cost) return { ok: false, code: 'no_viaz' };
  account.viaz = round2(account.viaz - cost);
  if (!account.items) account.items = {};
  const key = toolKey(type, tier);
  account.items[key] = (account.items[key] ?? 0) + 1;
  if (!account.inventory) account.inventory = {};
  if ((account.inventory[type] ?? 0) < tier) account.inventory[type] = tier; // auto-equip tier tertinggi
  saveAccount(account);
  return { ok: true, tool: def, copies: account.items[key], eqTier: account.inventory[type], cost };
}

/**
 * Beli `qty` item konsumsi (benih / umpan / ramuan) ke account[field].
 * Harga ikut kurs halving. Dibatasi Viaz, slot tas, dan maxPerAction.
 */
function buyStack(account, field, item, baseCost, qty) {
  const unit = price(baseCost);
  const max = Math.max(0, Math.min(G.MAX_BUY_PER_ACTION, Math.floor(account.viaz / unit), freeSlots(account)));
  const n = Math.min(Math.floor(qty) || 0, max);
  if (n < 1) return { ok: false, code: freeSlots(account) < 1 ? 'bag_full' : 'no_viaz' };
  const cost = round2(n * unit);
  account.viaz = round2(account.viaz - cost);
  if (!account[field]) account[field] = {};
  account[field][item.id] = (account[field][item.id] ?? 0) + n;
  saveAccount(account);
  return { ok: true, qty: n, cost };
}

/** Jumlah maksimum yang bisa dibeli sekarang. */
function maxStackBuy(account, baseCost) {
  return Math.max(0, Math.min(G.MAX_BUY_PER_ACTION, Math.floor(account.viaz / price(baseCost)), freeSlots(account)));
}

/**
 * Jual tumpukan item dari account[field] (map id -> qty).
 * items: daftar definisi { id, sellPrice }, ids: null = semua.
 */
async function sellStack(account, field, items, ids = null) {
  const halving = await getViazMultiplier();
  const bonus = sellBonus(account);
  const mult = halving * bonus;
  const stock = account[field] ?? {};
  const targets = items.filter((it) => (stock[it.id] ?? 0) > 0 && (!ids || ids.includes(it.id)));
  if (!targets.length) return { ok: false, code: 'nothing_to_sell' };
  let total = 0;
  const sold = [];
  for (const it of targets) {
    const qty = stock[it.id];
    total = round2(total + qty * it.sellPrice * mult);
    sold.push({ item: it, qty });
    delete stock[it.id];
  }
  account.viaz = round2(account.viaz + total);
  record(account, 'earn', total);
  saveAccount(account);
  await addViazMinted(total);
  return { ok: true, total, sold, mult, halving, bonus };
}

module.exports = { buyToolTier, buyStack, maxStackBuy, sellStack };
