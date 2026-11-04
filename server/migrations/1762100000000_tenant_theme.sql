-- Up Migration
alter table tenants
  add column theme text not null default 'light' check (theme in ('light','dark')),
  add column logo_dark_url text,
  add column symbol_url text,
  add column font_display text not null default 'default' check (font_display in ('default','big-shoulders'));

-- Down Migration
alter table tenants drop column theme, drop column logo_dark_url, drop column symbol_url, drop column font_display;
