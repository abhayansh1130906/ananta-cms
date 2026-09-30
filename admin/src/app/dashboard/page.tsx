"use client";

import { useState } from "react";
import Link from "next/link";
import { useOverview, useContentTypes, useReleases } from "@/lib/query";
import { PublishModal } from "@/components/publish/publish-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Rocket,
  Clock,
  FileEdit,
  ArrowRight,
  Plus,
  Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function DashboardOverviewPage() {
  const { data: overview, isLoading: overviewLoading } = useOverview({ refetchInterval: 10000 });
  const { data: contentTypes, isLoading: typesLoading } = useContentTypes();
  const { data: releases } = useReleases();

  const [publishModalOpen, setPublishModalOpen] = useState(false);

  const pendingCount = overview?.pending_changes ?? 0;
  const liveVersion = overview?.live_version;
  const activeRelease = overview?.active_release;
  const latestRelease = releases?.[0];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Status, live snapshot release, and quick editorial navigation.
          </p>
        </div>

        <Button onClick={() => setPublishModalOpen(true)} className="gap-2 shadow-sm">
          <Send className="h-4 w-4" />
          <span>Publish Changes</span>
          {pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-primary-foreground text-primary">
              {pendingCount}
            </span>
          )}
        </Button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Card 1: Live Version */}
        <Card className="border shadow-xs relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Live Deployment</span>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </CardDescription>
            <CardTitle className="text-3xl font-mono">
              {overviewLoading ? (
                <span className="h-8 w-20 bg-muted/60 rounded animate-pulse inline-block" />
              ) : liveVersion ? (
                `v${liveVersion}`
              ) : (
                "None"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {overview?.live_published_at
                ? `Published ${formatDistanceToNow(new Date(overview.live_published_at), { addSuffix: true })}`
                : "No live release confirmed yet"}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Pending Changes */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Pending Modifications</span>
              <FileEdit className="h-4 w-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-3xl font-mono">
              {overviewLoading ? (
                <span className="h-8 w-12 bg-muted/60 rounded animate-pulse inline-block" />
              ) : (
                pendingCount
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {pendingCount === 0
                ? "All drafts are synchronized with live"
                : `${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting to be published`}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Release Activity */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Release Activity</span>
              <Rocket className="h-4 w-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-xl flex items-center gap-2">
              {activeRelease ? (
                <>
                  <Badge variant="secondary" className="animate-pulse">
                    Building v{activeRelease.version}
                  </Badge>
                </>
              ) : latestRelease ? (
                <>
                  <Badge
                    variant={latestRelease.status === "live" ? "default" : "secondary"}
                    className={latestRelease.status === "live" ? "bg-emerald-600" : ""}
                  >
                    v{latestRelease.version} ({latestRelease.status})
                  </Badge>
                </>
              ) : (
                <span className="text-muted-foreground text-base">Idle</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/releases"
              className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
            >
              <span>View release history</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links per Content Type */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Content Schemas</h2>
            <p className="text-xs text-muted-foreground">
              Quick access to create and manage items across all configured types
            </p>
          </div>
        </div>

        {typesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="h-32 border rounded-xl bg-card animate-pulse" />
            <div className="h-32 border rounded-xl bg-card animate-pulse" />
            <div className="h-32 border rounded-xl bg-card animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(contentTypes || []).map((ct) => (
              <Card
                key={ct.key}
                className="border shadow-xs hover:border-primary/50 transition-colors flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold truncate">
                      {ct.name}
                    </CardTitle>
                    {ct.is_singleton ? (
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                        Singleton
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                        Collection
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs font-mono">
                    /{ct.key} • {ct.fields.length} field{ct.fields.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 flex items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1 text-xs">
                    <Link href={`/dashboard/${ct.key}`}>Manage</Link>
                  </Button>
                  {!ct.is_singleton && (
                    <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
                      <Link href={`/dashboard/${ct.key}/new`} title={`Add ${ct.name}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <PublishModal open={publishModalOpen} onOpenChange={setPublishModalOpen} />
    </div>
  );
}
