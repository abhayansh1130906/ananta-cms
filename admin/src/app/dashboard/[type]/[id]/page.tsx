"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useContentType, useContentItem } from "@/lib/query";
import { api, VersionConflictError } from "@/lib/api";
import { toKebabCase } from "@/lib/content/slug";
import { DynamicForm } from "@/components/form/dynamic-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  AlertCircle,
  Eye,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ContentItem } from "@/types/cms";

export default function EditContentItemPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = use(params);
  const queryClient = useQueryClient();

  const { data: contentType, isLoading: typeLoading } = useContentType(type);
  const { data: item, isLoading: itemLoading, refetch: refetchItem } = useContentItem(type, id);

  const [prevItem, setPrevItem] = useState(item);
  const [slug, setSlug] = useState(() => item?.slug || "");
  const [saving, setSaving] = useState(false);
  const [conflictTarget, setConflictTarget] = useState<ContentItem | null>(null);
  const [stashedData, setStashedData] = useState<Record<string, unknown> | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Sync item data into local states
  if (item && item !== prevItem) {
    setPrevItem(item);
    setSlug(item.slug || "");
  }

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  if (typeLoading || itemLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
        <div className="h-96 border rounded-xl bg-card animate-pulse" />
      </div>
    );
  }

  if (!contentType || !item) {
    return (
      <div className="p-8 text-center border rounded-xl bg-card">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <h2 className="text-lg font-semibold">Content Item Not Found</h2>
        <Button asChild className="mt-4">
          <Link href={`/dashboard/${type}`}>Back to {contentType?.name || "List"}</Link>
        </Button>
      </div>
    );
  }

  const handleSave = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.updateContentItem(type, id, item.version, {
        slug: slug.trim() ? toKebabCase(slug.trim()) : undefined,
        data,
      });

      setIsDirty(false);
      toast.success("Draft saved successfully");
      queryClient.invalidateQueries({ queryKey: ["contentItem", type, id] });
      queryClient.invalidateQueries({ queryKey: ["contentItems", type] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["publishPreview"] });
    } catch (err: unknown) {
      if (err instanceof VersionConflictError) {
        setStashedData(data);
        setConflictTarget(err.current || null);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to update item";
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Reload latest from server
  const handleReloadLatest = async () => {
    await refetchItem();
    setConflictTarget(null);
    setStashedData(null);
    setIsDirty(false);
    toast.info("Reloaded latest version from server");
  };

  // Overwrite: fetch latest version number and resubmit stashed data
  const handleOverwrite = async () => {
    if (!stashedData) return;
    setSaving(true);
    try {
      const latest = await api.getContentItem(type, id);
      await api.updateContentItem(type, id, latest.version, {
        slug: slug.trim() ? toKebabCase(slug.trim()) : undefined,
        data: stashedData,
      });

      setIsDirty(false);
      setConflictTarget(null);
      setStashedData(null);
      toast.success("Successfully overwritten with your changes");
      queryClient.invalidateQueries({ queryKey: ["contentItem", type, id] });
      queryClient.invalidateQueries({ queryKey: ["contentItems", type] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to overwrite changes";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Bar with Navigation and Preview */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {!contentType.is_singleton ? (
          <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground">
            <Link href={`/dashboard/${type}`}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back to {contentType.name}</span>
            </Link>
          </Button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/dashboard/${type}/${id}/preview`} target="_blank">
              <Eye className="h-4 w-4" />
              <span>Preview Draft</span>
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border shadow-xs">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">
                  Edit {contentType.name.replace(/s$/, "")}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  v{item.version}
                </Badge>
                {item.has_unpublished_changes && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10 text-xs">
                    Unpublished changes
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1">
                Content writes touch draft data only. Promoted upon next publish.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Slug input field */}
          <div className="space-y-1.5 p-4 rounded-xl border bg-muted/20">
            <div className="flex items-center justify-between">
              <label htmlFor="slug" className="text-sm font-medium flex items-center gap-1.5">
                <span>URL Slug</span>
              </label>
              <span className="text-xs font-mono text-muted-foreground">
                /{type}/{slug}
              </span>
            </div>
            <Input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(toKebabCase(e.target.value));
                setIsDirty(true);
              }}
              className="font-mono text-sm"
              disabled={saving}
            />
          </div>

          {/* Dynamic Form */}
          <DynamicForm
            fields={contentType.fields}
            initialData={(item.draft_data as Record<string, unknown>) || {}}
            onSubmit={handleSave}
            loading={saving}
            submitLabel="Save Draft"
            onDirtyChange={setIsDirty}
          />
        </CardContent>
      </Card>

      {/* 409 VERSION_CONFLICT CONCURRENCY DIALOG */}
      <Dialog open={Boolean(conflictTarget)} onOpenChange={(open) => !open && setConflictTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Changed by Someone Else
            </DialogTitle>
            <DialogDescription>
              Another user updated this record (current server version is{" "}
              <strong className="font-mono">v{conflictTarget?.version}</strong>).
              Your current changes were not saved to avoid overwriting their work.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-sm text-muted-foreground">
            You can either reload the latest data from the server or choose to overwrite it with your edits.
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleReloadLatest} disabled={saving} className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Reload Latest
            </Button>
            <Button variant="destructive" onClick={handleOverwrite} disabled={saving}>
              {saving ? "Overwriting..." : "Overwrite With My Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
