import type { ContentTypeSchema, Field } from "../content/types";
import { checksum } from "./checksum";

export interface SnapshotItem {
  id: string;
  slug: string;
  sort_order: number;
  data: Record<string, unknown>;
  is_deleted?: boolean;
}

export interface ContentTypeRecord {
  key: string;
  name: string;
  is_singleton: boolean;
  fields: unknown; // Field[] or Json
}

export interface Snapshot {
  release_id: string;
  version: number;
  published_at: string;
  checksum: string;
  schema: Record<string, ContentTypeSchema>;
  types: Record<string, Array<{ id: string; slug: string; sort_order: number; data: Record<string, unknown> }>>;
}

export interface BuildSnapshotInput {
  releaseId: string;
  version: number;
  contentTypes: ContentTypeRecord[];
  typesData: Record<string, SnapshotItem[]>;
  publishedAt?: string;
}

/**
 * Builds the canonical content.json snapshot according to the contract:
 * - Every content_types key appears in BOTH schema and types (types[key] = [] if empty)
 * - Soft-deleted items are completely omitted from types
 * - Types are sorted by sort_order ascending
 * - Checksum is computed via stableStringify sha256 hex
 */
export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  const publishedAt = input.publishedAt || new Date().toISOString();

  const schema: Record<string, ContentTypeSchema> = {};
  const types: Record<string, Array<{ id: string; slug: string; sort_order: number; data: Record<string, unknown> }>> = {};

  // Sort content type keys alphabetically for deterministic structure
  const sortedContentTypes = [...input.contentTypes].sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  for (const ct of sortedContentTypes) {
    const fields = Array.isArray(ct.fields) ? (ct.fields as Field[]) : [];

    schema[ct.key] = {
      name: ct.name,
      is_singleton: Boolean(ct.is_singleton),
      fields,
    };

    const rawItems = input.typesData[ct.key] || [];

    // Filter out deleted items and format items according to contract
    const cleanItems = rawItems
      .filter((item) => !item.is_deleted)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        sort_order: item.sort_order ?? 0,
        data: item.data ?? {},
      }));

    types[ct.key] = cleanItems;
  }

  // Compute checksum over { schema, types }
  const computedChecksum = checksum({ schema, types });

  return {
    release_id: input.releaseId,
    version: input.version,
    published_at: publishedAt,
    checksum: computedChecksum,
    schema,
    types,
  };
}
