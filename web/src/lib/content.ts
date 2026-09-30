import snapshot from "@/data/content.json";
import type { Field, Snapshot } from "./snapshot-schema";

export type { Field, Snapshot };
export type Item = Snapshot["types"][string][number];
export type Schema = Snapshot["schema"][string];

const content = snapshot as Snapshot;

export function getItems(type: string): Item[] {
  return [...(content.types[type] ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}

export function getItem(type: string, slug: string): Item | undefined {
  return getItems(type).find((item) => item.slug === slug);
}

export function getSchema(type: string): Schema | undefined {
  return content.schema[type];
}

export function getTypes(): string[] {
  return Object.keys(content.schema);
}

export function getVersion() {
  return { version: content.version, release_id: content.release_id, published_at: content.published_at };
}

export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

export function formatTime(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function labelFor(field: Field): string {
  return field.label || field.name.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function displayTitle(item: Item, schema?: Schema): string {
  const data = item.data;
  const preferred = ["title", "name", "question", "day"];
  const key = preferred.find((name) => typeof data[name] === "string") || schema?.fields.find((field) => typeof data[field.name] === "string")?.name;
  return key && typeof data[key] === "string" ? data[key] : item.slug;
}
