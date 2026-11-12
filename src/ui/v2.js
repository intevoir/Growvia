'use strict';

/**
 * Kit Components V2. Semua tampilan Growvia = 1 Container berisi judul, isi, dan tombol di dalamnya.
 * Semua tombol abu-abu (Secondary) sesuai gaya Growvia.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} = require('discord.js');

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;
const MAX_TEXT = 3800; // batas total teks pesan V2 adalah 4000

function btn(customId, label, emoji = null, disabled = false) {
  const b = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(String(label).slice(0, 80))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(Boolean(disabled));
  if (emoji) b.setEmoji(emoji);
  return b;
}

/** options: [{ label, value, description?, emoji? }] (maks 25). Mengembalikan null kalau kosong. */
function select(customId, placeholder, options) {
  const opts = options.slice(0, 25).map((o) => {
    const opt = new StringSelectMenuOptionBuilder().setLabel(String(o.label).slice(0, 100)).setValue(String(o.value));
    if (o.description) opt.setDescription(String(o.description).slice(0, 100));
    if (o.emoji) opt.setEmoji(o.emoji);
    return opt;
  });
  if (!opts.length) return null;
  return new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(String(placeholder).slice(0, 150)).addOptions(opts);
}

function row(...components) {
  const list = components.flat().filter(Boolean);
  return list.length ? new ActionRowBuilder().addComponents(...list) : null;
}

/**
 * screen = { title, body (string | string[]), accent?, rows?: ActionRow[], notice? }
 * Notice ditampilkan di atas isi (hasil aksi terakhir).
 */
function container({ title, body, accent, rows = [], notice = '' }) {
  const text = (Array.isArray(body) ? body.filter((l) => l !== null && l !== undefined).join('\n') : body) || '\u200b';
  const c = new ContainerBuilder();
  if (accent !== undefined && accent !== null) c.setAccentColor(accent);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));
  if (notice) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(notice).slice(0, 1500)));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text.slice(0, MAX_TEXT - String(notice).length)));
  const actionRows = rows.filter(Boolean);
  if (actionRows.length) {
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addActionRowComponents(...actionRows);
  }
  return c;
}

function payload(screen, { ephemeral = false } = {}) {
  return { components: [container(screen)], flags: ephemeral ? V2 | EPHEMERAL : V2 };
}

/**
 * Tampilkan screen pada interaksi yang sudah di-defer (deferReply / deferUpdate).
 * Fallback: pesan lama non-V2 (dibuat sebelum update) tidak bisa diedit ke V2, jadi kirim pesan baru.
 */
async function show(interaction, screen) {
  try {
    await interaction.editReply(payload(screen));
  } catch {
    await interaction.followUp(payload(screen, { ephemeral: true })).catch(() => {});
  }
}

module.exports = { V2, EPHEMERAL, btn, select, row, container, payload, show };

/* ============ Modal (form) ============ */

const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

/**
 * Buat modal form. fields: [{ customId, label, style: 'short'|'paragraph', required, placeholder }]
 */
function modal(customId, title, fields) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  for (const f of fields.slice(0, 5)) {
    m.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(f.customId)
        .setLabel(f.label.slice(0, 45))
        .setStyle(f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(Boolean(f.required)),
    ));
  }
  return m;
}
