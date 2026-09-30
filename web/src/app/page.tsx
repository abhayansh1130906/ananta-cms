import Link from "next/link";
import { displayTitle, getItems, getSchema } from "@/lib/content";
import { Renderer } from "@/components/renderers";

export default function Home() {
  const events = getItems("events").slice(0, 3);
  const announcements = getItems("announcements").filter((item) => item.data.pinned === true).slice(0, 3);
  const faqs = getItems("faqs").slice(0, 3);
  const hero = getItems("pages")[0] || events[0];
  const heroSchema = hero ? getSchema(hero === events[0] ? "events" : "pages") : undefined;
  return <div className="space-y-20"><section className="hero"><p className="eyebrow">Ananta Festival</p><h1>{hero ? displayTitle(hero, heroSchema) : "A festival of ideas, people, and possibility."}</h1><p className="max-w-2xl text-lg text-slate-600 dark:text-slate-300">Gather with us for a thoughtful, joyful programme shaped by our community.</p><Link className="button" href="/events/">Explore the programme</Link></section>{events.length > 0 && <section><SectionTitle title="Upcoming events" href="/events/" /><div className="grid gap-5 md:grid-cols-3">{events.map((item) => <Link key={item.id} href={`/events/${item.slug}/`}><Renderer type="events" item={item} schema={getSchema("events")!} /></Link>)}</div></section>}{announcements.length > 0 && <section><SectionTitle title="From the festival" href="/announcements/" /><div className="grid gap-5 md:grid-cols-3">{announcements.map((item) => <Link key={item.id} href={`/announcements/${item.slug}/`}><Renderer type="announcements" item={item} schema={getSchema("announcements")!} /></Link>)}</div></section>}{faqs.length > 0 && <section><SectionTitle title="Questions, answered" href="/faqs/" /><div className="grid gap-5 md:grid-cols-3">{faqs.map((item) => <Link key={item.id} href={`/faqs/${item.slug}/`}><Renderer type="faqs" item={item} schema={getSchema("faqs")!} /></Link>)}</div></section>}</div>;
}

function SectionTitle({ title, href }: { title: string; href: string }) {
  return <div className="mb-6 flex items-end justify-between gap-4"><h2 className="text-3xl font-black">{title}</h2><Link className="text-sm font-bold text-[var(--accent)]" href={href}>View all →</Link></div>;
}
