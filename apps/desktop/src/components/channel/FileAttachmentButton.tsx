import { useRef } from "react";
import { FILE_LIMITS } from "@nodes/core";

interface FileAttachmentButtonProps {
  onFilesSelected: (files: PendingAttachment[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  currentCount?: number;
}

/**
 * Pending attachment before it's uploaded to IPFS.
 * Contains the file, processed bytes, and optional thumbnail.
 */
export interface PendingAttachment {
  id: string;
  file: File;
  bytes: Uint8Array;
  thumbnail?: Uint8Array;
  width?: number;
  height?: number;
  previewUrl: string; // Object URL for preview (revoke after send!)
}

/**
 * FileAttachmentButton opens a file picker for attaching files to messages.
 *
 * - Validates file size and type
 * - Generates thumbnails for images
 * - Shows a paperclip icon button
 */
export function FileAttachmentButton({
  onFilesSelected,
  disabled = false,
  maxFiles = FILE_LIMITS.MAX_FILES_PER_MESSAGE,
  currentCount = 0,
}: FileAttachmentButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
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
          // Only thumbnail if > 50KB
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
      onFilesSelected(pending);
    }

    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  const remainingSlots = maxFiles - currentCount;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={FILE_LIMITS.ALLOWED_FILE_TYPES.join(",")}
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || remainingSlots <= 0}
        className={`p-2 rounded-lg transition-colors shrink-0 ${
          disabled || remainingSlots <= 0
            ? "text-text-muted cursor-not-allowed opacity-50"
            : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
        }`}
        title={
          remainingSlots <= 0
            ? `Maximum ${maxFiles} files per message`
            : "Attach file"
        }
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
      </button>
    </>
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
