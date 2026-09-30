export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, NotFoundError, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { sanitizeContentData } from "@/lib/content/sanitize";
import { buildZodSchema } from "@/lib/content/buildZodSchema";
import { generateSlug, deduplicateSlug, toKebabCase } from "@/lib/content/slug";
import type { Field } from "@/lib/content/types";
import type { Json } from "@/types/database";

export const GET = withHandler(async (_req: Request, context: { params: Promise<{ type: string }> }) => {
  await requireRole(["admin", "editor"]);
  const { type } = await context.params;
  const admin = createAdminClient();

  // Verify content type exists
  const { data: ct, error: ctError } = await admin
    .from("content_types")
    .select("key")
    .eq("key", type)
    .maybeSingle();

  if (ctError) {
    return error(ctError.message, "DB_ERROR", 500);
  }
  if (!ct) {
    throw new NotFoundError(`Content type '${type}' not found`);
  }

  // Draft view returns items with flags: has_unpublished_changes, is_deleted, status
  const { data: items, error: itemsError } = await admin
    .from("content_items")
    .select("*")
    .eq("type_key", type)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (itemsError) {
    return error(itemsError.message, "DB_ERROR", 500);
  }

  return json(items || []);
});

export const POST = withHandler(async (req: Request, context: { params: Promise<{ type: string }> }) => {
  const { user } = await requireRole(["admin", "editor"]);
  const { type } = await context.params;
  checkRateLimit(`content_post_${user.id}`);

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const admin = createAdminClient();

  // Fetch content type definition
  const { data: ct, error: ctError } = await admin
    .from("content_types")
    .select("key, name, is_singleton, fields")
    .eq("key", type)
    .maybeSingle();

  if (ctError) {
    return error(ctError.message, "DB_ERROR", 500);
  }
  if (!ct) {
    throw new NotFoundError(`Content type '${type}' not found`);
  }

  // Singleton check
  if (ct.is_singleton) {
    const { count } = await admin
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("type_key", type)
      .eq("is_deleted", false);

    if (count && count > 0) {
      return error(
        `Singleton content type '${type}' already has an active item`,
        "SINGLETON_EXISTS",
        409
      );
    }
  }

  const rawData = body.data || {};
  const fields = (Array.isArray(ct.fields) ? (ct.fields as unknown as Field[]) : []);

  // 1. Sanitize input data
  const sanitized = sanitizeContentData(rawData, fields);

  // 2. Validate against Zod schema (strips unknown extra keys)
  const schema = buildZodSchema(fields);
  const validatedData = schema.parse(sanitized);

  // 3. Determine slug
  let slug: string;
  const { data: existingRows } = await admin
    .from("content_items")
    .select("slug")
    .eq("type_key", type);

  const existingSlugs = (existingRows || []).map((r) => r.slug);

  if (typeof body.slug === "string" && body.slug.trim()) {
    const candidate = toKebabCase(body.slug.trim());
    if (existingSlugs.includes(candidate)) {
      return error(`Slug '${candidate}' already exists in '${type}'`, "SLUG_CONFLICT", 409);
    }
    slug = candidate;
  } else {
    const baseSlug = generateSlug(validatedData, fields);
    slug = deduplicateSlug(baseSlug, existingSlugs);
  }

  // 4. Calculate sort_order
  const { data: lastItem } = await admin
    .from("content_items")
    .select("sort_order")
    .eq("type_key", type)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (lastItem?.sort_order ?? -1) + 1;

  // 5. Insert content item
  const { data: inserted, error: insertError } = await admin
    .from("content_items")
    .insert({
      type_key: type,
      slug,
      sort_order: nextSortOrder,
      draft_data: validatedData as unknown as Json,
      status: "draft",
      has_unpublished_changes: true,
      is_deleted: false,
      updated_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return error("Unique constraint violation on type and slug", "CONFLICT", 409);
    }
    return error(insertError.message, "DB_ERROR", 500);
  }

  await logAudit({
    actor: user.id,
    action: "create",
    entity: "content_item",
    entityId: inserted.id,
    diff: { after: inserted },
  });

  return json(inserted, 201);
});
