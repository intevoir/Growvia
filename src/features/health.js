'use strict';

/**
 * Laporan kesehatan berkala ke channel logs (LOG_CHANNEL_ID) + console.
 * Menandai peringatan kalau antrean tulis DB menumpuk atau banyak error.
 */

const { LOG_CHANNEL_ID } = require('../config/constants');
const { drain, uptimeMs } = require('../lib/metrics');
const { cacheStats, getGlobalStats } = require('../lib/account');
const { getState } = require('../lib/halving');
const { formatNumber, formatDuration } = require('../lib/format');

const REPORT_MS = 15 * 60 * 1000;
const BUFFER_WARN = 2000;
const ERROR_WARN = 25;

async function buildReport(client) {
  const snap = drain();
  const { cached, buffered } = cacheStats();
  const [players, halving] = await Promise.all([getGlobalStats().catch(() => ({ playerCount: 0 })), getState().catch(() => null)]);
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const warn = buffered > BUFFER_WARN || snap.errors > ERROR_WARN || snap.slow > 50;
  const line = [
    `${warn ? '⚠️' : '✅'} **Growvia health**`,
    `Uptime ${formatDuration(uptimeMs())} · ping ${Math.round(client.ws.ping)} ms · RSS ${mem} MB`,
    `Interactions ${formatNumber(snap.interactions)} (${formatNumber(Math.round(snap.interactions / (REPORT_MS / 60000)))}/min) · errors ${snap.errors} · rate limited ${snap.rateLimited} · slow(>2s) ${snap.slow}`,
    `Cache ${formatNumber(cached)} · write queue ${formatNumber(buffered)} · players ${formatNumber(players.playerCount)}`,
    halving ? `Halving ×${halving.multiplier} · minted ${formatNumber(Math.round(halving.totalViazMinted))}` : null,
  ].filter(Boolean).join('\n');
  return { line, warn };
}

async function report(client) {
  const { line, warn } = await buildReport(client);
  console.log(`[GROWVIA] ${line.replace(/\*\*/g, '').replace(/\n/g, ' | ')}`);
  if (!LOG_CHANNEL_ID) return;
  const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  // Laporan sehat cukup di console; ke channel hanya kalau ada peringatan agar channel tidak spam.
  if (channel?.isTextBased() && warn) await channel.send({ content: line }).catch(() => {});
}

function startHealthReporter(client) {
  const timer = setInterval(() => report(client).catch((e) => console.warn('[GROWVIA] health gagal:', e.message)), REPORT_MS);
  if (timer.unref) timer.unref();
  return timer;
}

/** Pesan satu kali ke channel logs (start / shutdown). */
async function notify(client, content) {
  if (!LOG_CHANNEL_ID) return;
  const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ content }).catch(() => {});
}

module.exports = { startHealthReporter, notify, report };
