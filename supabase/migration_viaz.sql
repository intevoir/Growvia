-- Migrasi dari versi lama (gems + farmable) ke versi Viaz + benih + plot.
-- JALANKAN SEKALI di SQL Editor Supabase SEBELUM menjalankan bot versi baru.
-- Aman dijalankan ulang: bagian yang mengubah data hanya jalan jika kolom lama masih ada.
--
-- Efek pada pemain lama:
--   * Level & EXP lama dipertahankan sebagai level Farming (maksimal 100).
--   * Viaz, benih, inventory direset ke kondisi awal (Hoe + 100 benih Gandum).
--   * Total halving direset ke 0.

-- 1. Kolom baru
alter table players add column if not exists skills jsonb default '{"farming":{"level":1,"exp":0}}';
alter table players add column if not exists viaz numeric default 0;
alter table players add column if not exists seeds jsonb default '{"gandum":100}';
alter table players add column if not exists harvests jsonb default '{}';
alter table players add column if not exists plantings jsonb default '{}';
alter table players add column if not exists bought_plots integer default 0;
alter table players add column if not exists auto_plant boolean default false;

-- 2. Pindahkan data lama, lalu buang kolom lama
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'level'
  ) then
    update players set
      skills = jsonb_build_object(
        'farming',
        jsonb_build_object(
          'level', least(greatest(coalesce(level, 1), 1), 100),
          'exp', greatest(coalesce(exp, 0), 0)
        )
      ),
      viaz = 0,
      seeds = '{"gandum":100}'::jsonb,
      harvests = '{}'::jsonb,
      plantings = '{}'::jsonb,
      bought_plots = 0,
      auto_plant = false,
      inventory = '{"hoe":1}'::jsonb;

    alter table players
      drop column if exists level,
      drop column if exists exp,
      drop column if exists gems,
      drop column if exists farmable_id,
      drop column if exists unlocked_farmables,
      drop column if exists equipped_item_id,
      drop column if exists break_count;
  end if;
end $$;

alter table players alter column inventory set default '{"hoe":1}';

-- 3. Halving: total_gems_held -> total_viaz_minted (reset)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'halving_state' and column_name = 'total_gems_held'
  ) then
    alter table halving_state rename column total_gems_held to total_viaz_minted;
    update halving_state set total_viaz_minted = 0;
  end if;
end $$;

-- 4. Index & fungsi statistik
drop index if exists players_level_idx;

create index if not exists players_idle_thread_idx
  on players (last_thread_activity)
  where thread_id is not null;

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
