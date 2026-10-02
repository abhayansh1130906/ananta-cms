export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PreviewChange {
  type: string;
  id: string;
  slug: string;
  change: "added" | "modified" | "deleted";
  before: unknown;
  after: unknown;
}

export const GET = withHandler(async () => {
  await requireRole(["editor", "admin", "super_admin"]);
  const admin = createAdminClient();

  // Find all items that have unpublished changes or are soft-deleted
  const { data: items, error: dbError } = await admin
    .from("content_items")
    .select("id, type_key, slug, draft_data, published_data, is_deleted, has_unpublished_changes")
    .or("has_unpublished_changes.eq.true,is_deleted.eq.true");

  if (dbError) {
    console.error("[Publish Preview DB Error]", dbError);
    return error("Failed to generate publish preview", "DB_ERROR", 500);
  }

  const changes: PreviewChange[] = [];

  for (const item of items || []) {
    if (item.is_deleted) {
      // If item was previously published, mark as deleted
      if (item.published_data !== null) {
        changes.push({
          type: item.type_key,
          id: item.id,
          slug: item.slug,
          change: "deleted",
          before: item.published_data,
          after: null,
        });
      }
    } else if (item.published_data === null) {
      // New item never published before
      changes.push({
        type: item.type_key,
        id: item.id,
        slug: item.slug,
        change: "added",
        before: null,
        after: item.draft_data,
      });
    } else {
      // Existing item modified
      changes.push({
        type: item.type_key,
        id: item.id,
        slug: item.slug,
        change: "modified",
        before: item.published_data,
        after: item.draft_data,
      });
    }
  }

  return json({
    count: changes.length,
    changes,
  });
});
