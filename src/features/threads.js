'use strict';

/**
 * Pembuka thread pribadi bersama untuk Farming / Mining / Fishing / Dungeon.
 * Satu akun = satu thread aktif. Thread di channel lain dihapus lalu dibuat baru di channel aktivitas ini.
 */

const { ChannelType } = require('discord.js');
const { loadAccount, saveAccount, withUserLock } = require('../lib/account');
const { langOf, tr } = require('../lib/i18n');
const C = require('../config/constants');
const { payload } = require('../ui/v2');
const { errorText } = require('../ui/common');
const { client } = require('../bot/client');

const KINDS = {
  farm: { channel: C.FARM_CHANNEL_ID, prefix: 'farm' },
  mining: { channel: C.MINING_CHANNEL_ID, prefix: 'mine' },
  fishing: { channel: C.FISHING_CHANNEL_ID, prefix: 'dock' },
  dungeon: { channel: C.DUNGEON_CHANNEL_ID, prefix: 'dungeon' },
};

function isIdle(account) {
  if (!account.last_thread_activity) return false;
  return Date.now() - new Date(account.last_thread_activity).getTime() > C.THREAD_IDLE_CLOSE_MS;
}

/**
 * opts = { kind, gate(account) -> errorCode|null, settle?(account), screen(account, lang) -> screen }
 */
async function openThread(interaction, { kind, gate, settle, screen }) {
  const cfg = KINDS[kind];
  if (!interaction.guild) {
    await interaction.reply({ content: errorText('en', 'guild_only'), flags: C.EPHEMERAL }).catch(() => {});
    return;
  }
  await interaction.deferReply({ flags: C.EPHEMERAL }).catch(() => {});

  await withUserLock(interaction.user.id, async () => {
    const account = await loadAccount(interaction.user.id);
    if (!account) {
      await interaction.editReply({ content: errorText('en', 'no_account') }).catch(() => {});
      return;
    }
    const lang = langOf(account);
    const blocked = gate ? gate(account) : null;
    if (blocked) {
      await interaction.editReply({ content: errorText(lang, blocked) }).catch(() => {});
      return;
    }

    const home = cfg.channel ? await client.channels.fetch(cfg.channel).catch(() => null) : null;
    const parent = home && 'threads' in home ? home : interaction.channel;
    const ready = (id) => interaction.editReply({ content: `${tr(lang, 'Your thread is ready', 'Thread kamu siap')}: <#${id}>` }).catch(() => {});

    // Boleh punya banyak thread (satu per aktivitas) -> tombol & perintah chat di thread mana pun
    // milik pemain tetap jalan, tidak harus "reset" thread. Thread lama dibersihkan sweeper saat idle penuh.
    if (!Array.isArray(account.thread_ids)) account.thread_ids = [];
    const candidates = account.thread_id && !account.thread_ids.includes(account.thread_id)
      ? [account.thread_id, ...account.thread_ids]
      : [...account.thread_ids];
    for (const tid of candidates) {
      const existing = await client.channels.fetch(tid).catch(() => null);
      const sameParent = existing && existing.parentId === parent?.id;
      if (!sameParent) continue;
      if (!existing.archived && !isIdle(account)) {
        account.thread_id = tid;
        account.last_thread_activity = new Date().toISOString();
        saveAccount(account);
        await ready(tid);
        return;
      }
      if (existing.archived && (await existing.setArchived(false).catch(() => null))) {
        account.thread_id = tid;
        account.last_thread_activity = new Date().toISOString();
        saveAccount(account);
        await ready(tid);
        return;
      }
      break; // thread sejenis ketemu tapi tidak bisa dipakai lagi -> buat baru
    }

    let thread;
    try {
      thread = await parent.threads.create({
        name: `${cfg.prefix}-${interaction.user.username}`.slice(0, 100),
        type: ChannelType.PrivateThread,
        autoArchiveDuration: C.THREAD_AUTO_ARCHIVE_DURATION,
        reason: `Growvia ${kind}`,
      });
      await thread.members.add(interaction.user.id).catch(() => {});
    } catch (e) {
      console.warn(`[GROWVIA] Gagal membuat thread ${kind}:`, e.message);
      await interaction.editReply({ content: errorText(lang, 'thread_failed') }).catch(() => {});
      return;
    }

    account.thread_id = thread.id;
    if (!account.thread_ids.includes(thread.id)) account.thread_ids = [thread.id, ...account.thread_ids].slice(0, 10);
    account.guild_id = interaction.guildId;
    account.last_thread_activity = new Date().toISOString();
    const notice = settle ? settle(account, lang) : '';
    const sent = await thread.send(payload({ ...screen(account, lang), notice })).catch((e) => {
      console.warn(`[GROWVIA] Gagal kirim pesan thread ${kind}:`, e.message);
      return null;
    });
    if (sent) account.status_msg_id = sent.id;
    saveAccount(account);
    await ready(thread.id);
  });
}

module.exports = { openThread, isIdle };
