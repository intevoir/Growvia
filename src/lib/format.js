'use strict';

// Intl.NumberFormat dibuat sekali: toLocaleString() membuat formatter baru tiap panggilan dan
// sebelumnya memakan >40% CPU saat beban tinggi (lihat scripts/load-sim.js).
const NUMBER = new Intl.NumberFormat('en-US');
const VIAZ = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function formatNumber(n) {
  return NUMBER.format(Number(n ?? 0));
}

/** Viaz boleh berkoma (halving), tampilkan maksimal 2 desimal. */
function formatViaz(n) {
  return VIAZ.format(Number(n ?? 0));
}

function formatDuration(ms, lang = 'en') {
  const isId = lang === 'id';
  const secUnit = isId ? 'detik' : 'secs';
  const minUnit = isId ? 'menit' : 'mins';
  const hrUnit = isId ? 'jam' : 'hours';

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} ${secUnit}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minUnit}`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} ${hrUnit}` : `${hours.toFixed(1)} ${hrUnit}`;
}

module.exports = { formatNumber, formatViaz, formatDuration };
