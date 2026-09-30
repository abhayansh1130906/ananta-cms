export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withHandler(async () => {
  await requireRole(["admin", "editor"]);
  const admin = createAdminClient();

  // 1. Latest live release
  const { data: liveRelease, error: liveError } = await admin
    .from("releases")
    .select("version, deployed_at, created_at")
    .eq("status", "live")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (liveError) {
    return error(liveError.message, "DB_ERROR", 500);
  }

  // 2. Count of pending changes
  const { count: pendingCount, error: countError } = await admin
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .or("has_unpublished_changes.eq.true,is_deleted.eq.true");

  if (countError) {
    return error(countError.message, "DB_ERROR", 500);
  }

  // 3. Active in-flight release (pending or building)
  const { data: activeRelease, error: activeError } = await admin
    .from("releases")
    .select("id, version, status, created_at")
    .in("status", ["pending", "building"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) {
    return error(activeError.message, "DB_ERROR", 500);
  }

  return json({
    live_version: liveRelease ? Number(liveRelease.version) : null,
    live_published_at: liveRelease ? (liveRelease.deployed_at || liveRelease.created_at) : null,
    pending_changes: pendingCount || 0,
    active_release: activeRelease
      ? {
          id: activeRelease.id,
          version: Number(activeRelease.version),
          status: activeRelease.status,
          created_at: activeRelease.created_at,
        }
      : null,
  });
});
