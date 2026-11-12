-- Migrasi fitur Dungeon (run aktif, loot, ramuan, senjata & armor). Aman dijalankan ulang.

alter table players add column if not exists dungeon_run jsonb default null;
alter table players add column if not exists dungeon_loot jsonb default '{}';
alter table players add column if not exists potions jsonb default '{}';

update players set
  dungeon_loot = coalesce(dungeon_loot, '{}'::jsonb),
  potions = coalesce(potions, '{}'::jsonb),
  skills = case
    when skills->'dungeon' is null then
      jsonb_set(coalesce(skills, '{}'::jsonb), '{dungeon}', '{"level":1,"exp":0}'::jsonb)
    else skills
  end,
  inventory = coalesce(inventory, '{"hoe":1}'::jsonb)
    || case when inventory->'weapon' is null then '{"weapon":0}'::jsonb else '{}'::jsonb end
    || case when inventory->'armor' is null then '{"armor":0}'::jsonb else '{}'::jsonb end;
