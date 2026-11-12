'use strict';

/**
 * Pasang panel publik (English, Components V2) di tiap channel.
 * Baris panel_state: 1=farming, 2=akun, 3=toko tani, 4=mining, 5=toko tambang,
 * 6=armory, 7=fishing, 8=toko pancing, 9=dungeon, 10=toko dungeon, 11=hall.
 * Angka live per aktivitas (berapa pemain sedang farming/dll) ditanam di panel channel aktivitasnya
 * (baris 1, 4, 7, 9) dan diperbarui tiap 60 detik, supaya tidak perlu channel khusus.
 */

const C = require('../config/constants');
const { getGlobalStats } = require('../lib/account');
const { getTop } = require('../lib/leaderboard');
const { getLiveActivity } = require('../lib/liveActivity');
const { PANELS } = require('../ui/panels');
const { payload } = require('../ui/v2');
const { client } = require('../bot/client');
const { supabase } = require('../lib/db');

const TABLE_PANEL = 'panel_state';

async function readPanelState(rowId) {
  const { data } = await supabase.from(TABLE_PANEL).select('*').eq('id', rowId).maybeSingle();
  return data ?? null;
}

async function savePanelState(rowId, channelId, messageId) {
  await supabase.from(TABLE_PANEL).upsert({ id: rowId, channel_id: channelId, message_id: messageId }, { onConflict: 'id' });
}

/** Edit panel yang ada; kalau hilang / channel berubah, kirim baru (panel lama dihapus). */
async function ensurePanel({ rowId, channelId, label, screen, quiet = false }) {
  if (!channelId) {
    console.warn(`[GROWVIA] Panel ${label}: channel ID belum diisi di .env`);
    return;
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[GROWVIA] Panel ${label}: channel tidak ditemukan / bukan text channel.`);
    return;
  }
  const body = payload(screen);
  const saved = await readPanelState(rowId);

  if (saved?.message_id && saved.channel_id === channelId) {
    try {
      const existing = await channel.messages.fetch(saved.message_id);
      // Pesan lama (embed) dibersihkan supaya bisa jadi V2.
      await existing.edit({ ...body, content: null, embeds: [] });
      if (!quiet) console.log(`[GROWVIA] Panel ${label} diperbarui.`);
      return;
    } catch (e) {
      console.warn(`[GROWVIA] Panel ${label}: edit gagal (${e.message}), kirim ulang.`);
    }
  } else if (saved?.message_id && saved.channel_id) {
    const old = await client.channels.fetch(saved.channel_id).catch(() => null);
    await old?.messages?.delete(saved.message_id).catch(() => {});
  }

  try {
    const sent = await channel.send(body);
    await savePanelState(rowId, channelId, sent.id);
    console.log(`[GROWVIA] Panel ${label} dibuat.`);
  } catch (e) {
    console.warn(`[GROWVIA] Gagal membuat panel ${label}:`, e.message);
  }
}

const LIVE_REFRESH_MS = 10 * 60 * 1000;

async function ensurePanels() {
  const [stats, top, live] = await Promise.all([getGlobalStats(), getTop('total', 5).catch(() => []), getLiveActivity().catch(() => null)]);
  const list = [
    { rowId: 2, channelId: C.ACCOUNT_CHANNEL_ID, label: 'akun', screen: PANELS.account(stats) },
    { rowId: 1, channelId: C.FARM_CHANNEL_ID, label: 'farming', screen: PANELS.farm(live) },
    { rowId: 3, channelId: C.SHOP_CHANNEL_ID, label: 'toko tani', screen: PANELS.farmShop() },
    { rowId: 4, channelId: C.MINING_CHANNEL_ID, label: 'mining', screen: PANELS.mining(live) },
    { rowId: 5, channelId: C.MINING_SHOP_CHANNEL_ID, label: 'toko tambang', screen: PANELS.miningShop() },
    { rowId: 6, channelId: C.BACKPACK_CHANNEL_ID, label: 'armory', screen: PANELS.armory() },
    { rowId: 7, channelId: C.FISHING_CHANNEL_ID, label: 'fishing', screen: PANELS.fishing(live) },
    { rowId: 8, channelId: C.FISHING_SHOP_CHANNEL_ID, label: 'toko pancing', screen: PANELS.fishingShop() },
    { rowId: 9, channelId: C.DUNGEON_CHANNEL_ID, label: 'dungeon', screen: PANELS.dungeon(live) },
    { rowId: 10, channelId: C.DUNGEON_SHOP_CHANNEL_ID, label: 'toko dungeon', screen: PANELS.dungeonShop() },
    { rowId: 11, channelId: C.HALL_CHANNEL_ID, label: 'hall', screen: PANELS.hall({ top }) },
    { rowId: 12, channelId: C.BOOSTS_CHANNEL_ID, label: 'boosts', screen: PANELS.boosts() },
    { rowId: 13, channelId: C.SUGGEST_CHANNEL_ID, label: 'saran', screen: PANELS.feedback() },
  ];
  for (const p of list) {
    await ensurePanel(p).catch((e) => console.warn(`[GROWVIA] Panel ${p.label} gagal:`, e.message));
  }
}

/** Perbarui panel yang menampilkan data hidup (jumlah pemain, top 5) tiap 10 menit. */
function startPanelRefresher() {
  const timer = setInterval(async () => {
    const [stats, top] = await Promise.all([getGlobalStats(), getTop('total', 5).catch(() => [])]);
    await ensurePanel({ rowId: 11, channelId: C.HALL_CHANNEL_ID, label: 'hall', screen: PANELS.hall({ top }), quiet: true }).catch(() => {});
  }, LIVE_REFRESH_MS);
  if (timer.unref) timer.unref();
  return timer;
}

/** Angka live di panel channel aktivitas + jumlah pemain di panel Play: diedit ulang tiap 60 detik. */
const ACTIVITY_REFRESH_MS = 60_000;

function startActivityRefresher() {
  const timer = setInterval(async () => {
    const [live, stats] = await Promise.all([getLiveActivity().catch(() => null), getGlobalStats().catch(() => null)]);
    const panels = [
      { rowId: 2, channelId: C.ACCOUNT_CHANNEL_ID, label: 'akun', screen: PANELS.account(stats) },
      { rowId: 1, channelId: C.FARM_CHANNEL_ID, label: 'farming', screen: PANELS.farm(live) },
      { rowId: 4, channelId: C.MINING_CHANNEL_ID, label: 'mining', screen: PANELS.mining(live) },
      { rowId: 7, channelId: C.FISHING_CHANNEL_ID, label: 'fishing', screen: PANELS.fishing(live) },
      { rowId: 9, channelId: C.DUNGEON_CHANNEL_ID, label: 'dungeon', screen: PANELS.dungeon(live) },
    ];
    for (const p of panels) await ensurePanel({ ...p, quiet: true }).catch(() => {});
  }, ACTIVITY_REFRESH_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { ensurePanels, startPanelRefresher, startActivityRefresher };
