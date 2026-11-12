'use strict';

/**
 * Rarity global Growvia (berlaku untuk benih, item, dan fitur lain ke depan).
 * Hanya 5 tingkat. Tidak ada angka rarity per item.
 */
const RARITIES = {
  common: { id: 'common', name: 'Common', emoji: '⚪', color: 0x9e9e9e, order: 1 },
  uncommon: { id: 'uncommon', name: 'Uncommon', emoji: '🟢', color: 0x4caf50, order: 2 },
  rare: { id: 'rare', name: 'Rare', emoji: '🔵', color: 0x2196f3, order: 3 },
  epic: { id: 'epic', name: 'Epic', emoji: '🟣', color: 0x9c27b0, order: 4 },
  legendary: { id: 'legendary', name: 'Legendary', emoji: '🟠', color: 0xff9800, order: 5 },
};

function getRarity(id) {
  return RARITIES[id] ?? RARITIES.common;
}

module.exports = { RARITIES, getRarity };
