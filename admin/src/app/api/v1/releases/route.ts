export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withHandler(async () => {
  await requireRole(["admin", "editor"]);
  const admin = createAdminClient();

  const { data, error: dbError } = await admin
    .from("releases")
    .select("*")
    .order("created_at", { ascending: false });

  if (dbError) {
    return error(dbError.message, "DB_ERROR", 500);
  }

  return json(data || []);
});
