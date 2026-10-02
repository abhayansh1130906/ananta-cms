export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { buildSnapshot, type SnapshotItem } from "@/lib/publish/snapshot";
import { triggerDeployHook, syncLocalWebSnapshot } from "@/lib/publish/deploy";
import { verifyReleaseStatus, type ReleaseRow } from "@/lib/publish/verify";

export const POST = withHandler(async () => {
  const { user } = await requireRole(["admin", "super_admin"]);
  checkRateLimit(`publish_${user.id}`, 10, 60000);

  const admin = createAdminClient();

  // Step 1: Insert pending release row (placeholder path & checksum)
  // one_active_release unique partial index prevents multiple active releases
  const { data: release, error: insertError } = await admin
    .from("releases")
    .insert({
      status: "pending",
      snapshot_path: "pending",
      checksum: "pending",
      created_by: user.id,
    })
    .select("id, version, status, created_at")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505" || insertError.message.includes("one_active_release")) {
      return error(
        "Another publish or build is currently in progress",
        "PUBLISH_IN_PROGRESS",
        409
      );
    }
    console.error("[Publish Insert DB Error]", insertError);
    return error("Failed to initialize release in database", "DB_ERROR", 500);
  }

  if (!release) {
    return error("Failed to initialize release", "INTERNAL_ERROR", 500);
  }

  const releaseId = release.id;
  const releaseVersion = Number(release.version);

  // Step 2: Atomic promotion of drafts via PostgreSQL function publish_all()
  const { data: publishedTypes, error: rpcError } = await admin.rpc("publish_all");

  if (rpcError) {
    await admin
      .from("releases")
      .update({
        status: "failed",
        error: rpcError.message,
      })
      .eq("id", releaseId);

    return error(`Failed to publish content items: ${rpcError.message}`, "PUBLISH_FAILED", 500);
  }

  // Step 3: Fetch content types and construct canonical snapshot
  const { data: contentTypes, error: ctError } = await admin
    .from("content_types")
    .select("key, name, is_singleton, fields");

  if (ctError) {
    await admin
      .from("releases")
      .update({ status: "failed", error: ctError.message })
      .eq("id", releaseId);
    return error(`Failed to fetch schema: ${ctError.message}`, "DB_ERROR", 500);
  }

  const snapshot = buildSnapshot({
    releaseId,
    version: releaseVersion,
    contentTypes: contentTypes || [],
    typesData: (publishedTypes ?? {}) as unknown as Record<string, SnapshotItem[]>,
  });

  const snapshotJson = JSON.stringify(snapshot, null, 2);
  const versionSnapshotPath = `releases/${releaseVersion}/content.json`;

  // Step 4: Upload to bucket "snapshots" (versioned + latest)
  const { error: uploadVersionError } = await admin.storage
    .from("snapshots")
    .upload(versionSnapshotPath, snapshotJson, {
      contentType: "application/json",
      upsert: false,
    });

  const { error: uploadLatestError } = await admin.storage
    .from("snapshots")
    .upload("latest/content.json", snapshotJson, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (uploadVersionError || uploadLatestError) {
    const uploadError = uploadVersionError || uploadLatestError;
    await admin
      .from("releases")
      .update({
        status: "failed",
        error: uploadError?.message || "Storage upload failed",
      })
      .eq("id", releaseId);

    return error(
      `Failed to upload snapshot: ${uploadError?.message}`,
      "SNAPSHOT_UPLOAD_FAILED",
      500
    );
  }

  // Update release with actual snapshot path and checksum
  await admin
    .from("releases")
    .update({
      snapshot_path: versionSnapshotPath,
      checksum: snapshot.checksum,
    })
    .eq("id", releaseId);

  // Sync directly to local web frontend in monorepo if present
  await syncLocalWebSnapshot(snapshot);

  // Step 5: Transition to 'building' and trigger deploy hook
  await admin
    .from("releases")
    .update({ status: "building" })
    .eq("id", releaseId);

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
      .eq("id", releaseId);

    return error(`Failed to trigger deploy hook: ${errorMsg}`, "DEPLOY_HOOK_FAILED", 500);
  }

  // Fast-path verification: immediately verify if public site version is already current
  try {
    const { data: currentRelease } = await admin
      .from("releases")
      .select("*")
      .eq("id", releaseId)
      .maybeSingle();

    if (currentRelease) {
      await verifyReleaseStatus(currentRelease as unknown as ReleaseRow, {
        adminClient: admin,
      });
    }
  } catch {
    // Non-blocking: background polling will handle it if deploy is asynchronous
  }

  // Step 6: Log audit and return 202
  await logAudit({
    actor: user.id,
    action: "publish",
    entity: "release",
    entityId: releaseId,
    diff: { version: releaseVersion, checksum: snapshot.checksum },
  });

  return json(
    {
      release_id: releaseId,
      version: releaseVersion,
    },
    202
  );
});
