import { useEffect, useCallback, useState } from "react";
import type { FileAttachment } from "@nodes/core";

interface ImageLightboxProps {
  attachment: FileAttachment;
  imageUrl: string;
  onClose: () => void;
}

/**
 * ImageLightbox displays a full-screen image viewer.
 *
 * - Dark overlay background
 * - Image centered and scaled to fit viewport
 * - Close on Escape, click outside, or close button
 * - Download button
 * - Shows filename and size
 */
export function ImageLightbox({
  attachment,
  imageUrl,
  onClose,
}: ImageLightboxProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = attachment.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-fade-in"
      onClick={handleOverlayClick}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
        title="Close (Escape)"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image container */}
      <div className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center">
        {/* Loading indicator */}
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Image */}
        <img
          src={imageUrl}
          alt={attachment.filename}
          className={`max-w-full max-h-[85vh] object-contain rounded-lg transition-opacity duration-200 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setIsLoaded(true)}
          style={{ transform: isLoaded ? "scale(1)" : "scale(0.95)" }}
        />

        {/* Info bar */}
        <div className="absolute bottom-0 left-0 right-0 translate-y-full pt-4 flex items-center justify-center gap-4">
          <div className="text-white/80 text-sm">
            <span className="font-medium">{attachment.filename}</span>
            <span className="mx-2">•</span>
            <span>{formatFileSize(attachment.size)}</span>
            {attachment.width && attachment.height && (
              <>
                <span className="mx-2">•</span>
                <span>{attachment.width} × {attachment.height}</span>
              </>
            )}
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
