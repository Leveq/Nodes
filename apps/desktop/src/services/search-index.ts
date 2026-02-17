/**
 * SearchIndex - MiniSearch wrapper with IndexedDB persistence
 * 
 * Provides full-text search capabilities for messages and DMs
 * with automatic persistence across app restarts.
 */

import MiniSearch, { SearchResult as MiniSearchResult, Options } from "minisearch";
import { get, set, del } from "idb-keyval";
import type { SearchResult, SearchFilters, Message, DMMessage } from "@nodes/core";

// Document structure stored in the search index
export interface IndexedDocument {
  id: string;
  type: "message" | "dm";
  content: string;
  authorKey: string;
  timestamp: number;
  channelId?: string;
  nodeId?: string;
  conversationId?: string;
}

const STORAGE_KEY = "nodes-search-index";
const INDEX_VERSION = 1;

// MiniSearch configuration
const MINISEARCH_OPTIONS: Options<IndexedDocument> = {
  fields: ["content", "authorKey"],
  storeFields: ["type", "content", "authorKey", "timestamp", "channelId", "nodeId", "conversationId"],
  searchOptions: {
    boost: { content: 2 },
    prefix: true,
    fuzzy: 0.2,
  },
};

interface SerializedIndex {
  version: number;
  data: string;
  documentCount: number;
  lastUpdated: number;
}

export class SearchIndex {
  private index: MiniSearch<IndexedDocument>;
  private documentIds: Set<string> = new Set();
  private isDirty: boolean = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private pendingDocuments: Array<{ doc: IndexedDocument; type: 'add' }> = [];

  constructor() {
    this.index = new MiniSearch(MINISEARCH_OPTIONS);
  }

  /**
   * Initialize the index, loading from IndexedDB if available
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      const stored = await get<SerializedIndex>(STORAGE_KEY);
      
      if (stored && stored.version === INDEX_VERSION) {
        // Load existing index from storage
        this.index = MiniSearch.loadJSON(stored.data, MINISEARCH_OPTIONS);
        
        // Rebuild documentIds from the loaded index
        // We stored documentCount but need to track IDs for deduplication
        // Since MiniSearch doesn't expose IDs directly, we mark them as "potentially indexed"
        // by setting a flag. The try/catch in add methods will handle duplicates.
        console.log(`[SearchIndex] Loaded ${stored.documentCount} documents from storage`);
      }
    } catch (error) {
      console.warn("[SearchIndex] Failed to load index from storage, starting fresh:", error);
      this.index = new MiniSearch(MINISEARCH_OPTIONS);
    }

    this.isInitialized = true;

    // Process any documents that arrived before initialization
    if (this.pendingDocuments.length > 0) {
      console.log(`[SearchIndex] Processing ${this.pendingDocuments.length} pending documents`);
      for (const pending of this.pendingDocuments) {
        this._addDocument(pending.doc);
      }
      this.pendingDocuments = [];
    }
  }

  /**
   * Internal method to add a document to the index
   */
  private _addDocument(doc: IndexedDocument): void {
    // Skip if already in our tracking set
    if (this.documentIds.has(doc.id)) return;

    try {
      this.index.add(doc);
      this.documentIds.add(doc.id);
      this.scheduleAutoSave();
      console.debug(`[SearchIndex] Added document: ${doc.id} (total: ${this.documentIds.size})`);
    } catch (error) {
      // Document might already exist in loaded index (duplicate)
      // This is expected when we load from storage
      this.documentIds.add(doc.id); // Mark as known to prevent future attempts
    }
  }

  /**
   * Add a message to the search index
   */
  addMessage(message: Message, nodeId: string): void {
    // Skip system messages
    if (message.type === "system") return;

    const docId = `msg:${message.id}`;
    
    // Skip if already indexed
    if (this.documentIds.has(docId)) return;

    const doc: IndexedDocument = {
      id: docId,
      type: "message",
      content: message.content,
      authorKey: message.authorKey,
      timestamp: message.timestamp,
      channelId: message.channelId,
      nodeId,
    };

    // Queue if not initialized yet
    if (!this.isInitialized) {
      this.pendingDocuments.push({ doc, type: 'add' });
      return;
    }

    this._addDocument(doc);
  }

  /**
   * Add a DM message to the search index
   */
  addDM(message: DMMessage, decryptedContent: string): void {
    // Skip system messages
    if (message.type === "system") return;

    const docId = `dm:${message.id}`;
    
    // Skip if already indexed
    if (this.documentIds.has(docId)) return;

    const doc: IndexedDocument = {
      id: docId,
      type: "dm",
      content: decryptedContent,
      authorKey: message.authorKey,
      timestamp: message.timestamp,
      conversationId: message.conversationId,
    };

    // Queue if not initialized yet
    if (!this.isInitialized) {
      this.pendingDocuments.push({ doc, type: 'add' });
      return;
    }

    this._addDocument(doc);
  }

  /**
   * Remove a document from the index
   */
  remove(id: string): void {
    if (!this.isInitialized) return;

    const docId = id.includes(":") ? id : `msg:${id}`;
    
    if (this.documentIds.has(docId)) {
      try {
        this.index.discard(docId);
        this.documentIds.delete(docId);
        this.scheduleAutoSave();
      } catch (error) {
        console.debug("[SearchIndex] Failed to remove document:", docId);
      }
    }
  }

