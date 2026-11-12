-- Migrasi fitur Fishing (umpan, ikan, sesi AFK, pancingan).
-- Aman dijalankan ulang.

alter table players add column if not exists baits jsonb default '{}';
alter table players add column if not exists fishes jsonb default '[]';
alter table players add column if not exists fishing_session jsonb default null;

update players set
  baits = coalesce(baits, '{}'::jsonb),
  fishes = coalesce(fishes, '[]'::jsonb),
  skills = case
    when skills->'fishing' is null then
      jsonb_set(coalesce(skills, '{}'::jsonb), '{fishing}', '{"level":1,"exp":0}'::jsonb)
    else skills
  end,
  inventory = case
    when inventory->'rod' is null then jsonb_set(coalesce(inventory, '{"hoe":1}'::jsonb), '{rod}', '0'::jsonb)
    else inventory
  end;
