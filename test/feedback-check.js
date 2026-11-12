'use strict';

/**
 * Self-check form saran & laporan bug: modal valid, submit memposting dengan format yang benar,
 * cooldown anti-spam, dan tombol panel ter-route. Tanpa jaringan.
 * Jalankan: node test/feedback-check.js
 */

for (const [k, v] of Object.entries({
  ACCOUNT_CHANNEL_ID: '1', FARM_CHANNEL_ID: '2', SHOP_CHANNEL_ID: '3', MINING_CHANNEL_ID: '4',
  MINING_SHOP_CHANNEL_ID: '5', FISHING_CHANNEL_ID: '6', FISHING_SHOP_CHANNEL_ID: '7',
  DUNGEON_CHANNEL_ID: '8', DUNGEON_SHOP_CHANNEL_ID: '9', BACKPACK_CHANNEL_ID: '10', HALL_CHANNEL_ID: '11',
  BOOSTS_CHANNEL_ID: '12', SUGGEST_CHANNEL_ID: '13',
  SUPABASE_URL: 'http://fake', SUPABASE_SERVICE_ROLE_KEY: 'fake',
})) process.env[k] = v;
delete process.env.REDIS_URL;

const assert = require('node:assert');
const F = require('../src/ui/feedback');
const { client } = require('../src/bot/client');
const fb = require('../src/features/feedback');

/* ---- Modal valid (bisa diserialisasi Discord) ---- */
for (const [name, modal] of [['suggest', F.suggestModal()], ['report', F.reportModal()]]) {
  const json = modal.toJSON();
  assert.ok(json.custom_id === 'fb_suggest' || json.custom_id === 'fb_report', name);
  assert.ok(json.title.length >= 1 && json.title.length <= 45, `${name}: title maks 45`);
  assert.ok(json.components.length >= 2, `${name}: minimal 2 field`);
  for (const row of json.components) {
    assert.strictEqual(row.type, 1, 'action row');
    for (const c of row.components) {
      assert.strictEqual(c.type, 4, 'text input');
      assert.ok(c.label.length >= 1 && c.label.length <= 45, `${name}: label maks 45 (${c.label})`);
    }
  }
}
assert.strictEqual(F.reportModal().toJSON().components.length, 3, 'report: 3 field (title, happened, expected)');

/* ---- Submit memposting format yang benar ke channel ---- */
const sent = [];
const reactions = [];
const fakeChannel = {
  isTextBased: () => true,
  send: async (p) => {
    sent.push(p);
    return { react: async (e) => { reactions.push(e); } };
  },
};
client.channels.fetch = async () => fakeChannel;

const fieldsOf = (values) => ({ getTextInputValue: (id) => values[id] ?? '' });
const fakeModal = (values) => ({
  customId: 'fb_suggest',
  user: { id: 'u1' },
  fields: fieldsOf(values),
  replied: false, deferred: false,
  reply: async (p) => { fakeModal.last = p; },
});

(async () => {
  const m = fakeModal({ title: 'Tambah trade', details: 'Trade antar pemain biar seru' });
  await fb.handleSuggestSubmit(m);
  assert.strictEqual(sent.length, 1, 'satu postingan dikirim');
  const body = JSON.stringify(sent[0].components);
  assert.ok(body.includes('Trade') || body.includes('trade'), 'judul tampil');
  assert.ok(body.includes('Seru') || body.includes('seru'), 'detail tampil');
  assert.ok(body.includes('Vote'), 'ajakan vote tampil');
  assert.deepStrictEqual(reactions, ['👍', '👎'], 'reaksi vote ditambahkan');
  assert.ok(fakeModal.last.content.includes('Thanks'), 'balasan terkonfirmasi');

  // cooldown: kirim kedua dalam 60 detik ditolak
  const m2 = fakeModal({ title: 'Kedua', details: 'x' });
  await fb.handleSuggestSubmit(m2);
  assert.strictEqual(sent.length, 1, 'tidak diposting lagi selama cooldown');
  assert.ok(fakeModal.last.content.includes('Slow down'), 'pesan rate limit');

  console.log('feedback-check: semua lolos (modal valid, submit terformat, cooldown)');
  process.exit(0);
})().catch((e) => { console.error('feedback-check GAGAL:', e); process.exit(1); });
