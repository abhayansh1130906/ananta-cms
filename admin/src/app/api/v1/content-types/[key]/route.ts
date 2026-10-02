export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, NotFoundError, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { fieldDefinitionSchema } from "@/lib/content/types";
import { z } from "zod";

import type { Database, Json } from "@/types/database";

const updateContentTypeSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(100).optional(),
  fields: z.array(fieldDefinitionSchema).max(100).optional(),
  is_singleton: z.boolean().optional(),
});

export const GET = withHandler(async (_req: Request, context: { params: Promise<{ key: string }> }) => {
  await requireRole(["editor", "admin", "super_admin"]);
  const { key } = await context.params;
  const admin = createAdminClient();

  const { data, error: dbError } = await admin
    .from("content_types")
    .select("*")
    .eq("key", key)
    .maybeSingle();

  if (dbError) {
    console.error("[Content Types GET Key DB Error]", dbError);
    return error("Failed to retrieve content type", "DB_ERROR", 500);
  }

  if (!data) {
    throw new NotFoundError(`Content type '${key}' not found`);
  }

  return json(data);
});

export const PUT = withHandler(async (req: Request, context: { params: Promise<{ key: string }> }) => {
  const { user } = await requireRole(["admin", "super_admin"]);
  const { key } = await context.params;
  checkRateLimit(`content_types_put_${user.id}`);

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const parsed = updateContentTypeSchema.parse(body);
  const admin = createAdminClient();

  const { data: current, error: getError } = await admin
    .from("content_types")
    .select("*")
    .eq("key", key)
    .maybeSingle();

  if (getError) {
    console.error("[Content Types PUT Get DB Error]", getError);
    return error("Failed to retrieve existing content type", "DB_ERROR", 500);
  }

  if (!current) {
    throw new NotFoundError(`Content type '${key}' not found`);
  }

  const updates: Database["public"]["Tables"]["content_types"]["Update"] = {};
  if (parsed.name !== undefined) updates.name = parsed.name;
  if (parsed.fields !== undefined) updates.fields = parsed.fields as unknown as Json;
  if (parsed.is_singleton !== undefined) updates.is_singleton = parsed.is_singleton;

  const { data: updated, error: updateError } = await admin
    .from("content_types")
    .update(updates)
    .eq("key", key)
    .select()
    .single();

  if (updateError) {
    console.error("[Content Types PUT DB Error]", updateError);
    return error("Failed to update content type", "DB_ERROR", 500);
  }

  await logAudit({
    actor: user.id,
    action: "update",
    entity: "content_type",
    entityId: key,
    diff: { before: current, after: updated },
  });

  return json(updated);
});
