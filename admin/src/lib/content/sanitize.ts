import sanitizeHtml from "sanitize-html";
import type { Field } from "./types";

export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "p",
    "a",
    "ul",
    "ol",
    "nl",
    "li",
    "b",
    "i",
    "strong",
    "em",
    "strike",
    "code",
    "hr",
    "br",
    "div",
    "table",
    "thead",
    "caption",
    "tbody",
    "tr",
    "th",
    "td",
    "pre",
    "img",
    "span",
    "sub",
    "sup",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  disallowedTagsMode: "discard",
};

export function getMediaBucketBaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/media`;
}

export function isValidImageUrl(url: string, baseUrl?: string): boolean {
  if (typeof url !== "string") return false;
  const prefix = baseUrl || getMediaBucketBaseUrl();
  // If baseUrl is empty (e.g. In unit tests without env), allow any valid media path with /storage/v1/object/public/media
  if (!prefix) {
    return url.includes("/storage/v1/object/public/media");
  }
  return url.startsWith(prefix);
}

export function isValidHttpsUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function sanitizeRichtext(content: string): string {
  if (typeof content !== "string") return "";
  return sanitizeHtml(content, SANITIZE_OPTIONS);
}

/**
 * Recursively sanitizes content data according to field specifications.
 * Unknown extra keys are stripped during this process.
 */
export function sanitizeContentData(
  data: unknown,
  fields: Field[],
  mediaBaseUrl?: string
): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  const input = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    const val = input[field.name];
    if (val === undefined) {
      continue;
    }

    if (val === null) {
      result[field.name] = null;
      continue;
    }

    switch (field.type) {
      case "text":
        result[field.name] = typeof val === "string" ? val.trim() : String(val);
        break;

      case "richtext":
        result[field.name] = typeof val === "string" ? sanitizeRichtext(val) : "";
        break;

      case "number":
        result[field.name] = typeof val === "number" ? val : Number(val);
        break;

      case "boolean":
        result[field.name] = Boolean(val);
        break;

      case "date":
      case "time":
      case "datetime":
        result[field.name] = typeof val === "string" ? val.trim() : String(val);
        break;

      case "url":
        result[field.name] = typeof val === "string" ? val.trim() : String(val);
        break;

      case "select":
        result[field.name] = typeof val === "string" ? val.trim() : String(val);
        break;

      case "image":
        if (typeof val === "object" && val !== null) {
          const img = val as Record<string, unknown>;
          result[field.name] = {
            url: typeof img.url === "string" ? img.url.trim() : "",
            alt: typeof img.alt === "string" ? img.alt.trim() : undefined,
          };
        } else {
          result[field.name] = val;
        }
        break;

      case "list":
        if (Array.isArray(val) && field.of) {
          result[field.name] = val.map((item) =>
            sanitizeContentData(item, field.of!, mediaBaseUrl)
          );
        } else {
          result[field.name] = val;
        }
        break;

      case "group":
        if (typeof val === "object" && val !== null && !Array.isArray(val) && field.of) {
          result[field.name] = sanitizeContentData(val, field.of, mediaBaseUrl);
        } else {
          result[field.name] = val;
        }
        break;

      default:
        result[field.name] = val;
        break;
    }
  }

  return result;
}
