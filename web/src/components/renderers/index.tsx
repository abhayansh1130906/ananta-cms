import type { ReactNode } from "react";
import { formatDate, formatTime, labelFor, type Field, type Item, type Schema } from "@/lib/content";

function RichText({ html }: { html: string }) {
  return <div className="prose prose-slate max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function FieldValue({ field, value }: { field: Field; value: unknown }): ReactNode {
  if (value === null || value === undefined || value === "") return null;
  switch (field.type) {
    case "richtext": return <RichText html={String(value)} />;
    case "date": return formatDate(String(value));
    case "time": return formatTime(String(value));
    case "datetime": {
      const [date, time] = String(value).split("T");
      return <>{formatDate(date)} {time ? formatTime(time) : ""}</>;
    }
    case "image": {
      const image = value as { url?: string; alt?: string };
      return image.url ? <img src={image.url} alt={image.alt || ""} loading="lazy" className="h-auto max-h-96 w-full rounded-2xl object-cover" /> : null;
    }
    case "url": return <a className="text-[var(--accent)] underline" href={String(value)}>{String(value)}</a>;
    case "boolean": return value ? "Yes" : "No";
    case "list": return <ul className="space-y-2">{(value as unknown[]).map((entry, index) => <li key={index} className="rounded-xl border border-black/10 p-3 dark:border-white/10"><GenericFields fields={field.of || []} data={entry as Record<string, unknown>} /></li>)}</ul>;
    case "group": return <GenericFields fields={field.of || []} data={value as Record<string, unknown>} />;
    default: return String(value);
  }
}

export function GenericFields({ fields, data }: { fields: Field[]; data: Record<string, unknown> }) {
  return <div className="space-y-5">{fields.map((field) => {
    const value = data[field.name];
    if (value === undefined || value === null || value === "") return null;
    return <div key={field.name}><dt className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{labelFor(field)}</dt><dd><FieldValue field={field} value={value} /></dd></div>;
  })}</div>;
}

export function GenericSection({ item, schema, detail = false }: { item: Item; schema: Schema; detail?: boolean }) {
  return <article className={detail ? "rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900 sm:p-10" : "rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-slate-900"}><h2 className="mb-5 text-2xl font-bold">{String(item.data.title || item.data.name || item.data.question || item.slug)}</h2><GenericFields fields={schema.fields} data={item.data} /></article>;
}

function specialized(type: string) {
  return ["events", "announcements", "schedule", "coordinators", "faqs", "pages"].includes(type);
}

export function Renderer({ type, item, schema, detail = false }: { type: string; item: Item; schema: Schema; detail?: boolean }) {
  return <GenericSection item={item} schema={schema} detail={detail} />;
}

export { specialized };
