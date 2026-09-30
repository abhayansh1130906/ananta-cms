"use client";

import Link from "next/link";
import {
  Layers,
  Plus,
  Edit,
  ExternalLink,
  Loader2,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

import { useContentTypes, useCurrentUser } from "@/lib/query";

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

export default function ContentTypesListPage() {
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const isAdmin = user?.role === "admin";

  const { data: contentTypes, isLoading, error } = useContentTypes();

  if (!isUserLoading && !isAdmin) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center max-w-lg mx-auto my-12">
        <ShieldAlert className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h2 className="text-lg font-bold text-foreground">Admin Only</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You must have administrator privileges to view or manage content type schemas.
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/dashboard">Back to Overview</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Content Types</h1>
          <p className="text-sm text-muted-foreground">
            Configure data schemas, validation rules, and field structures.
          </p>
        </div>

        <Button asChild className="gap-1.5 self-start sm:self-auto">
          <Link href="/dashboard/content-types/new">
            <Plus className="w-4 h-4" />
            New Content Type
          </Link>
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Loading content types...</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-semibold">Failed to load content types</h3>
          </div>
          <p className="mt-2 text-sm">
            {error instanceof Error ? error.message : "An error occurred fetching schemas."}
          </p>
        </div>
      ) : !contentTypes || contentTypes.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <Layers className="w-12 h-12 text-muted-foreground/40 mx-auto" />
          <h3 className="mt-4 font-semibold text-foreground">No content types defined</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first content type to start authoring content.
          </p>
          <Button asChild className="mt-4 gap-1.5" size="sm">
            <Link href="/dashboard/content-types/new">
              <Plus className="w-4 h-4" />
              Create Content Type
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key Identifier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contentTypes.map((ct) => (
                <TableRow key={ct.key}>
                  {/* Name */}
                  <TableCell className="font-medium text-foreground">
                    <Link
                      href={`/dashboard/content-types/${ct.key}`}
                      className="hover:underline flex items-center gap-2"
                    >
                      <Layers className="w-4 h-4 text-primary" />
                      {ct.name}
                    </Link>
                  </TableCell>

                  {/* Key */}
                  <TableCell>
                    <code className="text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground">
                      {ct.key}
                    </code>
                  </TableCell>

                  {/* Singleton Badge */}
                  <TableCell>
                    {ct.is_singleton ? (
                      <Badge variant="secondary" className="text-xs">
                        Singleton
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Collection
                      </Badge>
                    )}
                  </TableCell>

                  {/* Fields Count */}
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{ct.fields?.length || 0}</span> fields
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        title="View Content Entries"
                      >
                        <Link href={`/dashboard/${ct.key}`}>
                          <ExternalLink className="w-3.5 h-3.5" />
                          Entries
                        </Link>
                      </Button>

                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs gap-1"
                        title="Edit Schema"
                      >
                        <Link href={`/dashboard/content-types/${ct.key}`}>
                          <Edit className="w-3.5 h-3.5" />
                          Edit
                        </Link>
                      </Button>
                    </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
  );
}
