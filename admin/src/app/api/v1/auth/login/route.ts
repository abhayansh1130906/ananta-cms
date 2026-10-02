export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error, BadRequestError } from "@/lib/http";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import type { Database } from "@/types/database";

// In-memory lockout store for login attempts: 5 failed attempts in 15 minutes locks out for 15 minutes
interface FailedAttempt {
  count: number;
  lockoutUntil: number;
}
const loginAttempts = new Map<string, FailedAttempt>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginLockout(key: string): { locked: boolean; remainingSec: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt) return { locked: false, remainingSec: 0 };

  if (attempt.lockoutUntil > now) {
    const remainingSec = Math.ceil((attempt.lockoutUntil - now) / 1000);
    return { locked: true, remainingSec };
  }

  if (attempt.lockoutUntil <= now && attempt.count >= MAX_FAILED_ATTEMPTS) {
    loginAttempts.delete(key);
  }

  return { locked: false, remainingSec: 0 };
}

function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, lockoutUntil: 0 };

  attempt.count += 1;
  if (attempt.count >= MAX_FAILED_ATTEMPTS) {
    attempt.lockoutUntil = now + LOCKOUT_DURATION_MS;
    console.warn(`[Security Alert] Account/IP locked out due to multiple failed logins: ${key}`);
  }

  loginAttempts.set(key, attempt);
}

function clearLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const POST = withHandler(async (req: Request) => {
  const body = await req.json().catch(() => null);
  if (!body) {
    throw new BadRequestError("Missing request body");
  }

  const { email, password } = loginSchema.parse(body);
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limiting & lockout check (keyed by email and IP)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
  const lockoutKey = `${clientIp}_${normalizedEmail}`;

  const lockout = checkLoginLockout(lockoutKey);
  if (lockout.locked) {
    return error(
      `Account temporarily locked due to multiple failed login attempts. Please try again in ${lockout.remainingSec} seconds.`,
      "ACCOUNT_LOCKED",
      429,
      { retryAfter: lockout.remainingSec }
    );
  }

  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  const supabase = createServerClient<Database>(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            })
          );
        } catch {
          // Ignore if called in read-only environment
        }
      },
    },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (authError || !authData.user) {
    recordFailedAttempt(lockoutKey);

    await logAudit({
      actor: null,
      action: "login_failed",
      entity: "auth",
      diff: { email: normalizedEmail, ip: clientIp },
    });

    // Generic error message to prevent user enumeration
    return error("Invalid email or password", "INVALID_CREDENTIALS", 401);
  }

  // Verify profile exists in database
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!profile) {
    recordFailedAttempt(lockoutKey);
    await supabase.auth.signOut();
    return error("Account is not authorized for editorial dashboard access", "FORBIDDEN", 403);
  }

  // Clear failed attempts counter on successful login
  clearLoginAttempts(lockoutKey);

  // Check if TOTP MFA is enrolled
  const { data: mfaFactors } = await supabase.auth.mfa.listFactors();
  const totpFactor = mfaFactors?.totp?.find((f) => f.status === "verified");

  await logAudit({
    actor: authData.user.id,
    action: "login_success",
    entity: "auth",
    diff: { email: normalizedEmail, role: profile.role, ip: clientIp },
  });

  return json({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      role: profile.role,
      full_name: profile.full_name,
    },
    mfa_required: Boolean(totpFactor),
  });
});
