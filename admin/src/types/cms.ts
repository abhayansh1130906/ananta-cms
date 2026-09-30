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

export interface ContentType {
  id?: string;
  key: string;
  name: string;
  is_singleton: boolean;
  fields: Field[];
  created_at?: string;
}

export type ItemStatus = "draft" | "published" | "archived";

export interface ContentItem {
  id: string;
  type_key: string;
  slug: string;
  sort_order: number;
  draft_data: Record<string, unknown>;
  published_data: Record<string, unknown> | null;
  status: ItemStatus;
  version: number;
  is_deleted: boolean;
  has_unpublished_changes: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export type ReleaseStatus = "pending" | "building" | "live" | "failed";

export interface Release {
  id: string;
  version: number;
  snapshot_path: string;
  checksum: string;
  status: ReleaseStatus;
  created_by: string | null;
  created_at: string;
  deployed_at: string | null;
  error: string | null;
}

export interface Snapshot {
  release_id: string;
  version: number;
  published_at: string;
  checksum: string;
  schema: Record<
    string,
    {
      name: string;
      is_singleton: boolean;
      fields: Field[];
    }
  >;
  types: Record<
    string,
    Array<{
      id: string;
      slug: string;
      sort_order: number;
      data: Record<string, unknown>;
    }>
  >;
}

export interface PreviewChange {
  type: string;
  id: string;
  slug: string;
  change: "added" | "modified" | "deleted";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface PublishPreviewResponse {
  count: number;
  changes: PreviewChange[];
}

export interface Overview {
  live_version: number | null;
  live_published_at: string | null;
  pending_changes: number;
  active_release: {
    id: string;
    version: number;
    status: ReleaseStatus;
    created_at: string;
  } | null;
}

export interface UserProfile {
  id: string;
  email?: string;
  full_name: string | null;
  role: "admin" | "editor";
}
