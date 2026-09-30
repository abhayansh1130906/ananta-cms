import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local manually
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");

const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;

const adminClient = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// stableStringify
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]));
  return "{" + entries.join(",") + "}";
}

function computeChecksum(data) {
  return crypto.createHash("sha256").update(stableStringify(data)).digest("hex");
}

async function main() {
  console.log("Checking if releases exist...");
  const { data: existingReleases } = await adminClient
    .from("releases")
    .select("*")
    .order("version", { ascending: false });

  // Get admin user
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const adminUser = env.TEST_ADMIN_EMAIL
    ? usersData.users.find((u) => u.email === env.TEST_ADMIN_EMAIL)
    : null;

  console.log("Promoting drafts via publish_all()...");
  const { error: rpcErr } = await adminClient.rpc("publish_all");
  if (rpcErr) {
    console.error("publish_all failed:", rpcErr);
  }

  // Create new release
  console.log("Creating new release in releases table...");
  const { data: release, error: insertErr } = await adminClient
    .from("releases")
    .insert({
      status: "pending",
      snapshot_path: "pending",
      checksum: "pending",
      created_by: adminUser ? adminUser.id : null,
    })
    .select()
    .single();

  if (insertErr) {
    console.error("Insert release error:", insertErr);
    process.exit(1);
  }

  console.log(`Created release row v${release.version} (id: ${release.id})`);

  // Build snapshot
  const { data: contentTypes } = await adminClient.from("content_types").select("*");
  const schema = {};
  const types = {};

  for (const ct of contentTypes || []) {
    schema[ct.key] = {
      name: ct.name,
      is_singleton: ct.is_singleton,
      fields: ct.fields,
    };
    types[ct.key] = [];
  }

  // Fetch published items
  const { data: items } = await adminClient
    .from("content_items")
    .select("*")
    .eq("is_deleted", false);

  for (const item of items || []) {
    if (types[item.type_key]) {
      types[item.type_key].push({
        id: item.id,
        slug: item.slug,
        sort_order: item.sort_order,
        data: item.published_data || item.draft_data || {},
      });
    }
  }

  const checksum = computeChecksum({ schema, types });
  const snapshot = {
    release_id: release.id,
    version: release.version,
    published_at: new Date().toISOString(),
    checksum,
    schema,
    types,
  };

  const payload = Buffer.from(JSON.stringify(snapshot, null, 2), "utf-8");

  console.log("Uploading snapshot to Supabase Storage bucket 'snapshots'...");
  // 1. Upload releases/<version>/content.json
  const versionPath = `releases/${release.version}/content.json`;
  const { error: upErr1 } = await adminClient.storage
    .from("snapshots")
    .upload(versionPath, payload, {
      contentType: "application/json",
      upsert: true,
    });
  if (upErr1) console.error("Upload error 1:", upErr1);

  // 2. Upload latest/content.json
  const latestPath = `latest/content.json`;
  const { error: upErr2 } = await adminClient.storage
    .from("snapshots")
    .upload(latestPath, payload, {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (upErr2) console.error("Upload error 2:", upErr2);

  // Update release status to live
  await adminClient
    .from("releases")
    .update({
      status: "live",
      snapshot_path: versionPath,
      checksum,
      deployed_at: new Date().toISOString(),
    })
    .eq("id", release.id);

  console.log("SUCCESS! Release published and uploaded.");
  console.log(`Latest snapshot available at: ${supabaseUrl}/storage/v1/object/public/snapshots/latest/content.json`);
}

main().catch(console.error);
