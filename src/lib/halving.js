'use strict';

const { supabase } = require('./db');
const { computeHalving, round2 } = require('./halvingMath');
const { setRate } = require('./viazRate');

const TABLE = 'halving_state';
const ROW_ID = 1;
const FLUSH_INTERVAL_MS = 5000;

/** Total Viaz yang pernah tercetak lewat penjualan hasil panen (sumber kebenaran di memori). */
let totalMinted = 0;
let loadPromise = null;
let dirty = false;
let flushTimer = null;

async function load() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('total_viaz_minted')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) throw error;
  totalMinted = Number(data?.total_viaz_minted ?? 0) || 0;
  setRate(computeHalving(totalMinted).multiplier);
}

function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = load().catch((e) => {
      loadPromise = null;
      throw e;
    });
  }
  return loadPromise;
}

async function flush() {
  if (!dirty) {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    return;
  }
  dirty = false;
  try {
    const { error } = await supabase.from(TABLE).upsert(
      { id: ROW_ID, total_viaz_minted: totalMinted, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
    if (error) throw error;
  } catch (e) {
    dirty = true; // coba lagi di flush berikutnya
    console.error('[GROWVIA] flush halving gagal:', e.message);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  if (flushTimer.unref) flushTimer.unref();
}

/** Multiplier harga jual saat ini (0.01 sampai 1.0). Murni dari memori setelah load pertama. */
async function getViazMultiplier() {
  await ensureLoaded();
  return computeHalving(totalMinted).multiplier;
}

/** Catat Viaz baru yang tercetak (dibuffer, ditulis ke DB tiap 5 detik). */
async function addViazMinted(amount) {
  await ensureLoaded();
  totalMinted = round2(totalMinted + amount);
  setRate(computeHalving(totalMinted).multiplier);
  dirty = true;
  scheduleFlush();
}

async function getState() {
  await ensureLoaded();
  return { totalViazMinted: totalMinted, ...computeHalving(totalMinted) };
}

module.exports = { getViazMultiplier, addViazMinted, getState, flush };
