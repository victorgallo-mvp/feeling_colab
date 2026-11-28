-- Up Migration
-- Trava semanal das moedas: a partir de um dia/hora locais (ex.: sexta 15h) ninguém dá mais moeda até a virada
-- da semana (segunda 00:00), quando o saldo volta cheio. coins_lock_dow nulo = sem trava.
alter table tenants add column coins_lock_dow smallint check (coins_lock_dow between 1 and 7);   -- 1 = segunda … 7 = domingo
alter table tenants add column coins_lock_hour smallint not null default 15 check (coins_lock_hour between 0 and 23);
alter table tenants add column coins_lock_from date;   -- a trava só vale para semanas que começam nesta data ou depois

-- Feeling: trava sexta às 15h, valendo a partir da semana de 30/11/2026.
update tenants set coins_lock_dow = 5, coins_lock_hour = 15, coins_lock_from = date '2026-11-30', updated_at = now() where slug = 'feeling';

-- Down Migration
alter table tenants drop column coins_lock_from;
alter table tenants drop column coins_lock_hour;
alter table tenants drop column coins_lock_dow;
