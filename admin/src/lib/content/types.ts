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
