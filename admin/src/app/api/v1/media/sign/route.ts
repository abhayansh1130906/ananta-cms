export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";
import crypto from "node:crypto";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const signMediaSchema = z.object({
  filename: z.string().min(1, "Filename is required").max(255, "Filename too long"),
  mime: z.string().min(1, "MIME type is required"),
  size: z.number().int().positive("Size must be greater than 0"),
});

export const POST = withHandler(async (req: Request) => {
  const { user } = await requireRole(["admin", "super_admin"]);
  checkRateLimit(`media_sign_${user.id}`, 30, 60000);

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const { filename, mime, size } = signMediaSchema.parse(body);

  const cleanMime = mime.toLowerCase().trim();
  const ext = ALLOWED_MIME_TYPES[cleanMime];

  if (!ext) {
    return error(
      "Unsupported file type. Only PNG, JPEG, WebP, and AVIF images are allowed.",
      "UNSUPPORTED_MEDIA_TYPE",
      400
    );
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    return error("File size exceeds 5 MB limit.", "FILE_TOO_LARGE", 400);
  }

  const year = new Date().getFullYear();
  const fileId = crypto.randomUUID();
  const path = `${year}/${fileId}.${ext}`;

  const admin = createAdminClient();
  const { data, error: storageError } = await admin.storage
    .from("media")
    .createSignedUploadUrl(path);

  if (storageError || !data) {
    return error(
      storageError?.message || "Failed to generate signed upload URL",
      "STORAGE_ERROR",
      500
    );
  }

  return json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    filename,
  });
});
