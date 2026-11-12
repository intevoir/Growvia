'use strict';

/**
 * Jalankan migrasi SQL ke Supabase dengan backup sebelum dan verifikasi sesudah.
 *
 *   npm run migrate                   # jalankan supabase/migration_viaz.sql
 *   npm run migrate -- --dry-run      # hanya cek koneksi & keadaan, tidak mengubah apa pun
 *   npm run migrate -- --file=supabase/schema.sql
 *
 * Kredensial (simpan di .env, jangan di chat / commit). Pilih salah satu:
 *   SUPABASE_ACCESS_TOKEN  Personal Access Token Supabase (Management API, tanpa dependency tambahan)
 *   DATABASE_URL           Connection string Postgres (butuh paket `pg`: npm i --no-save pg)
 */

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force'); // jalankan file SQL apa adanya (untuk migrasi fungsi baru)
const fileArg = args.find((a) => a.startsWith('--file='));
const SQL_FILE = path.resolve(__dirname, '..', fileArg ? fileArg.slice('--file='.length) : 'supabase/migration_viaz.sql');

const REQUIRED_PLAYER_COLUMNS = [
  'skills',
  'viaz',
  'seeds',
  'harvests',
  'plantings',
  'bought_plots',
  'auto_plant',
  'ores',
  'mining_trip',
  'auto_mining',
  'bought_backpack',
  'lang',
  'baits',
  'fishes',
  'fishing_session',
  'dungeon_run',
  'dungeon_loot',
  'potions',
  'inventory',
  'items',
  'boosters',
  'progress',
];
const LEGACY_PLAYER_COLUMNS = ['level', 'exp', 'gems', 'farmable_id', 'unlocked_farmables', 'equipped_item_id', 'break_count'];

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

const log = (message) => console.log(message);

/* ---------- Pemilihan jalur koneksi ---------- */

function projectRef() {
  try {
    return new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
  } catch {
    return fail('SUPABASE_URL di .env tidak valid.');
  }
}

async function makeRunner() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const dbUrl = process.env.DATABASE_URL;

  if (token) {
    const ref = projectRef();
    const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;
    return {
      label: `Management API (project ${ref})`,
      async query(sql) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: sql }),
        });
        const text = await res.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
        if (!res.ok) {
          const detail = typeof body === 'object' && body ? body.message || JSON.stringify(body) : String(body);
          const hint = res.status === 401 || res.status === 403 ? ' (token salah / tidak punya akses ke project ini)' : '';
          throw new Error(`HTTP ${res.status}: ${detail.slice(0, 600)}${hint}`);
        }
        return Array.isArray(body) ? body : [];
      },
      async close() {},
    };
  }

  if (dbUrl) {
    let Client;
    try {
      ({ Client } = require('pg'));
    } catch {
      return fail('DATABASE_URL dipakai tapi paket `pg` belum ada. Jalankan: npm i --no-save pg');
    }
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    return {
      label: 'Postgres langsung (DATABASE_URL)',
      async query(sql) {
        const result = await client.query(sql);
        const last = Array.isArray(result) ? result[result.length - 1] : result;
        return last?.rows ?? [];
      },
      close: () => client.end(),
    };
  }

  return fail(
    'Tidak ada kredensial. Isi salah satu di .env:\n' +
      '   SUPABASE_ACCESS_TOKEN=sbp_...   (Supabase > Account > Access Tokens)\n' +
      '   DATABASE_URL=postgresql://...   (Supabase > Project Settings > Database > Connection string)',
  );
}

/* ---------- Backup data lewat service role ---------- */

