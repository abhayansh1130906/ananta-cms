export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, NotFoundError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyReleaseStatus, type ReleaseRow } from "@/lib/publish/verify";

export const GET = withHandler(
  async (_req: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole(["admin", "editor"]);
    const { id } = await context.params;
    const admin = createAdminClient();

    const { data: release, error: dbError } = await admin
      .from("releases")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (dbError) {
      return error(dbError.message, "DB_ERROR", 500);
    }
    if (!release) {
      throw new NotFoundError(`Release '${id}' not found`);
    }

    const verification = await verifyReleaseStatus(release as unknown as ReleaseRow, {
      adminClient: admin,
    });

    return json({
      status: verification.status,
      version: verification.version,
      deployed_at: verification.deployed_at ?? null,
      error: verification.error ?? null,
      ...(verification.note ? { note: verification.note } : {}),
    });
  }
);
