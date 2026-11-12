-- Papan aktivitas live: berapa pemain yang sedang menjalankan tiap aktivitas.
-- Aman dijalankan ulang.

create or replace function live_activity()
returns table(
  farming_q bigint,
  mining_q bigint,
  fishing_q bigint,
  dungeon_q bigint,
  online_q bigint,
  total_q bigint
)
language sql
stable
as $$
  select
    count(*) filter (where plantings is not null and plantings <> '{}'::jsonb),
    count(*) filter (where mining_trip is not null),
    count(*) filter (where fishing_session is not null),
    count(*) filter (where dungeon_run is not null),
    count(*) filter (where last_thread_activity > now() - interval '10 minutes'),
    count(*)
  from players;
$$;
