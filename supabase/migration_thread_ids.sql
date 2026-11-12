-- Daftar semua thread pribadi milik pemain (satu per aktivitas) supaya tombol & perintah
-- bisa dipakai dari thread mana pun miliknya, bukan cuma thread terakhir.
alter table players add column if not exists thread_ids jsonb default '[]'::jsonb;

-- Isi dari thread aktif yang sudah ada.
update players
set thread_ids = jsonb_build_array(thread_id)
where thread_id is not null
  and (thread_ids is null or thread_ids = '[]'::jsonb);
