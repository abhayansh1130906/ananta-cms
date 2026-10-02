export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, NotFoundError, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const idParamSchema = z.string().uuid("Invalid user UUID");

const updateUserSchema = z.object({
  full_name: z.string().max(100).optional(),
  role: z.enum(["editor", "admin", "super_admin"]).optional(),
});

export const GET = withHandler(
  async (_req: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole("super_admin");
    const { id: rawId } = await context.params;
    const id = idParamSchema.parse(rawId);
    const admin = createAdminClient();

    const { data: profile, error: dbError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (dbError) {
      console.error("[User GET ID DB Error]", dbError);
      return error("Failed to retrieve user profile", "DB_ERROR", 500);
    }
    if (!profile) {
      throw new NotFoundError(`User '${id}' not found`);
    }

    const { data: authUser } = await admin.auth.admin.getUserById(id);

    return json({
      id: profile.id,
      email: authUser?.user?.email || null,
      full_name: profile.full_name,
      role: profile.role,
      created_at: profile.created_at,
    });
  }
);

export const PUT = withHandler(
  async (req: Request, context: { params: Promise<{ id: string }> }) => {
    const { user: currentSuperAdmin } = await requireRole("super_admin");
    const { id: rawId } = await context.params;
    const id = idParamSchema.parse(rawId);
    checkRateLimit(`update_user_${currentSuperAdmin.id}`);

    const body = await req.json().catch(() => null);
    if (!body) {
      throw new BadRequestError("Missing request body");
    }

    const parsed = updateUserSchema.parse(body);
    const admin = createAdminClient();

    const { data: current, error: getError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (getError || !current) {
      throw new NotFoundError(`User '${id}' not found`);
    }

    // Prevent demoting the last super_admin or self if changing super_admin role
    if (currentSuperAdmin.id === id && parsed.role && parsed.role !== "super_admin") {
      return error("Cannot demote your own super_admin account", "FORBIDDEN", 403);
    }

    const updates: Record<string, unknown> = {};
    if (parsed.full_name !== undefined) updates.full_name = parsed.full_name;
    if (parsed.role !== undefined) updates.role = parsed.role;

    const { data: updated, error: updateError } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("[User Update DB Error]", updateError);
      return error("Failed to update user profile", "DB_ERROR", 500);
    }

    await logAudit({
      actor: currentSuperAdmin.id,
      action: "update",
      entity: "user_account",
      entityId: id,
      diff: { before: current, after: updated },
    });

    return json(updated);
  }
);

export const DELETE = withHandler(
  async (_req: Request, context: { params: Promise<{ id: string }> }) => {
    const { user: currentSuperAdmin } = await requireRole("super_admin");
    const { id: rawId } = await context.params;
    const id = idParamSchema.parse(rawId);
    checkRateLimit(`delete_user_${currentSuperAdmin.id}`);

    if (currentSuperAdmin.id === id) {
      return error("Cannot delete your own super_admin account", "FORBIDDEN", 403);
    }

    const admin = createAdminClient();

    // Delete from auth.users (cascades to profiles)
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(id);
    if (deleteAuthError) {
      console.error("[User Delete Auth Error]", deleteAuthError);
      return error("Failed to delete user account", "AUTH_ERROR", 500);
    }

    await logAudit({
      actor: currentSuperAdmin.id,
      action: "delete",
      entity: "user_account",
      entityId: id,
    });

    return json({ success: true, deleted: id });
  }
);
