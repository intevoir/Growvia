'use strict';

/** Form saran & laporan bug (Discord Modal) + tampilan postingan di channel publik. */

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { payload } = require('./v2');

const MODAL_SUGGEST = 'fb_suggest';
const MODAL_REPORT = 'fb_report';

const field = (customId, label, style, { required = true, maxLength = 1000, placeholder } = {}) => {
  const input = new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(style).setRequired(required);
  if (maxLength) input.setMaxLength(Math.min(maxLength, 4000));
  if (placeholder) input.setPlaceholder(placeholder.slice(0, 100));
  return new ActionRowBuilder().addComponents(input);
};

function suggestModal() {
  return new ModalBuilder()
    .setCustomId(MODAL_SUGGEST)
    .setTitle('💡 New Suggestion')
    .addComponents(
      field('title', 'Title', TextInputStyle.Short, { maxLength: 100, placeholder: 'Short summary (max 100 chars)' }),
      field('details', 'Details', TextInputStyle.Paragraph, { maxLength: 1500, placeholder: 'Describe your idea…' }),
    );
}

function reportModal() {
  return new ModalBuilder()
    .setCustomId(MODAL_REPORT)
    .setTitle('🐛 Report a Bug')
    .addComponents(
      field('title', 'Title', TextInputStyle.Short, { maxLength: 100, placeholder: 'Short summary (max 100 chars)' }),
      field('description', 'What happened', TextInputStyle.Paragraph, { maxLength: 1500, placeholder: 'What were you doing when it happened?' }),
      field('expected', 'Expected', TextInputStyle.Paragraph, { required: false, maxLength: 1000, placeholder: 'What did you expect to happen?' }),
    );
}

/**
 * Tampilan postingan publik (V2). Judul & label selalu English (panel publik).
 * vote: true -> bot menambahkan reaksi 👍/👎 setelah mengirim.
 */
function submissionScreen({ kind, title, author, body, extra = '' }) {
  const isReport = kind === 'report';
  return {
    title: isReport ? '🐛 Bug Report' : '💡 Suggestion',
    accent: isReport ? 0xd32f2f : 0xf9a825,
    notice: '',
    body: [
      `**${title}**`,
      `by <@${author}>`,
      '',
      body,
      extra ? `\nExpected: ${extra}` : null,
      '',
      '_Vote with 👍 / 👎 below._',
    ],
  };
}

const sendSubmission = (channel, data) => channel.send(payload(submissionScreen(data)));

module.exports = { MODAL_SUGGEST, MODAL_REPORT, suggestModal, reportModal, submissionScreen, sendSubmission };
