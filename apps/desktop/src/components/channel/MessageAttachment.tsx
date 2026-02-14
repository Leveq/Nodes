import { useState, useEffect, useRef, useCallback } from "react";
import { FILE_LIMITS, type FileAttachment } from "@nodes/core";
import { useTransport } from "../../providers/TransportProvider";
import { getIPFSPeerAdvertiser, IPFSService } from "@nodes/transport-gun";

interface MessageAttachmentProps {
  attachment: FileAttachment;
  authorKey: string; // Public key of the message author (for peer connection)
  onImageClick?: (attachment: FileAttachment, imageUrl: string) => void;
  encrypted?: boolean;
  sharedSecret?: string;
}

/**
 * MessageAttachment renders a single attachment within a message.
 *
 * - Images render inline with lazy loading
 * - GIFs animate inline
 * - Non-image files show as downloadable cards
 * - Click on image opens lightbox
 * - Encrypted attachments show lock icon (handled by parent for decryption)
 * - Uses peer hints to connect to uploader's IPFS node before downloading
 */
export function MessageAttachment({
  attachment,
  authorKey,
  onImageClick,
  encrypted = false,
}: MessageAttachmentProps) {
  const isImage = FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(
    attachment.mimeType as any
  );

  if (isImage) {
    return (
      <ImageAttachment
        attachment={attachment}
        authorKey={authorKey}
        onImageClick={onImageClick}
        encrypted={encrypted}
      />
    );
  }

  return <FileAttachmentCard attachment={attachment} authorKey={authorKey} encrypted={encrypted} />;
}

interface ImageAttachmentProps {
  attachment: FileAttachment;
  authorKey: string;
  onImageClick?: (attachment: FileAttachment, imageUrl: string) => void;
  encrypted?: boolean;
}

