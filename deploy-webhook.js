'use strict';

/**
 * Webhook auto-deploy: GitHub push ke main -> git pull -> npm install (jika perlu)
 * -> tes -> restart bot lewat PM2. Hanya menerima request bertanda tangan GitHub
 * (X-Hub-Signature-256) memakai WEBHOOK_SECRET.
 */

require('dotenv').config();

const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4000;
const SECRET = process.env.WEBHOOK_SECRET;
const BRANCH = process.env.DEPLOY_BRANCH || 'main';
const PM2 = process.env.PM2_BIN || 'pm2';
const BOT_APP = process.env.PM2_APP_NAME || 'growvia';
const WEBHOOK_APP = process.env.PM2_WEBHOOK_NAME || 'growvia-webhook';
// Opsional: kirim hasil deploy ke Discord. Akhiran "/github" otomatis dibuang.
const NOTIFY_URL = (process.env.DEPLOY_DISCORD_WEBHOOK || '').replace(/\/github\/?$/, '');
const MAX_BODY_BYTES = 5 * 1024 * 1024;

if (!SECRET) {
  console.error('[deploy] WEBHOOK_SECRET kosong di .env. Webhook tidak dijalankan.');
  process.exit(1);
}

const log = (msg) => console.log(`[${new Date().toISOString()}] [deploy] ${msg}`);

function validSignature(rawBody, header) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(rawBody).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function notify(content) {
  if (!NOTIFY_URL) return;
  try {
    await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Growvia Deploy', content: content.slice(0, 1900) }),
    });
  } catch (e) {
    log(`notifikasi Discord gagal: ${e.message}`);
  }
}

const git = (...args) => run('git', args, { cwd: ROOT, timeout: 120_000 }).then((r) => r.stdout.trim());

function tail(text, max = 600) {
  const s = String(text ?? '').trim();
  return s.length > max ? `...${s.slice(-max)}` : s;
}

async function restartBot() {
  try {
    await run(PM2, ['restart', BOT_APP, '--update-env'], { cwd: ROOT, timeout: 60_000 });
  } catch {
    await run(PM2, ['start', 'ecosystem.config.js', '--only', BOT_APP], { cwd: ROOT, timeout: 60_000 });
  }
}

async function deployOnce() {
  try {
    const before = await git('rev-parse', 'HEAD');
    await git('pull', '--ff-only', 'origin', BRANCH);
    const after = await git('rev-parse', 'HEAD');
    if (before === after) {
      log('sudah terbaru, tidak ada yang di-deploy');
      return;
    }

    const changed = (await git('diff', '--name-only', before, after)).split('\n').filter(Boolean);
    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json')) {
      log('dependency berubah, npm install');
      await run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, timeout: 300_000 });
    }

    // Gerbang keamanan: kalau tes gagal, bot yang sedang berjalan TIDAK di-restart.
    await run('npm', ['test', '--silent'], { cwd: ROOT, timeout: 120_000 });

    await restartBot();
    const summary = await git('log', '-1', '--pretty=%h %s');
    log(`deploy sukses: ${summary}`);
    await notify(`✅ Deploy sukses: \`${summary}\``);

    if (changed.includes('deploy-webhook.js') || changed.includes('ecosystem.config.js')) {
      // Restart diri sendiri paling akhir, setelah respons dan notifikasi terkirim.
      setTimeout(() => run(PM2, ['restart', WEBHOOK_APP]).catch(() => {}), 1000);
    }
  } catch (e) {
    const detail = tail(e.stderr || e.stdout || e.message);
    log(`deploy GAGAL: ${detail}`);
    await notify(`❌ Deploy gagal, bot lama tetap berjalan.\n\`\`\`\n${detail}\n\`\`\``);
  }
}

let deploying = false;
let queued = false;

/** Satu deploy pada satu waktu. Push yang datang saat deploy berjalan dijadwalkan sekali lagi. */
async function deploy() {
  if (deploying) {
    queued = true;
    return;
  }
  deploying = true;
  try {
    do {
      queued = false;
      await deployOnce();
    } while (queued);
  } finally {
    deploying = false;
  }
}

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`${body}\n`);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return reply(res, 200, 'ok');
  if (req.method !== 'POST' || req.url !== '/webhook/deploy') return reply(res, 404, 'Not found');

  const chunks = [];
  let size = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      aborted = true;
      reply(res, 413, 'Payload too large');
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (aborted) return;
    const raw = Buffer.concat(chunks);

    if (!validSignature(raw, req.headers['x-hub-signature-256'])) {
      log('request ditolak: tanda tangan tidak valid');
      return reply(res, 401, 'Invalid signature');
    }

    const event = req.headers['x-github-event'];
    if (event === 'ping') return reply(res, 200, 'pong');
    if (event !== 'push') return reply(res, 202, `Event ${event} diabaikan`);

    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return reply(res, 400, 'Bad JSON');
    }
    if (payload.ref !== `refs/heads/${BRANCH}` || payload.deleted) {
      return reply(res, 202, 'Bukan push ke branch deploy, diabaikan');
    }

    reply(res, 202, 'Deploy dijadwalkan');
    log(`push diterima (${payload.after?.slice(0, 7) ?? '?'}), mulai deploy`);
    deploy().catch((e) => log(`deploy error: ${e.message}`));
  });
});

server.listen(PORT, () => log(`webhook mendengarkan di port ${PORT}`));
