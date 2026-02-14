import { useState, useCallback, type ReactNode, type DragEvent } from "react";
import { FILE_LIMITS } from "@nodes/core";
import type { PendingAttachment } from "./FileAttachmentButton";

interface DropZoneProps {
  children: ReactNode;
  onFilesDropped: (files: PendingAttachment[]) => void;
  maxFiles?: number;
  currentCount?: number;
  disabled?: boolean;
}

/**
 * DropZone wraps content and handles drag-and-drop file uploads.
 *
 * - Shows overlay when files are dragged over
 * - Validates file size and type on drop
 * - Generates thumbnails for images
 */
export function DropZone({
  children,
  onFilesDropped,
  maxFiles = FILE_LIMITS.MAX_FILES_PER_MESSAGE,
  currentCount = 0,
  disabled = false,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_dragCounter, setDragCounter] = useState(0);

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      setDragCounter((c) => c + 1);
      if (e.dataTransfer?.items?.length) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter((c) => {
      const newCount = c - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(false);
      setDragCounter(0);

      if (disabled) return;

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const remaining = maxFiles - currentCount;
      const filesToProcess = Array.from(files).slice(0, remaining);

      const pending: PendingAttachment[] = [];

      for (const file of filesToProcess) {
        // Validate size
        if (file.size > FILE_LIMITS.MAX_FILE_SIZE) {
          console.warn(`File ${file.name} exceeds size limit`);
          continue;
        }

        // Validate type
        if (!isAllowedType(file.type)) {
          console.warn(`File ${file.name} has unsupported type: ${file.type}`);
          continue;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        let thumbnail: Uint8Array | undefined;
        let width: number | undefined;
        let height: number | undefined;

        // Process images
        if (isImageType(file.type)) {
          const dims = await getImageDimensions(file);
          width = dims.width;
          height = dims.height;

          // Generate thumbnail for images (skip for small images)
          if (file.size > 50 * 1024) {
            thumbnail = await generateThumbnail(file);
          }
        }

        const previewUrl = URL.createObjectURL(file);

        pending.push({
          id: `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          file,
          bytes,
          thumbnail,
          width,
          height,
          previewUrl,
        });
      }

      if (pending.length > 0) {
        onFilesDropped(pending);
      }
    },
    [disabled, maxFiles, currentCount, onFilesDropped]
  );

  return (
    <div
      className="relative h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drop overlay */}
      {isDragging && !disabled && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-accent-primary/10 border-2 border-dashed border-accent-primary rounded-lg backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center gap-3 text-accent-primary">
            <svg
              className="w-16 h-16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div className="text-lg font-medium">Drop files to upload</div>
            <div className="text-sm text-text-muted">
              Max {FILE_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB per file
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper Functions ──

function isImageType(mimeType: string): boolean {
  return FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(mimeType as any);
}

function isAllowedType(mimeType: string): boolean {
  return FILE_LIMITS.ALLOWED_FILE_TYPES.includes(mimeType as any);
}

async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image dimensions"));
    };

    img.src = url;
  });
}

async function generateThumbnail(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate thumbnail dimensions
      let width = img.width;
      let height = img.height;
      const maxWidth = FILE_LIMITS.THUMBNAIL_MAX_WIDTH;
      const maxHeight = 600;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      // Draw to canvas
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Export as PNG
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to generate thumbnail"));
            return;
          }
          blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
        },
        "image/png",
        0.8
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for thumbnail"));
    };

    img.src = url;
  });
}
