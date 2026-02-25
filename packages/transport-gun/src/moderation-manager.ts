import { GunInstanceManager } from "./gun-instance";
import type { AuditLogEntry, AuditAction, BanEntry, KickNotification } from "@nodes/core";

/**
 * ModerationManager handles kick, ban, slow mode, and audit logging.
 *
 * All moderation actions:
 * 1. Verify the actor has the required permission
 * 2. Verify hierarchy (actor outranks target)
 * 3. Execute the action on the Gun graph
 * 4. Write an audit log entry
 *
 * The caller (UI hook or transport layer) is responsible for the
 * permission check before calling these methods. The ModerationManager
 * does NOT re-check permissions — it trusts the caller.
 */
export class ModerationManager {
  // ── Kick / Ban ──

  /**
   * Kick a member from a Node.
   * Removes them from the member list. They can rejoin via invite.
   */
  async kickMember(
    nodeId: string,
    targetKey: string,
    actorKey: string,
    actorName: string,
    targetName: string,
    reason?: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    // Remove from member list
    gun.get("nodes").get(nodeId).get("members").get(targetKey).put(null);

    // Write kick signal for target's client to detect
    const kickNotification: KickNotification = {
      kickedBy: actorKey,
      kickedAt: Date.now(),
      reason: reason ?? "",
      banned: false,
    };
    gun.get("nodes").get(nodeId).get("kicks").get(targetKey).put(kickNotification);

    // Log the action
    await this.logAction(nodeId, {
      action: "member_kick",
      actorKey,
      actorName,
      targetKey,
      targetName,
      reason,
    });
  }

  /**
   * Ban a member from a Node.
   * Removes them AND prevents rejoin.
   */
  async banMember(
    nodeId: string,
    targetKey: string,
    actorKey: string,
    actorName: string,
    targetName: string,
    reason?: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    // Remove from member list
    gun.get("nodes").get(nodeId).get("members").get(targetKey).put(null);

    // Add to ban list
    const banEntry: BanEntry = {
      publicKey: targetKey,
      bannedBy: actorKey,
      bannedAt: Date.now(),
      reason: reason ?? "",
    };
    gun.get("nodes").get(nodeId).get("bans").get(targetKey).put(banEntry);

    // Write kick/ban signal for target's client
    const kickNotification: KickNotification = {
      kickedBy: actorKey,
      kickedAt: Date.now(),
      reason: reason ?? "",
      banned: true,
    };
    gun.get("nodes").get(nodeId).get("kicks").get(targetKey).put(kickNotification);

    // Log the action
    await this.logAction(nodeId, {
      action: "member_ban",
      actorKey,
      actorName,
      targetKey,
      targetName,
      reason,
    });
  }

  /**
   * Unban a user from a Node.
   */
  async unbanMember(
    nodeId: string,
    targetKey: string,
    actorKey: string,
    actorName: string,
    targetName: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    // Remove from ban list
    gun.get("nodes").get(nodeId).get("bans").get(targetKey).put(null);

    // Log the action
    await this.logAction(nodeId, {
      action: "member_unban",
      actorKey,
      actorName,
      targetKey,
      targetName,
    });
  }

  /**
   * Check if a user is banned from a Node.
   */
  async isBanned(nodeId: string, publicKey: string): Promise<boolean> {
    const gun = GunInstanceManager.get();
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, 2000);

