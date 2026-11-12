'use strict';

/**
 * Form saran & laporan bug: tombol di channel publik membuka Discord Modal,
 * isian modal diposting bot sebagai pesan terformat di channel yang sama.
 * Batas kirim: 1 per menit per pemain (anti-spam).
 */

const { client } = require('../bot/client');
const C = require('../config/constants');
const { errorText } = require('../ui/common');
const { MODAL_SUGGEST, MODAL_REPORT, suggestModal, reportModal, sendSubmission } = require('../ui/feedback');

const COOLDOWN_MS = 60_000;
const lastSubmitAt = new Map();

const cooldownLeft = (userId) => Math.max(0, COOLDOWN_MS - (Date.now() - (lastSubmitAt.get(userId) ?? 0)));

/** Tombol panel publik: buka modal (harus sebelum defer apapun). */
const handleOpenSuggest = async (interaction) => {
  try {
    await interaction.showModal(suggestModal());
  } catch {
    /* interaction sudah tidak valid */
  }
};

const handleOpenReport = async (interaction) => {
  try {
    await interaction.showModal(reportModal());
  } catch {
    /* abaikan */
  }
};

async function submit(interaction, kind) {
  const left = cooldownLeft(interaction.user.id);
  if (left > 0) {
    await interaction.reply({ content: errorText('en', 'rate_limited'), flags: C.EPHEMERAL }).catch(() => {});
    return;
  }
  lastSubmitAt.set(interaction.user.id, Date.now());

  const title = (interaction.fields.getTextInputValue('title') ?? '').trim().slice(0, 100) || '(untitled)';
  const details = (interaction.fields.getTextInputValue(kind === 'report' ? 'description' : 'details') ?? '').trim().slice(0, 1500) || '—';
  const extra = kind === 'report' ? (interaction.fields.getTextInputValue('expected') ?? '').trim().slice(0, 1000) : '';

  const channel = C.SUGGEST_CHANNEL_ID ? await client.channels.fetch(C.SUGGEST_CHANNEL_ID).catch(() => null) : null;
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ content: errorText('en', 'error'), flags: C.EPHEMERAL }).catch(() => {});
    return;
  }

  const sent = await sendSubmission(channel, { kind, title, author: interaction.user.id, body: details, extra }).catch(() => null);
  if (sent) {
    await sent.react('👍').catch(() => {});
    await sent.react('👎').catch(() => {});
  }
  await interaction.reply({
    content: kind === 'report' ? '🐛 Thanks! Your bug report has been posted.' : '💡 Thanks! Your suggestion has been posted.',
    flags: C.EPHEMERAL,
  }).catch(() => {});
}

const handleSuggestSubmit = (interaction) => submit(interaction, 'suggest');
const handleReportSubmit = (interaction) => submit(interaction, 'report');

module.exports = { handleOpenSuggest, handleOpenReport, handleSuggestSubmit, handleReportSubmit, cooldownLeft };
