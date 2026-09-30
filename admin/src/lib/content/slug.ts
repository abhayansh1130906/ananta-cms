import type { Field } from "./types";

/**
 * Converts a string into lowercase kebab-case format.
 * Matches SQL check: ^[a-z0-9]+(-[a-z0-9]+)*$
 */
export function toKebabCase(input: string): string {
  if (!input) return "item";

  const slug = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
    .replace(/-{2,}/g, "-"); // Collapse consecutive hyphens

  return slug || "item";
}

const COMMON_SLUG_FIELD_NAMES = ["title", "name", "question", "day"];

/**
 * Auto-generates a slug from the first required text field (or common fields).
 */
export function generateSlug(
  data: Record<string, unknown>,
  fields: Field[]
): string {
  // 1. Look for first required text field
  const requiredTextField = fields.find(
    (f) => (f.type === "text" || f.type === "richtext") && f.required
  );

  if (requiredTextField && data[requiredTextField.name]) {
    const val = String(data[requiredTextField.name]);
    const slug = toKebabCase(val);
    if (slug) return slug;
  }

  // 2. Look for any field matching common names: title, name, question, day
  for (const name of COMMON_SLUG_FIELD_NAMES) {
    const matched = fields.find((f) => f.name.toLowerCase() === name);
    if (matched && data[matched.name]) {
      const val = String(data[matched.name]);
      const slug = toKebabCase(val);
      if (slug) return slug;
    }
  }

  // 3. Look for any text field with a non-empty value
  for (const field of fields) {
    if (
      (field.type === "text" || field.type === "richtext") &&
      data[field.name]
    ) {
      const val = String(data[field.name]);
      const slug = toKebabCase(val);
      if (slug) return slug;
    }
  }

  return "item";
}

/**
 * De-duplicates a slug within an existing list of slugs by appending -2, -3, etc.
 */
export function deduplicateSlug(
  baseSlug: string,
  existingSlugs: string[] | Set<string>
): string {
  const set = existingSlugs instanceof Set ? existingSlugs : new Set(existingSlugs);

  const cleanBase = toKebabCase(baseSlug);
  if (!set.has(cleanBase)) {
    return cleanBase;
  }

  let counter = 2;
  while (set.has(`${cleanBase}-${counter}`)) {
    counter++;
  }

  return `${cleanBase}-${counter}`;
}
