-- Migrasi penambahan kolom kapasitas ransel (bought_backpack)
-- Jalankan di SQL Editor Supabase.

alter table players add column if not exists bought_backpack integer default 0;

update players set
  bought_backpack = coalesce(bought_backpack, 0);
