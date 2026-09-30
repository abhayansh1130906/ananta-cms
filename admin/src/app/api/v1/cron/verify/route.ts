export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyReleaseStatus, type ReleaseRow } from "@/lib/publish/verify";

export const GET = withHandler(async (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return error("Unauthorized: invalid or missing cron secret", "UNAUTHORIZED", 401);
  }

  const admin = createAdminClient();

  // Find all releases currently in 'building' state
  const { data: buildingReleases, error: dbError } = await admin
    .from("releases")
    .select("*")
    .eq("status", "building");

  if (dbError) {
    return error(dbError.message, "DB_ERROR", 500);
  }

  const results = [];
  for (const release of buildingReleases || []) {
    const res = await verifyReleaseStatus(release as unknown as ReleaseRow, {
      adminClient: admin,
    });
    results.push({
      id: release.id,
      ...res,
    });
  }

  return json({
    success: true,
    checked_count: (buildingReleases || []).length,
    results,
  });
});
