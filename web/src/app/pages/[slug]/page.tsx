import { Detail } from "@/components/site";
import { getItems } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  const items = getItems("pages");
  return items.length ? items.map(({ slug }) => ({ slug })) : [{ slug: "_" }];
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "_") return <h1>Page not found</h1>;
  return <Detail type="pages" slug={slug} />;
}
