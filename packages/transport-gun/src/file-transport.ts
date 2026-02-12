import type {
  IFileTransport,
  FileMetadata,
  UploadProgress,
  Unsubscribe,
} from "@nodes/transport";

/**
 * LocalFileTransport is a stub implementation for MVP.
 *
 * Files are stored in-memory as base64 data URLs. This is NOT persistent
 * and is only intended for basic file sharing in a single session.
 *
 * Future versions will use:
 * - IPFS for decentralized storage
 * - Tauri's filesystem for local caching
 * - Chunked transfers for large files
 */

interface StoredFile {
  id: string;
  metadata: FileMetadata;
  dataUrl: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit for MVP

export class LocalFileTransport implements IFileTransport {
  private files: Map<string, StoredFile> = new Map();
  private progressHandlers: Map<string, Set<(p: UploadProgress) => void>> =
    new Map();

  /**
   * Upload a file. Converts to base64 and stores in memory.
   * Returns a unique file ID.
   */
  async upload(
    file: File,
    metadata?: Partial<FileMetadata>
  ): Promise<{ fileId: string; metadata: FileMetadata }> {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Read file as base64
    const dataUrl = await this.readFileAsDataUrl(file, fileId);

    const fileMetadata: FileMetadata = {
      id: fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      uploadedAt: Date.now(),
      uploadedBy: metadata?.uploadedBy || "unknown",
    };

    this.files.set(fileId, {
      id: fileId,
      metadata: fileMetadata,
      dataUrl,
    });

    return { fileId, metadata: fileMetadata };
  }

  /**
   * Download a file by ID. Returns a Blob.
   */
  async download(fileId: string): Promise<Blob> {
    const stored = this.files.get(fileId);
    if (!stored) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Convert data URL back to blob
    const response = await fetch(stored.dataUrl);
    return response.blob();
  }

  /**
   * Get metadata for a file.
   */
  async getMetadata(fileId: string): Promise<FileMetadata | null> {
    const stored = this.files.get(fileId);
    return stored?.metadata || null;
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
      this.progressHandlers.get(fileId)?.delete(handler);
    };
  }

  /**
   * Delete a file.
   */
  async delete(fileId: string): Promise<void> {
    this.files.delete(fileId);
    this.progressHandlers.delete(fileId);
  }

  /**
   * Get the URL for a file (returns the data URL for local storage).
   */
  getUrl(fileId: string): string {
    const stored = this.files.get(fileId);
    if (!stored) {
      return "";
    }
    return stored.dataUrl;
  }

  /**
   * Helper to read a file as a data URL with progress updates.
   */
  private readFileAsDataUrl(file: File, fileId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress: UploadProgress = {
            fileId,
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
          };
          this.emitProgress(fileId, progress);
        }
      };

      reader.onload = () => {
        // Emit 100% complete
        this.emitProgress(fileId, {
          fileId,
          loaded: file.size,
          total: file.size,
          percentage: 100,
        });
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        reject(new Error(`Failed to read file: ${file.name}`));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Emit progress to all subscribed handlers.
   */
  private emitProgress(fileId: string, progress: UploadProgress): void {
    const handlers = this.progressHandlers.get(fileId);
    if (handlers) {
      handlers.forEach((h) => h(progress));
    }
  }
}
