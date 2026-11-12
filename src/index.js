'use strict';

require('dotenv').config();

const { Events, disableValidators } = require('discord.js');

// Validasi builder discord.js membuat banyak objek error di jalur panas (~12% CPU di uji beban).
// Payload sudah dicek penuh di test/ui-check.js, jadi di produksi dimatikan. GROWVIA_VALIDATE=1 menyalakan lagi.
if (process.env.GROWVIA_VALIDATE !== '1') disableValidators();
const { client } = require('./bot/client');
const { routeInteraction } = require('./bot/router');
const { ensurePanels, startPanelRefresher, startActivityRefresher } = require('./features/panel');
const { startHealthReporter, notify } = require('./features/health');
const { startSettleWorker } = require('./features/settleWorker');
const { checkpoint } = require('./lib/clock');
const writeBehind = require('./lib/writeBehind');
const { handleMessage: handleChatCommand } = require('./features/commands');
const { latestCommit, FRESH_MINUTES } = require('./lib/deployNote');
const { startThreadSweeper } = require('./features/threadSweeper');
const { flushNow: flushAccounts } = require('./lib/account');
const { flush: flushHalving, getState } = require('./lib/halving');
const { quit: quitRedis } = require('./lib/redis');

for (const name of [
  'ACCOUNT_CHANNEL_ID',
  'FARM_CHANNEL_ID',
  'SHOP_CHANNEL_ID',
  'MINING_CHANNEL_ID',
  'MINING_SHOP_CHANNEL_ID',
  'BACKPACK_CHANNEL_ID',
  'FISHING_CHANNEL_ID',
  'FISHING_SHOP_CHANNEL_ID',
  'DUNGEON_CHANNEL_ID',
  'DUNGEON_SHOP_CHANNEL_ID',
  'HALL_CHANNEL_ID',
  'BOOSTS_CHANNEL_ID',
  'SUGGEST_CHANNEL_ID',
]) {
  if (!process.env[name]) console.warn(`[GROWVIA] ${name} kosong di .env, panel terkait tidak akan dibuat.`);
}

client.once(Events.ClientReady, async () => {
  console.log(`[GROWVIA] Login sebagai ${client.user.tag}`);
  // Kurs halving harus sudah termuat sebelum pemain pertama membeli sesuatu (harga ikut kurs).
  await getState().catch((e) => console.warn('[GROWVIA] muat halving gagal:', e.message));
  writeBehind.startLoop();
  startSettleWorker();
  startThreadSweeper(client);
  startHealthReporter(client);
  await ensurePanels().catch((e) => console.warn('[GROWVIA] ensurePanels gagal:', e.message));
  startPanelRefresher();
  startActivityRefresher();
  // Umumkan perubahan terakhir ke channel logs (bukan sekadar "bot online").
  const note = latestCommit();
  if (note && note.ageMinutes <= FRESH_MINUTES) await notify(client, note.text);
  else await notify(client, '🟢 Growvia is online.');
});

// Tanpa listener 'error', error koneksi Discord bisa mematikan proses.
client.on(Events.Error, (e) => console.warn('[GROWVIA] Discord client error:', e.message));
client.on(Events.ShardError, (e) => console.warn('[GROWVIA] Discord shard error:', e.message));
process.on('unhandledRejection', (reason) => {
  console.error('[GROWVIA] unhandledRejection:', reason instanceof Error ? reason.stack : reason);
});

client.on(Events.InteractionCreate, (interaction) => {
  routeInteraction(interaction);
});

// Perintah chat `!...` di thread pribadi (farming/mining/fishing/dungeon).
client.on(Events.MessageCreate, (message) => {
  handleChatCommand(message);
});

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('[GROWVIA] BOT_TOKEN kosong di .env');
  process.exit(1);
}

client.login(token).catch((e) => {
  console.error('[GROWVIA] Login gagal:', e.message);
  process.exit(1);
});

let shuttingDown = false;

async function gracefulShutdown() {
  if (shuttingDown) return;
  console.log('[GROWVIA] Shutdown: menulis buffer account & halving...');
  shuttingDown = true;
  await notify(client, '🔴 Growvia is restarting.').catch(() => {});
  await client.destroy();
  checkpoint(); // simpan jam game terakhir
  await flushAccounts().catch(() => {});
  await flushHalving().catch(() => {});
  await quitRedis().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
