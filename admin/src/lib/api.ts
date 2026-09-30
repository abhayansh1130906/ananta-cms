import type {
  ContentType,
  ContentItem,
  Field,
  PublishPreviewResponse,
  Release,
  ReleaseStatus,
  Overview,
  UserProfile,
} from "@/types/cms";

export class ApiError extends Error {
  status: number;
  code: string;
  data?: unknown;

  constructor(status: number, message: string, code = "API_ERROR", data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export class VersionConflictError extends ApiError {
  current?: ContentItem;

  constructor(message: string, code = "VERSION_CONFLICT", current?: ContentItem) {
    super(409, message, code, { current });
    this.name = "VersionConflictError";
    this.current = current;
  }
}

const API_BASE = "/api/v1";

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith("/login")) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
    }
    throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  }

  let data: unknown = null;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  const errData = data as { error?: string; code?: string; current?: ContentItem } | null;

  if (!res.ok) {
    const errorMsg = errData?.error || res.statusText || "Request failed";
    const errorCode = errData?.code || `HTTP_${res.status}`;

    if (res.status === 409 && errorCode === "VERSION_CONFLICT") {
      throw new VersionConflictError(errorMsg, errorCode, errData?.current);
    }

    throw new ApiError(res.status, errorMsg, errorCode, data);
  }

  return data as T;
}

export const api = {
  // Current user & profile
  me: () => request<UserProfile>("/me"),

  // Content Types
  getContentTypes: () => request<ContentType[]>("/content-types"),
  getContentType: (key: string) => request<ContentType>(`/content-types/${key}`),
  createContentType: (data: {
    key: string;
    name: string;
    is_singleton?: boolean;
    fields?: Field[];
  }) =>
    request<ContentType>("/content-types", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateContentType: (
    key: string,
    data: {
      name?: string;
      is_singleton?: boolean;
      fields?: Field[];
    }
  ) =>
    request<ContentType>(`/content-types/${key}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Content Items
  getContentItems: (type: string) => request<ContentItem[]>(`/content/${type}`),
  getContentItem: (type: string, id: string) =>
    request<ContentItem>(`/content/${type}/${id}`),
  createContentItem: (
    type: string,
    data: { slug?: string; data: Record<string, unknown> }
  ) =>
    request<ContentItem>(`/content/${type}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateContentItem: (
    type: string,
    id: string,
    version: number,
    updates: {
      data?: Record<string, unknown>;
      slug?: string;
      sort_order?: number;
    }
  ) =>
    request<ContentItem>(`/content/${type}/${id}`, {
      method: "PUT",
      headers: {
        "If-Match": String(version),
      },
      body: JSON.stringify(updates),
    }),
  deleteContentItem: (type: string, id: string) =>
    request<{ success: boolean; item: ContentItem }>(`/content/${type}/${id}`, {
      method: "DELETE",
    }),
  reorderContentItems: (type: string, ids: string[]) =>
    request<{ success: boolean; reordered: number }>(`/content/${type}/reorder`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  // Media
  signMedia: (data: { filename: string; mime: string; size: number }) =>
    request<{ signedUrl: string; token: string; path: string; filename: string }>(
      "/media/sign",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
  registerMedia: (data: { path: string; alt?: string }) =>
    request<{ id: string; public_url: string }>("/media", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listMedia: () => request<Array<{ id: string; storage_path: string; public_url: string; alt_text?: string }>>("/media"),

  // Direct media upload with progress
  uploadMedia: async (
    file: File,
    alt?: string,
    onProgress?: (progress: number) => void
  ): Promise<{ id: string; public_url: string; alt?: string }> => {
    // 1. Check size client-side (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("File size exceeds 5 MB limit");
    }

    // 2. Check MIME
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/avif"];
    if (!allowed.includes(file.type.toLowerCase())) {
      throw new Error("Unsupported image format. Allowed: PNG, JPEG, WebP, AVIF.");
    }

    // 3. Get signed URL
    const { signedUrl, path } = await api.signMedia({
      filename: file.name,
      mime: file.type,
      size: file.size,
    });

    // 4. PUT file directly to Supabase signed URL with XMLHttpRequest for progress
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signedUrl);
      xhr.setRequestHeader("Content-Type", file.type);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Direct storage upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during direct storage upload"));
      xhr.send(file);
    });

    // 5. Register uploaded media object in database
    const registered = await api.registerMedia({
      path,
      alt,
    });

    return {
      id: registered.id,
      public_url: registered.public_url,
      alt,
    };
  },

  // Publishing & Releases
  getPublishPreview: () => request<PublishPreviewResponse>("/publish/preview"),
  publish: () =>
    request<{ release_id: string; version: number }>("/publish", {
      method: "POST",
    }),
  getReleases: () => request<Release[]>("/releases"),
  getReleaseStatus: (id: string) =>
    request<{
      status: ReleaseStatus;
      version: number;
      deployed_at?: string | null;
      error?: string | null;
      note?: string;
    }>(`/releases/${id}/status`),
  retryRelease: (id: string) =>
    request<{ success: boolean; release_id: string; status: string }>(
      `/releases/${id}/retry`,
      { method: "POST" }
    ),
  rollbackRelease: (id: string) =>
    request<{ release_id: string; version: number }>(
      `/releases/${id}/rollback`,
      { method: "POST" }
    ),

  // Overview
  getOverview: () => request<Overview>("/overview"),
};
