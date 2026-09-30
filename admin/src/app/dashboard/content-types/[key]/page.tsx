"use client";

import { use } from "react";
import Link from "next/link";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";

import { useContentType } from "@/lib/query";
import { ContentTypeEditor } from "@/components/content/content-type-editor";
import { Button } from "@/components/ui/button";

export default function EditContentTypePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const { data: contentType, isLoading, error } = useContentType(key);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Loading content type schema...</p>
      </div>
    );
  }

  if (error || !contentType) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center max-w-lg mx-auto my-12">
        <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h2 className="text-lg font-bold text-foreground">Content Type Not Found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : `Content type '${key}' does not exist.`}
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/dashboard/content-types">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Content Types
          </Link>
        </Button>
      </div>
    );
  }

  return <ContentTypeEditor initialData={contentType} isEdit={true} />;
}
