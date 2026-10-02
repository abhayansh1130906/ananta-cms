export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, BadRequestError, NotFoundError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const registerMediaSchema = z.object({
  path: z.string().min(1, "Storage path is required").max(500),
  alt: z.string().max(500).optional().nullable(),
});

/**
 * Validates actual binary content using magic bytes.
 * Blocks scripts, HTML, SVG, and executables disguised as images.
 */
function validateImageMagicBytes(buffer: Uint8Array): { valid: boolean; detectedType?: string } {
  if (buffer.length < 12) {
    return { valid: false };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedType: "image/png" };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedType: "image/jpeg" };
  }

  // WebP: RIFF....WEBP
  const isRiff =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46;
  const isWebp =
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;
  if (isRiff && isWebp) {
    return { valid: true, detectedType: "image/webp" };
  }

  // AVIF: ....ftypavif or ....ftypavis
  const brand = String.fromCharCode(buffer[4], buffer[5], buffer[6], buffer[7]);
  const subBrand = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
  if (brand === "ftyp" && (subBrand === "avif" || subBrand === "avis" || subBrand === "mif1")) {
    return { valid: true, detectedType: "image/avif" };
  }

  return { valid: false };
}

export const GET = withHandler(async () => {
  await requireRole(["editor", "admin", "super_admin"]);
  const admin = createAdminClient();

  const { data, error: dbError } = await admin
    .from("media")
    .select("*")
    .order("created_at", { ascending: false });

  if (dbError) {
    console.error("[Media GET DB Error]", dbError);
    return error("Failed to retrieve media library", "DB_ERROR", 500);
  }

  return json(data || []);
});

export const POST = withHandler(async (req: Request) => {
  // Only admin and super_admin may register media
  const { user } = await requireRole(["admin", "super_admin"]);
  checkRateLimit(`media_register_${user.id}`, 30, 60000);

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const { path, alt } = registerMediaSchema.parse(body);
  const admin = createAdminClient();

  // 1. Download uploaded file from storage to inspect magic bytes
  const { data: fileBlob, error: downloadError } = await admin.storage
    .from("media")
    .download(path);

  if (downloadError || !fileBlob) {
    throw new NotFoundError(`Object '${path}' not found in media storage`);
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);

  // 2. Validate content by magic bytes (prevent stored XSS or non-image uploads)
  const validation = validateImageMagicBytes(fileBytes);
  if (!validation.valid) {
    // Purge rejected file from storage
    await admin.storage.from("media").remove([path]);
    return error(
      "File validation failed: content does not match allowed image formats (PNG, JPEG, WebP, AVIF).",
      "INVALID_FILE_CONTENT",
      400
    );
  }

  const { data: pubData } = admin.storage.from("media").getPublicUrl(path);
  const publicUrl = pubData.publicUrl;
  const mimeType = validation.detectedType || "image/png";
  const sizeBytes = fileBytes.length;

  // 3. Insert verified media record
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
      const { data: existing } = await admin
        .from("media")
        .select("*")
        .eq("storage_path", path)
        .single();
      return json(existing);
    }
    console.error("[Media Insert DB Error]", insertError);
    return error("Failed to register media asset", "DB_ERROR", 500);
  }

  await logAudit({
    actor: user.id,
    action: "create",
    entity: "media",
    entityId: inserted.id,
    diff: { path, public_url: publicUrl, mime_type: mimeType, size_bytes: sizeBytes },
  });

  return json(inserted, 201);
});
