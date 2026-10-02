import { createClient } from "@/lib/supabase/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/http";
import type { Database } from "@/types/database";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type UserRole = "super_admin" | "admin" | "editor";

export interface AuthenticatedContext {
  user: User;
  profile: {
    id: string;
    role: UserRole;
    full_name: string | null;
  };
  supabase: SupabaseClient<Database>;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  editor: 1,
  admin: 2,
  super_admin: 3,
};

/**
 * Checks if the user's role satisfies the required roles, supporting hierarchy:
 * super_admin >= admin >= editor.
 */
export function hasRequiredRole(
  userRole: UserRole,
  allowedRoles: UserRole | UserRole[]
): boolean {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  // Direct match
  if (roles.includes(userRole)) {
    return true;
  }

  // Hierarchical match: find lowest required role in allowedRoles
  const userRank = ROLE_HIERARCHY[userRole] ?? 0;
  return roles.some((requiredRole) => {
    const requiredRank = ROLE_HIERARCHY[requiredRole] ?? 99;
    return userRank >= requiredRank;
  });
}

/**
 * Checks if the current authenticated user has one of the allowed roles.
 * Always reads role from the database profiles table (never trusting client JWT metadata).
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

  // Always query database directly to prevent role spoofing or stale JWT claims
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new ForbiddenError("User profile not found or deactivated", "PROFILE_NOT_FOUND");
  }

  const role = profile.role as UserRole;

  if (!hasRequiredRole(role, allowedRoles)) {
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
