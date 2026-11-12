'use strict';

/**
 * Jam global game yang monotonik (tidak pernah mundur), aman dari lompatan jam sistem
 * (NTP, sinkronisasi, perubahan zona) dan restart proses.
 *
 * Waktu nyata boleh maju bebas, tapi TIDAK BOLEH mundur: kalau jam sistem meloncat ke belakang,
 * now() tetap melanjutkan dari nilai terakhir. Nilai terakhir disimpan ke file supaya restart
 * juga tidak bisa mundur. Dipakai untuk semua timer gameplay (tanam, tambang, pancing, dungeon,
 * quest harian); TTL cache & idle-thread tetap memakai jam dinding biasa.
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = process.env.GROWVIA_CLOCK_FILE || path.resolve(__dirname, '../../data/server-clock.json');
/** Nilai tersimpan yang lebih dari 60 dtk di depan jam dinding dibuang (dianggap rusak):
 * game time tidak boleh "di masa depan" relative ke timestamp Discord lebih dari satu menit,
 * supaya countdown <t:R> selalu cocok dengan status siap/belum di logika. */
const MAX_FUTURE_SKEW_MS = 60 * 1000;

/**
 * Pabrik jam monotonik (dipakai juga untuk tes).
 *   realNow: sumber waktu nyata, read/write: penyimpanan nilai terakhir (ms).
 */
function createClock({ realNow = () => Date.now(), read = () => null, write = () => {} } = {}) {
  const stored = Number(read()) || 0;
  const sane = stored > 0 && stored - realNow() <= MAX_FUTURE_SKEW_MS ? stored : 0;
  let last = Math.max(realNow(), sane) - 1;
  let lastWrite = 0;
  return function now() {
    const t = Math.max(realNow(), last + 1);
    last = t;
    if (t - lastWrite >= 5000) {
      lastWrite = t;
      try {
        write(t);
      } catch {
        /* file tidak bisa ditulis: jam tetap jalan di memori */
      }
    }
    return t;
  };
}

const readFile = () => {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')).last ?? null;
  } catch {
    return null;
  }
};

const writeFile = (t) => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ last: t }));
};

const now = createClock({ read: readFile, write: writeFile });

/** Simpan nilai terakhir saat shutdown supaya restart tidak mundur. */
function checkpoint() {
  try {
    writeFile(now() - 1); // simpan nilai yang sudah dikembalikan terakhir
  } catch {
    /* abaikan */
  }
}

module.exports = { createClock, now, checkpoint };
