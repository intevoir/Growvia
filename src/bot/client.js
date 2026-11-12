'use strict';

const { Client, GatewayIntentBits } = require('discord.js');

// GuildMessages: perintah chat `/...` di thread pribadi (pakai prefix `/`).
// MessageContent (privileged) WAJIB aktif di Discord Developer Portal dulu.
// Kalau sudah aktif di portal, set MESSAGE_CONTENT_INTENT=1 di .env lalu restart bot.
// Tanpa itu bot gagal login (Used disallowed intents).
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
if (process.env.MESSAGE_CONTENT_INTENT === '1') intents.push(GatewayIntentBits.MessageContent);

const client = new Client({ intents });

module.exports = { client };
