'use strict';

/**
 * Self-check pemformat catatan deploy (pengumuman update ke channel logs).
 * Jalankan: node test/deploy-note-check.js
 */

const assert = require('node:assert');
const { formatCommit } = require('../src/lib/deployNote');

{
  const raw = 'abc123def456\nabc123d\nfeat: tambah fitur X\nBaris detail satu\nBaris detail dua\n2026-11-04 11:14:14 +0700';
  const n = formatCommit(raw);
  assert.ok(n.text.includes('Growvia updated'));
  assert.ok(n.text.includes('`abc123d`'));
  assert.ok(n.text.includes('✨ **New feature** — tambah fitur X'), 'prefix feat: diparsing ke label');
  assert.ok(!n.text.includes('feat: '), 'prefix commit tidak ditampilkan mentah');
  assert.ok(n.text.includes('• Baris detail satu'), 'badan commit jadi baris detail');
  assert.ok(n.ageMinutes < 60_000, 'umur masuk akal untuk commit baru');
}
{
  const raw = 'abc\nabc\nfix: cepat\n\n2020-01-01 00:00:00 +0700';
  const n = formatCommit(raw);
  assert.ok(n.text.includes('🐛 **Bug fix** — cepat'), 'fix: diparsing ke label');
  assert.ok(!n.text.includes('``'), 'tanpa body tidak ada baris kosong');
  assert.ok(n.ageMinutes > 60_000, 'commit lama terdeteksi lama');
}
assert.strictEqual(formatCommit(''), null);
assert.strictEqual(formatCommit(null), null);

console.log('deploy-note-check: semua lolos (format catatan update)');
