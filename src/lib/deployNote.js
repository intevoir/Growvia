'use strict';

/**
 * Catatan update untuk channel logs: commit terakhir git (praktisnya = push/deploy terakhir),
 * diparsing ala changelog GitHub: label tipe (✨ New feature / 🐛 Fix / ⚡ Performance / ...)
 * plus baris detail dari badan commit.
 */

const { execSync } = require('node:child_process');
const path = require('node:path');

const REPO = path.resolve(__dirname, '../..');
/** Commit lebih tua dari ini dianggap bukan deploy baru (mis. restart manual lama). */
const FRESH_MINUTES = 15;

const TITLES = {
  feat: ['✨', 'New feature'],
  fix: ['🐛', 'Bug fix'],
  perf: ['⚡', 'Performance'],
  refactor: ['♻️', 'Refactor'],
  docs: ['📚', 'Docs'],
  test: ['✅', 'Tests'],
  style: ['🎨', 'Style'],
  build: ['🛠️', 'Build'],
  ci: ['🔧', 'CI'],
  chore: ['🔧', 'Chore'],
  revert: ['↩️', 'Revert'],
};

/** Ubah output `git log -1 --format=%H%n%h%n%s%n%b%n%ci` menjadi teks siap kirim. */
function formatCommit(raw) {
  const [hash, short, subject, ...rest] = String(raw ?? '').trimEnd().split('\n');
  const body = rest.slice(0, -1).join('\n').trim();
  const dateRaw = rest[rest.length - 1];
  const time = new Date(dateRaw);
  if (!hash || !subject) return null;

  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/);
  const [emoji, label] = TITLES[m?.[1]?.toLowerCase()] ?? TITLES.chore;
  const scope = m?.[2] ? ` (${m[2]})` : '';
  const title = m?.[3] ?? subject;

  const lines = [`🚀 **Growvia updated** · \`${short}\``, `${emoji} **${label}${scope}** — ${title}`];
  const details = body.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
  for (const line of details) lines.push(`   • ${line}`);
  lines.push(`🕒 ${Number.isNaN(time) ? 'now' : time.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })} WIB`);
  return { text: lines.join('\n'), ageMinutes: Number.isNaN(time) ? 0 : (Date.now() - time.getTime()) / 60_000 };
}

/** Commit HEAD repo ini, atau null kalau bukan repo git / gagal. */
function latestCommit() {
  try {
    const raw = execSync('git log -1 --format=%H%n%h%n%s%n%b%n%ci', { cwd: REPO, timeout: 5000 }).toString();
    return formatCommit(raw);
  } catch {
    return null;
  }
}

module.exports = { formatCommit, latestCommit, FRESH_MINUTES };