  /**
   * Search the index with optional filters
   */
  search(
    query: string,
    filters?: SearchFilters,
    limit: number = 50
  ): SearchResult[] {
    console.log(`[SearchIndex] search() called - query: "${query}", initialized: ${this.isInitialized}, docs: ${this.documentIds.size}`);
    
    if (!this.isInitialized) {
      console.warn("[SearchIndex] Search called before initialization");
      return [];
    }
    
    if (!query.trim()) {
      return [];
    }

    try {
      const rawResults = this.index.search(query, {
        prefix: true,
        fuzzy: 0.2,
      });
      
      console.log(`[SearchIndex] Raw results: ${rawResults.length}, filters:`, filters);

      // Apply filters and transform results
      const filtered = rawResults
        .filter((result) => this.matchesFilters(result, filters))
        .slice(0, limit)
        .map((result) => this.transformResult(result, query));
        
      console.log(`[SearchIndex] Filtered results: ${filtered.length}`);
      return filtered;
    } catch (error) {
      console.error("[SearchIndex] Search error:", error);
      return [];
    }
  }

  /**
   * Check if a result matches the provided filters
   */
  private matchesFilters(
    result: MiniSearchResult,
    filters?: SearchFilters
  ): boolean {
    if (!filters) return true;

    const doc = result as unknown as IndexedDocument;

    // Author filter
    if (filters.from && doc.authorKey !== filters.from) {
      return false;
    }

    // Channel filter
    if (filters.in && doc.channelId !== filters.in) {
      return false;
    }

    // Date filters
    if (filters.before && doc.timestamp >= filters.before.getTime()) {
      return false;
    }

    if (filters.after && doc.timestamp <= filters.after.getTime()) {
      return false;
    }

    // Content type filter (would need to parse attachments JSON)
    if (filters.has) {
      // For now, basic check - in production, parse attachments
      const content = doc.content.toLowerCase();
      switch (filters.has) {
        case "link":
          if (!content.includes("http://") && !content.includes("https://")) {
            return false;
          }
          break;
        case "image":
        case "file":
          // Would need attachment metadata, skip for now
          break;
      }
    }

    return true;
  }

  /**
   * Transform MiniSearch result to our SearchResult format
   */
  private transformResult(
    result: MiniSearchResult,
    query: string
  ): SearchResult {
    // MiniSearch stores fields directly on result when using storeFields
    const doc = result as unknown as IndexedDocument;
    
    console.debug(`[SearchIndex] Transform result:`, {
      id: doc.id,
      type: doc.type,
      content: doc.content?.substring(0, 50),
      score: result.score
    });
    
    return {
      id: doc.id.replace(/^(msg|dm):/, ""),
      type: doc.type,
      content: doc.content,
      contentSnippet: this.createSnippet(doc.content, query),
      authorKey: doc.authorKey,
      timestamp: doc.timestamp,
      channelId: doc.channelId,
      nodeId: doc.nodeId,
      conversationId: doc.conversationId,
      score: result.score,
      matches: result.terms || [],
    };
  }

  /**
   * Create a highlighted snippet around matched terms
   */
  private createSnippet(content: string, query: string): string {
    const maxLength = 150;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const lowerContent = content.toLowerCase();
    
    // Find first match position
    let matchStart = -1;
    for (const term of terms) {
      const pos = lowerContent.indexOf(term);
      if (pos !== -1 && (matchStart === -1 || pos < matchStart)) {
        matchStart = pos;
      }
    }

    if (matchStart === -1) {
      // No match found, return start of content
      return content.length > maxLength
        ? content.slice(0, maxLength) + "..."
        : content;
    }

    // Center snippet around match
    const start = Math.max(0, matchStart - 30);
    const end = Math.min(content.length, start + maxLength);
    
    let snippet = content.slice(start, end);
    if (start > 0) snippet = "..." + snippet;
    if (end < content.length) snippet = snippet + "...";

    return snippet;
  }

  /**
   * Schedule an auto-save after modifications
   */
  private scheduleAutoSave(): void {
    this.isDirty = true;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Debounce saves to prevent excessive IndexedDB writes
    this.saveTimeout = setTimeout(() => {
      this.save();
    }, 5000);
  }

  /**
   * Persist the index to IndexedDB
   */
  async save(): Promise<void> {
    if (!this.isDirty || !this.isInitialized) return;

    try {
      const serialized: SerializedIndex = {
        version: INDEX_VERSION,
        data: JSON.stringify(this.index.toJSON()),
        documentCount: this.documentIds.size,
        lastUpdated: Date.now(),
      };

      await set(STORAGE_KEY, serialized);
      this.isDirty = false;
      console.log(`[SearchIndex] Saved ${serialized.documentCount} documents to storage`);
    } catch (error) {
      console.error("[SearchIndex] Failed to save index:", error);
    }
  }

  /**
   * Clear the entire index
   */
  async clear(): Promise<void> {
    this.index = new MiniSearch(MINISEARCH_OPTIONS);
    this.documentIds.clear();
    this.isDirty = false;

    try {
      await del(STORAGE_KEY);
      console.log("[SearchIndex] Index cleared");
    } catch (error) {
      console.error("[SearchIndex] Failed to clear index:", error);
    }
  }

  /**
   * Get index statistics
   */
  getStats(): { documentCount: number; isInitialized: boolean } {
    return {
      documentCount: this.documentIds.size,
      isInitialized: this.isInitialized,
    };
  }
}

// Singleton instance
let searchIndexInstance: SearchIndex | null = null;

export function getSearchIndex(): SearchIndex {
  if (!searchIndexInstance) {
    searchIndexInstance = new SearchIndex();
  }
  return searchIndexInstance;
}
