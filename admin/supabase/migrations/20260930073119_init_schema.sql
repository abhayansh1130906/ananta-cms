create extension if not exists pgcrypto;

-- ============ ENUMS ============
create type user_role      as enum ('admin', 'editor');
create type item_status    as enum ('draft', 'published', 'archived');
create type release_status as enum ('pending', 'building', 'live', 'failed');

-- ============ PROFILES ============
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       user_role not null default 'editor',
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ============ CONTENT TYPES ============
create table content_types (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name         text not null,
  is_singleton boolean not null default false,
  fields       jsonb not null default '[]'::jsonb,   -- field definitions
  created_at   timestamptz not null default now()
);

-- ============ CONTENT ITEMS ============
create table content_items (
  id                      uuid primary key default gen_random_uuid(),
  type_key                text not null references content_types(key) on update cascade,
  slug                    text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order              int  not null default 0,
  draft_data              jsonb not null default '{}'::jsonb,
  published_data          jsonb,
  status                  item_status not null default 'draft',
  version                 int  not null default 1,          -- optimistic concurrency
  is_deleted              boolean not null default false,   -- soft delete
  has_unpublished_changes boolean not null default true,
  updated_by              uuid references profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  published_at            timestamptz,
  unique (type_key, slug)
);
create index content_items_type_sort on content_items (type_key, sort_order);
create index content_items_draft_gin on content_items using gin (draft_data);
create index content_items_pub_gin   on content_items using gin (published_data);

-- bump version / flag changes only when editorial fields change
create function content_items_before_update() returns trigger
language plpgsql as $$
begin
  if new.draft_data is distinct from old.draft_data
     or new.sort_order is distinct from old.sort_order
     or new.slug is distinct from old.slug
     or new.is_deleted is distinct from old.is_deleted then
    new.version := old.version + 1;
    new.has_unpublished_changes := true;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger trg_content_items_update before update on content_items
  for each row execute function content_items_before_update();

-- ============ MEDIA ============
create table media (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  public_url   text not null,
  alt_text     text,
  mime_type    text,
  size_bytes   int,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ============ RELEASES ============
create table releases (
  id            uuid primary key default gen_random_uuid(),
  version       bigint generated always as identity unique,
  snapshot_path text not null,
  checksum      text not null,
  status        release_status not null default 'pending',
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  deployed_at   timestamptz,
  error         text
);
-- only ONE release may be in flight at a time
create unique index one_active_release on releases ((true))
  where status in ('pending', 'building');

-- ============ AUDIT LOG ============
create table audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid references profiles(id),
  action     text not null,            -- create | update | delete | publish | rollback
  entity     text not null,
  entity_id  text,
  diff       jsonb,
  created_at timestamptz not null default now()
);

-- ============ PUBLISH FUNCTION (single transaction) ============
create function publish_all() returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('ananta_publish'));

  -- soft-deleted items leave the live dataset
  update content_items
     set published_data = null, status = 'archived', has_unpublished_changes = false
   where is_deleted and (published_data is not null or status <> 'archived');

  -- promote changed / new drafts
  update content_items
     set published_data = draft_data, status = 'published',
         published_at = now(), has_unpublished_changes = false
   where not is_deleted and (has_unpublished_changes or published_data is null);

  -- return the full published dataset grouped by type
  select coalesce(jsonb_object_agg(type_key, items), '{}'::jsonb) into result
  from (
    select type_key,
           jsonb_agg(jsonb_build_object('id', id, 'slug', slug,
                     'sort_order', sort_order, 'data', published_data)
                     order by sort_order, created_at) as items
    from content_items
    where not is_deleted and published_data is not null
    group by type_key
  ) t;

  return result;
end $$;
revoke execute on function publish_all() from public, anon, authenticated;
-- only the service role (admin API) can call it

-- ============ ROW LEVEL SECURITY ============
create function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid()) $$;
create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

alter table profiles      enable row level security;
alter table content_types enable row level security;
alter table content_items enable row level security;
alter table media         enable row level security;
alter table releases      enable row level security;
alter table audit_log     enable row level security;

create policy "profiles read"   on profiles      for select using (id = auth.uid() or is_admin());
create policy "types read"      on content_types for select using (is_staff());
create policy "types write"     on content_types for all    using (is_admin()) with check (is_admin());
create policy "items staff"     on content_items for all    using (is_staff()) with check (is_staff());
create policy "media staff"     on media         for all    using (is_staff()) with check (is_staff());
create policy "releases read"   on releases      for select using (is_staff());   -- writes: service role only
create policy "audit read"      on audit_log     for select using (is_admin());   -- writes: service role only

-- ============ STORAGE ============
insert into storage.buckets (id, name, public) values
  ('media', 'media', true),
  ('snapshots', 'snapshots', true)
on conflict (id) do nothing;

create policy "media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and is_staff());
-- 'snapshots' is written only by the service role (bypasses RLS)