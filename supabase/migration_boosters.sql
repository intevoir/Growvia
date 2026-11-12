-- Booster consumable (XP/hasil/jual, ada durasinya) di toko consumables.
alter table players add column if not exists boosters jsonb default '{}'::jsonb;
