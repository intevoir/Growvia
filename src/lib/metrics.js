'use strict';

/** Penghitung ringan untuk pemantauan (tanpa dependency). Dibaca & di-reset oleh features/health.js. */

const counters = { interactions: 0, errors: 0, rateLimited: 0, slow: 0 };
const startedAt = Date.now();

const inc = (key, n = 1) => {
  counters[key] = (counters[key] ?? 0) + n;
};

/** Ambil nilai periode ini lalu reset ke 0. */
function drain() {
  const snap = { ...counters };
  for (const k of Object.keys(counters)) counters[k] = 0;
  return snap;
}

const uptimeMs = () => Date.now() - startedAt;

module.exports = { inc, drain, uptimeMs };
