'use strict';

/** Setiap custom ID di constants harus punya handler di router (mencegah tombol mati). */

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const assert = require('node:assert');
const C = require('../src/config/constants');
const router = require('fs').readFileSync(require.resolve('../src/bot/router'), 'utf8');

const missing = Object.keys(C)
  .filter((k) => k.endsWith('_CUSTOM_ID') || k.endsWith('_PREFIX'))
  .filter((k) => !new RegExp(`\\[C\\.${k},`).test(router));

assert.deepStrictEqual(missing, [], `custom ID tanpa handler di router: ${missing.join(', ')}`);
console.log('route-check: semua custom ID punya handler');
