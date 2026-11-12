'use strict';

/**
 * Tunnel publik untuk webhook deploy tanpa akun / domain Cloudflare (quick tunnel).
 * URL quick tunnel berubah tiap tunnel dimulai ulang, jadi setelah tunnel hidup skrip ini
 * memperbarui URL hook "/webhook/deploy" di GitHub lewat `gh`. Hook lain (mis. notifikasi
 * Discord) tidak disentuh.
 *
 * Syarat: `gh auth login` sudah dilakukan, dan cloudflared terpasang.
 * Kalau punya domain Cloudflare, pakai named tunnel (lihat DEPLOY.md) dan tidak perlu skrip ini.
 */

require('dotenv').config();

const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);

const PORT = Number(process.env.PORT) || 4000;
const SECRET = process.env.WEBHOOK_SECRET;
const CLOUDFLARED = process.env.CLOUDFLARED_BIN || path.join(os.homedir(), '.local', 'bin', 'cloudflared');
const GH = process.env.GH_BIN || 'gh';
const HOOK_PATH = '/webhook/deploy';
const READY_TIMEOUT_MS = 90_000;

const log = (msg) => console.log(`[${new Date().toISOString()}] [tunnel] ${msg}`);

if (!SECRET) {
  console.error('[tunnel] WEBHOOK_SECRET kosong di .env.');
  process.exit(1);
}

async function repoSlug() {
  if (process.env.GITHUB_REPO) return process.env.GITHUB_REPO;
  const { stdout } = await run('git', ['remote', 'get-url', 'origin'], { cwd: __dirname });
  const match = stdout.trim().match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  if (!match) throw new Error('Tidak bisa membaca nama repo dari git remote. Isi GITHUB_REPO di .env.');
  return match[1];
}

/** `gh api`; body JSON dikirim lewat stdin supaya secret tidak tampil di daftar proses. */
function gh(args, body) {
  return new Promise((resolve, reject) => {
    const proc = spawn(GH, ['api', ...args, ...(body ? ['--input', '-'] : [])], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(err.trim() || `gh keluar dengan kode ${code}`)),
    );
    proc.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}

async function syncHook(publicUrl) {
  const repo = await repoSlug();
  const target = `${publicUrl}${HOOK_PATH}`;
  const config = { url: target, content_type: 'json', secret: SECRET, insecure_ssl: '0' };

  const hooks = JSON.parse(await gh([`repos/${repo}/hooks`]));
  const mine = hooks.find((h) => (h.config?.url ?? '').endsWith(HOOK_PATH));

  let id;
  if (mine) {
    await gh(['-X', 'PATCH', `repos/${repo}/hooks/${mine.id}`], { active: true, events: ['push'], config });
    id = mine.id;
    log(`hook deploy #${id} diperbarui -> ${target}`);
  } else {
    const created = JSON.parse(
      await gh(['-X', 'POST', `repos/${repo}/hooks`], { name: 'web', active: true, events: ['push'], config }),
    );
    id = created.id;
    log(`hook deploy #${id} dibuat -> ${target}`);
  }
  await gh(['-X', 'POST', `repos/${repo}/hooks/${id}/pings`]).catch(() => {});
}

/** Tunggu sampai URL publik benar-benar menjawab (DNS quick tunnel butuh beberapa detik). */
async function waitUntilReachable(publicUrl) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${publicUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('URL tunnel tidak bisa dijangkau. Pastikan growvia-webhook berjalan.');
}

const child = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let announced = false;
const onOutput = (chunk) => {
  const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match || announced) return;
  announced = true;
  log(`tunnel hidup: ${match[0]}`);
  waitUntilReachable(match[0])
    .then(() => syncHook(match[0]))
    .catch((e) => log(`sinkron hook GAGAL: ${e.message}`));
};
child.stdout.on('data', onOutput);
child.stderr.on('data', onOutput);

child.on('error', (e) => {
  log(`cloudflared gagal dijalankan (${CLOUDFLARED}): ${e.message}`);
  process.exit(1);
});
// Tunnel mati -> keluar supaya PM2 memulai ulang dan hook disinkronkan dengan URL baru.
child.on('exit', (code) => {
  log(`cloudflared berhenti (kode ${code})`);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill();
    process.exit(0);
  });
}
