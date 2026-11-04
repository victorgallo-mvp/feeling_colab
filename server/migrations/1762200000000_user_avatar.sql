-- Up Migration
alter table users
  add column avatar_data bytea,
  add column avatar_mime text,
  add column avatar_updated_at timestamptz;

-- Down Migration
alter table users drop column avatar_data, drop column avatar_mime, drop column avatar_updated_at;
