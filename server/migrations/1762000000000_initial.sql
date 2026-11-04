-- Up Migration
create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  primary_color text not null default '#4f46e5',
  secondary_color text not null default '#f59e0b',
  timezone text not null default 'America/Sao_Paulo',
  coins_per_cycle int not null default 20 check (coins_per_cycle > 0),
  recognition_cost int not null default 5 check (recognition_cost > 0),
  max_per_receiver_per_cycle int not null default 3 check (max_per_receiver_per_cycle > 0),
  goal_participation_pct int not null default 80 check (goal_participation_pct between 1 and 100),
  goal_min_recognitions int not null default 3 check (goal_min_recognitions >= 0),
  goal_min_missions int not null default 1 check (goal_min_missions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index areas_tenant_name_uq on areas(tenant_id, lower(name)) where deleted_at is null;

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  email text not null,
  name text not null,
  avatar_url text,
  area_id uuid references areas(id),
  role text not null default 'member' check (role in ('member','manager','admin')),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index users_tenant_email_uq on users(tenant_id, lower(email)) where deleted_at is null;
create index users_tenant_idx on users(tenant_id) where deleted_at is null;

create table magic_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  refresh_token_hash text not null unique,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions(user_id) where revoked_at is null;

create table cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  coins_per_user int not null,
  recognition_cost int not null,
  max_per_receiver int not null,
  goal_participation_pct int not null,
  goal_min_recognitions int not null,
  goal_min_missions int not null,
  closed_at timestamptz,
  closed_by uuid references users(id),
  team_goal_reached boolean,
  participation_pct numeric(5,2),
  team_reward_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at > starts_at)
);
create unique index cycles_one_open_per_tenant on cycles(tenant_id) where status = 'open' and deleted_at is null;
create index cycles_tenant_idx on cycles(tenant_id, starts_at desc);

create table chips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  label text not null,
  emoji text,
  color text,
  sort_order int not null default 0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index chips_tenant_idx on chips(tenant_id) where deleted_at is null;

create table recognitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  cycle_id uuid not null references cycles(id),
  giver_id uuid not null references users(id),
  receiver_id uuid not null references users(id),
  chip_id uuid not null references chips(id),
  message text,
  coins_spent int not null check (coins_spent > 0),
  points_awarded int not null check (points_awarded >= 0),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (giver_id <> receiver_id)
);
create index recognitions_receiver_idx on recognitions(tenant_id, cycle_id, receiver_id) where deleted_at is null;
create index recognitions_giver_pair_idx on recognitions(cycle_id, giver_id, receiver_id) where deleted_at is null;
create index recognitions_feed_idx on recognitions(tenant_id, created_at desc) where deleted_at is null;

create table reactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  recognition_id uuid not null references recognitions(id),
  user_id uuid not null references users(id),
  emoji text not null default '👏',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index reactions_uq on reactions(recognition_id, user_id, emoji) where deleted_at is null;

create table mission_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  title text not null,
  description text,
  points int not null check (points > 0),
  recurrence text not null check (recurrence in ('once','weekly','monthly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table missions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  created_by uuid not null references users(id),
  title text not null,
  description text,
  points int not null check (points > 0),
  recurrence text not null check (recurrence in ('once','weekly','monthly')),
  scope text not null default 'all' check (scope in ('all','area')),
  area_id uuid references areas(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  template_id uuid references mission_templates(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (scope = 'all' or area_id is not null)
);
create index missions_tenant_idx on missions(tenant_id) where deleted_at is null;

create table mission_completions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  mission_id uuid not null references missions(id),
  user_id uuid not null references users(id),
  cycle_id uuid not null references cycles(id),
  period_key text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  points_awarded int not null default 0,
  completed_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index mission_completions_uq on mission_completions(mission_id, user_id, period_key) where deleted_at is null;
create index mission_completions_cycle_idx on mission_completions(tenant_id, cycle_id, status) where deleted_at is null;

create table cycle_user_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  cycle_id uuid not null references cycles(id),
  user_id uuid not null references users(id),
  coins_given int not null default 0,
  coins_unspent int not null default 0,
  recognitions_given int not null default 0,
  recognitions_received int not null default 0,
  points_recognition int not null default 0,
  points_missions int not null default 0,
  points_total int not null default 0,
  missions_completed int not null default 0,
  rank int,
  met_participation boolean not null default false,
  received_by_chip jsonb not null default '{}'::jsonb,
  individual_reward_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions(user_id) where revoked_at is null;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  type text not null check (type in ('balance_reminder','mission_new','mission_validated','mission_rejected','recognition_received','cycle_ending','cycle_closed')),
  channel text not null default 'web_push',
  title text not null,
  body text not null,
  deep_link text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  failed_at timestamptz,
  error text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  actor_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_tenant_idx on audit_log(tenant_id, created_at desc);

-- Down Migration
drop table if exists audit_log;
drop table if exists notifications;
drop table if exists push_subscriptions;
drop table if exists cycle_user_snapshots;
drop table if exists mission_completions;
drop table if exists missions;
drop table if exists mission_templates;
drop table if exists reactions;
drop table if exists recognitions;
drop table if exists chips;
drop table if exists cycles;
drop table if exists sessions;
drop table if exists magic_links;
drop table if exists users;
drop table if exists areas;
drop table if exists tenants;
