-- Sistem retensi: statistik, koleksi, achievement, quest, prestige (satu kolom jsonb) + papan peringkat.
-- Aman dijalankan ulang.

alter table players add column if not exists progress jsonb default '{}'::jsonb;

-- Papan peringkat: hanya mengembalikan N teratas. Dipanggil bot dengan cache 60 detik.
create or replace function leaderboard(kind text, lim int default 10)
returns table(user_id text, username text, score numeric)
language sql
stable
as $$
  select t.user_id, t.username, t.score
  from (
    select
      p.user_id,
      p.username,
      case kind
        when 'viaz' then coalesce(p.viaz, 0)
        when 'farming' then coalesce((p.skills->'farming'->>'level')::numeric, 1)
        when 'mining' then coalesce((p.skills->'mining'->>'level')::numeric, 1)
        when 'fishing' then coalesce((p.skills->'fishing'->>'level')::numeric, 1)
        when 'dungeon' then coalesce((p.skills->'dungeon'->>'level')::numeric, 1)
        when 'total' then
          coalesce((p.skills->'farming'->>'level')::numeric, 1)
          + coalesce((p.skills->'mining'->>'level')::numeric, 1)
          + coalesce((p.skills->'fishing'->>'level')::numeric, 1)
          + coalesce((p.skills->'dungeon'->>'level')::numeric, 1)
        when 'fish' then coalesce((p.progress->'best'->'fish'->>'weight')::numeric, 0)
        when 'prestige' then coalesce((p.progress->>'prestige')::numeric, 0)
        else 0
      end as score,
      -- tie-break: EXP skill terkait
      case kind
        when 'mining' then coalesce((p.skills->'mining'->>'exp')::numeric, 0)
        when 'fishing' then coalesce((p.skills->'fishing'->>'exp')::numeric, 0)
        when 'dungeon' then coalesce((p.skills->'dungeon'->>'exp')::numeric, 0)
        else coalesce((p.skills->'farming'->>'exp')::numeric, 0)
      end as tie
    from players p
  ) t
  where t.score > 0
  order by t.score desc, t.tie desc
  limit least(greatest(lim, 1), 25);
$$;

-- Peringkat kekayaan memakai indeks; jenis lain dihitung dari jsonb dan di-cache di sisi bot.
create index if not exists players_viaz_idx on players (viaz desc);
