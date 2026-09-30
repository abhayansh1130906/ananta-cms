import { Detail } from "@/components/site";
import { getItems } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  const items = getItems("announcements");
  return items.length ? items.map(({ slug }) => ({ slug })) : [{ slug: "_" }];
}

export default async function AnnouncementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "_") return <h1>No announcement selected</h1>;
  return <Detail type="announcements" slug={slug} />;
}
