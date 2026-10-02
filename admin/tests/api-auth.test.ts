import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasRequiredRole, type UserRole } from "@/lib/auth/requireRole";
import { NextRequest } from "next/server";

// Valid RFC 4122 UUIDs
const VALID_UUIDS = {
  editor: "11111111-1111-4111-8111-111111111111",
  admin: "22222222-2222-4222-8222-222222222222",
  super_admin: "33333333-3333-4333-8333-333333333333",
  target: "44444444-4444-4444-8444-444444444444",
};

// Fluent query builder mock for Supabase
function createChainableQuery() {
  const query: any = {
    data: [],
    count: 0,
    error: null,
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve({ data: { id: VALID_UUIDS.target, role: "editor" }, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    insert: vi.fn(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: VALID_UUIDS.target, role: "editor" }, error: null }),
      }),
    })),
    upsert: vi.fn(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: VALID_UUIDS.target, role: "editor" }, error: null }),
      }),
    })),
    update: vi.fn(() => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: VALID_UUIDS.target, role: "editor" }, error: null }),
        }),
      }),
    })),
    delete: vi.fn(() => ({
      eq: () => Promise.resolve({ data: null, error: null }),
    })),
    then: (resolve: any) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve),
  };
  return query;
}

// Mock Supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (_table: string) => createChainableQuery(),
    auth: {
      admin: {
        listUsers: () => Promise.resolve({
          data: {
            users: [
              { id: VALID_UUIDS.editor, email: "editor@example.com" },
              { id: VALID_UUIDS.admin, email: "admin@example.com" },
              { id: VALID_UUIDS.super_admin, email: "super@example.com" },
            ],
          },
          error: null,
        }),
        createUser: () => Promise.resolve({
          data: { user: { id: VALID_UUIDS.target, email: "new@example.com" } },
          error: null,
        }),
        deleteUser: () => Promise.resolve({ data: {}, error: null }),
      },
    },
  })),
}));

// Mock rate limiting to avoid test interference
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

// Mock audit logging
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

// Route handlers under test
import { GET as getOverview } from "@/app/api/v1/overview/route";
import { GET as getContentTypes, POST as postContentTypes } from "@/app/api/v1/content-types/route";
import { POST as postPublish } from "@/app/api/v1/publish/route";
import { POST as postRollback } from "@/app/api/v1/releases/[id]/rollback/route";
import { GET as getUsers, POST as postUsers } from "@/app/api/v1/users/route";
import { DELETE as deleteUser } from "@/app/api/v1/users/[id]/route";

function setupAuthMock(role: UserRole | null) {
  if (!role) {
    // Unauthenticated / anon
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: new Error("No active session"),
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error("Not found") }),
          }),
        }),
      }),
    });
    return;
  }

  const userId = VALID_UUIDS[role];
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: { id: userId, email: `${role}@example.com` } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: userId,
                  role,
                  full_name: `Test ${role}`,
                },
                error: null,
              }),
            }),
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      return createChainableQuery();
    },
  });
}

