-- Booster Viaz sementara: { "<boostId>": expiresAtMs } (6 jam per pembelian).
alter table players add column if not exists boosts jsonb default '{}'::jsonb;
