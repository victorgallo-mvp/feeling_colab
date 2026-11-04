-- Up Migration
alter table tenants add column auth_mode text not null default 'magic_link' check (auth_mode in ('magic_link','click'));

-- Down Migration
alter table tenants drop column auth_mode;
