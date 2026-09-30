import { describe, it, expect } from "vitest";
import { requireRole, hasRequiredRole } from "@/lib/auth/requireRole";
import { UnauthorizedError, ForbiddenError } from "@/lib/http";

function createMockSupabaseClient(user: any, profile: any, userError: any = null, profileError: any = null) {
  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: userError,
      }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: profile,
            error: profileError,
          }),
        }),
      }),
    }),
  } as any;
}

describe("RBAC and requireRole helper", () => {
  it("throws 401 UnauthorizedError when user is not authenticated", async () => {
    const mockClient = createMockSupabaseClient(null, null, new Error("No session"));

    await expect(requireRole("admin", mockClient)).rejects.toThrow(UnauthorizedError);
  });

  it("throws 403 ForbiddenError when user profile is not found", async () => {
    const mockClient = createMockSupabaseClient(
      { id: "user-123" },
      null,
      null,
      new Error("Profile not found")
    );

    await expect(requireRole("admin", mockClient)).rejects.toThrow(ForbiddenError);
  });

  it("throws 403 ForbiddenError when editor attempts admin-only operation", async () => {
    const mockClient = createMockSupabaseClient(
      { id: "editor-user" },
      { id: "editor-user", role: "editor", full_name: "Editor Jane" }
    );

    await expect(requireRole("admin", mockClient)).rejects.toThrow(ForbiddenError);
  });

  it("allows access when role matches", async () => {
    const mockClient = createMockSupabaseClient(
      { id: "admin-user" },
      { id: "admin-user", role: "admin", full_name: "Admin John" }
    );

    const ctx = await requireRole("admin", mockClient);
    expect(ctx.user.id).toBe("admin-user");
    expect(ctx.profile.role).toBe("admin");
  });

  it("allows either admin or editor when an array of allowed roles is provided", async () => {
    const mockClient = createMockSupabaseClient(
      { id: "editor-user" },
      { id: "editor-user", role: "editor", full_name: "Editor Jane" }
    );

    const ctx = await requireRole(["admin", "editor"], mockClient);
    expect(ctx.profile.role).toBe("editor");
  });

  it("hasRequiredRole correctly evaluates roles", () => {
    expect(hasRequiredRole("admin", "admin")).toBe(true);
    expect(hasRequiredRole("admin", ["admin", "editor"])).toBe(true);
    expect(hasRequiredRole("editor", "admin")).toBe(false);
    expect(hasRequiredRole("editor", ["admin", "editor"])).toBe(true);
  });
});
