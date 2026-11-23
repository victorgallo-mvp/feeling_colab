-- Up Migration
-- Programa Feel Good: moedas semanais, justificativa obrigatória, desempate da roleta,
-- "Dobre e passe", status de entrega do prêmio e acesso por código gerado pelo admin.

-- Regras semanais (0 = desligado: vale o saldo da temporada, como antes)
alter table tenants add column coins_per_week int not null default 0 check (coins_per_week between 0 and 1000);
alter table tenants add column message_min_chars int not null default 0 check (message_min_chars between 0 and 200);

-- Acesso por código: o admin gera, a pessoa digita uma vez e o aparelho fica conectado
alter table tenants drop constraint tenants_auth_mode_check;
alter table tenants add constraint tenants_auth_mode_check check (auth_mode in ('magic_link','click','invite'));

-- Tolerância na rotação do refresh token: o token trocado continua valendo por alguns minutos,
-- para uma resposta perdida na rede não derrubar a sessão de um ano.
alter table sessions add column rotated_at timestamptz;

-- Roleta: prêmio especial que não paga e dobra o do próximo vencedor
alter table rewards add column effect text not null default 'prize' check (effect in ('prize','double_next'));
alter table wheel_spins add column multiplier int not null default 1 check (multiplier >= 1);
alter table wheel_spins add column status text not null default 'pending' check (status in ('pending','scheduled','delivered'));
alter table wheel_spins add column delivery_note text;
update wheel_spins set status = 'delivered' where delivered_at is not null;

-- Desempate ("giro prévio"): cada empatado tira um número, o maior vence
create table wheel_tiebreaks (
  tenant_id uuid not null references tenants(id),
  week_key text not null,
  user_id uuid not null references users(id),
  roll int not null check (roll between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (tenant_id, week_key, user_id)
);
create unique index wheel_tiebreaks_roll_uq on wheel_tiebreaks(tenant_id, week_key, roll);

-- Feeling: regras do deck Feel Good. O modo de acesso NÃO muda aqui: o admin troca em
-- Admin → Marca & acesso depois de distribuir os códigos.
update tenants set coins_per_week = 5, message_min_chars = 10, recognition_cost = 1 where slug = 'feeling';
update cycles set recognition_cost = 1 where status = 'open' and tenant_id in (select id from tenants where slug = 'feeling');

-- As 6 atitudes do deck substituem os motivos antigos (que ficam no histórico, fora de vigência)
update chips set valid_until = now(), updated_at = now()
 where valid_until is null and tenant_id in (select id from tenants where slug = 'feeling');
insert into chips (tenant_id, label, emoji, sort_order)
select t.id, v.label, null, v.ord from tenants t,
  (values ('Colaboração', 0), ('Proatividade', 1), ('Comprometimento', 2), ('Atitude de dono', 3), ('Resolução', 4), ('Excelência', 5)) as v(label, ord)
 where t.slug = 'feeling';

-- Os 10 prêmios do deck substituem os da roleta (os antigos ficam desativados, reativáveis no admin)
update rewards set is_active = false, updated_at = now()
 where kind = 'wheel' and deleted_at is null and tenant_id in (select id from tenants where slug = 'feeling');
insert into rewards (tenant_id, title, description, kind, weight, sort_order, effect)
select t.id, v.title, v.description, 'wheel', v.weight, v.ord, v.effect from tenants t,
  (values
    ('R$ 100 no Pix', null, 1, 0, 'prize'),
    ('R$ 50 no Pix', null, 2, 1, 'prize'),
    ('1 dia de Home Office', 'Data combinada com a liderança.', 2, 2, 'prize'),
    ('1 dia de folga', 'Data combinada com a liderança.', 1, 3, 'prize'),
    ('Folga sexta após o almoço', 'Data combinada com a liderança.', 2, 4, 'prize'),
    ('Vale-energético (um fardo)', null, 3, 5, 'prize'),
    ('Vale-cinema (2 pessoas)', null, 3, 6, 'prize'),
    ('Vale-pizza', null, 3, 7, 'prize'),
    ('Prêmio surpresa (caixa misteriosa)', null, 3, 8, 'prize'),
    ('Dobre e passe para o próximo', 'O prêmio não sai nesta semana: o próximo Destaque leva em dobro.', 2, 9, 'double_next')
  ) as v(title, description, weight, ord, effect)
 where t.slug = 'feeling';

-- Down Migration
drop table if exists wheel_tiebreaks;
alter table wheel_spins drop column delivery_note;
alter table wheel_spins drop column status;
alter table wheel_spins drop column multiplier;
alter table rewards drop column effect;
alter table sessions drop column rotated_at;
update tenants set auth_mode = 'click' where auth_mode = 'invite';
alter table tenants drop constraint tenants_auth_mode_check;
alter table tenants add constraint tenants_auth_mode_check check (auth_mode in ('magic_link','click'));
alter table tenants drop column message_min_chars;
alter table tenants drop column coins_per_week;
