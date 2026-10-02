import type { ReactNode } from "react";
import sanitizeHtml from "sanitize-html";
import { formatDate, formatTime, labelFor, type Field, type Item, type Schema } from "@/lib/content";

const BASE_ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "p",
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
];

function isSafeUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim().toLowerCase();
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:") || trimmed.startsWith("vbscript:")) {
    return false;
  }
  return trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:");
}

function RichText({ html, allowLinks = true }: { html: string; allowLinks?: boolean }) {
  const allowedTags = allowLinks ? [...BASE_ALLOWED_TAGS, "a"] : BASE_ALLOWED_TAGS;

  const sanitized = sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => {
        if (!isSafeUrl(attribs.href || "")) {
          return { tagName: "span", attribs: {} };
        }
        return {
          tagName: "a",
          attribs: {
            ...attribs,
            rel: "noopener noreferrer",
          },
        };
      },
    },
  });

  return (
    <div
      className="prose prose-slate max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

export function FieldValue({ field, value, detail = false }: { field: Field; value: unknown; detail?: boolean }): ReactNode {
  if (value === null || value === undefined || value === "") return null;
  switch (field.type) {
    case "richtext": return <RichText html={String(value)} allowLinks={detail} />;
    case "date": return formatDate(String(value));
    case "time": return formatTime(String(value));
    case "datetime": {
      const [date, time] = String(value).split("T");
      return <>{formatDate(date)} {time ? formatTime(time) : ""}</>;
    }
    case "image": {
      const image = value as { url?: string; alt?: string };
      if (!image.url || !isSafeUrl(image.url)) return null;
      return <img src={image.url} alt={image.alt || ""} loading="lazy" className="h-auto max-h-96 w-full rounded-2xl object-cover" />;
    }
    case "url": {
      const rawUrl = String(value).trim();
      const safe = isSafeUrl(rawUrl);
      if (!detail || !safe) {
        return <span className="text-[var(--accent)] underline">{rawUrl}</span>;
      }
      return (
        <a
          className="text-[var(--accent)] underline"
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {rawUrl}
        </a>
      );
    }
    case "boolean": return value ? "Yes" : "No";
    case "list": return <ul className="space-y-2">{(value as unknown[]).map((entry, index) => <li key={index} className="rounded-xl border border-black/10 p-3 dark:border-white/10"><GenericFields fields={field.of || []} data={entry as Record<string, unknown>} detail={detail} /></li>)}</ul>;
    case "group": return <GenericFields fields={field.of || []} data={value as Record<string, unknown>} detail={detail} />;
    default: return String(value);
  }
}

export function GenericFields({ fields, data, detail = false }: { fields: Field[]; data: Record<string, unknown>; detail?: boolean }) {
  return <div className="space-y-5">{fields.map((field) => {
    const value = data[field.name];
    if (value === undefined || value === null || value === "") return null;
    return <div key={field.name}><dt className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{labelFor(field)}</dt><dd><FieldValue field={field} value={value} detail={detail} /></dd></div>;
  })}</div>;
}

export function GenericSection({ item, schema, detail = false }: { item: Item; schema: Schema; detail?: boolean }) {
  return <article className={detail ? "rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900 sm:p-10" : "rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-slate-900"}><h2 className="mb-5 text-2xl font-bold">{String(item.data.title || item.data.name || item.data.question || item.slug)}</h2><GenericFields fields={schema.fields} data={item.data} detail={detail} /></article>;
}

function specialized(type: string) {
  return ["events", "announcements", "schedule", "coordinators", "faqs", "pages"].includes(type);
}

export function Renderer({ item, schema, detail = false }: { type?: string; item: Item; schema: Schema; detail?: boolean }) {
  return <GenericSection item={item} schema={schema} detail={detail} />;
}

export { specialized };
