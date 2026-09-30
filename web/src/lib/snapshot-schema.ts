import { z } from "zod";

const field: z.ZodTypeAny = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    label: z.string().optional(),
    type: z.enum(["text", "richtext", "number", "date", "time", "datetime", "image", "url", "boolean", "select", "list", "group"]),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    of: z.array(field).optional(),
  }),
);

export const snapshotSchema = z.object({
  release_id: z.string().min(1),
  version: z.number().int().nonnegative(),
  published_at: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  schema: z.record(z.string(), z.object({ name: z.string(), is_singleton: z.boolean(), fields: z.array(field) })),
  types: z.record(z.string(), z.array(z.object({
    id: z.string().min(1), slug: z.string().min(1), sort_order: z.number(), data: z.record(z.string(), z.unknown()),
  }))),
}).superRefine((value, ctx) => {
  const schemaKeys = Object.keys(value.schema).sort();
  const typeKeys = Object.keys(value.types).sort();
  if (JSON.stringify(schemaKeys) !== JSON.stringify(typeKeys)) {
    ctx.addIssue({ code: "custom", message: "schema and types must contain the same keys", path: ["types"] });
  }
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type Field = z.infer<typeof field>;
