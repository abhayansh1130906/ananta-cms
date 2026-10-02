export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { fieldDefinitionSchema } from "@/lib/content/types";
import { z } from "zod";

import type { Json } from "@/types/database";

const createContentTypeSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(64, "Key cannot exceed 64 characters")
    .regex(/^[a-z][a-z0-9_]*$/, "Key must start with a lowercase letter and contain only lowercase alphanumeric characters and underscores"),
  name: z.string().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  is_singleton: z.boolean().optional().default(false),
  fields: z.array(fieldDefinitionSchema).max(100, "Cannot exceed 100 fields").optional().default([]),
});

export const GET = withHandler(async () => {
  await requireRole(["editor", "admin", "super_admin"]);
  const admin = createAdminClient();

  const { data, error: dbError } = await admin
    .from("content_types")
    .select("*")
    .order("created_at", { ascending: true });

  if (dbError) {
    console.error("[Content Types GET DB Error]", dbError);
    return error("Failed to retrieve content types", "DB_ERROR", 500);
  }

  return json(data || []);
});

export const POST = withHandler(async (req: Request) => {
  const { user } = await requireRole(["admin", "super_admin"]);
  checkRateLimit(`content_types_post_${user.id}`);

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const parsed = createContentTypeSchema.parse(body);
  const admin = createAdminClient();

  // Check if key already exists
  const { data: existing } = await admin
    .from("content_types")
    .select("key")
    .eq("key", parsed.key)
    .maybeSingle();

  if (existing) {
    return error(`Content type '${parsed.key}' already exists`, "CONFLICT", 409);
  }

  const { data, error: dbError } = await admin
    .from("content_types")
    .insert({
      key: parsed.key,
      name: parsed.name,
      is_singleton: parsed.is_singleton,
      fields: parsed.fields as unknown as Json,
    })
    .select()
    .single();

  if (dbError) {
    console.error("[Content Types POST DB Error]", dbError);
    return error("Failed to create content type", "DB_ERROR", 500);
  }

  await logAudit({
    actor: user.id,
    action: "create",
    entity: "content_type",
    entityId: parsed.key,
    diff: { after: data },
  });

  return json(data, 201);
});
