export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const reorderSchema = z.object({
  ids: z.array(z.string().uuid("Invalid item UUID")),
});

export const POST = withHandler(async (req: Request, context: { params: Promise<{ type: string }> }) => {
  const { user } = await requireRole(["admin", "editor"]);
  const { type } = await context.params;
  checkRateLimit(`content_reorder_${user.id}`);

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const { ids } = reorderSchema.parse(body);
  const admin = createAdminClient();

  // Update sort_order for each id based on array index
  const updatePromises = ids.map((id, index) =>
    admin
      .from("content_items")
      .update({
        sort_order: index,
        updated_by: user.id,
      })
      .eq("id", id)
      .eq("type_key", type)
  );

  const results = await Promise.all(updatePromises);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return error(failed.error.message, "DB_ERROR", 500);
  }

  await logAudit({
    actor: user.id,
    action: "update",
    entity: "content_item_reorder",
    entityId: type,
    diff: { ids },
  });

  return json({ success: true, reordered: ids.length });
});
