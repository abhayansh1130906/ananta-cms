import { createClient } from "@/lib/supabase/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/http";
import type { Database } from "@/types/database";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type UserRole = "admin" | "editor";

export interface AuthenticatedContext {
  user: User;
  profile: {
    id: string;
    role: UserRole;
    full_name: string | null;
  };
  supabase: SupabaseClient<Database>;
}

/**
 * Checks if the current authenticated user has one of the allowed roles.
 * Throws 401 if unauthenticated, 403 if unauthorized.
 */
export async function requireRole(
  allowedRoles: UserRole | UserRole[],
  client?: SupabaseClient<Database>
): Promise<AuthenticatedContext> {
  const supabase = client ?? (await createClient());

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new UnauthorizedError("Authentication required", "UNAUTHORIZED");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new ForbiddenError("User profile not found", "PROFILE_NOT_FOUND");
  }

  const role = profile.role as UserRole;
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!roles.includes(role)) {
    throw new ForbiddenError(
      `Role '${role}' is not authorized for this operation`,
      "FORBIDDEN"
    );
  }

  return {
    user,
    profile: {
      id: profile.id,
      role,
      full_name: profile.full_name,
    },
    supabase,
  };
}

/**
 * Helper to check role without throwing (e.g. for conditional logic).
 */
export function hasRequiredRole(
  userRole: UserRole,
  allowedRoles: UserRole | UserRole[]
): boolean {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return roles.includes(userRole);
}
