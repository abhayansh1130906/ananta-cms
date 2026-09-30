"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { ImageValue } from "@/types/cms";

interface ImageFieldProps {
  value?: ImageValue | null;
  onChange: (val: ImageValue | null) => void;
  disabled?: boolean;
}

export function ImageField({ value, onChange, disabled = false }: ImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUrl = value?.url || "";
  const currentAlt = value?.alt || "";

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5 MB limit");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate MIME
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/avif"];
    if (!allowed.includes(file.type.toLowerCase())) {
      toast.error("Unsupported file type. Please select PNG, JPEG, WebP, or AVIF.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const uploaded = await api.uploadMedia(file, currentAlt || undefined, (pct) => {
        setProgress(pct);
      });

      onChange({
        url: uploaded.public_url,
        alt: currentAlt || "",
      });
      toast.success("Image uploaded successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload image";
      toast.error(msg);
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAltChange = (alt: string) => {
    if (currentUrl) {
      onChange({
        url: currentUrl,
        alt,
      });
    }
  };

  const handleRemove = () => {
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      {/* Upload or Preview Display */}
      {currentUrl ? (
        <div className="flex flex-col sm:flex-row gap-4 p-3 border rounded-xl bg-card items-start">
          <div className="relative h-28 w-28 rounded-lg overflow-hidden border bg-muted/30 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUrl}
              alt={currentAlt || "Uploaded image"}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="flex-1 space-y-2 w-full min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono truncate text-muted-foreground max-w-[200px] sm:max-w-xs">
                {currentUrl.split("/").pop()}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive h-7 px-2 hover:bg-destructive/10"
                onClick={handleRemove}
                disabled={disabled}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Alt Text (accessibility description)
              </label>
              <Input
                type="text"
                placeholder="Describe image for screen readers"
                value={currentAlt}
                onChange={(e) => handleAltChange(e.target.value)}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            className="hidden"
            onChange={handleFileSelect}
            disabled={disabled || uploading}
          />

          <div
            onClick={() => !uploading && !disabled && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
              uploading
                ? "border-primary/50 bg-primary/5 cursor-wait"
                : disabled
                ? "opacity-50 cursor-not-allowed bg-muted/10"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-xs font-medium">Uploading to storage... {progress}%</p>
                <div className="w-40 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Click to choose image</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    PNG, JPEG, WebP, or AVIF (max 5 MB)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
