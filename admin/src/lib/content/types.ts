import { z } from "zod";

export type FieldType =
  | "text"
  | "richtext"
  | "number"
  | "date"
  | "time"
  | "datetime"
  | "image"
  | "url"
  | "boolean"
  | "select"
  | "list"
  | "group";

export interface ImageValue {
  url: string;
  alt?: string;
}

export interface Field {
  name: string;
  label?: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  of?: Field[];
}

export const fieldTypeEnum = z.enum([
  "text",
  "richtext",
  "number",
  "date",
  "time",
  "datetime",
  "image",
  "url",
  "boolean",
  "select",
  "list",
  "group",
]);

export const fieldDefinitionSchema: z.ZodType<Field> = z.lazy(() =>
  z.object({
    name: z
      .string()
      .min(1, "Field name is required")
      .max(64, "Field name must be under 64 characters")
      .regex(/^[a-z][a-z0-9_]*$/, "Field name must be lowercase alphanumeric with underscores"),
    label: z.string().max(100).optional(),
    type: fieldTypeEnum,
    required: z.boolean().optional(),
    options: z.array(z.string().max(100)).max(50).optional(),
    of: z.array(fieldDefinitionSchema).max(20).optional(),
  })
);

export interface ContentTypeSchema {
  name: string;
  is_singleton: boolean;
  fields: Field[];
}

export interface ContentItemRow {
  id: string;
  type_key: string;
  slug: string;
  sort_order: number;
  draft_data: Record<string, unknown>;
  published_data: Record<string, unknown> | null;
  status: "draft" | "published" | "archived";
  version: number;
  is_deleted: boolean;
  has_unpublished_changes: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}
