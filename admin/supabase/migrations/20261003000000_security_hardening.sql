-- ==============================================================================
-- Security Hardening Migration for Ananta CMS
-- ==============================================================================

-- 1. Ensure 'super_admin' role exists in user_role enum
alter type user_role add value if not exists 'super_admin';

-- 2. Drop insecure automatic profile creation on public signup.
-- Admin accounts must only be created by a super_admin.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

-- 3. Hardened security definer helper functions with search_path set explicitly
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
  );
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function is_editor() returns boolean
language sql stable security definer set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('editor', 'admin', 'super_admin')
  );
$$;

-- Revoke execute from public/anon on helper functions
revoke execute on function is_staff(), is_admin(), is_super_admin(), is_editor() from public, anon;
grant execute on function is_staff(), is_admin(), is_super_admin(), is_editor() to authenticated;

-- Ensure snapshot and publish functions have explicit search_path and are revoked from public/anon
create or replace function build_snapshot_types() returns jsonb
language sql stable security definer set search_path = public, auth, pg_temp as $$
  select coalesce(jsonb_object_agg(type_key, items), '{}'::jsonb)
  from (
    select type_key,
           jsonb_agg(jsonb_build_object('id', id, 'slug', slug,
                     'sort_order', sort_order, 'data', published_data)
                     order by sort_order, created_at) as items
    from content_items
    where not is_deleted and published_data is not null
    group by type_key
  ) t
$$;

create or replace function publish_all() returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('ananta_publish'));

  update content_items
     set published_data = null, status = 'archived', has_unpublished_changes = false
   where is_deleted and (published_data is not null or status <> 'archived');

  update content_items
     set published_data = draft_data, status = 'published',
         published_at = now(), has_unpublished_changes = false
   where not is_deleted and (has_unpublished_changes or published_data is null);

  return build_snapshot_types();
end $$;

create or replace function restore_snapshot(p_types jsonb) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('ananta_publish'));

  update content_items c
     set draft_data = x.data, published_data = x.data, slug = x.slug,
         sort_order = x.sort_order, is_deleted = false,
         status = 'published', published_at = now()
    from (
      select (i->>'id')::uuid as id, i->>'slug' as slug,
             (i->>'sort_order')::int as sort_order, i->'data' as data
      from jsonb_each(p_types) t(k, arr), jsonb_array_elements(arr) i
    ) x
   where c.id = x.id;

  update content_items
     set is_deleted = true, published_data = null, status = 'archived'
   where not is_deleted
     and id not in (select (i->>'id')::uuid
                    from jsonb_each(p_types) t(k, arr), jsonb_array_elements(arr) i);

  update content_items set has_unpublished_changes = false;
end $$;

revoke execute on function build_snapshot_types(), publish_all(), restore_snapshot(jsonb)
  from public, anon, authenticated;

-- 4. Revoke ALL table permissions from anon role
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 5. Storage Buckets Hardening
-- Snapshots bucket must be PRIVATE (never readable by anon or public)
update storage.buckets set public = false where id = 'snapshots';
update storage.buckets set public = true where id = 'media';

-- Storage RLS Policies
drop policy if exists "media upload" on storage.objects;
drop policy if exists "media public read" on storage.objects;
drop policy if exists "media admin write" on storage.objects;
drop policy if exists "snapshots staff read" on storage.objects;

-- media: public read
create policy "media public read" on storage.objects for select to public
  using (bucket_id = 'media');

-- media: admin/super_admin write only
create policy "media admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and is_admin());

-- snapshots: no direct client access; service role only (bypasses RLS)

-- 6. Row Level Security Policies Re-definition
-- Drop existing policies
drop policy if exists "profiles read" on profiles;
drop policy if exists "types read" on content_types;
drop policy if exists "types write" on content_types;
drop policy if exists "items staff" on content_items;
drop policy if exists "media staff" on media;
drop policy if exists "releases read" on releases;
drop policy if exists "audit read" on audit_log;

-- Table: profiles
create policy "profiles read" on profiles for select to authenticated
  using (id = auth.uid() or is_admin());

create policy "profiles super_admin write" on profiles for all to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- Table: content_types (read: staff; write: admin/super_admin)
create policy "types read" on content_types for select to authenticated
  using (is_staff());

create policy "types write" on content_types for all to authenticated
  using (is_admin())
  with check (is_admin());

-- Table: content_items (staff can read and edit drafts)
create policy "items read" on content_items for select to authenticated
  using (is_staff());

create policy "items draft write" on content_items for insert to authenticated
  with check (is_staff() and published_data is null and status = 'draft');

create policy "items draft update" on content_items for update to authenticated
  using (is_staff())
  with check (is_staff() and (is_admin() or published_data is not distinct from published_data));

create policy "items delete" on content_items for delete to authenticated
  using (is_admin());

-- Table: media (staff read; admin write)
create policy "media read" on media for select to authenticated
  using (is_staff());

create policy "media write" on media for all to authenticated
  using (is_admin())
  with check (is_admin());

-- Table: releases (staff read; writes service-role only)
create policy "releases read" on releases for select to authenticated
  using (is_staff());

-- Table: audit_log (admin/super_admin read; writes service-role or staff append)
create policy "audit read" on audit_log for select to authenticated
  using (is_admin());

create policy "audit staff insert" on audit_log for insert to authenticated
  with check (is_staff() and actor = auth.uid());

-- 7. Append-Only Enforcement Triggers
create or replace function enforce_audit_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is strictly append-only. Modifying or deleting records is prohibited.';
end $$;

drop trigger if exists trg_audit_log_immutable on audit_log;
create trigger trg_audit_log_immutable before update or delete on audit_log
  for each row execute function enforce_audit_log_append_only();

create or replace function enforce_releases_immutable() returns trigger
language plpgsql as $$
begin
  if old.status = 'live' then
    raise exception 'Releases that are live are immutable and cannot be updated or deleted.';
  end if;
  return old;
end $$;

drop trigger if exists trg_releases_immutable on releases;
create trigger trg_releases_immutable before update or delete on releases
  for each row execute function enforce_releases_immutable();
