'use strict';

/** Matematika halving murni (tanpa I/O) supaya mudah dites. */

const BASE_INTERVAL = 10_000_000;
const INTERVAL_GROWTH = 2;
const FLOOR_MULTIPLIER = 0.01;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Hitung tahap halving dari total Viaz yang pernah tercetak. Deterministik. */
function computeHalving(totalMinted) {
  let remaining = Number(totalMinted) || 0;
  let halvings = 0;
  let interval = BASE_INTERVAL;
  while (remaining >= interval) {
    halvings += 1;
    remaining -= interval;
    interval *= INTERVAL_GROWTH;
  }
  const multiplier = Math.max(0.5 ** halvings, FLOOR_MULTIPLIER);
  return {
    halvings,
    interval,
    remaining,
    multiplier,
    nextHalvingAt: (Number(totalMinted) || 0) + (interval - remaining),
  };
}

module.exports = { BASE_INTERVAL, INTERVAL_GROWTH, FLOOR_MULTIPLIER, round2, computeHalving };
