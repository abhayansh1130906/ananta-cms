import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export interface ReleaseRow {
  id: string;
  version: number | bigint;
  snapshot_path: string;
  checksum: string;
  status: "pending" | "building" | "live" | "failed";
  created_by: string | null;
  created_at: string;
  deployed_at: string | null;
  error: string | null;
}

export interface VerificationResult {
  status: "pending" | "building" | "live" | "failed";
  version: number;
  deployed_at?: string | null;
  error?: string | null;
  note?: string;
}

export interface VerifyOptions {
  publicSiteUrl?: string;
  now?: number;
  adminClient?: SupabaseClient<Database>;
  fetchFn?: typeof fetch;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/**
 * Checks deployment status of a release.
 * While 'building', fetches `${PUBLIC_SITE_URL}/version.json?t=${Date.now()}`.
 * If json.version >= release.version -> marks 'live' with deployed_at.
 * If mismatch and older than 15 min -> marks 'failed' with 'deploy not confirmed'.
 * If unreachable -> stays 'building' unless older than 15 min.
 * Never throws when public site is unreachable.
 */
export async function verifyReleaseStatus(
  release: ReleaseRow,
  options: VerifyOptions = {}
): Promise<VerificationResult> {
  const versionNum = Number(release.version);

  // If already in terminal or non-building state, return current status
  if (release.status !== "building") {
    return {
      status: release.status,
      version: versionNum,
      deployed_at: release.deployed_at,
      error: release.error,
    };
  }

  const now = options.now ?? Date.now();
  const createdAtMs = new Date(release.created_at).getTime();
  const isTimedOut = now - createdAtMs > FIFTEEN_MINUTES_MS;

  const siteUrl = options.publicSiteUrl ?? process.env.PUBLIC_SITE_URL?.trim();
  const isUrlValid =
    siteUrl &&
    !siteUrl.startsWith("<") &&
    !siteUrl.includes("placeholder") &&
    siteUrl !== "add later";

  const fetchImpl = options.fetchFn ?? fetch;

  if (!isUrlValid) {
    if (isTimedOut) {
      if (options.adminClient) {
        await options.adminClient
          .from("releases")
          .update({
            status: "failed",
            error: "deploy not confirmed",
          })
          .eq("id", release.id);
      }
      return {
        status: "failed",
        version: versionNum,
        error: "deploy not confirmed",
        note: "PUBLIC_SITE_URL not configured and release timed out after 15 minutes",
      };
    }

    return {
      status: "building",
      version: versionNum,
      note: "PUBLIC_SITE_URL is not configured; deploy confirmation pending",
    };
  }

  const cleanSiteUrl = siteUrl.replace(/\/$/, "");
  const versionUrl = `${cleanSiteUrl}/version.json?t=${now}`;

  try {
    const res = await fetchImpl(versionUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const deployedVersion = Number(data?.version);

      if (deployedVersion >= versionNum) {
        const deployedAt = new Date(now).toISOString();
        if (options.adminClient) {
          await options.adminClient
            .from("releases")
            .update({
              status: "live",
              deployed_at: deployedAt,
              error: null,
            })
            .eq("id", release.id);
        }

        return {
          status: "live",
          version: versionNum,
          deployed_at: deployedAt,
          error: null,
        };
      }
    }

    // Version not yet matching or non-200 response
    if (isTimedOut) {
      if (options.adminClient) {
        await options.adminClient
          .from("releases")
          .update({
            status: "failed",
            error: "deploy not confirmed",
          })
          .eq("id", release.id);
      }
      return {
        status: "failed",
        version: versionNum,
        error: "deploy not confirmed",
      };
    }

    return {
      status: "building",
      version: versionNum,
    };
  } catch (err) {
    // Unreachable: never throw, check timeout
    console.warn("[Verify Status] Public site unreachable:", err);

    if (isTimedOut) {
      if (options.adminClient) {
        await options.adminClient
          .from("releases")
          .update({
            status: "failed",
            error: "deploy not confirmed",
          })
          .eq("id", release.id);
      }
      return {
        status: "failed",
        version: versionNum,
        error: "deploy not confirmed",
      };
    }

    return {
      status: "building",
      version: versionNum,
    };
  }
}
