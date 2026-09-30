import { describe, it, expect, vi } from "vitest";
import { verifyReleaseStatus, type ReleaseRow } from "@/lib/publish/verify";

describe("Release verify logic", () => {
  const baseRelease: ReleaseRow = {
    id: "release-test-1",
    version: 10,
    snapshot_path: "releases/10/content.json",
    checksum: "abcdef123456",
    status: "building",
    created_by: "user-1",
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    deployed_at: null,
    error: null,
  };

  it("marks 'live' and sets deployed_at when version matches or exceeds target", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 10 }),
    } as any);

    const result = await verifyReleaseStatus(baseRelease, {
      publicSiteUrl: "https://ananta.fest",
      fetchFn: mockFetch,
    });

    expect(result.status).toBe("live");
    expect(result.version).toBe(10);
    expect(result.deployed_at).toBeDefined();
    expect(result.error).toBeNull();
  });

  it("stays 'building' when version is lower than target and release is within 15 minutes", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 9 }),
    } as any);

    const result = await verifyReleaseStatus(baseRelease, {
      publicSiteUrl: "https://ananta.fest",
      fetchFn: mockFetch,
    });

    expect(result.status).toBe("building");
    expect(result.version).toBe(10);
  });

  it("marks 'failed' with 'deploy not confirmed' when version mismatches and release exceeds 15 minutes", async () => {
    const timedOutRelease: ReleaseRow = {
      ...baseRelease,
      created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min ago
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 9 }),
    } as any);

    const result = await verifyReleaseStatus(timedOutRelease, {
      publicSiteUrl: "https://ananta.fest",
      fetchFn: mockFetch,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("deploy not confirmed");
  });

  it("never throws when public site is unreachable and stays 'building' within 15 minutes", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection refused"));

    const result = await verifyReleaseStatus(baseRelease, {
      publicSiteUrl: "https://unreachable-site.local",
      fetchFn: mockFetch,
    });

    expect(result.status).toBe("building");
    expect(result.version).toBe(10);
  });

  it("marks 'failed' with 'deploy not confirmed' when public site is unreachable and timed out (> 15 min)", async () => {
    const timedOutRelease: ReleaseRow = {
      ...baseRelease,
      created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 min ago
    };

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const result = await verifyReleaseStatus(timedOutRelease, {
      publicSiteUrl: "https://unreachable-site.local",
      fetchFn: mockFetch,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("deploy not confirmed");
  });
});
