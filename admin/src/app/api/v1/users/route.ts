export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, BadRequestError } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  full_name: z.string().max(100).optional(),
  role: z.enum(["editor", "admin", "super_admin"]),
});

export const GET = withHandler(async () => {
  await requireRole("super_admin");
  const admin = createAdminClient();

  const { data, error: dbError } = await admin
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (dbError) {
    console.error("[Users GET DB Error]", dbError);
    return error("Failed to retrieve user accounts", "DB_ERROR", 500);
  }

  // Fetch emails from auth.users using admin client
  const { data: authUsers } = await admin.auth.admin.listUsers();
  const emailMap = new Map((authUsers?.users || []).map((u) => [u.id, u.email]));

  const enriched = (data || []).map((p) => ({
    ...p,
    email: emailMap.get(p.id) || null,
  }));

  return json(enriched);
});

export const POST = withHandler(async (req: Request) => {
  const { user: currentSuperAdmin } = await requireRole("super_admin");
  checkRateLimit(`create_user_${currentSuperAdmin.id}`, 20, 60000);

  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const { email, password, full_name, role } = createUserSchema.parse(body);
  const admin = createAdminClient();

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (authError || !authData.user) {
    console.error("[User Creation Auth Error]", authError);
    return error(authError?.message || "Failed to create user in auth system", "AUTH_ERROR", 400);
  }

  const newUserId = authData.user.id;

  // Insert or update profile in profiles table
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: newUserId,
      full_name: full_name ?? null,
      role,
    })
    .select()
    .single();

  if (profileError) {
    console.error("[User Creation Profile DB Error]", profileError);
    // Cleanup auth user if profile creation failed
    await admin.auth.admin.deleteUser(newUserId);
    return error("Failed to initialize user profile", "DB_ERROR", 500);
  }

  await logAudit({
    actor: currentSuperAdmin.id,
    action: "create",
    entity: "user_account",
    entityId: newUserId,
    diff: { email, role, full_name },
  });

  return json(
    {
      id: profile.id,
      email,
      full_name: profile.full_name,
      role: profile.role,
      created_at: profile.created_at,
    },
    201
  );
});
