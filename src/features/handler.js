'use strict';

/**
 * Wrapper handler bersama. Semua balasan pribadi memakai bahasa akun (default English).
 *
 *   panelAction : tombol di panel publik -> balasan ephemeral baru
 *   menuAction  : komponen di dalam pesan ephemeral -> update pesan yang sama
 *   threadAction: komponen di thread pribadi -> cek pemilik thread + settle aktivitas AFK
 *
 * fn(interaction, ctx) dengan ctx = { account, lang, notice }.
 */

const { loadAccount, saveAccount, withUserLock } = require('../lib/account');
const { langOf } = require('../lib/i18n');
const { EPHEMERAL } = require('../config/constants');
const { errorText } = require('../ui/common');
const { drainUnseen } = require('../lib/progress');
const { achievementText } = require('../ui/progressScreens');

const ACTIVITY_TOUCH_MS = 30_000;

/** Apakah interaksi ini datang dari SALAH SATU thread pribadi milik pemain (bukan cuma thread terakhir)? */
async function isOwnThread(interaction, account) {
  const ids = [account.thread_id, ...(account.thread_ids ?? [])].filter(Boolean);
  if (!ids.length) return true; // akun belum punya thread tercatat (mis. menu ephemeral): jangan blokir
  if (ids.includes(interaction.channelId)) return true;
  // Akun lama yang thread_ids-nya belum tercatat: cek langsung keanggotaan thread Discord.
  const ch = interaction.channel;
  if (!ch || typeof ch.isThread !== 'function' || !ch.isThread()) return false;
  try {
    await ch.members.fetch(interaction.user.id);
    return ch.members.cache.has(interaction.user.id);
  } catch {
    return false;
  }
}

/** Pesan teks ephemeral (bukan embed). Dipakai untuk peringatan singkat. */
function reply(interaction, content) {
  const payload = { content, flags: EPHEMERAL };
  const send = interaction.deferred || interaction.replied ? interaction.followUp(payload) : interaction.reply(payload);
  return send.catch(() => {});
}

function warn(interaction, lang, code, extra) {
  return reply(interaction, errorText(lang, code, extra));
}

async function withAccount(interaction, fn) {
  await withUserLock(interaction.user.id, async () => {
    const account = await loadAccount(interaction.user.id);
    if (!account) {
      await warn(interaction, 'en', 'no_account');
      return;
    }
    const lang = langOf(account);
    await fn(account, lang);
    await announceAchievements(interaction, account, lang);
  });
}

/** Achievement yang terbuka selama aksi ini diumumkan lewat pesan pribadi terpisah. */
async function announceAchievements(interaction, account, lang) {
  const news = drainUnseen(account);
  if (!news.length) return;
  saveAccount(account);
  await interaction.followUp({ content: achievementText(news, lang), flags: EPHEMERAL }).catch(() => {});
}

const panelAction = (fn) => async (interaction) => {
  await interaction.deferReply({ flags: EPHEMERAL }).catch(() => {});
  await withAccount(interaction, (account, lang) => fn(interaction, { account, lang, notice: '' }));
};

const menuAction = (fn) => async (interaction) => {
  await interaction.deferUpdate().catch(() => {});
  await withAccount(interaction, (account, lang) => fn(interaction, { account, lang, notice: '' }));
};

/**
 * settle(account) -> notice string (hasil AFK tertunda, mis. auto-tanam / strike pancing).
 * Mengembalikan teks kosong kalau tidak ada perubahan.
 */
const threadAction = (settle, fn) => async (interaction) => {
  await interaction.deferUpdate().catch(() => {});
  await withAccount(interaction, async (account, lang) => {
    if (!(await isOwnThread(interaction, account))) {
      await warn(interaction, lang, 'wrong_thread');
      return;
    }
    // Menyentuh thread hanya tiap 30 dtk (batas idle 5 mnt) dan menyimpan hanya kalau ada yang berubah:
    // klik Refresh berulang tidak lagi menghasilkan tulisan DB.
    const now = Date.now();
    let dirty = false;
    if (now - (Date.parse(account.last_thread_activity) || 0) > ACTIVITY_TOUCH_MS) {
      account.last_thread_activity = new Date(now).toISOString();
      dirty = true;
    }
    const notice = settle ? settle(account, lang) : '';
    if (notice) dirty = true;
    if (dirty) saveAccount(account);
    await fn(interaction, { account, lang, notice });
  });
};

module.exports = { reply, warn, panelAction, menuAction, threadAction, isOwnThread };
