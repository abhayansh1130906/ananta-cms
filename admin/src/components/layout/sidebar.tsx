"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContentTypes, useCurrentUser } from "@/lib/query";
import {
  LayoutDashboard,
  Rocket,
  Layers,
  FileText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: contentTypes, isLoading } = useContentTypes();

  const isAdmin = user?.role === "admin";

  return (
    <aside className="w-64 border-r bg-card h-full flex flex-col select-none">
      {/* Brand logo */}
      <div className="h-16 border-b px-5 flex items-center justify-between">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2.5 font-bold tracking-tight text-foreground hover:opacity-90 transition-opacity"
        >
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-base">Ananta CMS</span>
        </Link>
      </div>

      {/* Navigation list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Main section */}
        <div className="space-y-1">
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/dashboard"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Overview</span>
          </Link>

          <Link
            href="/dashboard/releases"
            onClick={onNavigate}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith("/dashboard/releases")
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            <Rocket className="h-4 w-4" />
            <span>Releases</span>
          </Link>
        </div>

        {/* Content Section (Dynamic from GET /content-types) */}
        <div className="space-y-1">
          <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Content</span>
            <span className="text-[10px] font-mono text-muted-foreground/80">
              {contentTypes?.length ?? 0}
            </span>
          </div>

          {isLoading ? (
            <div className="px-3 py-2 space-y-2">
              <div className="h-6 bg-muted/60 rounded animate-pulse" />
              <div className="h-6 bg-muted/60 rounded animate-pulse" />
              <div className="h-6 bg-muted/60 rounded animate-pulse" />
            </div>
          ) : (
            (contentTypes || []).map((ct) => {
              const active =
                pathname === `/dashboard/${ct.key}` ||
                pathname.startsWith(`/dashboard/${ct.key}/`);

              return (
                <Link
                  key={ct.key}
                  href={`/dashboard/${ct.key}`}
                  onClick={onNavigate}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors group ${
                    active
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{ct.name}</span>
                  </div>

                  {ct.is_singleton && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] py-0 px-1 border-muted-foreground/30 ${
                        active ? "text-primary-foreground border-primary-foreground/40" : ""
                      }`}
                    >
                      Single
                    </Badge>
                  )}
                </Link>
              );
            })
          )}
        </div>

        {/* Settings / Schema Builder (Admin Only) */}
        {isAdmin && (
          <div className="space-y-1 pt-2 border-t">
            <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Administration
            </div>

            <Link
              href="/dashboard/content-types"
              onClick={onNavigate}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/dashboard/content-types")
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="h-4 w-4" />
                <span>Content Types</span>
              </div>
              <Badge variant="secondary" className="text-[10px] py-0 px-1 font-mono">
                Admin
              </Badge>
            </Link>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="p-4 border-t text-xs text-muted-foreground/80 flex items-center justify-between">
        <span className="font-mono">Next.js 16</span>
        <span className="font-mono">Supabase</span>
      </div>
    </aside>
  );
}
