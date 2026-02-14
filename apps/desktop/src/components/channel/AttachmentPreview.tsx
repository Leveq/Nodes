import { FILE_LIMITS } from "@nodes/core";
import type { PendingAttachment } from "./FileAttachmentButton";

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}

/**
 * AttachmentPreview shows pending attachments before sending.
 *
 * - Images show as thumbnails
 * - Files show with icon, name, and size
 * - Each has a remove button
 * - Sits above the message input
 */
export function AttachmentPreview({
  attachments,
  onRemove,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="px-4 py-2 border-t border-surface-border bg-depth-secondary">
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <AttachmentPreviewItem
            key={attachment.id}
            attachment={attachment}
            onRemove={() => onRemove(attachment.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface AttachmentPreviewItemProps {
  attachment: PendingAttachment;
  onRemove: () => void;
}

function AttachmentPreviewItem({
  attachment,
  onRemove,
}: AttachmentPreviewItemProps) {
  const isImage = FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(
    attachment.file.type as any
  );

  return (
    <div className="relative group animate-fade-in">
      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-2 -right-2 z-10 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
        title="Remove attachment"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {isImage ? (
        <ImagePreview attachment={attachment} />
      ) : (
        <FilePreview attachment={attachment} />
      )}
    </div>
  );
}

function ImagePreview({ attachment }: { attachment: PendingAttachment }) {
  return (
    <div className="w-20 h-20 rounded-lg overflow-hidden border border-surface-border bg-depth-primary">
      <img
        src={attachment.previewUrl}
        alt={attachment.file.name}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

function FilePreview({ attachment }: { attachment: PendingAttachment }) {
  const icon = getFileTypeIcon(attachment.file.type);
  const size = formatFileSize(attachment.file.size);

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-border bg-depth-primary max-w-[200px]">
      <div className="shrink-0 text-text-muted">
        <FileIcon type={icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-text-primary truncate" title={attachment.file.name}>
          {attachment.file.name}
        </div>
        <div className="text-xs text-text-muted">{size}</div>
      </div>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  switch (type) {
    case "image":
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "video":
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case "audio":
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    case "file-text":
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "archive":
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
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