function ImageAttachment({
  attachment,
  authorKey,
  onImageClick,
  encrypted,
}: ImageAttachmentProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false); // Guard against concurrent loads
  const { ipfsReady } = useTransport();

  // Use thumbnail CID if available, otherwise use main CID
  const cid = attachment.thumbnailCid || attachment.cid;

  const loadImage = useCallback(async () => {
    // Guard against concurrent loads for same CID
    if (loadingRef.current) {
      console.log('[MessageAttachment] Load already in progress for CID:', cid);
      return;
    }
    loadingRef.current = true;

    console.log('[MessageAttachment] Loading image from CID:', cid);
    console.log('[MessageAttachment] Author:', authorKey.slice(0, 12) + '...');
    try {
      setIsLoading(true);
      setError(false);

      // Step 1: Try to connect to the uploader's IPFS node first
      const advertiser = getIPFSPeerAdvertiser();
      const peerInfo = await advertiser.resolvePeerInfo(authorKey);

      let data: Uint8Array;

      if (peerInfo && peerInfo.multiaddrs.length > 0) {
        console.log('[MessageAttachment] Using peer hint with', peerInfo.multiaddrs.length, 'addrs');
        try {
          data = await IPFSService.downloadWithPeerHint(
            cid,
            peerInfo.multiaddrs,
            15000 // 15 second timeout
          );
        } catch (err) {
          console.warn('[MessageAttachment] Peer hint download failed, trying direct:', err);
          // Fall back to regular download
          data = await IPFSService.download(cid, 30000);
        }
      } else {
        console.log('[MessageAttachment] No peer info, trying direct download');
        // No peer info available - try connecting anyway
        await advertiser.connectToUser(authorKey);
        data = await IPFSService.download(cid, 30000);
      }

      console.log('[MessageAttachment] Got data:', data.length, 'bytes');
      const blob = new Blob([data]);
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (err) {
      console.error("[MessageAttachment] Failed to load image:", err);
      setError(true);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [cid, authorKey]);

  // Lazy load image using IntersectionObserver
  useEffect(() => {
    if (!ipfsReady) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          // Start loading
          loadImage();
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );

    observer.observe(container);

    return () => observer.disconnect();
  }, [cid, ipfsReady, loadImage]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleClick = async () => {
    if (!onImageClick) return;

    // If we only have a thumbnail, load the full image
    if (attachment.thumbnailCid && imageUrl) {
      try {
        const blob = await fileTransport.download(attachment.cid);
        const fullUrl = URL.createObjectURL(blob);
        onImageClick(attachment, fullUrl);
      } catch {
        // Use thumbnail as fallback
        onImageClick(attachment, imageUrl);
      }
    } else if (imageUrl) {
      onImageClick(attachment, imageUrl);
    }
  };

  // Calculate display dimensions
  const maxWidth = 400;
  const maxHeight = 300;
  let displayWidth = attachment.width || maxWidth;
  let displayHeight = attachment.height || maxHeight;

  if (displayWidth > maxWidth) {
    displayHeight = (displayHeight * maxWidth) / displayWidth;
    displayWidth = maxWidth;
  }
  if (displayHeight > maxHeight) {
    displayWidth = (displayWidth * maxHeight) / displayHeight;
    displayHeight = maxHeight;
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg overflow-hidden bg-depth-secondary cursor-pointer group"
      style={{
        width: displayWidth,
        height: displayHeight,
        minWidth: 100,
        minHeight: 100,
      }}
      onClick={handleClick}
    >
      {isLoading && (
        <div className="absolute inset-0 animate-pulse bg-surface-border" />
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-nodes-text-muted gap-2 p-2">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs text-center">Failed to load</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setError(false);
              setIsLoading(true);
              loadImage();
            }}
            className="text-xs text-nodes-primary hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {imageUrl && (
        <img
          src={imageUrl}
          alt={attachment.filename}
          className={`w-full h-full object-cover transition-opacity ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
        />
      )}

      {/* Hover overlay */}
      {imageUrl && !isLoading && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      )}

      {/* Encrypted indicator */}
      {encrypted && (
        <div className="absolute bottom-2 right-2 bg-black/50 rounded px-1.5 py-0.5 flex items-center gap-1">
          <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span className="text-xs text-white">E2E</span>
        </div>
      )}
    </div>
  );
}

interface FileAttachmentCardProps {
  attachment: FileAttachment;
  authorKey: string;
  encrypted?: boolean;
}

function FileAttachmentCard({ attachment, authorKey, encrypted }: FileAttachmentCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (isDownloading) return;

    try {
      setIsDownloading(true);

      // Try to connect to uploader's IPFS node first
      const advertiser = getIPFSPeerAdvertiser();
      const peerInfo = await advertiser.resolvePeerInfo(authorKey);

      let data: Uint8Array;
      if (peerInfo && peerInfo.multiaddrs.length > 0) {
        try {
          data = await IPFSService.downloadWithPeerHint(
            attachment.cid,
            peerInfo.multiaddrs,
            30000
          );
        } catch {
          data = await IPFSService.download(attachment.cid, 60000);
        }
      } else {
        await advertiser.connectToUser(authorKey);
        data = await IPFSService.download(attachment.cid, 60000);
      }

      const blob = new Blob([data]);

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[FileAttachment] Download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const icon = getFileTypeIcon(attachment.mimeType);
  const size = formatFileSize(attachment.size);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-surface-border bg-depth-secondary max-w-[350px]">
      <div className="shrink-0 text-text-muted">
        <FileIcon type={icon} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm text-text-primary truncate" title={attachment.filename}>
          {attachment.filename}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>{size}</span>
          {encrypted && (
            <span className="flex items-center gap-1 text-green-400">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              E2E
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="shrink-0 p-2 rounded-lg hover:bg-surface-hover transition-colors text-text-muted hover:text-text-primary"
        title="Download"
      >
        {isDownloading ? (
          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
      </button>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  switch (type) {
    case "image":
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "video":
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case "audio":
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    case "file-text":
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "archive":
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    default:
      return (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
  }
}

function getFileTypeIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "file-text";
  if (mimeType === "text/plain") return "file-text";
  if (mimeType === "application/zip") return "archive";
  return "file";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
