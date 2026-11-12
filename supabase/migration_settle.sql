-- Daftar pemain yang punya aktivitas berjalan (untuk settle latar tiap menit).
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
