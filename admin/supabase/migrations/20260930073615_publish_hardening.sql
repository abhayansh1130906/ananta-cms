-- reusable snapshot builder (used by publish AND retry)
create or replace function build_snapshot_types() returns jsonb
language sql stable security definer set search_path = public as $$
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

-- publish_all now reuses the builder
create or replace function publish_all() returns jsonb
language plpgsql security definer set search_path = public as $$
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

-- rollback: make the DB match an old snapshot
create or replace function restore_snapshot(p_types jsonb) returns void
language plpgsql security definer set search_path = public as $$
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

  update content_items set has_unpublished_changes = false;  -- draft now equals live
end $$;

revoke execute on function build_snapshot_types(), publish_all(), restore_snapshot(jsonb)
  from public, anon, authenticated;