"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type {
  ContentType,
  ContentItem,
  Overview,
  PublishPreviewResponse,
  Release,
  UserProfile,
} from "@/types/cms";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            retry: (failureCount, error: unknown) => {
              const status = (error as { status?: number })?.status;
              if (status === 401 || status === 403 || status === 404) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Current User & Profile Hook
export function useCurrentUser() {
  return useQuery<UserProfile>({
    queryKey: ["currentUser"],
    queryFn: () => api.me(),
    staleTime: 60 * 1000,
  });
}

// Content Types Hooks
export function useContentTypes() {
  return useQuery<ContentType[]>({
    queryKey: ["contentTypes"],
    queryFn: () => api.getContentTypes(),
  });
}

export function useContentType(key: string) {
  return useQuery<ContentType>({
    queryKey: ["contentTypes", key],
    queryFn: () => api.getContentType(key),
    enabled: Boolean(key),
  });
}

// Content Items Hooks
export function useContentItems(type: string) {
  return useQuery<ContentItem[]>({
    queryKey: ["contentItems", type],
    queryFn: () => api.getContentItems(type),
    enabled: Boolean(type),
  });
}

export function useContentItem(type: string, id: string) {
  return useQuery<ContentItem>({
    queryKey: ["contentItem", type, id],
    queryFn: () => api.getContentItem(type, id),
    enabled: Boolean(type && id),
  });
}

// Overview Hook
export function useOverview(options?: { refetchInterval?: number }) {
  return useQuery<Overview>({
    queryKey: ["overview"],
    queryFn: () => api.getOverview(),
    refetchInterval: options?.refetchInterval,
  });
}

// Publish Preview Hook
export function usePublishPreview(options?: { enabled?: boolean }) {
  return useQuery<PublishPreviewResponse>({
    queryKey: ["publishPreview"],
    queryFn: () => api.getPublishPreview(),
    enabled: options?.enabled !== false,
  });
}

// Releases Hooks
export function useReleases(options?: { refetchInterval?: number }) {
  return useQuery<Release[]>({
    queryKey: ["releases"],
    queryFn: () => api.getReleases(),
    refetchInterval: options?.refetchInterval,
  });
}

export function useReleaseStatus(
  id: string | null,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: ["releaseStatus", id],
    queryFn: () => (id ? api.getReleaseStatus(id) : null),
    enabled: Boolean(id && options?.enabled !== false),
    refetchInterval: options?.refetchInterval ?? 5000,
  });
}
