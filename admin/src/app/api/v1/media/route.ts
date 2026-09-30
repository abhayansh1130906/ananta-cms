export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, BadRequestError, NotFoundError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const registerMediaSchema = z.object({
  path: z.string().min(1, "Storage path is required"),
  alt: z.string().optional().nullable(),
});

export const GET = withHandler(async () => {
  await requireRole(["admin", "editor"]);
  const admin = createAdminClient();

  const { data, error: dbError } = await admin
    .from("media")
    .select("*")
    .order("created_at", { ascending: false });

  if (dbError) {
    return error(dbError.message, "DB_ERROR", 500);
  }

  return json(data || []);
});

export const POST = withHandler(async (req: Request) => {
  const { user } = await requireRole(["admin", "editor"]);
  checkRateLimit(`media_register_${user.id}`);

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const { path, alt } = registerMediaSchema.parse(body);
  const admin = createAdminClient();

  // Verify object exists in storage bucket
  const parts = path.split("/");
  const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  const filename = parts[parts.length - 1];

  const { data: fileList, error: listError } = await admin.storage
    .from("media")
    .list(folder, { search: filename });

  if (listError) {
    return error(listError.message, "STORAGE_ERROR", 500);
  }

  const fileItem = (fileList || []).find((f) => f.name === filename);
  if (!fileItem) {
    throw new NotFoundError(`Object '${path}' not found in media storage`);
  }

  const { data: pubData } = admin.storage.from("media").getPublicUrl(path);
  const publicUrl = pubData.publicUrl;

  const metadata = fileItem.metadata as Record<string, unknown> | undefined;
  const mimeType = typeof metadata?.mimetype === "string" ? metadata.mimetype : null;
  const sizeBytes = typeof metadata?.size === "number" ? metadata.size : null;

  // Insert media record
  const { data: inserted, error: insertError } = await admin
    .from("media")
    .insert({
      storage_path: path,
      public_url: publicUrl,
      alt_text: alt ?? null,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // Already registered, fetch existing
      const { data: existing } = await admin
        .from("media")
        .select("*")
        .eq("storage_path", path)
        .single();
      return json(existing);
    }
    return error(insertError.message, "DB_ERROR", 500);
  }

  await logAudit({
    actor: user.id,
    action: "create",
    entity: "media",
    entityId: inserted.id,
    diff: { path, public_url: publicUrl },
  });

  return json(inserted, 201);
});