      gun
        .get("nodes")
        .get(nodeId)
        .get("bans")
        .get(publicKey)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(Boolean(data?.bannedAt));
          }
        });
    });
  }

  /**
   * Get the full ban list for a Node.
   */
  async getBanList(nodeId: string): Promise<BanEntry[]> {
    const gun = GunInstanceManager.get();
    const bans: BanEntry[] = [];

    return new Promise((resolve) => {
      let settled = false;
      gun
        .get("nodes")
        .get(nodeId)
        .get("bans")
        .map()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any, key: string) => {
          if (data && data.bannedAt) {
            bans.push({
              publicKey: key,
              bannedBy: data.bannedBy,
              bannedAt: data.bannedAt,
              reason: data.reason ?? "",
            });
          }
        });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(bans);
        }
      }, 500);
    });
  }

  /**
   * Subscribe to ban list changes for a Node.
   */
  subscribeBanList(
    nodeId: string,
    handler: (bans: BanEntry[]) => void
  ): () => void {
    const gun = GunInstanceManager.get();
    const bans = new Map<string, BanEntry>();

    const ref = gun.get("nodes").get(nodeId).get("bans");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.map().on((data: any, key: string) => {
      if (!data || data === null || !data.bannedAt) {
        bans.delete(key);
      } else {
        bans.set(key, {
          publicKey: key,
          bannedBy: data.bannedBy,
          bannedAt: data.bannedAt,
          reason: data.reason ?? "",
        });
      }

      handler(Array.from(bans.values()));
    });

    return () => {
      ref.map().off();
    };
  }

  // ── Slow Mode ──

  /**
   * Set slow mode for a channel.
   * @param delaySeconds - Delay in seconds (0 = off)
   */
  async setSlowMode(
    nodeId: string,
    channelId: string,
    delaySeconds: number,
    actorKey: string,
    actorName: string,
    channelName: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    gun
      .get("nodes")
      .get(nodeId)
      .get("channels")
      .get(channelId)
      .put({ slowMode: delaySeconds });

    await this.logAction(nodeId, {
      action: delaySeconds > 0 ? "slow_mode_set" : "slow_mode_clear",
      actorKey,
      actorName,
      channelId,
      channelName,
      metadata: JSON.stringify({ delaySeconds }),
    });
  }

  /**
   * Get slow mode setting for a channel.
   */
  async getSlowMode(nodeId: string, channelId: string): Promise<number> {
    const gun = GunInstanceManager.get();
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(0);
        }
      }, 1000);

      gun
        .get("nodes")
        .get(nodeId)
        .get("channels")
        .get(channelId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(data?.slowMode ?? 0);
          }
        });
    });
  }

  // ── Message Moderation ──

  /**
   * Log a message deletion by a moderator.
   * The actual deletion is handled by MessageTransport - this just logs it.
   */
  async logMessageDeletion(
    nodeId: string,
    channelId: string,
    channelName: string,
    messageAuthorKey: string,
    messageAuthorName: string,
    actorKey: string,
    actorName: string,
    messagePreview?: string
  ): Promise<void> {
    await this.logAction(nodeId, {
      action: "message_delete",
      actorKey,
      actorName,
      targetKey: messageAuthorKey,
      targetName: messageAuthorName,
      channelId,
      channelName,
      metadata: messagePreview
        ? JSON.stringify({ preview: messagePreview.slice(0, 100) })
        : undefined,
    });
  }

  /**
   * Log a bulk message deletion.
   */
  async logBulkDeletion(
    nodeId: string,
    channelId: string,
    channelName: string,
    targetKey: string,
    targetName: string,
    count: number,
    actorKey: string,
    actorName: string
  ): Promise<void> {
    await this.logAction(nodeId, {
      action: "message_bulk_delete",
      actorKey,
      actorName,
      targetKey,
      targetName,
      channelId,
      channelName,
      metadata: JSON.stringify({ count }),
    });
  }

  // ── Voice Moderation ──

  /**
   * Server mute a user in voice.
   */
  async logVoiceMute(
    nodeId: string,
    channelId: string,
    channelName: string,
    targetKey: string,
    targetName: string,
    actorKey: string,
    actorName: string,
    muted: boolean
  ): Promise<void> {
    await this.logAction(nodeId, {
      action: "voice_mute",
      actorKey,
      actorName,
      targetKey,
      targetName,
      channelId,
      channelName,
      metadata: JSON.stringify({ muted }),
    });
  }

  /**
   * Disconnect a user from voice.
   */
  async logVoiceDisconnect(
    nodeId: string,
    channelId: string,
    channelName: string,
    targetKey: string,
    targetName: string,
    actorKey: string,
    actorName: string
  ): Promise<void> {
    await this.logAction(nodeId, {
      action: "voice_disconnect",
      actorKey,
      actorName,
      targetKey,
      targetName,
      channelId,
      channelName,
    });
  }

  // ── Audit Log ──

  /**
   * Write an audit log entry.
   */
  async logAction(
    nodeId: string,
    entry: Omit<AuditLogEntry, "id" | "timestamp">
  ): Promise<void> {
    const gun = GunInstanceManager.get();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const fullEntry: AuditLogEntry = {
      ...entry,
      id,
      timestamp: Date.now(),
    };

    gun
      .get("nodes")
      .get(nodeId)
      .get("auditLog")
      .get(id)
      .put(fullEntry);
  }

  /**
   * Subscribe to audit log entries for a Node.
   */
  subscribeAuditLog(
    nodeId: string,
    handler: (entries: AuditLogEntry[]) => void
  ): () => void {
    const gun = GunInstanceManager.get();
    const entries = new Map<string, AuditLogEntry>();

    const ref = gun.get("nodes").get(nodeId).get("auditLog");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.map().on((data: any, entryId: string) => {
      if (!data || data === null) {
        entries.delete(entryId);
      } else {
        entries.set(entryId, {
          id: entryId,
          action: data.action,
          actorKey: data.actorKey,
          actorName: data.actorName,
          targetKey: data.targetKey,
          targetName: data.targetName,
          channelId: data.channelId,
          channelName: data.channelName,
          reason: data.reason,
          metadata: data.metadata,
          timestamp: data.timestamp,
        });
      }

      // Sort by timestamp descending (newest first)
      const sorted = Array.from(entries.values()).sort(
        (a, b) => b.timestamp - a.timestamp
      );

      handler(sorted);
    });

    return () => {
      ref.map().off();
    };
  }

  /**
   * Get audit log entries (one-time fetch).
   */
  async getAuditLog(nodeId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    const gun = GunInstanceManager.get();
    const entries: AuditLogEntry[] = [];

    return new Promise((resolve) => {
      let settled = false;
      gun
        .get("nodes")
        .get(nodeId)
        .get("auditLog")
        .map()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any, entryId: string) => {
          if (data && data.timestamp) {
            entries.push({
              id: entryId,
              action: data.action,
              actorKey: data.actorKey,
              actorName: data.actorName,
              targetKey: data.targetKey,
              targetName: data.targetName,
              channelId: data.channelId,
              channelName: data.channelName,
              reason: data.reason,
              metadata: data.metadata,
              timestamp: data.timestamp,
            });
          }
        });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          entries.sort((a, b) => b.timestamp - a.timestamp);
          resolve(entries.slice(0, limit));
        }
      }, 500);
    });
  }

  /**
   * Get filtered audit log entries.
   */
  async getFilteredAuditLog(
    nodeId: string,
    options: {
      actionType?: AuditAction;
      actorKey?: string;
      startDate?: number;
      endDate?: number;
      limit?: number;
    }
  ): Promise<AuditLogEntry[]> {
    const entries = await this.getAuditLog(nodeId, 1000);
    
    let filtered = entries;

    if (options.actionType) {
      filtered = filtered.filter((e) => e.action === options.actionType);
    }

    if (options.actorKey) {
      filtered = filtered.filter((e) => e.actorKey === options.actorKey);
    }

    if (options.startDate) {
      filtered = filtered.filter((e) => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      filtered = filtered.filter((e) => e.timestamp <= options.endDate!);
    }

    return filtered.slice(0, options.limit ?? 100);
  }
}

// Singleton instance
let moderationManagerInstance: ModerationManager | null = null;

export function getModerationManager(): ModerationManager {
  if (!moderationManagerInstance) {
    moderationManagerInstance = new ModerationManager();
  }
  return moderationManagerInstance;
}
