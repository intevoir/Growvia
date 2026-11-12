-- Migrasi penambahan kolom pengaturan bahasa pemain (lang).
-- Jalankan di SQL Editor Supabase.

alter table players add column if not exists lang text default 'en';

update players set
  lang = coalesce(lang, 'en');
