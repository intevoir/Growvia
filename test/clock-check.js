'use strict';

/**
 * Self-check jam global game yang monotonik (tidak pernah mundur, aman restart/lompatan jam).
 * Jalankan: node test/clock-check.js
 */

const assert = require('node:assert');
const { createClock } = require('../src/lib/clock');

/* ---- Jam dinding normal: ikut waktu nyata ---- */
{
  let t = 1_000_000;
  const now = createClock({ realNow: () => t, read: () => null, write: () => {} });
  assert.strictEqual(now(), 1_000_000);
  t += 5_000;
  assert.strictEqual(now(), 1_005_000, 'maju mengikuti jam dinding');
}

/* ---- Jam sistem mundur: now() tetap maju (tidak pernah mundur) ---- */
{
  let t = 1_000_000;
  const now = createClock({ realNow: () => t, read: () => null, write: () => {} });
  assert.strictEqual(now(), 1_000_000);
  t = 900_000; // jam sistem meloncat mundur 100 detik
  const after = now();
  assert.ok(after > 1_000_000, `tidak boleh mundur, dapat ${after}`);
  t = 1_000_500; // jam dinding kembali mengejar
  assert.ok(now() >= 1_000_500);
}

/* ---- Restart: nilai tersimpan dipakai sebagai lantai ---- */
{
  const saved = [];
  let t = 2_000_000;
  const now = createClock({ realNow: () => t, read: () => saved[0] ?? null, write: (v) => saved.push(v) });
  assert.strictEqual(now(), 2_000_000);
  t += 10_000;
  now();
  assert.ok(saved.length >= 1, 'nilai disimpan berkala');
  const persisted = saved[saved.length - 1];

  // Restart dengan jam dinding sedikit lebih rendah dari tersimpan (mis. loncat jam kecil):
  // lantai tersimpan dipakai, jadi waktu tidak mundur.
  const rebooted = createClock({ realNow: () => 2_000_000, read: () => 2_000_030, write: () => {} });
  assert.strictEqual(rebooted(), 2_000_030, 'setelah restart: mulai dari lantai tersimpan (skew kecil diterima)');
  // Nilai tersimpan jauh di depan jam dinding (>60 dtk) dianggap rusak dan diabaikan:
  const corrupt = createClock({ realNow: () => 2_000_000, read: () => 2_500_000, write: () => {} });
  assert.strictEqual(corrupt(), 2_000_000, 'nilai tersimpan jauh di masa depan dibuang');
}

/* ---- Tulis ke penyimpanan di-throttle (tidak tiap panggilan) ---- */
{
  let writes = 0;
  let t = 3_000_000;
  const now = createClock({ realNow: () => t, read: () => null, write: () => { writes += 1; } });
  now();
  now();
  now();
  t += 10_000;
  now();
  assert.ok(writes <= 2, `tulis di-throttle, dapat ${writes}`);
}

console.log('clock-check: semua lolos (monotonik, tahan lompatan jam, aman restart)');
