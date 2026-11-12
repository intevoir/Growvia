'use strict';

const { loadAccount, insertAccount, defaultAccount, saveAccount, withUserLock } = require('../lib/account');
const { langOf, tr } = require('../lib/i18n');
const { FARM_CHANNEL_ID, LANGUAGE_SET_PREFIX, EPHEMERAL } = require('../config/constants');
const { show, btn, row } = require('../ui/v2');
const { errorText } = require('../ui/common');
const { menuAction } = require('./handler');

const farmMention = () => (FARM_CHANNEL_ID ? `<#${FARM_CHANNEL_ID}>` : '#farming');
const GREEN = 0x4caf50;

/** Tombol "Create Account". Akun baru default English. */
async function handleCreateAccount(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL }).catch(() => {});
  await withUserLock(interaction.user.id, async () => {
    const existing = await loadAccount(interaction.user.id);
    if (existing) {
      const lang = langOf(existing);
      await show(interaction, {
        title: `🌱 ${tr(lang, 'Welcome back!', 'Selamat datang kembali!')}`,
        accent: GREEN,
        body: tr(lang, `You already have an account. Continue at ${farmMention()}.`, `Kamu sudah punya akun. Lanjut di ${farmMention()}.`),
      });
      return;
    }
    const account = defaultAccount(interaction.user);
    account.guild_id = interaction.guildId;
    await insertAccount(account);
    await show(interaction, {
      title: '✅ Account created!',
      accent: GREEN,
      body: [
        'You start with a **Starter Hoe** and **100 Wheat seeds**. Everything else is earned.',
        `Head to ${farmMention()} and press **Start Farming**.`,
        '',
        '🌐 Prefer Bahasa Indonesia? Press **Language / Bahasa** on the panel.',
      ],
    });
  });
}

/* ============ Bahasa ============ */

function languageScreen(lang, notice = '') {
  return {
    title: '🌐 Language / Bahasa',
    accent: GREEN,
    notice,
    body: [
      `**${tr(lang, 'Current', 'Saat ini')}**: ${lang === 'id' ? 'Bahasa Indonesia 🇮🇩' : 'English 🇬🇧'}`,
      '',
      'Choose the language for your private threads, menus and notifications.',
      'Pilih bahasa untuk thread, menu, dan notifikasi pribadimu.',
      '',
      '_Public panels always stay in English._',
    ],
    rows: [row(btn(`${LANGUAGE_SET_PREFIX}en`, 'English', '🇬🇧', lang === 'en'), btn(`${LANGUAGE_SET_PREFIX}id`, 'Bahasa Indonesia', '🇮🇩', lang === 'id'))],
  };
}

async function handleLanguageOpen(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL }).catch(() => {});
  const account = await loadAccount(interaction.user.id);
  if (!account) {
    await interaction.editReply({ content: errorText('en', 'no_account') }).catch(() => {});
    return;
  }
  await show(interaction, languageScreen(langOf(account)));
}

const handleLanguageSet = menuAction(async (i, { account }) => {
  const lang = i.customId.slice(LANGUAGE_SET_PREFIX.length) === 'id' ? 'id' : 'en';
  account.lang = lang;
  saveAccount(account);
  await show(i, languageScreen(lang, tr(lang, '✅ Language set to English.', '✅ Bahasa diubah ke Bahasa Indonesia.')));
});

module.exports = { handleCreateAccount, handleLanguageOpen, handleLanguageSet };
