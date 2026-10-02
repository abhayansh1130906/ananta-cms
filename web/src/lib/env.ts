import { z } from "zod";

const webEnvSchema = z.object({
  SNAPSHOT_URL: z.string().url().optional(),
  SNAPSHOT_SIGNING_SECRET: z.string().min(16).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  ALLOW_EMPTY_SNAPSHOT: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function validateWebEnv(): WebEnv {
  return webEnvSchema.parse(process.env);
}
