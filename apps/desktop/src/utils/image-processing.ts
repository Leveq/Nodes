import { FILE_LIMITS } from "@nodes/core";

/**
 * Image processing utilities for avatars and thumbnails.
 * All processing happens client-side — no server involved.
 */

/**
 * Resize an image file to specific dimensions.
 * Returns a Uint8Array of the resized image (PNG).
 */
export async function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;

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

      // Export as PNG Uint8Array
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to resize image"));
            return;
          }
          blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
        },
        "image/png",
        0.9
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Resize an image from a Uint8Array.
 */
export async function resizeImageFromBytes(
  data: Uint8Array,
  mimeType: string,
  maxWidth: number,
  maxHeight: number
): Promise<Uint8Array> {
  const blob = new Blob([data], { type: mimeType });
  const file = new File([blob], "image", { type: mimeType });
  return resizeImage(file, maxWidth, maxHeight);
}

/**
 * Process a user avatar:
 * - Validate type and size
 * - Resize to 256x256 (full) and 64x64 (small)
 * - Return both as Uint8Arrays
 */
export async function processAvatar(
  file: File
): Promise<{ full: Uint8Array; small: Uint8Array }> {
  // Validate type
  if (!FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
    throw new Error("Invalid image type. Use PNG, JPG, GIF, or WebP.");
  }

  // Validate size
  if (file.size > FILE_LIMITS.MAX_AVATAR_SIZE) {
    throw new Error(
      `Avatar too large. Maximum size is ${FILE_LIMITS.MAX_AVATAR_SIZE / 1024 / 1024}MB.`
    );
  }

  const full = await resizeImage(
    file,
    FILE_LIMITS.AVATAR_FULL_SIZE,
    FILE_LIMITS.AVATAR_FULL_SIZE
  );
  const small = await resizeImage(
    file,
    FILE_LIMITS.AVATAR_SMALL_SIZE,
    FILE_LIMITS.AVATAR_SMALL_SIZE
  );

  return { full, small };
}

/**
 * Process an avatar from an already-cropped Blob.
 * Used after the crop modal to resize to final dimensions.
 */
export async function processAvatarFromBlob(
  blob: Blob
): Promise<{ full: Uint8Array; small: Uint8Array }> {
  // Convert Blob to File for resizeImage compatibility
  const file = new File([blob], "avatar.png", { type: blob.type || "image/png" });

  const full = await resizeImage(
    file,
    FILE_LIMITS.AVATAR_FULL_SIZE,
    FILE_LIMITS.AVATAR_FULL_SIZE
  );
  const small = await resizeImage(
    file,
    FILE_LIMITS.AVATAR_SMALL_SIZE,
    FILE_LIMITS.AVATAR_SMALL_SIZE
  );

  return { full, small };
}

/**
 * Generate a thumbnail for an image attachment.
 * Returns the thumbnail as Uint8Array.
 */
export async function generateThumbnail(file: File): Promise<Uint8Array> {
  return resizeImage(file, FILE_LIMITS.THUMBNAIL_MAX_WIDTH, 600);
}

/**
 * Generate a thumbnail from raw bytes.
 */
export async function generateThumbnailFromBytes(
  data: Uint8Array,
  mimeType: string
): Promise<Uint8Array> {
  const blob = new Blob([data], { type: mimeType });
  const file = new File([blob], "image", { type: mimeType });
  return generateThumbnail(file);
}

/**
 * Get image dimensions from a file.
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
 * Get image dimensions from a Uint8Array.
 */
export async function getImageDimensionsFromBytes(
  data: Uint8Array,
  mimeType: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();

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
 * Check if a MIME type is an image.
 */
export function isImageType(mimeType: string): boolean {
  return FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(mimeType as any);
}

/**
 * Check if a MIME type is allowed.
 */
export function isAllowedFileType(mimeType: string): boolean {
  return FILE_LIMITS.ALLOWED_FILE_TYPES.includes(mimeType as any);
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get a file type icon name based on MIME type.
 */
export function getFileTypeIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "file-text";
  if (mimeType === "text/plain") return "file-text";
  if (mimeType === "application/zip") return "archive";
  return "file";
}

/**
 * Convert a File to Uint8Array.
 */
export async function fileToUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Convert a Uint8Array to a data URL.
 */
export function uint8ArrayToDataUrl(
  data: Uint8Array,
  mimeType: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data], { type: mimeType });
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      reject(new Error("Failed to convert to data URL"));
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a Uint8Array to an object URL for rendering.
 * Remember to call URL.revokeObjectURL when done!
 */
export function uint8ArrayToObjectUrl(
  data: Uint8Array,
  mimeType: string
): string {
  const blob = new Blob([data], { type: mimeType });
  return URL.createObjectURL(blob);
}
