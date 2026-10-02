export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, NotFoundError, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { sanitizeContentData } from "@/lib/content/sanitize";
import { buildZodSchema } from "@/lib/content/buildZodSchema";
import { toKebabCase } from "@/lib/content/slug";
import type { Field } from "@/lib/content/types";
import type { Database, Json } from "@/types/database";
import { z } from "zod";

const updateItemBodySchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  slug: z.string().max(100).optional(),
  sort_order: z.number().int().optional(),
  version: z.number().int().optional(),
});

const idParamSchema = z.string().uuid("Invalid item UUID parameter");

export const GET = withHandler(
  async (_req: Request, context: { params: Promise<{ type: string; id: string }> }) => {
    await requireRole(["editor", "admin", "super_admin"]);
    const { type, id: rawId } = await context.params;
    const id = idParamSchema.parse(rawId);
    const admin = createAdminClient();

    const { data: item, error: dbError } = await admin
      .from("content_items")
      .select("*")
      .eq("id", id)
      .eq("type_key", type)
      .maybeSingle();

    if (dbError) {
      console.error("[Content Item GET DB Error]", dbError);
      return error("Failed to retrieve content item", "DB_ERROR", 500);
    }
    if (!item) {
      throw new NotFoundError(`Content item '${id}' not found`);
    }

    return json(item);
  }
);

export const PUT = withHandler(
  async (req: Request, context: { params: Promise<{ type: string; id: string }> }) => {
    const { user } = await requireRole(["editor", "admin", "super_admin"]);
    const { type, id: rawId } = await context.params;
    const id = idParamSchema.parse(rawId);
    checkRateLimit(`content_put_${user.id}`);

    // Read version from If-Match header or fallback to body.version
    const ifMatch = req.headers.get("if-match")?.replace(/["'wW/]/g, "").trim();
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new BadRequestError("Missing request body");
    }

    const parsed = updateItemBodySchema.parse(body);
    const versionStr = ifMatch || (parsed.version !== undefined ? String(parsed.version) : null);

    if (!versionStr) {
      return error(
        "Missing If-Match header or version field for optimistic concurrency",
        "PRECONDITION_REQUIRED",
        428
      );
    }

    const expectedVersion = parseInt(versionStr, 10);
    if (isNaN(expectedVersion)) {
      throw new BadRequestError("Invalid version in If-Match header (expected integer)");
    }

    const admin = createAdminClient();

    // Fetch content type fields for validation if data is being updated
    let validatedData: Record<string, unknown> | undefined;
    if (parsed.data !== undefined) {
      const { data: ct, error: ctError } = await admin
        .from("content_types")
        .select("fields")
        .eq("key", type)
        .maybeSingle();

      if (ctError) {
        console.error("[Content Item PUT ctError]", ctError);
        return error("Failed to retrieve content type schema", "DB_ERROR", 500);
      }
      if (!ct) {
        throw new NotFoundError(`Content type '${type}' not found`);
      }

      const fields = (Array.isArray(ct.fields) ? (ct.fields as unknown as Field[]) : []);
      const sanitized = sanitizeContentData(parsed.data, fields);
      const schema = buildZodSchema(fields);
      validatedData = schema.parse(sanitized);
    }

    // Build update object (content writes touch draft_data only)
    const updates: Database["public"]["Tables"]["content_items"]["Update"] = {
      updated_by: user.id,
    };

    if (validatedData !== undefined) {
      updates.draft_data = validatedData as unknown as Json;
    }
    if (parsed.slug !== undefined) {
      updates.slug = toKebabCase(parsed.slug);
    }
    if (parsed.sort_order !== undefined) {
      updates.sort_order = parsed.sort_order;
    }

    // Execute atomic update where id=$id and version=$expectedVersion
    const { data: updated, error: updateError } = await admin
      .from("content_items")
      .update(updates)
      .eq("id", id)
      .eq("type_key", type)
      .eq("version", expectedVersion)
      .select()
      .maybeSingle();

    if (updateError) {
      if (updateError.code === "23505") {
        return error("Slug already in use for this content type", "CONFLICT", 409);
      }
      console.error("[Content Item PUT updateError]", updateError);
      return error("Failed to update content item", "DB_ERROR", 500);
    }

    // Optimistic concurrency check: if no row updated, fetch current row to report 409
    if (!updated) {
      const { data: current } = await admin
        .from("content_items")
        .select("*")
        .eq("id", id)
        .eq("type_key", type)
        .maybeSingle();

      if (!current) {
        throw new NotFoundError(`Content item '${id}' not found`);
      }

      return error("Version conflict: item has been modified by another user", "VERSION_CONFLICT", 409, {
        current,
      });
    }

    await logAudit({
      actor: user.id,
      action: "update",
      entity: "content_item",
      entityId: id,
      diff: { after: updated },
    });

    return json(updated);
  }
);

export const DELETE = withHandler(
  async (_req: Request, context: { params: Promise<{ type: string; id: string }> }) => {
    const { user } = await requireRole(["editor", "admin", "super_admin"]);
    const { type, id: rawId } = await context.params;
    const id = idParamSchema.parse(rawId);
    checkRateLimit(`content_delete_${user.id}`);

    const admin = createAdminClient();

    // Soft delete: sets is_deleted = true
    const { data: updated, error: deleteError } = await admin
      .from("content_items")
      .update({
        is_deleted: true,
        updated_by: user.id,
      })
      .eq("id", id)
      .eq("type_key", type)
      .select()
      .maybeSingle();

    if (deleteError) {
      console.error("[Content Item DELETE deleteError]", deleteError);
      return error("Failed to delete content item", "DB_ERROR", 500);
    }
    if (!updated) {
      throw new NotFoundError(`Content item '${id}' not found`);
    }

    await logAudit({
      actor: user.id,
      action: "delete",
      entity: "content_item",
      entityId: id,
      diff: { is_deleted: true },
    });

    return json({ success: true, item: updated });
  }
);
