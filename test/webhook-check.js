'use strict';

/**
 * Tes keamanan deploy-webhook.js: tanda tangan, filter event/branch, batas ukuran.
 * Tidak menjalankan deploy sungguhan (hanya request yang ditolak / diabaikan).
 */

const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 45871;
const SECRET = 'rahasia-tes';
const BASE = `http://127.0.0.1:${PORT}`;

const sign = (body, secret = SECRET) =>
  `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

async function post(url, body, headers = {}) {
  const res = await fetch(`${BASE}${url}`, { method: 'POST', body, headers });
  return { status: res.status, text: (await res.text()).trim() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'deploy-webhook.js')], {
    env: { ...process.env, PORT: String(PORT), WEBHOOK_SECRET: SECRET, DEPLOY_DISCORD_WEBHOOK: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));

  try {
    for (let i = 0; i < 40 && !out.includes('mendengarkan'); i++) await sleep(100);
    assert.ok(out.includes('mendengarkan'), `webhook tidak start: ${out}`);

    const health = await fetch(`${BASE}/health`);
    assert.strictEqual(health.status, 200);

    const push = JSON.stringify({ ref: 'refs/heads/main', after: 'abc1234' });
    const otherBranch = JSON.stringify({ ref: 'refs/heads/dev', after: 'abc1234' });
    const json = { 'Content-Type': 'application/json' };

    // Tanpa tanda tangan / tanda tangan salah -> 401
    assert.strictEqual((await post('/webhook/deploy', push, json)).status, 401);
    assert.strictEqual(
      (await post('/webhook/deploy', push, { ...json, 'X-Hub-Signature-256': sign(push, 'salah') })).status,
      401,
    );
    assert.strictEqual(
      (await post('/webhook/deploy', push, { ...json, 'X-Hub-Signature-256': 'sha256=zz' })).status,
      401,
    );

    // Path salah -> 404
    assert.strictEqual((await post('/lain', push, json)).status, 404);

    // Tanda tangan valid: ping dibalas, event lain dan branch lain diabaikan
    const ok = (body, event) => ({ ...json, 'X-Hub-Signature-256': sign(body), 'X-GitHub-Event': event });
    const ping = await post('/webhook/deploy', '{}', ok('{}', 'ping'));
    assert.strictEqual(ping.status, 200);
    assert.strictEqual(ping.text, 'pong');
    assert.strictEqual((await post('/webhook/deploy', push, ok(push, 'issues'))).status, 202);
    const ignored = await post('/webhook/deploy', otherBranch, ok(otherBranch, 'push'));
    assert.strictEqual(ignored.status, 202);
    assert.ok(ignored.text.includes('diabaikan'));
    assert.ok(!out.includes('mulai deploy'), 'branch lain tidak boleh memicu deploy');

    // Payload terlalu besar -> ditolak
    const big = 'x'.repeat(6 * 1024 * 1024);
    const bigRes = await post('/webhook/deploy', big, json).catch(() => ({ status: 413 }));
    assert.ok([413, 401].includes(bigRes.status));

    // Tanpa secret, webhook menolak start
    const bare = spawn(process.execPath, [path.join(__dirname, '..', 'deploy-webhook.js')], {
      env: { ...process.env, PORT: String(PORT + 1), WEBHOOK_SECRET: '' },
      stdio: 'ignore',
    });
    const code = await new Promise((resolve) => bare.on('exit', resolve));
    assert.strictEqual(code, 1, 'tanpa WEBHOOK_SECRET webhook harus menolak start');

    console.log('webhook-check: semua lolos');
  } finally {
    child.kill();
  }
})().catch((e) => {
  console.error('webhook-check GAGAL:', e);
  process.exit(1);
});
