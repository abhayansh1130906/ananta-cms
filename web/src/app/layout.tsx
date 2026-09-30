import "./globals.css";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Ananta Festival", template: "%s | Ananta Festival" },
  description: "Discover the Ananta Festival programme, people, and answers.",
  openGraph: { type: "website", title: "Ananta Festival", description: "Discover the Ananta Festival programme." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SiteShell>{children}</SiteShell></body></html>;
}
