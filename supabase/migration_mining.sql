-- Migrasi penambahan fitur Mining (Gua Tambang).
-- Jalankan di SQL Editor Supabase jika database sudah di versi Viaz sebelumnya.

alter table players add column if not exists ores jsonb default '{}';
alter table players add column if not exists mining_trip jsonb default null;
alter table players add column if not exists auto_mining boolean default false;

-- Inisialisasi skill mining dan berikan pickaxe jika farming level >= 10
update players set
  skills = case
    when skills->'mining' is null then
      jsonb_set(coalesce(skills, '{}'::jsonb), '{mining}', '{"level":1,"exp":0}'::jsonb)
    else skills
  end,
  ores = coalesce(ores, '{}'::jsonb),
  auto_mining = coalesce(auto_mining, false),
  inventory = case
    when (skills->'farming'->>'level')::int >= 10 and (inventory->>'pickaxe' is null or (inventory->>'pickaxe')::int = 0) then
      jsonb_set(coalesce(inventory, '{"hoe":1}'::jsonb), '{pickaxe}', '1'::jsonb)
    else coalesce(inventory, '{"hoe":1}'::jsonb)
  end;
