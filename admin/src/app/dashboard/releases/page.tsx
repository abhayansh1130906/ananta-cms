"use client";

import { useState, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useReleases, useCurrentUser } from "@/lib/query";
import { api } from "@/lib/api";
import type { Release, ReleaseStatus } from "@/types/cms";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ReleasesPage() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === "admin";

  const { data: releases, isLoading, error } = useReleases({
    refetchInterval: 5000,
  });

  // Check if there are running releases to keep polling
  const hasActiveRelease = useMemo(() => {
    return releases?.some(
      (r) => r.status === "building" || r.status === "pending"
    );
  }, [releases]);

  // Rollback state
  const [rollbackTarget, setRollbackTarget] = useState<Release | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Retrying state
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleRollback = async () => {
    if (!rollbackTarget) return;

    try {
      setIsRollingBack(true);
      const res = await api.rollbackRelease(rollbackTarget.id);
      toast.success(`Rolled back successfully to version v${res.version}`);
      setRollbackTarget(null);
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["releases"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["contentItems"] });
      queryClient.invalidateQueries({ queryKey: ["publishPreview"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rollback failed";
      toast.error(msg);
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleRetry = async (release: Release) => {
    try {
      setRetryingId(release.id);
      await api.retryRelease(release.id);
      toast.success(`Retrying deployment for version v${release.version}`);
      queryClient.invalidateQueries({ queryKey: ["releases"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      toast.error(msg);
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: ReleaseStatus) => {
    switch (status) {
      case "live":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Live
          </Badge>
        );
      case "building":
        return (
          <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 font-medium inline-flex items-center gap-1.5 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Building
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-medium inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Pending
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="font-medium inline-flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Releases History</h1>
          <p className="text-sm text-muted-foreground">
            Audit trail of site deployments, snapshot versions, and rollback controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasActiveRelease && (
            <Badge variant="outline" className="border-blue-500/30 text-blue-600 dark:text-blue-400 gap-1.5 py-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Active release in progress
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["releases"] })}
            className="gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Loading releases...</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-semibold">Failed to load releases</h3>
          </div>
          <p className="mt-2 text-sm">
            {error instanceof Error ? error.message : "An error occurred fetching release history."}
          </p>
        </div>
      ) : !releases || releases.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Clock className="w-12 h-12 text-muted-foreground/40 mx-auto" />
          <h3 className="mt-4 font-semibold text-foreground">No releases yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish your draft changes to create the first release snapshot.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Version</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Deployed</TableHead>
                <TableHead>Error Details</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((release) => {
                const isFailed = release.status === "failed";
                const isRetrying = retryingId === release.id;

                return (
                  <TableRow key={release.id}>
                    {/* Version */}
                    <TableCell className="font-semibold text-foreground">
                      v{release.version}
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>{getStatusBadge(release.status)}</TableCell>

                    {/* Created */}
                    <TableCell className="text-sm text-muted-foreground">
                      <div>
                        {format(new Date(release.created_at), "MMM d, yyyy HH:mm")}
                      </div>
                      <div className="text-xs text-muted-foreground/75">
                        {formatDistanceToNow(new Date(release.created_at), { addSuffix: true })}
                      </div>
                    </TableCell>

                    {/* Deployed */}
                    <TableCell className="text-sm text-muted-foreground">
                      {release.deployed_at ? (
                        <>
                          <div>{format(new Date(release.deployed_at), "MMM d, yyyy HH:mm")}</div>
                          <div className="text-xs text-muted-foreground/75">
                            {formatDistanceToNow(new Date(release.deployed_at), { addSuffix: true })}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not deployed</span>
                      )}
                    </TableCell>

                    {/* Error info */}
                    <TableCell className="max-w-xs text-xs text-destructive truncate">
                      {release.error ? (
                        <span title={release.error} className="font-mono bg-destructive/10 px-2 py-1 rounded">
                          {release.error}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Retry button for failed release */}
                        {isFailed && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRetrying}
                            onClick={() => handleRetry(release)}
                            className="h-8 gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700"
                          >
                            {isRetrying ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            Retry
                          </Button>
                        )}

                        {/* Admin Rollback button for non-current live / older releases */}
                        {isAdmin && release.status === "live" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRollbackTarget(release)}
                            className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Rollback content and draft to this version"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rollback Strong Confirm Dialog */}
      <Dialog open={Boolean(rollbackTarget)} onOpenChange={(open) => !open && setRollbackTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-6 h-6" />
              <DialogTitle>Confirm Rollback to v{rollbackTarget?.version}</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm space-y-2">
              <span className="block font-medium text-foreground">
                This is a high-impact operation.
              </span>
              <span className="block text-muted-foreground">
                Rolling back to version <strong>v{rollbackTarget?.version}</strong> will:
              </span>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                <li>
                  Restore the snapshot taken at version <strong>v{rollbackTarget?.version}</strong>.
                </li>
                <li>
                  <strong>OVERWRITE</strong> all currently published content in the database.
                </li>
                <li>
                  <strong>RESTORE DRAFT CONTENT</strong> across all content types to match this historical version. Any unpublished work in progress will be lost.
                </li>
                <li>
                  Trigger an automated rebuild and deployment to take this version live.
                </li>
              </ul>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={isRollingBack}
              onClick={() => setRollbackTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isRollingBack}
              onClick={handleRollback}
              className="gap-2"
            >
              {isRollingBack && <Loader2 className="w-4 h-4 animate-spin" />}
              Yes, Rollback Everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
