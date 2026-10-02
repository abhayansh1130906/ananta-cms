export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, NotFoundError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { checksum } from "@/lib/publish/checksum";
import { triggerDeployHook, syncLocalWebSnapshot } from "@/lib/publish/deploy";
import { verifyReleaseStatus, type ReleaseRow } from "@/lib/publish/verify";
import type { Snapshot } from "@/lib/publish/snapshot";

import type { Json } from "@/types/database";

export const POST = withHandler(
  async (_req: Request, context: { params: Promise<{ id: string }> }) => {
    // Admin only
    const { user } = await requireRole(["admin", "super_admin"]);
    const { id } = await context.params;
    checkRateLimit(`release_rollback_${user.id}`);

    const admin = createAdminClient();

    // 1. Fetch target release to rollback to
    const { data: targetRelease, error: dbError } = await admin
      .from("releases")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (dbError) {
      console.error("[Release Rollback DB Error]", dbError);
      return error("Failed to retrieve release record", "DB_ERROR", 500);
    }
    if (!targetRelease) {
      throw new NotFoundError(`Release '${id}' not found`);
    }

    // 2. Download target release snapshot
    const targetPath = `releases/${targetRelease.version}/content.json`;
    const { data: fileData, error: downloadError } = await admin.storage
      .from("snapshots")
      .download(targetPath);

    if (downloadError || !fileData) {
      return error(
        `Failed to download snapshot for version ${targetRelease.version}: ${downloadError?.message}`,
        "SNAPSHOT_NOT_FOUND",
        500
      );
    }

    const snapshotText = await fileData.text();
    const targetSnapshot = JSON.parse(snapshotText) as Snapshot;

    // 3. Create a NEW release row
    const { data: newRelease, error: insertError } = await admin
      .from("releases")
      .insert({
        status: "pending",
        snapshot_path: "pending",
        checksum: "pending",
        created_by: user.id,
      })
      .select()
      .maybeSingle();

    if (insertError) {
      if (insertError.code === "23505" || insertError.message.includes("one_active_release")) {
        return error(
          "Another publish or build is currently in progress",
          "PUBLISH_IN_PROGRESS",
          409
        );
      }
      return error(insertError.message, "DB_ERROR", 500);
    }

    if (!newRelease) {
      return error("Failed to initialize rollback release", "INTERNAL_ERROR", 500);
    }

    const newReleaseId = newRelease.id;
    const newVersion = Number(newRelease.version);

    // 4. Restore database state via rpc restore_snapshot
    const { error: restoreError } = await admin.rpc("restore_snapshot", {
      p_types: targetSnapshot.types as unknown as Json,
    });

    if (restoreError) {
      await admin
        .from("releases")
        .update({
          status: "failed",
          error: `Snapshot restore failed: ${restoreError.message}`,
        })
        .eq("id", newReleaseId);

      return error(
        `Failed to restore snapshot data: ${restoreError.message}`,
        "ROLLBACK_FAILED",
        500
      );
    }

    // 5. Restore content_types fields from snapshot.schema
    if (targetSnapshot.schema) {
      for (const [key, schemaDef] of Object.entries(targetSnapshot.schema)) {
        await admin
          .from("content_types")
          .update({
            name: schemaDef.name,
            is_singleton: schemaDef.is_singleton,
            fields: schemaDef.fields as unknown as Json,
          })
          .eq("key", key);
      }
    }

    // 6. Build new snapshot and recompute checksum
    const publishedAt = new Date().toISOString();
    const newChecksum = checksum({
      schema: targetSnapshot.schema,
      types: targetSnapshot.types,
    });

    const newSnapshot: Snapshot = {
      release_id: newReleaseId,
      version: newVersion,
      published_at: publishedAt,
      checksum: newChecksum,
      schema: targetSnapshot.schema,
      types: targetSnapshot.types,
    };

    const newSnapshotJson = JSON.stringify(newSnapshot, null, 2);
    const newVersionPath = `releases/${newVersion}/content.json`;

    // 7. Upload new snapshot to bucket
    await admin.storage
      .from("snapshots")
      .upload(newVersionPath, newSnapshotJson, {
        contentType: "application/json",
        upsert: true,
      });

    await admin.storage
      .from("snapshots")
      .upload("latest/content.json", newSnapshotJson, {
        contentType: "application/json",
        cacheControl: "0",
        upsert: true,
      });

    // Sync directly to local web frontend in monorepo if present
    await syncLocalWebSnapshot(newSnapshot);

    // 8. Update release row status to 'building'
    await admin
      .from("releases")
      .update({
        snapshot_path: newVersionPath,
        checksum: newChecksum,
        status: "building",
      })
      .eq("id", newReleaseId);

    // 9. Trigger deploy hook
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
        .eq("id", newReleaseId);

      return error(`Failed to trigger deploy hook: ${errorMsg}`, "DEPLOY_HOOK_FAILED", 500);
    }

    // Fast-path verification: immediately verify if public site version is already current
    try {
      const { data: currentRelease } = await admin
        .from("releases")
        .select("*")
        .eq("id", newReleaseId)
        .maybeSingle();

      if (currentRelease) {
        await verifyReleaseStatus(currentRelease as unknown as ReleaseRow, {
          adminClient: admin,
        });
      }
    } catch {
      // Non-blocking: background polling will handle it if deploy is asynchronous
    }

    // 10. Audit log and return 202
    await logAudit({
      actor: user.id,
      action: "rollback",
      entity: "release",
      entityId: newReleaseId,
      diff: {
        rolled_back_to_version: targetRelease.version,
        new_version: newVersion,
      },
    });

    return json(
      {
        release_id: newReleaseId,
        version: newVersion,
      },
      202
    );
  }
);
