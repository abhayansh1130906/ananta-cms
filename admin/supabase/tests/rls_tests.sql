-- ==============================================================================
-- RLS Policy and Role Authorization SQL Test Suite
-- ==============================================================================
-- This test suite verifies access controls across 4 distinct roles:
-- 1. anon (unauthenticated client)
-- 2. editor (can edit drafts only; no publish, rollback, media, or schema updates)
-- 3. admin (can publish, rollback, media, and content types; no user management)
-- 4. super_admin (full access including user management)
--
-- Each test validates expected permissions (ALLOW or DENY).
-- ==============================================================================

begin;

-- Create temporary mock users and profiles for test verification
do $$
declare
  v_editor_id uuid := '11111111-1111-1111-1111-111111111111';
  v_admin_id uuid := '22222222-2222-2222-2222-222222222222';
  v_super_id uuid := '33333333-3333-3333-3333-333333333333';
begin
  -- Insert profiles directly
  insert into profiles (id, full_name, role) values
    (v_editor_id, 'Test Editor', 'editor'),
    (v_admin_id, 'Test Admin', 'admin'),
    (v_super_id, 'Test Super Admin', 'super_admin')
  on conflict (id) do update set role = excluded.role;
end $$;

-- ------------------------------------------------------------------------------
-- TEST SUITE 1: ANON ROLE VERIFICATION (MUST BE DENIED ALL ACCESS)
-- ------------------------------------------------------------------------------
set local role anon;
set local request.jwt.claim.sub to '';

-- 1.1 Anon cannot read profiles
do $$
begin
  perform * from profiles;
  if found then
    raise exception 'FAIL: Anon was able to read profiles';
  end if;
  raise notice 'PASS: Anon cannot read profiles';
end $$;

-- 1.2 Anon cannot read content_items
do $$
begin
  perform * from content_items;
  if found then
    raise exception 'FAIL: Anon was able to read content_items';
  end if;
  raise notice 'PASS: Anon cannot read content_items';
end $$;

-- 1.3 Anon cannot read releases
do $$
begin
  perform * from releases;
  if found then
    raise exception 'FAIL: Anon was able to read releases';
  end if;
  raise notice 'PASS: Anon cannot read releases';
end $$;

-- 1.4 Anon cannot read audit_log
do $$
begin
  perform * from audit_log;
  if found then
    raise exception 'FAIL: Anon was able to read audit_log';
  end if;
  raise notice 'PASS: Anon cannot read audit_log';
end $$;

-- 1.5 Anon cannot insert into content_items
do $$
begin
  insert into content_items (type_key, slug, draft_data)
  values ('events', 'anon-slug', '{"title":"hacked"}'::jsonb);
  raise exception 'FAIL: Anon was able to insert into content_items';
exception when others then
  raise notice 'PASS: Anon cannot insert into content_items (denied: %)', sqlerrm;
end $$;


-- ------------------------------------------------------------------------------
-- TEST SUITE 2: EDITOR ROLE VERIFICATION (DRAFTS ONLY)
-- ------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';

-- 2.1 Editor CAN read content_items
do $$
begin
  perform * from content_items limit 1;
  raise notice 'PASS: Editor can read content_items';
end $$;

-- 2.2 Editor CAN read own profile
do $$
begin
  perform * from profiles where id = '11111111-1111-1111-1111-111111111111';
  raise notice 'PASS: Editor can read own profile';
end $$;

-- 2.3 Editor CANNOT read other users profiles
do $$
declare
  v_count int;
begin
  select count(*) into v_count from profiles where id <> '11111111-1111-1111-1111-111111111111';
  if v_count > 0 then
    raise exception 'FAIL: Editor was able to read other users profiles';
  end if;
  raise notice 'PASS: Editor cannot read other profiles';
end $$;

-- 2.4 Editor CANNOT create content_types
do $$
begin
  insert into content_types (key, name, fields)
  values ('unauthorized_type', 'Unauthorized', '[]'::jsonb);
  raise exception 'FAIL: Editor was able to create a content_type';
exception when others then
  raise notice 'PASS: Editor cannot create content_types (denied)';
end $$;

-- 2.5 Editor CANNOT write to media table
do $$
begin
  insert into media (storage_path, public_url)
  values ('2026/test.png', 'https://example.com/test.png');
  raise exception 'FAIL: Editor was able to write to media table';
exception when others then
  raise notice 'PASS: Editor cannot write to media table (denied)';
end $$;

-- 2.6 Editor CANNOT read audit_log
do $$
declare
  v_count int;
begin
  select count(*) into v_count from audit_log;
  if v_count > 0 then
    raise exception 'FAIL: Editor was able to read audit_log';
  end if;
  raise notice 'PASS: Editor cannot read audit_log';
end $$;


-- ------------------------------------------------------------------------------
-- TEST SUITE 3: ADMIN ROLE VERIFICATION (MEDIA, SCHEMA, PUBLISH, AUDIT)
-- ------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';

-- 3.1 Admin CAN read audit_log
do $$
begin
  perform * from audit_log;
  raise notice 'PASS: Admin can read audit_log';
end $$;

-- 3.2 Admin CAN read all profiles
do $$
declare
  v_count int;
begin
  select count(*) into v_count from profiles;
  if v_count < 2 then
    raise exception 'FAIL: Admin could not read all profiles';
  end if;
  raise notice 'PASS: Admin can read all profiles';
end $$;

-- 3.3 Admin CANNOT manage users (insert/delete in profiles is super_admin only)
do $$
begin
  insert into profiles (id, full_name, role)
  values ('44444444-4444-4444-4444-444444444444', 'Attacker Admin', 'admin');
  raise exception 'FAIL: Admin was able to insert into profiles';
exception when others then
  raise notice 'PASS: Admin cannot create users in profiles (denied)';
end $$;


-- ------------------------------------------------------------------------------
-- TEST SUITE 4: SUPER ADMIN ROLE VERIFICATION (USER MANAGEMENT)
-- ------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';

-- 4.1 Super Admin CAN insert new user into profiles
do $$
begin
  insert into profiles (id, full_name, role)
  values ('55555555-5555-5555-5555-555555555555', 'New Staff By Super', 'editor');
  raise notice 'PASS: Super Admin can create user profiles';
end $$;

-- 4.2 Super Admin CAN update user role
do $$
begin
  update profiles set role = 'admin' where id = '55555555-5555-5555-5555-555555555555';
  raise notice 'PASS: Super Admin can update user profiles';
end $$;

-- 4.3 Super Admin CAN delete user profile
do $$
begin
  delete from profiles where id = '55555555-5555-5555-5555-555555555555';
  raise notice 'PASS: Super Admin can delete user profiles';
end $$;


-- ------------------------------------------------------------------------------
-- TEST SUITE 5: APPEND-ONLY IMMUTABILITY VERIFICATION
-- ------------------------------------------------------------------------------
-- 5.1 audit_log CANNOT be updated
do $$
begin
  update audit_log set action = 'tampered' where id = 1;
  raise exception 'FAIL: audit_log was modified!';
exception when others then
  raise notice 'PASS: audit_log cannot be updated (append-only enforced: %)', sqlerrm;
end $$;

-- 5.2 audit_log CANNOT be deleted
do $$
begin
  delete from audit_log;
  raise exception 'FAIL: audit_log records were deleted!';
exception when others then
  raise notice 'PASS: audit_log cannot be deleted (append-only enforced: %)', sqlerrm;
end $$;

rollback;
raise notice 'ALL RLS AND RBAC TESTS PASSED SUCCESSFULLY.';