describe("API Route Authorization Matrix", () => {
  describe("Role Hierarchy & Permissions Mapping", () => {
    const routeRules: Array<{
      route: string;
      method: string;
      allowedRoles: UserRole[];
    }> = [
      { route: "/api/v1/overview", method: "GET", allowedRoles: ["editor", "admin", "super_admin"] },
      { route: "/api/v1/content-types", method: "GET", allowedRoles: ["editor", "admin", "super_admin"] },
      { route: "/api/v1/content-types", method: "POST", allowedRoles: ["admin", "super_admin"] },
      { route: "/api/v1/content/:type", method: "GET", allowedRoles: ["editor", "admin", "super_admin"] },
      { route: "/api/v1/content/:type", method: "POST", allowedRoles: ["editor", "admin", "super_admin"] },
      { route: "/api/v1/content/:type/:id", method: "PUT", allowedRoles: ["editor", "admin", "super_admin"] },
      { route: "/api/v1/media", method: "GET", allowedRoles: ["editor", "admin", "super_admin"] },
      { route: "/api/v1/media", method: "POST", allowedRoles: ["admin", "super_admin"] },
      { route: "/api/v1/publish", method: "POST", allowedRoles: ["admin", "super_admin"] },
      { route: "/api/v1/publish/preview", method: "GET", allowedRoles: ["editor", "admin", "super_admin"] },
      { route: "/api/v1/releases", method: "GET", allowedRoles: ["editor", "admin", "super_admin"] },
      { route: "/api/v1/releases/:id/rollback", method: "POST", allowedRoles: ["admin", "super_admin"] },
      { route: "/api/v1/releases/:id/retry", method: "POST", allowedRoles: ["admin", "super_admin"] },
      { route: "/api/v1/users", method: "GET", allowedRoles: ["super_admin"] },
      { route: "/api/v1/users", method: "POST", allowedRoles: ["super_admin"] },
      { route: "/api/v1/users/:id", method: "DELETE", allowedRoles: ["super_admin"] },
    ];

    it("verifies permissions for all defined routes across all roles", () => {
      for (const rule of routeRules) {
        // editor
        const editorAllowed = hasRequiredRole("editor", rule.allowedRoles);
        expect(editorAllowed).toBe(rule.allowedRoles.includes("editor"));

        // admin
        const adminAllowed = hasRequiredRole("admin", rule.allowedRoles);
        expect(adminAllowed).toBe(
          rule.allowedRoles.includes("admin") || rule.allowedRoles.includes("editor")
        );

        // super_admin (inherits all)
        const superAllowed = hasRequiredRole("super_admin", rule.allowedRoles);
        expect(superAllowed).toBe(true);
      }
    });
  });

  describe("Unauthenticated (anon) Access to Admin Routes", () => {
    beforeEach(() => {
      setupAuthMock(null);
    });

    it("rejects unauthenticated request to GET /api/v1/overview with 401", async () => {
      const res = await (getOverview as any)(new NextRequest("http://localhost:3000/api/v1/overview"));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("rejects unauthenticated request to GET /api/v1/content-types with 401", async () => {
      const res = await (getContentTypes as any)(new NextRequest("http://localhost:3000/api/v1/content-types"));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("rejects unauthenticated request to POST /api/v1/publish with 401", async () => {
      const res = await (postPublish as any)(new NextRequest("http://localhost:3000/api/v1/publish", { method: "POST" }));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });

    it("rejects unauthenticated request to GET /api/v1/users with 401", async () => {
      const res = await (getUsers as any)(new NextRequest("http://localhost:3000/api/v1/users"));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Editor Role Authorization", () => {
    beforeEach(() => {
      setupAuthMock("editor");
    });

    it("allows editor to read GET /api/v1/content-types", async () => {
      const res = await (getContentTypes as any)(new NextRequest("http://localhost:3000/api/v1/content-types"));
      expect(res.status).toBe(200);
    });

    it("allows editor to read GET /api/v1/overview", async () => {
      const res = await (getOverview as any)(new NextRequest("http://localhost:3000/api/v1/overview"));
      expect(res.status).toBe(200);
    });

    it("forbids editor from creating content types (POST /api/v1/content-types) with 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/content-types", {
        method: "POST",
        body: JSON.stringify({ key: "test_type", name: "Test Type" }),
      });
      const res = await (postContentTypes as any)(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("forbids editor from triggering publish (POST /api/v1/publish) with 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/publish", {
        method: "POST",
      });
      const res = await (postPublish as any)(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("forbids editor from triggering rollback (POST /api/v1/releases/:id/rollback) with 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/releases/1/rollback", {
        method: "POST",
      });
      const res = await (postRollback as any)(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("forbids editor from accessing user management (GET /api/v1/users) with 403", async () => {
      const res = await (getUsers as any)(new NextRequest("http://localhost:3000/api/v1/users"));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });
  });

  describe("Admin Role Authorization", () => {
    beforeEach(() => {
      setupAuthMock("admin");
    });

    it("allows admin to create content types (POST /api/v1/content-types)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/content-types", {
        method: "POST",
        body: JSON.stringify({ key: "news", name: "News Articles" }),
      });
      const res = await (postContentTypes as any)(req);
      expect(res.status).toBe(201);
    });

    it("forbids admin from managing users (GET /api/v1/users) with 403", async () => {
      const res = await (getUsers as any)(new NextRequest("http://localhost:3000/api/v1/users"));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("forbids admin from creating users (POST /api/v1/users) with 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/users", {
        method: "POST",
        body: JSON.stringify({ email: "new@example.com", password: "Password123!", role: "editor" }),
      });
      const res = await (postUsers as any)(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });
  });

  describe("Super Admin Role Authorization", () => {
    beforeEach(() => {
      setupAuthMock("super_admin");
    });

    it("allows super_admin to read users (GET /api/v1/users)", async () => {
      const res = await (getUsers as any)(new NextRequest("http://localhost:3000/api/v1/users"));
      expect(res.status).toBe(200);
    });

    it("allows super_admin to create users (POST /api/v1/users)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/users", {
        method: "POST",
        body: JSON.stringify({ email: "staff@example.com", password: "Password123!", role: "editor" }),
      });
      const res = await (postUsers as any)(req);
      expect(res.status).toBe(201);
    });

    it("allows super_admin to delete users (DELETE /api/v1/users/:id)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/users/${VALID_UUIDS.target}`, {
        method: "DELETE",
      });
      const res = await (deleteUser as any)(req, {
        params: Promise.resolve({ id: VALID_UUIDS.target }),
      });
      expect(res.status).toBe(200);
    });

    it("allows super_admin to create content types (POST /api/v1/content-types)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/content-types", {
        method: "POST",
        body: JSON.stringify({ key: "press", name: "Press Releases" }),
      });
      const res = await (postContentTypes as any)(req);
      expect(res.status).toBe(201);
    });
  });
});
