/**
 * Shared utilities for file processing (drop zone, paste, file picker)
 */
import { FILE_LIMITS } from "@nodes/core";
import type { PendingAttachment } from "../components/channel/FileAttachmentButton";

/**
 * Check if MIME type is an allowed image type
 */
export function isImageType(mimeType: string): boolean {
  return FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(mimeType as any);
}

/**
 * Check if MIME type is allowed for upload
 */
export function isAllowedType(mimeType: string): boolean {
  return FILE_LIMITS.ALLOWED_FILE_TYPES.includes(mimeType as any);
}

/**
 * Get dimensions of an image file
 */
export async function getImageDimensions(
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

/**
 * Generate a thumbnail from an image file
 */
export async function generateThumbnail(file: File): Promise<Uint8Array> {
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

/**
 * Process files into PendingAttachment objects
 * Used by paste, drop zone, and file picker
 */
export async function processFilesToAttachments(
  files: File[],
  maxFiles: number,
  currentCount: number
): Promise<PendingAttachment[]> {
  const remaining = maxFiles - currentCount;
  const filesToProcess = files.slice(0, remaining);
  const pending: PendingAttachment[] = [];

  for (const file of filesToProcess) {
    // Validate size (warn but don't block for images > 5MB)
    if (file.size > FILE_LIMITS.MAX_FILE_SIZE) {
      console.warn(`File ${file.name} exceeds size limit`);
      continue;
    }

    // Validate type - allow all image types for paste even if not in allowed list
    const isImage = file.type.startsWith("image/");
    if (!isAllowedType(file.type) && !isImage) {
      console.warn(`File ${file.name} has unsupported type: ${file.type}`);
      continue;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let thumbnail: Uint8Array | undefined;
    let width: number | undefined;
    let height: number | undefined;

    // Process images
    if (isImage) {
      try {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;

        // Generate thumbnail for images (skip for small images)
        if (file.size > 50 * 1024) {
          thumbnail = await generateThumbnail(file);
        }
      } catch (err) {
        console.warn("Failed to process image:", err);
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

  return pending;
}
