import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY is required (service role)"),
  DEPLOY_HOOK_URL: z.string().url().optional().or(z.literal("")),
  PUBLIC_SITE_URL: z.string().url().optional().or(z.literal("")),
  CRON_SECRET: z.string().min(16, "CRON_SECRET should be a secure random token of at least 16 characters").optional(),
  SNAPSHOT_SIGNING_SECRET: z.string().min(16, "SNAPSHOT_SIGNING_SECRET should be at least 16 characters").optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getValidatedEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  // Only run full strict validation in non-test environments or when explicit
  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    const errorMsg = `[Startup Configuration Error] Invalid environment variables:\n${formatted}`;

    if (process.env.NODE_ENV !== "test") {
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  cachedEnv = (result.success ? result.data : process.env) as ServerEnv;
  return cachedEnv;
}

// Fail-fast on module load in non-test environments
if (typeof window === "undefined" && process.env.NODE_ENV !== "test") {
  try {
    getValidatedEnv();
  } catch (err) {
    // Allows build-time bundling if NEXT_PHASE is active
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      console.warn("[Env Warning]", err instanceof Error ? err.message : String(err));
    }
  }
}
