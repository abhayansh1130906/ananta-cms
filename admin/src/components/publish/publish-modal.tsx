"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePublishPreview, useOverview, useReleaseStatus } from "@/lib/query";
import { api, ApiError } from "@/lib/api";
import { formatDiffValue } from "@/lib/format";
import type { PreviewChange } from "@/types/cms";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  Loader2,
  Send,
  RotateCcw,
  Sparkles,
  FileCheck,
} from "lucide-react";

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublishModal({ open, onOpenChange }: PublishModalProps) {
  const queryClient = useQueryClient();
  const { data: preview, isLoading: previewLoading, refetch: refetchPreview } = usePublishPreview({
    enabled: open,
  });
  const { data: overview } = useOverview();

  const [userTriggeredReleaseId, setUserTriggeredReleaseId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Active release is user-triggered release, or active release from overview when dialog is open
  const activeReleaseId = userTriggeredReleaseId || (open ? overview?.active_release?.id ?? null : null);
  const inProgressWarning =
    !userTriggeredReleaseId && open && overview?.active_release?.id
      ? "A release is already currently in progress. Showing live status."
      : null;

  // Poll active release if one is running
  const { data: releaseStatus } = useReleaseStatus(activeReleaseId, {
    enabled: Boolean(activeReleaseId),
    refetchInterval: 5000,
  });

  // Handle release reaching terminal state
  useEffect(() => {
    if (releaseStatus?.status === "live") {
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["releases"] });
      queryClient.invalidateQueries({ queryKey: ["contentItems"] });
      queryClient.invalidateQueries({ queryKey: ["publishPreview"] });
    }
  }, [releaseStatus?.status, queryClient]);

  const handlePublish = async () => {
    setPublishing(true);

    try {
      const res = await api.publish();
      setUserTriggeredReleaseId(res.release_id);
      toast.success(`Release v${res.version} initiated!`);
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["releases"] });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === "PUBLISH_IN_PROGRESS") {
        toast.info("Another publish or build is currently in progress.");
        const ov = await api.getOverview();
        if (ov.active_release) {
          setUserTriggeredReleaseId(ov.active_release.id);
        }
      } else {
        const msg = err instanceof Error ? err.message : "Publish failed";
        toast.error(msg);
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleRetry = async () => {
    if (!activeReleaseId) return;
    setRetrying(true);
    try {
      await api.retryRelease(activeReleaseId);
      toast.success("Release retry triggered!");
      queryClient.invalidateQueries({ queryKey: ["releaseStatus", activeReleaseId] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      toast.error(msg);
    } finally {
      setRetrying(false);
    }
  };

  const handleClose = () => {
    setUserTriggeredReleaseId(null);
    onOpenChange(false);
  };

  // Group preview changes by content type
  const changesByType = (preview?.changes || []).reduce<Record<string, PreviewChange[]>>(
    (acc, change) => {
      acc[change.type] = acc[change.type] || [];
      acc[change.type].push(change);
      return acc;
    },
    {}
  );

  const isLive = releaseStatus?.status === "live";
  const isFailed = releaseStatus?.status === "failed";
  const isBuilding = releaseStatus?.status === "building" || releaseStatus?.status === "pending";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Publish Changes
          </DialogTitle>
          <DialogDescription>
            Review pending modifications and promote drafts to the live snapshot.
          </DialogDescription>
        </DialogHeader>

        {inProgressWarning && (
          <div
            role="alert"
            className="p-3 text-sm rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{inProgressWarning}</span>
          </div>
        )}

        {/* ACTIVE RELEASE STEPPER */}
        {activeReleaseId ? (
          <div className="py-4 space-y-6 flex-1 overflow-y-auto" aria-live="polite">
            <div className="p-4 rounded-xl border bg-muted/40 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-base">Release Progress</h3>
                  <p className="text-xs text-muted-foreground">
                    Target Version: <span className="font-mono font-medium">v{releaseStatus?.version ?? "..."}</span>
                  </p>
                </div>
                {isLive && <Badge variant="default" className="bg-emerald-600 text-white">Live</Badge>}
                {isBuilding && <Badge variant="secondary" className="animate-pulse">Building...</Badge>}
                {isFailed && <Badge variant="destructive">Failed</Badge>}
              </div>

              {/* Stepper visualization */}
              <div className="space-y-3 pt-2">
                {/* Step 1: Promoted */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">1. Database Promotion</p>
                    <p className="text-xs text-muted-foreground">Drafts promoted to published state atomically</p>
                  </div>
                </div>

                {/* Step 2: Snapshot Uploaded */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">2. Snapshot Created & Uploaded</p>
                    <p className="text-xs text-muted-foreground">Generated deterministic content.json with SHA-256 checksum</p>
                  </div>
                </div>

                {/* Step 3: Building */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {isLive ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : isFailed ? (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    ) : (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">3. Frontend Build (Deploy Hook)</p>
                    <p className="text-xs text-muted-foreground">
                      {isFailed
                        ? "Build or deploy hook failed"
                        : isLive
                        ? "Deploy hook completed successfully"
                        : "Triggered deploy webhook, building static pages..."}
                    </p>
                  </div>
                </div>

                {/* Step 4: Live */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {isLive ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <CircleDashed className="h-5 w-5 text-muted-foreground/60" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">4. Deployment Confirmed (Live)</p>
                    <p className="text-xs text-muted-foreground">
                      {isLive
                        ? `Live confirmation verified at ${releaseStatus?.deployed_at ? new Date(releaseStatus.deployed_at).toLocaleTimeString() : "now"}`
                        : "Verifying live site version.json..."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Note or warning message */}
              {releaseStatus?.note && (
                <div className="p-3 text-xs rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-200 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{releaseStatus.note}</span>
                </div>
              )}

              {/* Error message */}
              {isFailed && releaseStatus?.error && (
                <div className="p-3 text-xs rounded-lg bg-destructive/15 border border-destructive/30 text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Deployment failed</p>
                    <p>{releaseStatus.error}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {isFailed && (
                <Button onClick={handleRetry} disabled={retrying} variant="destructive">
                  {retrying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Retry Release
                </Button>
              )}
              <Button onClick={handleClose} variant="outline">
                {isLive ? "Done" : "Close (runs in background)"}
              </Button>
            </div>
          </div>
        ) : (
          /* PREVIEW CHANGES VIEW */
          <div className="flex-1 flex flex-col overflow-hidden space-y-4 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-muted-foreground">
                {previewLoading ? (
                  "Inspecting changes..."
                ) : (
                  <>
                    Pending changes: <strong className="text-foreground">{preview?.count ?? 0}</strong>
                  </>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={() => refetchPreview()} disabled={previewLoading}>
                Refresh
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-xl p-3 bg-muted/20 space-y-4">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  <p className="text-sm">Calculating diff between draft and published data...</p>
                </div>
              ) : preview?.count === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center">
                  <FileCheck className="h-10 w-10 text-emerald-500 mb-2" />
                  <p className="font-medium text-foreground">All content is up to date</p>
                  <p className="text-xs max-w-xs mt-1">
                    There are no unpublished changes or pending deletions to publish.
                  </p>
                </div>
              ) : (
                Object.entries(changesByType).map(([typeKey, changes]) => (
                  <div key={typeKey} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span className="capitalize">{typeKey}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                        {changes.length}
                      </Badge>
                    </h4>

                    <div className="space-y-2">
                      {changes.map((change) => (
                        <div
                          key={change.id}
                          className="p-3 bg-card rounded-lg border text-sm space-y-2 shadow-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-semibold">{change.slug}</span>
                            <Badge
                              variant={
                                change.change === "added"
                                  ? "default"
                                  : change.change === "deleted"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-[11px] capitalize"
                            >
                              {change.change}
                            </Badge>
                          </div>

                          {/* Diffs view */}
                          {change.change === "modified" && change.before && change.after && (() => {
                            const beforeObj = change.before as Record<string, unknown>;
                            const afterObj = change.after as Record<string, unknown>;
                            return (
                              <div className="space-y-1 text-xs pt-1 border-t">
                                {Object.keys({ ...beforeObj, ...afterObj }).map((fieldKey) => {
                                  const beforeVal = beforeObj[fieldKey];
                                  const afterVal = afterObj[fieldKey];
                                  if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) {
                                    return null;
                                  }
                                  return (
                                    <div key={fieldKey} className="grid grid-cols-3 gap-2 py-0.5">
                                      <span className="font-medium text-muted-foreground truncate capitalize">
                                        {fieldKey}:
                                      </span>
                                      <span className="line-through text-destructive truncate">
                                        {formatDiffValue(beforeVal)}
                                      </span>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate">
                                        {formatDiffValue(afterVal)}
                                      </span>
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )})()}

                          {change.change === "added" && (
                            <p className="text-xs text-muted-foreground">New item ready to be included in release</p>
                          )}
                          {change.change === "deleted" && (
                            <p className="text-xs text-destructive">Will be excluded and archived in live snapshot</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handlePublish}
                disabled={previewLoading || !preview || preview.count === 0 || publishing}
              >
                {publishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Publish {preview?.count ? `(${preview.count})` : ""}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
