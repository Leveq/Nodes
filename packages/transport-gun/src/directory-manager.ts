import type { DirectoryListing } from "@nodes/core";
import { GunInstanceManager } from "./gun-instance";

/**
 * DirectoryManager handles listing and browsing public Nodes.
 *
 * Write path (Node owner):
 *   gun.get("directory").get(nodeId).put(listing)
 *
 * Read path (browser):
 *   gun.get("directory").map().once(callback)
 *
 * The directory is a flat list in the Gun graph.
 * Filtering, sorting, and search happen client-side.
 */
export class DirectoryManager {
  /**
   * List a Node in the public directory.
   * Called by the Node owner when they enable directory listing.
   */
  async listNode(listing: DirectoryListing): Promise<void> {
    const gun = GunInstanceManager.get();

    const data = {
      nodeId: listing.nodeId,
      name: listing.name,
      shortDescription: listing.shortDescription,
      description: listing.description,
      icon: listing.icon,
      category: listing.category,
      tags: JSON.stringify(listing.tags),
      memberCount: listing.memberCount,
      channelCount: listing.channelCount,
      channelNames: JSON.stringify(listing.channelNames),
      ownerKey: listing.ownerKey,
      ownerName: listing.ownerName,
      inviteKey: listing.inviteKey,
      createdAt: listing.createdAt,
      listedAt: listing.listedAt || Date.now(),
      lastRefreshed: Date.now(),
      isPublic: true,
    };

    return new Promise((resolve, reject) => {
      gun
        .get("directory")
        .get(listing.nodeId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .put(data, (ack: any) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });
  }

  /**
   * Remove a Node from the public directory.
   */
  async delistNode(nodeId: string): Promise<void> {
    const gun = GunInstanceManager.get();
    
    return new Promise((resolve) => {
      gun
        .get("directory")
        .get(nodeId)
        .put({ isPublic: false, delistedAt: Date.now() });
      // Gun doesn't have true deletion, so we mark as not public
      setTimeout(resolve, 100);
    });
  }

  /**
   * Refresh a listing (update member count, last active, etc.)
   * Call this periodically (every 24h) from the owner's client.
   */
  async refreshListing(
    nodeId: string,
    updates: Partial<
      Pick<
        DirectoryListing,
        | "memberCount"
        | "channelCount"
        | "channelNames"
        | "name"
        | "shortDescription"
        | "description"
        | "icon"
      >
    >
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      ...updates,
      lastRefreshed: Date.now(),
    };

    if (updates.channelNames) {
      data.channelNames = JSON.stringify(updates.channelNames);
    }

    gun.get("directory").get(nodeId).put(data);
  }

  /**
   * Browse the directory — fetch all public listings.
   * Returns raw listings; filtering/sorting done client-side.
   */
  async browse(): Promise<DirectoryListing[]> {
    const gun = GunInstanceManager.get();
    const listings: DirectoryListing[] = [];

    return new Promise((resolve) => {
      gun
        .get("directory")
        .map()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any, nodeId: string) => {
          if (!data || data === null || !data.isPublic) return;

          try {
            listings.push({
              nodeId,
              name: data.name ?? "Unnamed Node",
              shortDescription: data.shortDescription ?? "",
              description: data.description ?? "",
              icon: data.icon ?? "",
              category: data.category ?? "other",
              tags: safeParse(data.tags, []),
              memberCount: data.memberCount ?? 0,
              channelCount: data.channelCount ?? 0,
              channelNames: safeParse(data.channelNames, []),
              ownerKey: data.ownerKey ?? "",
              ownerName: data.ownerName ?? "",
              inviteKey: data.inviteKey ?? "",
              createdAt: data.createdAt ?? 0,
              listedAt: data.listedAt ?? 0,
              lastRefreshed: data.lastRefreshed ?? 0,
            });
          } catch {
            // Skip malformed entries
          }
        });

      // Gun .map().once() doesn't signal completion
      setTimeout(() => {
        // Filter out stale listings (>30 days without refresh)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const fresh = listings.filter((l) => l.lastRefreshed > thirtyDaysAgo);
        resolve(fresh);
      }, 1000);
    });
  }

  /**
   * Subscribe to directory changes in real-time.
   */
  subscribeDirectory(
    handler: (listings: DirectoryListing[]) => void
  ): () => void {
    const gun = GunInstanceManager.get();
    const listingsMap = new Map<string, DirectoryListing>();

    const ref = gun.get("directory");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.map().on((data: any, nodeId: string) => {
      if (!data || data === null || !data.isPublic) {
        listingsMap.delete(nodeId);
      } else {
        try {
          listingsMap.set(nodeId, {
            nodeId,
            name: data.name ?? "Unnamed Node",
            shortDescription: data.shortDescription ?? "",
            description: data.description ?? "",
            icon: data.icon ?? "",
            category: data.category ?? "other",
            tags: safeParse(data.tags, []),
            memberCount: data.memberCount ?? 0,
            channelCount: data.channelCount ?? 0,
            channelNames: safeParse(data.channelNames, []),
            ownerKey: data.ownerKey ?? "",
            ownerName: data.ownerName ?? "",
            inviteKey: data.inviteKey ?? "",
            createdAt: data.createdAt ?? 0,
            listedAt: data.listedAt ?? 0,
            lastRefreshed: data.lastRefreshed ?? 0,
          });
        } catch {
          // Skip malformed entries
        }
      }

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const listings = Array.from(listingsMap.values()).filter(
        (l) => l.lastRefreshed > thirtyDaysAgo
      );
      handler(listings);
    });

    return () => {
      ref.map().off();
    };
  }

  /**
   * Check if a Node is currently listed in the directory.
   */
  async isListed(nodeId: string): Promise<boolean> {
    const gun = GunInstanceManager.get();
    return new Promise((resolve) => {
      gun
        .get("directory")
        .get(nodeId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any) => {
          resolve(
            data !== null && data !== undefined && data.isPublic === true
          );
        });
      setTimeout(() => resolve(false), 1000);
    });
  }

  /**
   * Get a specific directory listing by Node ID.
   */
  async getListing(nodeId: string): Promise<DirectoryListing | null> {
    const gun = GunInstanceManager.get();
    return new Promise((resolve) => {
      gun
        .get("directory")
        .get(nodeId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any) => {
          if (!data || !data.isPublic) {
            resolve(null);
            return;
          }
          resolve({
            nodeId,
            name: data.name ?? "Unnamed Node",
            shortDescription: data.shortDescription ?? "",
            description: data.description ?? "",
            icon: data.icon ?? "",
            category: data.category ?? "other",
            tags: safeParse(data.tags, []),
            memberCount: data.memberCount ?? 0,
            channelCount: data.channelCount ?? 0,
            channelNames: safeParse(data.channelNames, []),
            ownerKey: data.ownerKey ?? "",
            ownerName: data.ownerName ?? "",
            inviteKey: data.inviteKey ?? "",
            createdAt: data.createdAt ?? 0,
            listedAt: data.listedAt ?? 0,
            lastRefreshed: data.lastRefreshed ?? 0,
          });
        });
      setTimeout(() => resolve(null), 1000);
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParse(json: any, fallback: any): any {
  if (Array.isArray(json)) return json;
  if (typeof json !== "string") return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// Singleton instance
export const directoryManager = new DirectoryManager();