async function backupData() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const dump = { taken_at: new Date().toISOString() };
  for (const table of ['players', 'halving_state', 'panel_state']) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw new Error(`backup ${table} gagal: ${error.message}`);
    dump[table] = data;
  }
  const file = path.join(os.homedir(), `growvia-db-backup-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2), { mode: 0o600 });
  log(`   backup: ${file} (players: ${dump.players.length})`);
  return file;
}

/* ---------- Keadaan skema ---------- */

async function inspectSchema(runner) {
  const columns = async (table) =>
    (
      await runner.query(
        `select column_name from information_schema.columns where table_schema='public' and table_name='${table}'`,
      )
    ).map((r) => r.column_name);

  const players = await columns('players');
  const halving = await columns('halving_state');
  const fn = await runner.query(
    "select 1 as ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='player_stats'",
  );

  return {
    missingPlayers: REQUIRED_PLAYER_COLUMNS.filter((c) => !players.includes(c)),
    legacyPlayers: LEGACY_PLAYER_COLUMNS.filter((c) => players.includes(c)),
    halvingOk: halving.includes('total_viaz_minted') && !halving.includes('total_gems_held'),
    hasStatsFn: fn.length > 0,
  };
}

const isMigrated = (s) =>
  s.missingPlayers.length === 0 && s.legacyPlayers.length === 0 && s.halvingOk && s.hasStatsFn;

function describe(s) {
  log(`   kolom baru yang belum ada : ${s.missingPlayers.join(', ') || '-'}`);
  log(`   kolom lama yang masih ada : ${s.legacyPlayers.join(', ') || '-'}`);
  log(`   halving_state.total_viaz_minted: ${s.halvingOk ? 'ada' : 'belum'}`);
  log(`   fungsi player_stats()          : ${s.hasStatsFn ? 'ada' : 'belum'}`);
}

/* ---------- Main ---------- */

(async () => {
  if (!fs.existsSync(SQL_FILE)) fail(`File SQL tidak ditemukan: ${SQL_FILE}`);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.');
  }
  const sql = fs.readFileSync(SQL_FILE, 'utf8');

  log(`\n[1/5] Koneksi${DRY_RUN ? ' (dry-run)' : ''}`);
  const runner = await makeRunner();
  try {
    await runner.query('select 1');
    log(`   OK via ${runner.label}`);

    log('\n[2/5] Keadaan skema sekarang');
    const before = await inspectSchema(runner);
    describe(before);

    if (isMigrated(before) && !FORCE) {
      log('\n✅ Database sudah termigrasi. Tidak ada yang perlu dijalankan.');
      return;
    }
    if (DRY_RUN) {
      log(`\n(dry-run) Akan menjalankan ${path.relative(process.cwd(), SQL_FILE)}. Tidak ada yang diubah.`);
      return;
    }

    log('\n[3/5] Backup data');
    await backupData();

    log(`\n[4/5] Menjalankan ${path.relative(process.cwd(), SQL_FILE)}`);
    await runner.query(sql);
    await runner.query("notify pgrst, 'reload schema'");
    log('   selesai, schema cache API dimuat ulang');

    log('\n[5/5] Verifikasi');
    // Beri waktu PostgREST memuat ulang cache sebelum dites lewat API.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const after = await inspectSchema(runner);
    describe(after);
    if (!isMigrated(after) && !FORCE) fail('Verifikasi gagal: skema belum sesuai. Data asli aman di file backup di atas.');

    const stats = await runner.query('select * from player_stats()');
    const players = await runner.query("select skills->'farming' as farming, viaz, seeds, inventory from players");
    log(`   player_stats(): ${JSON.stringify(stats[0] ?? null)}`);
    log(`   pemain termigrasi: ${players.length}`);
    for (const p of players.slice(0, 5)) {
      log(`     farming=${JSON.stringify(p.farming)} viaz=${p.viaz} seeds=${JSON.stringify(p.seeds)} inventory=${JSON.stringify(p.inventory)}`);
    }

    // Terakhir: pastikan lewat service role (jalur yang dipakai bot) kolom baru terbaca.
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const api = await supabase.from('players').select('user_id,skills,viaz,seeds,plantings', { head: true, count: 'exact' });
    if (api.error) fail(`API belum melihat kolom baru: ${api.error.message}. Coba jalankan ulang dalam 1 menit.`);
    log('   jalur API (dipakai bot): OK');

    log('\n✅ Migrasi selesai.');
  } catch (e) {
    fail(`Migrasi gagal: ${e.message}\n   Tidak ada backup data yang dihapus. Jalankan ulang aman (idempoten).`);
  } finally {
    await runner.close().catch(() => {});
  }
})();
