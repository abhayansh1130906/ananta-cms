# Ananta CMS Contract

## Snapshot file content.json (only thing web/ consumes, at build time):
```json
{
  "release_id": "uuid",
  "version": 1,
  "published_at": "ISO string",
  "checksum": "string",
  "schema": {
    "<type_key>": {
      "name": "string",
      "is_singleton": false,
      "fields": []
    }
  },
  "types": {
    "<type_key>": [
      {
        "id": "uuid",
        "slug": "string",
        "sort_order": 0,
        "data": {}
      }
    ]
  }
}
```

- Every `content_types` key appears in BOTH `schema` and `types` (`types[key] = []` if no items).
- `checksum` = sha256 hex of `stableStringify({ schema, types })` where `stableStringify` sorts object keys recursively (Postgres jsonb reorders keys, so plain `JSON.stringify` is NOT stable).
- Put `stableStringify` + `checksum` helper in a small file that `web/` can copy verbatim (`admin/src/lib/publish/checksum.ts`, no imports).

## Field Definition
`Field = { name, label?, type, required?, options?: string[], of?: Field[] }`

### Supported Field Types
`type` in: `text | richtext | number | date | time | datetime | image | url | boolean | select | list | group`

### Value Formats
- `text` / `richtext` / `url` / `select`: string (`richtext` = sanitized HTML)
- `number`: number
- `date`: `"YYYY-MM-DD"`
- `time`: `"HH:mm"` (24h)
- `datetime`: `"YYYY-MM-DDTHH:mm"` (no timezone conversion anywhere, values display exactly as stored)
- `boolean`: boolean
- `image`: `{ url: string, alt?: string }`
- `list`: array of objects shaped by `of`
- `group`: object shaped by `of`

## Slug Generation & Formatting
- Lowercase kebab-case.
- If not supplied, auto-generate from the first required text field (`title` / `name` / `question` / `day`) and de-duplicate within the type with `-2`, `-3`.

## API Specification
- API base: `/api/v1` (same-origin, Supabase session cookies).
- Errors format: `{ "error": string, "code": string }`.

### Endpoints
- `GET  /content-types`: List content types
- `GET  /content-types/:key`: Get single content type
- `POST /content-types`: (admin only) `{ key, name, is_singleton?, fields }`
- `PUT  /content-types/:key`: (admin only) update `name` / `fields`
- `GET  /content/:type`: list (draft view) + flags: `has_unpublished_changes`, `is_deleted`, `status`
- `POST /content/:type`: `{ slug?, data }` -> creates draft
- `GET  /content/:type/:id`: Get single content item
- `PUT  /content/:type/:id`: header `If-Match: <version>`; body `{ data?, slug?, sort_order? }`; `409` on mismatch
- `DELETE /content/:type/:id`: soft delete
- `POST /content/:type/reorder`: `{ ids: uuid[] }` sets sort_order by array index
- `POST /media/sign`: `{ filename, mime, size }` -> `{ signedUrl, token, path }`
- `POST /media`: `{ path, alt? }` -> registers uploaded object -> `{ id, public_url }`
- `GET  /publish/preview`: -> `{ count, changes:[{type,id,slug,change:'added'|'modified'|'deleted',before,after}] }`
- `POST /publish`: -> `202 { release_id, version }`
- `GET  /releases`: list, newest first
- `GET  /releases/:id/status`: verifies lazily -> `{ status, version, error?, deployed_at? }`
- `POST /releases/:id/retry`: (failed only)
- `POST /releases/:id/rollback`: (admin only)
- `GET  /overview`: `{ live_version, live_published_at, pending_changes, active_release }`
- `GET  /cron/verify`: `Authorization: Bearer CRON_SECRET`
- `GET  /me`: `{ id, email, full_name, role }`

## Roles & Permissions
- `admin`: everything
- `editor`: content CRUD, media, publish, view releases; NOT create/update content types, NOT rollback.
