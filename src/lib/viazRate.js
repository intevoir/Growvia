'use strict';

/**
 * Kurs Viaz saat ini (multiplier halving) tanpa I/O, supaya logika murni bisa memakainya.
 * Diperbarui oleh lib/halving.js. Semua harga toko DAN hasil jual ikut kurs ini, jadi setelah
 * halving Viaz makin langka (deflasi) tapi ekonomi tetap seimbang untuk pemain baru.
 */

let multiplier = 1;

const getRate = () => multiplier;
const setRate = (m) => {
  if (Number.isFinite(m) && m > 0) multiplier = m;
};

/** Harga dasar dikali kurs, minimal 0.01 Viaz (0 tetap 0). */
function price(base) {
  const n = Number(base) || 0;
  if (n <= 0) return 0;
  if (!Number.isFinite(n)) return Infinity;
  return Math.max(0.01, Math.round(n * multiplier * 100) / 100);
}

module.exports = { getRate, setRate, price };
