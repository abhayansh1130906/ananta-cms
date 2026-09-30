import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checksum } from "../src/lib/publish/checksum";
import { snapshotSchema, type Snapshot } from "../src/lib/snapshot-schema";

const root = process.cwd();
const emptySnapshot = (): Snapshot => {
  const schema = {};
  const types = {};
  return { release_id: "empty", version: 0, published_at: new Date(0).toISOString(), checksum: checksum({ schema, types }), schema, types };
};

async function fetchSnapshot(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
      if (response.status === 404 && process.env.ALLOW_EMPTY_SNAPSHOT === "true") return emptySnapshot();
      if (!response.ok) throw new Error(`snapshot request returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function main() {
  const url = process.env.SNAPSHOT_URL;
  if (!url) throw new Error("SNAPSHOT_URL is not set");
  const parsed = snapshotSchema.parse(await fetchSnapshot(url));
  const computed = checksum({ schema: parsed.schema, types: parsed.types });
  if (computed !== parsed.checksum) throw new Error(`checksum mismatch: expected ${parsed.checksum}, got ${computed}`);
  await mkdir(join(root, "src", "data"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "src", "data", "content.json"), JSON.stringify(parsed, null, 2) + "\n");
  await writeFile(join(root, "public", "version.json"), JSON.stringify({
    version: parsed.version, release_id: parsed.release_id, published_at: parsed.published_at,
  }, null, 2) + "\n");
  console.log(`Snapshot ${parsed.version} verified (${Object.keys(parsed.types).length} types).`);
}

main().catch((error) => {
  console.error(`Snapshot build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
