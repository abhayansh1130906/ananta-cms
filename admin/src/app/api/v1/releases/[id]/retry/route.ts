export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, NotFoundError, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { buildSnapshot, type SnapshotItem } from "@/lib/publish/snapshot";
import { triggerDeployHook, syncLocalWebSnapshot } from "@/lib/publish/deploy";
import { verifyReleaseStatus, type ReleaseRow } from "@/lib/publish/verify";

export const POST = withHandler(
  async (_req: Request, context: { params: Promise<{ id: string }> }) => {
    const { user } = await requireRole(["admin", "super_admin"]);
    const { id } = await context.params;
    checkRateLimit(`release_retry_${user.id}`);

    const admin = createAdminClient();

    const { data: release, error: dbError } = await admin
      .from("releases")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (dbError) {
      console.error("[Release Retry DB Error]", dbError);
      return error("Failed to retrieve release record", "DB_ERROR", 500);
    }
    if (!release) {
      throw new NotFoundError(`Release '${id}' not found`);
    }

    if (release.status !== "failed") {
      throw new BadRequestError(
        `Only failed releases can be retried (current status is '${release.status}')`
      );
    }

    // Check if another release is currently active
    const { data: activeRelease } = await admin
      .from("releases")
      .select("id, status")
      .in("status", ["pending", "building"])
      .neq("id", id)
      .maybeSingle();

    if (activeRelease) {
      return error(
        "Another publish or build is currently in progress",
        "PUBLISH_IN_PROGRESS",
        409
      );
    }

    const versionNum = Number(release.version);
    const versionSnapshotPath = `releases/${versionNum}/content.json`;

    // Check if snapshot exists in bucket
    const { data: existingSnapshotFile, error: downloadError } = await admin.storage
      .from("snapshots")
      .download(versionSnapshotPath);

    if (downloadError || !existingSnapshotFile) {
      // Rebuild from build_snapshot_types() WITHOUT re-promoting drafts
      const { data: typesData, error: rpcError } = await admin.rpc("build_snapshot_types");
      if (rpcError) {
        return error(
          `Failed to rebuild snapshot types: ${rpcError.message}`,
          "DB_ERROR",
          500
        );
      }

      const { data: contentTypes, error: ctError } = await admin
        .from("content_types")
        .select("key, name, is_singleton, fields");

      if (ctError) {
        return error(
          `Failed to fetch content types: ${ctError.message}`,
          "DB_ERROR",
          500
        );
      }

      const snapshot = buildSnapshot({
        releaseId: release.id,
        version: versionNum,
        contentTypes: contentTypes || [],
        typesData: (typesData ?? {}) as unknown as Record<string, SnapshotItem[]>,
      });

      const snapshotJson = JSON.stringify(snapshot, null, 2);

      await admin.storage
        .from("snapshots")
        .upload(versionSnapshotPath, snapshotJson, {
          contentType: "application/json",
          upsert: true,
        });

      await admin.storage
        .from("snapshots")
        .upload("latest/content.json", snapshotJson, {
          contentType: "application/json",
          cacheControl: "0",
          upsert: true,
        });

      await admin
        .from("releases")
        .update({
          snapshot_path: versionSnapshotPath,
          checksum: snapshot.checksum,
        })
        .eq("id", id);

      await syncLocalWebSnapshot(snapshot);
    } else {
      // Copy existing snapshot to latest/content.json
      const content = await existingSnapshotFile.text();
      await admin.storage
        .from("snapshots")
        .upload("latest/content.json", content, {
          contentType: "application/json",
          cacheControl: "0",
          upsert: true,
        });

      try {
        const parsed = JSON.parse(content);
        await syncLocalWebSnapshot(parsed);
      } catch {
        // ignore parse error if any
      }
    }

    // Set 'building', clear error
    await admin
      .from("releases")
      .update({
        status: "building",
        error: null,
      })
      .eq("id", id);

    // Re-trigger deploy hook
    try {
      await triggerDeployHook();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await admin
        .from("releases")
        .update({
          status: "failed",
          error: errorMsg,
        })
        .eq("id", id);

      return error(
        `Failed to trigger deploy hook: ${errorMsg}`,
        "DEPLOY_HOOK_FAILED",
        500
      );
    }

    // Fast-path verification: immediately verify if public site version is already current
    try {
      const { data: currentRelease } = await admin
        .from("releases")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (currentRelease) {
        await verifyReleaseStatus(currentRelease as unknown as ReleaseRow, {
          adminClient: admin,
        });
      }
    } catch {
      // Non-blocking: background polling will handle it if deploy is asynchronous
    }

    await logAudit({
      actor: user.id,
      action: "retry",
      entity: "release",
      entityId: id,
      diff: { version: versionNum },
    });

    return json({
      success: true,
      release_id: id,
      status: "building",
    });
  }
);
