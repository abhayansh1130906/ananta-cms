"use client";

import { use } from "react";
import Link from "next/link";
import { useContentType, useContentItem } from "@/lib/query";
import { formatTime12h } from "@/lib/format";
import { sanitizeRichtext } from "@/lib/content/sanitize";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Eye,
  Loader2,
} from "lucide-react";

export default function DraftPreviewPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = use(params);

  const { data: contentType, isLoading: typeLoading } = useContentType(type);
  const { data: item, isLoading: itemLoading } = useContentItem(type, id);

  if (typeLoading || itemLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Loading draft preview...</p>
      </div>
    );
  }

  if (!item || !contentType) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Draft not found</h2>
        <Button asChild className="mt-4">
          <Link href={`/dashboard/${type}`}>Back to items</Link>
        </Button>
      </div>
    );
  }

  const data = (item.draft_data as Record<string, unknown>) || {};

  const title = (data.title || data.name || data.question || data.day || item.slug) as string;
  const imageObj = (data.banner || data.hero_image || data.photo) as { url?: string; alt?: string } | undefined;
  const richtextContent = (data.description || data.body || data.answer) as string | undefined;
  const eventDate = typeof data.date === "string" ? data.date : undefined;
  const eventTime = typeof data.time === "string" ? data.time : undefined;
  const eventVenue = typeof data.venue === "string" ? data.venue : undefined;
  const isPinned = Boolean(data.pinned);
  const userRole = typeof data.role === "string" ? data.role : undefined;
  const slots = Array.isArray(data.slots)
    ? (data.slots as Array<{ time?: string; title?: string; location?: string }>)
    : [];

  const registrationUrl = typeof data.registration_url === "string" ? data.registration_url : undefined;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Preview Notification Banner */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-sm">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <span className="font-medium">Draft Preview Mode</span>
          <Badge variant="outline" className="text-xs font-mono ml-1">
            v{item.version}
          </Badge>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link href={`/dashboard/${type}/${id}`}>Return to Editor</Link>
        </Button>
      </div>

      {/* Rendered Live Preview Card */}
      <article className="border rounded-2xl bg-card overflow-hidden shadow-md">
        {/* Banner image */}
        {imageObj?.url && (
          <div className="relative w-full h-64 sm:h-80 bg-muted/30 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageObj.url}
              alt={imageObj.alt || title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header & Meta badges */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="capitalize text-xs">
                {contentType.name.replace(/s$/, "")}
              </Badge>
              {isPinned && <Badge variant="default">Pinned</Badge>}
              {userRole && <Badge variant="outline">{userRole}</Badge>}
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {title}
            </h1>

            {/* Event details row */}
            {(eventDate || eventTime || eventVenue) && (
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
                {eventDate && (
                  <div className="flex items-center gap-1.5 font-medium">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>{eventDate}</span>
                  </div>
                )}
                {eventTime && (
                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock className="h-4 w-4 text-primary" />
                    <span>{formatTime12h(eventTime)}</span>
                  </div>
                )}
                {eventVenue && (
                  <div className="flex items-center gap-1.5 font-medium">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>{eventVenue}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Richtext body */}
          {richtextContent && (
            <div
              className="prose prose-zinc dark:prose-invert max-w-none pt-2"
              dangerouslySetInnerHTML={{
                __html: sanitizeRichtext(richtextContent),
              }}
            />
          )}

          {/* List items (e.g. Schedule slots) */}
          {slots.length > 0 && (
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-lg font-semibold">Schedule Slots</h3>
              <div className="divide-y border rounded-xl overflow-hidden bg-muted/10">
                {slots.map((slot, idx: number) => (
                  <div key={idx} className="p-3 sm:p-4 flex items-start gap-4">
                    {slot.time && (
                      <span className="font-mono text-sm font-semibold text-primary shrink-0">
                        {formatTime12h(slot.time)}
                      </span>
                    )}
                    <div>
                      <p className="font-medium text-sm">{slot.title || "Untitled Slot"}</p>
                      {slot.location && (
                        <p className="text-xs text-muted-foreground mt-0.5">{slot.location}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Registration / External Link */}
          {registrationUrl && (
            <div className="pt-4 border-t">
              <Button asChild className="gap-2">
                <a href={registrationUrl} target="_blank" rel="noopener noreferrer">
                  <span>Register Now</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
