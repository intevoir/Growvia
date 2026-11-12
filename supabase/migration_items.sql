-- Item alat per copy (untuk pembelian berulang & trade pemain-ke-pemain nanti).
-- Kunci: "<type>_<tier>" mis. hoe_2 = Cangkul Biasa, nilai = jumlah copy yang dimiliki.
-- Diisi sekali dari tier alat yang sudah dimiliki pemain saat ini.
alter table players add column if not exists items jsonb default '{}'::jsonb;

update players
set items = coalesce(items, '{}'::jsonb) || coalesce((
  select jsonb_object_agg(k, 1) from (
    select 'hoe_' || (inventory->>'hoe') as k where coalesce((inventory->>'hoe')::int, 0) > 0
    union all select 'pickaxe_' || (inventory->>'pickaxe') where coalesce((inventory->>'pickaxe')::int, 0) > 0
    union all select 'rod_' || (inventory->>'rod') where coalesce((inventory->>'rod')::int, 0) > 0
    union all select 'weapon_' || (inventory->>'weapon') where coalesce((inventory->>'weapon')::int, 0) > 0
    union all select 'armor_' || (inventory->>'armor') where coalesce((inventory->>'armor')::int, 0) > 0
  ) t
), '{}'::jsonb);
