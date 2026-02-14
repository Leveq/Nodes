import type {
  IFileTransport,
  FileMetadata,
  UploadProgress,
  Unsubscribe,
} from "@nodes/transport";
import { FILE_LIMITS } from "@nodes/core";
import { IPFSService } from "./ipfs-service";

/**
 * IPFSFileTransport implements IFileTransport using Helia/IPFS.
 *
 * Replaces the LocalFileTransport stub from Milestone 1.3.
 * Files are stored on IPFS and addressed by their CID.
 */
export class IPFSFileTransport implements IFileTransport {
  private progressHandlers: Map<string, Set<(p: UploadProgress) => void>> =
    new Map();

  /**
   * Upload a file to IPFS.
   *
   * @param file - The file to upload
   * @param metadata - Optional metadata (uploadedBy)
   * @returns The CID as fileId and file metadata
   */
  async upload(
    file: File,
    metadata?: Partial<FileMetadata>
  ): Promise<{ fileId: string; metadata: FileMetadata }> {
    // Validate file size
    if (file.size > FILE_LIMITS.MAX_FILE_SIZE) {
      throw new Error(
        `File too large. Maximum size is ${FILE_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB.`
      );
    }

    // Read file as ArrayBuffer → Uint8Array
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Generate a temporary ID for progress tracking
    const tempId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Upload to IPFS with progress tracking
    const cid = await IPFSService.upload(data, (percent) => {
      this.emitProgress(tempId, {
        fileId: tempId,
        loaded: Math.floor((percent / 100) * file.size),
        total: file.size,
        percentage: percent,
      });
    });

    // Build metadata
    const fileMetadata: FileMetadata = {
      id: cid,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      uploadedAt: Date.now(),
      uploadedBy: metadata?.uploadedBy || "unknown",
    };

    return { fileId: cid, metadata: fileMetadata };
  }

  /**
   * Upload raw bytes to IPFS (for pre-encrypted data or processed images).
   *
   * @param data - Raw bytes to upload
   * @param onProgress - Optional progress callback
   * @returns The CID string
   */
  async uploadBytes(
    data: Uint8Array,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    return IPFSService.upload(data, onProgress);
  }

  /**
   * Download a file from IPFS by CID.
   */
  async download(cid: string): Promise<Blob> {
    const data = await IPFSService.download(cid);
    return new Blob([data]);
  }

  /**
   * Download raw bytes from IPFS (for decryption pipelines).
   */
  async downloadBytes(cid: string): Promise<Uint8Array> {
    return IPFSService.download(cid);
  }

  /**
   * Delete is a no-op on IPFS.
   * Content-addressed storage means "deleting" just unpins locally.
   * The content may still exist on other peers.
   */
  async delete(cid: string): Promise<void> {
    // Unpin locally — content may still be available from other peers
    try {
      const { CID: CIDClass } = await import("multiformats/cid");
      const cidObj = CIDClass.parse(cid);
      await IPFSService.getHelia().pins.rm(cidObj);
    } catch {
      // Ignore — may not be pinned
    }
  }

  /**
   * Get a URL for a CID.
   * Uses a public IPFS gateway for viewing outside the app.
   */
  getUrl(cid: string): string {
    // Use a public gateway as fallback for sharing outside the app
    return `https://ipfs.io/ipfs/${cid}`;
  }

  /**
   * Get metadata for a file.
   * IPFS doesn't store metadata - return null.
   * Caller should track metadata separately.
   */
  async getMetadata(_cid: string): Promise<FileMetadata | null> {
    // IPFS doesn't inherently store metadata with files.
    // The caller is responsible for tracking file metadata.
    return null;
  }

  /**
   * Subscribe to upload progress.
   */
  onProgress(fileId: string, handler: (p: UploadProgress) => void): Unsubscribe {
    if (!this.progressHandlers.has(fileId)) {
      this.progressHandlers.set(fileId, new Set());
    }
    this.progressHandlers.get(fileId)!.add(handler);

    return () => {
      const handlers = this.progressHandlers.get(fileId);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.progressHandlers.delete(fileId);
        }
      }
    };
  }

  /**
   * Emit progress to all handlers for a file.
   */
  private emitProgress(fileId: string, progress: UploadProgress): void {
    const handlers = this.progressHandlers.get(fileId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(progress);
        } catch (err) {
          console.error("[IPFSFileTransport] Progress handler error:", err);
        }
      }
    }
  }
}
