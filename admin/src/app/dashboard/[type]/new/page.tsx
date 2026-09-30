"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useContentType } from "@/lib/query";
import { api } from "@/lib/api";
import { toKebabCase } from "@/lib/content/slug";
import { DynamicForm } from "@/components/form/dynamic-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function CreateContentItemPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: contentType, isLoading } = useContentType(type);

  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

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

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
        <div className="h-96 border rounded-xl bg-card animate-pulse" />
      </div>
    );
  }

  if (!contentType) {
    return (
      <div className="p-8 text-center border rounded-xl bg-card">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <h2 className="text-lg font-semibold">Content Type Not Found</h2>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Back to Overview</Link>
        </Button>
      </div>
    );
  }

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const created = await api.createContentItem(type, {
        slug: slug.trim() ? toKebabCase(slug.trim()) : undefined,
        data,
      });

      setIsDirty(false);
      toast.success("Draft created successfully");
      queryClient.invalidateQueries({ queryKey: ["contentItems", type] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["publishPreview"] });
      router.push(`/dashboard/${type}/${created.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create item";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top back button & title */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground">
          <Link href={`/dashboard/${type}`}>
            <ArrowLeft className="h-4 w-4" />
            <span>Back to {contentType.name}</span>
          </Link>
        </Button>
      </div>

      <Card className="border shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">
                Create New {contentType.name.replace(/s$/, "")}
              </CardTitle>
              <CardDescription>
                Fill in the details below. This will be saved as a draft.
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
                <span className="text-xs text-muted-foreground font-normal">
                  (auto-generated if empty)
                </span>
              </label>
              {slug && (
                <span className="text-xs font-mono text-muted-foreground">
                  /{type}/{toKebabCase(slug)}
                </span>
              )}
            </div>
            <Input
              id="slug"
              type="text"
              placeholder="e.g. hackathon-2026"
              value={slug}
              onChange={(e) => {
                setSlug(toKebabCase(e.target.value));
                setIsDirty(true);
              }}
              className="font-mono text-sm"
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              Lowercase letters, numbers, and single hyphens only.
            </p>
          </div>

          {/* Dynamic schema-driven form */}
          <DynamicForm
            fields={contentType.fields}
            onSubmit={handleFormSubmit}
            loading={submitting}
            submitLabel="Create Draft"
            onDirtyChange={setIsDirty}
          />
        </CardContent>
      </Card>
    </div>
  );
}
