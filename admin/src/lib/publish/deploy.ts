import fs from "node:fs";
import path from "node:path";
import type { Snapshot } from "./snapshot";

/**
 * Triggers the DEPLOY_HOOK_URL if configured.
 * Does not crash if env is missing or a placeholder.
 */
export async function triggerDeployHook(): Promise<{
  triggered: boolean;
  warning?: string;
}> {
  const hookUrl = process.env.DEPLOY_HOOK_URL?.trim();

  if (
    !hookUrl ||
    hookUrl.startsWith("<") ||
    hookUrl.includes("placeholder") ||
    hookUrl === "add later"
  ) {
    const warning = "DEPLOY_HOOK_URL is not configured or placeholder";
    console.warn(`[DeployHook Warning] ${warning}: ${hookUrl}`);
    return { triggered: false, warning };
  }

  try {
    const res = await fetch(hookUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Ananta-CMS-Publisher/1.0",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Deploy hook returned HTTP ${res.status}: ${errorText}`);
    }

    return { triggered: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[DeployHook Error]", err);
    throw new Error(`Deploy hook call failed: ${errorMsg}`);
  }
}

/**
 * In local/monorepo development, directly syncs the published snapshot
 * to the sibling web app (both src/data/content.json and public/version.json).
 * This makes local deployments instant without waiting for manual snapshot scripts.
 */
export async function syncLocalWebSnapshot(snapshot: Snapshot): Promise<boolean> {
  try {
    const candidates = [
      path.resolve(process.cwd(), "../web"),
      path.resolve(process.cwd(), "web"),
      path.resolve(process.cwd(), "../../web"),
    ];

    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, "package.json"))) {
        const dataDir = path.join(dir, "src", "data");
        const publicDir = path.join(dir, "public");

        await fs.promises.mkdir(dataDir, { recursive: true });
        await fs.promises.mkdir(publicDir, { recursive: true });

        const snapshotJson = JSON.stringify(snapshot, null, 2) + "\n";
        const versionJson =
          JSON.stringify(
            {
              version: Number(snapshot.version),
              release_id: snapshot.release_id,
              published_at: snapshot.published_at,
            },
            null,
            2
          ) + "\n";

        await fs.promises.writeFile(path.join(dataDir, "content.json"), snapshotJson);
        await fs.promises.writeFile(path.join(publicDir, "version.json"), versionJson);

        console.log(`[Local Sync] Automatically synchronized web snapshot to v${snapshot.version}`);
        return true;
      }
    }
  } catch (err) {
    console.warn("[Local Sync Warning] Could not sync local web files:", err);
  }
  return false;
}
