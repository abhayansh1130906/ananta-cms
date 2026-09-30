import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const email = env.TEST_ADMIN_EMAIL || "admin_123@g.com";
const password = env.TEST_ADMIN_PASSWORD || "admin_123";

console.log("Connecting to Supabase at:", supabaseUrl);
console.log("Target Admin User:", email);

const adminClient = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. List users to check if already exists
  const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) {
    console.error("Failed to list users:", listErr);
    process.exit(1);
  }

  let user = usersData.users.find((u) => u.email === email);

  if (!user) {
    console.log("User does not exist. Creating user...");
    const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Demo Admin" },
    });

    if (createErr) {
      console.error("Failed to create user:", createErr);
      process.exit(1);
    }
    user = createData.user;
    console.log("User created successfully with ID:", user.id);
  } else {
    console.log("User already exists with ID:", user.id, "- Updating password and confirming email...");
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: "Demo Admin" },
    });
    if (updateErr) {
      console.error("Failed to update user:", updateErr);
      process.exit(1);
    }
    console.log("User password and confirmation updated.");
  }

  // 2. Ensure profile exists and has role 'admin'
  console.log("Upserting profile with role 'admin'...");
  const { error: profileErr } = await adminClient
    .from("profiles")
    .upsert({
      id: user.id,
      full_name: "Demo Admin",
      role: "admin",
    });

  if (profileErr) {
    console.error("Failed to update profile:", profileErr);
    process.exit(1);
  }

  console.log("Profile successfully set to 'admin'.");

  // 3. Verify login using client SDK (publishable key)
  console.log("Verifying credentials via signInWithPassword...");
  const client = createClient(supabaseUrl, publishableKey);
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr) {
    console.error("Verification signIn failed:", signInErr);
    process.exit(1);
  }

  console.log("SUCCESS! User signed in successfully. Session token generated.");
  console.log("-----------------------------------------");
  console.log("DEMO ADMIN CREDENTIALS:");
  console.log("Email:    " + email);
  console.log("Password: " + password);
  console.log("Role:     admin");
  console.log("-----------------------------------------");
}

main().catch(console.error);
