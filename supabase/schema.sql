-- Skema Growvia (instalasi baru). Jalankan di SQL Editor Supabase.
-- Pakai SUPABASE_SERVICE_ROLE_KEY di .env (bypass RLS, cocok untuk bot server-side).

create table if not exists players (
  user_id text primary key,
  username text not null,
  thread_id text,
  thread_ids jsonb default '[]',
  guild_id text,
  -- level per aktivitas, mis. {"farming":{"level":1,"exp":0},"mining":{"level":1,"exp":0}}.
  skills jsonb default '{"farming":{"level":1,"exp":0},"mining":{"level":1,"exp":0},"fishing":{"level":1,"exp":0},"dungeon":{"level":1,"exp":0}}',
  viaz numeric default 0,
  seeds jsonb default '{"gandum":100}',
  harvests jsonb default '{}',
  plantings jsonb default '{}',
  bought_plots integer default 0,
  auto_plant boolean default false,
  -- Kapasitas tas (+100 slot per upgrade)
  bought_backpack integer default 0,
  -- Fitur Mining
  ores jsonb default '{}',
  mining_trip jsonb default null,
  auto_mining boolean default false,
  -- Bahasa antarmuka ('en' atau 'id')
  lang text default 'en',
  -- Fitur Fishing
  baits jsonb default '{}',
  fishes jsonb default '[]',
  fishing_session jsonb default null,
  -- Fitur Dungeon
  dungeon_run jsonb default null,
  dungeon_loot jsonb default '{}',
  potions jsonb default '{}',
  inventory jsonb default '{"hoe":1,"pickaxe":0,"rod":0,"weapon":0,"armor":0}',
  -- Kepemilikan alat per copy, kunci "<type>_<tier>" -> jumlah (siap trade antar pemain)
  items jsonb default '{"hoe_1":1}',
  -- Booster aktif: { "farming_xp": { until, mult } }
  boosters jsonb default '{}',
  -- Booster sementara: { "<boostId>": expiresAtMs }
  boosts jsonb default '{}',
  status_msg_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_thread_activity timestamptz
);

-- Total Viaz yang pernah tercetak dari penjualan hasil panen / tambang (dasar halving).
create table if not exists halving_state (
  id integer primary key default 1,
  total_viaz_minted numeric default 0,
  updated_at timestamptz default now()
);

-- 1=farming, 2=akun, 3=toko tani, 4=mining, 5=toko tambang, 6=ransel, 7=fishing, 8=toko pancing, 9=dungeon, 10=toko dungeon
create table if not exists panel_state (
  id integer primary key,
  channel_id text,
  message_id text,
  updated_at timestamptz default now()
);

-- Untuk sweeper thread idle (hanya baris yang punya thread).
create index if not exists players_idle_thread_idx
  on players (last_thread_activity)
  where thread_id is not null;

-- Statistik global tanpa menarik semua baris ke bot.
create or replace function player_stats()
returns table(player_count bigint, avg_farming_level numeric)
language sql
stable
as $$
  select
    count(*),
    coalesce(avg((skills->'farming'->>'level')::numeric), 1)
  from players;
$$;

-- Sistem retensi (lihat supabase/migration_progress.sql untuk fungsi leaderboard + indeks).
alter table players add column if not exists progress jsonb default '{}'::jsonb;
create index if not exists players_viaz_idx on players (viaz desc);

-- Papan aktivitas live (lihat supabase/migration_live_activity.sql).
create or replace function live_activity()
returns table(farming_q bigint, mining_q bigint, fishing_q bigint, dungeon_q bigint, online_q bigint, total_q bigint)
language sql stable as $$
  select
    count(*) filter (where plantings is not null and plantings <> '{}'::jsonb),
    count(*) filter (where mining_trip is not null),
    count(*) filter (where fishing_session is not null),
    count(*) filter (where dungeon_run is not null),
    count(*) filter (where last_thread_activity > now() - interval '10 minutes'),
    count(*)
  from players;
$$;

-- Pekerja settle latar (lihat supabase/migration_settle.sql).
create or replace function active_players(lim int default 200)
returns table(user_id text)
language sql stable
as $$
  select p.user_id
  from players p
  where (p.plantings is not null and p.plantings <> '{}'::jsonb)
     or p.mining_trip is not null
     or p.fishing_session is not null
     or p.dungeon_run is not null
  limit least(greatest(lim, 1), 1000);
$$;
