-- Up Migration
create table rewards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  title text not null,
  description text,
  kind text not null check (kind in ('individual','team','wheel')),
  weight int not null default 1 check (weight between 1 and 100),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index rewards_tenant_idx on rewards(tenant_id) where deleted_at is null;

create table wheel_spins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  cycle_id uuid references cycles(id),
  week_key text not null,
  user_id uuid not null references users(id),
  reward_id uuid not null references rewards(id),
  points int not null default 0,
  spun_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index wheel_spins_week_uq on wheel_spins(tenant_id, week_key);

create table achievements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  key text not null,
  cycle_id uuid references cycles(id),
  meta jsonb not null default '{}'::jsonb,
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index achievements_user_key_uq on achievements(user_id, key);
create index achievements_tenant_idx on achievements(tenant_id, earned_at desc);

alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'balance_reminder','mission_new','mission_validated','mission_rejected','recognition_received','cycle_ending','cycle_closed','achievement','wheel_winner'));

-- Down Migration
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'balance_reminder','mission_new','mission_validated','mission_rejected','recognition_received','cycle_ending','cycle_closed'));
drop table if exists achievements;
drop table if exists wheel_spins;
drop table if exists rewards;
