import { Detail } from "@/components/site";
import { getItems } from "@/lib/content";
export const dynamicParams = false;
export function generateStaticParams() { return getItems("events").map(({ slug }) => ({ slug })); }
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) { return <Detail type="events" slug={(await params).slug} />; }
