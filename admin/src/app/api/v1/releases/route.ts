export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withHandler(async () => {
  await requireRole(["editor", "admin", "super_admin"]);
  const admin = createAdminClient();

  const { data, error: dbError } = await admin
    .from("releases")
    .select("*")
    .order("created_at", { ascending: false });

  if (dbError) {
    console.error("[Releases GET DB Error]", dbError);
    return error("Failed to retrieve releases list", "DB_ERROR", 500);
  }

  return json(data || []);
});
