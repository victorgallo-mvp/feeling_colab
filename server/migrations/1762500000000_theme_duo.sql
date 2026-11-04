-- Up Migration
alter table tenants drop constraint tenants_theme_check;
alter table tenants add constraint tenants_theme_check check (theme in ('light','dark','duo'));

-- Down Migration
update tenants set theme = 'light' where theme = 'duo';
alter table tenants drop constraint tenants_theme_check;
alter table tenants add constraint tenants_theme_check check (theme in ('light','dark'));
