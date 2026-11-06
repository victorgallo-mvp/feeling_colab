-- Up Migration
-- Modo simples: motivo (chip) opcional e "0 = sem limite" para moedas e máximo por pessoa.
alter table recognitions alter column chip_id drop not null;

alter table tenants drop constraint if exists tenants_coins_per_cycle_check;
alter table tenants add constraint tenants_coins_per_cycle_check check (coins_per_cycle >= 0);
alter table tenants drop constraint if exists tenants_max_per_receiver_per_cycle_check;
alter table tenants add constraint tenants_max_per_receiver_per_cycle_check check (max_per_receiver_per_cycle >= 0);

-- Feeling: 1 moeda por reconhecimento, sem limite de saldo nem por pessoa (vale já na temporada aberta)
update tenants set coins_per_cycle = 0, recognition_cost = 1, max_per_receiver_per_cycle = 0 where slug = 'feeling';
update cycles set coins_per_user = 0, recognition_cost = 1, max_per_receiver = 0
 where status = 'open' and tenant_id in (select id from tenants where slug = 'feeling');

-- Down Migration
update tenants set coins_per_cycle = 20, recognition_cost = 5, max_per_receiver_per_cycle = 3 where slug = 'feeling';
alter table tenants drop constraint if exists tenants_coins_per_cycle_check;
alter table tenants add constraint tenants_coins_per_cycle_check check (coins_per_cycle > 0);
alter table tenants drop constraint if exists tenants_max_per_receiver_per_cycle_check;
alter table tenants add constraint tenants_max_per_receiver_per_cycle_check check (max_per_receiver_per_cycle > 0);
