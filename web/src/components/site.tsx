import Link from "next/link";
import { displayTitle, getItems, getSchema, getTypes, getVersion, type Item } from "@/lib/content";
import { Renderer } from "./renderers";

const special = new Set(["events", "announcements", "schedule", "coordinators", "faqs", "pages"]);

export function SiteShell({ children }: { children: React.ReactNode }) {
  const nav = getTypes().filter((type) => getItems(type).length && !special.has(type));
  return <><a href="#content" className="skip-link">Skip to content</a><header className="sticky top-0 z-10 border-b border-black/10 bg-[var(--background)]/90 backdrop-blur dark:border-white/10"><nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4" aria-label="Main navigation"><Link href="/" className="font-black tracking-tight">ANANTA <span className="text-[var(--accent)]">FESTIVAL</span></Link><div className="flex flex-wrap justify-end gap-4 text-sm"><Link href="/events/">Events</Link><Link href="/schedule/">Schedule</Link><Link href="/team/">Team</Link><Link href="/faqs/">FAQs</Link>{nav.map((type) => <Link key={type} href={`/${type}/`}>{getSchema(type)?.name || type}</Link>)}</div></nav></header><main id="content" className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main><footer className="border-t border-black/10 px-5 py-8 text-center text-sm text-slate-500 dark:border-white/10">Content version {getVersion().version}, updated {getVersion().published_at}</footer></>;
}

export function Listing({ type, title }: { type: string; title?: string }) {
  const schema = getSchema(type);
  const items = getItems(type);
  if (!schema) return <h1>Not found</h1>;
  return <><div className="mb-8"><p className="eyebrow">{schema.name}</p><h1 className="text-4xl font-black tracking-tight sm:text-6xl">{title || schema.name}</h1></div><div className="grid gap-5 md:grid-cols-2">{items.map((item) => <Link key={item.id} href={`/${type}/${item.slug}/`}><Renderer type={type} item={item} schema={schema} /></Link>)}</div></>;
}

export function Detail({ type, slug }: { type: string; slug: string }) {
  const schema = getSchema(type);
  const item = getItems(type).find((entry) => entry.slug === slug);
  if (!schema || !item) return <h1>Not found</h1>;
  return <><p className="eyebrow">{schema.name}</p><h1 className="mb-8 text-4xl font-black tracking-tight sm:text-6xl">{displayTitle(item, schema)}</h1><Renderer type={type} item={item} schema={schema} detail /></>;
}

export function TypeParams({ exclude = [] }: { exclude?: string[] }) {
  return getTypes().filter((type) => !special.has(type) && !exclude.includes(type) && getItems(type).length).map((type) => ({ type }));
}

export function ItemParams({ types }: { types: string[] }) {
  return types.flatMap((type) => getItems(type).map((item: Item) => ({ type, slug: item.slug })));
}
