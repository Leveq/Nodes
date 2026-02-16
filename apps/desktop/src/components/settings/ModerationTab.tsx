import { useState, useEffect, useCallback } from "react";
import { Button, Input } from "../ui";
import { useNodeStore } from "../../stores/node-store";
import { useToastStore } from "../../stores/toast-store";
import { usePermissions, useHasPermission } from "../../hooks/usePermissions";
import { getModerationManager } from "@nodes/transport-gun";
import type { BanEntry, AuditLogEntry } from "@nodes/core";
import { Trash2, Clock, History, UserX, RefreshCw } from "lucide-react";

/**
 * ModerationTab for Node Settings.
 * Displays ban list management and audit log.
 */
export function ModerationTab() {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const addToast = useToastStore((s) => s.addToast);
  const { isOwner } = usePermissions();
  const canBan = useHasPermission("banMembers");
  const canKick = useHasPermission("kickMembers");
  const canModerate = isOwner || canBan || canKick;

  const [banList, setBanList] = useState<BanEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"bans" | "audit">("bans");
  const [isLoading, setIsLoading] = useState(false);
  const [isUnbanning, setIsUnbanning] = useState<string | null>(null);

  // Filter state for audit log
  const [auditFilter, setAuditFilter] = useState("");

  // Load ban list and audit log
  const loadModerationData = useCallback(async () => {
    if (!activeNodeId) return;

    setIsLoading(true);
    try {
      const manager = getModerationManager();

      // Load ban list
      const bans = await manager.getBanList(activeNodeId);
      setBanList(bans);

      // Load audit log
      const log = await manager.getAuditLog(activeNodeId, 100);
      setAuditLog(log);
    } catch (error) {
      console.error("[ModerationTab] Failed to load moderation data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeNodeId]);

  useEffect(() => {
    loadModerationData();
  }, [loadModerationData]);

  // Subscribe to audit log updates
  useEffect(() => {
    if (!activeNodeId) return;

    const manager = getModerationManager();
    const unsubscribe = manager.subscribeAuditLog(activeNodeId, (entries) => {
      setAuditLog(entries);
    });

    return unsubscribe;
  }, [activeNodeId]);

  // Handle unban
  const handleUnban = async (targetKey: string, targetName: string) => {
    if (!activeNodeId || !canBan) return;

    setIsUnbanning(targetKey);
    try {
      const manager = getModerationManager();
      await manager.unbanMember(
        activeNodeId,
        targetKey,
        "", // actorKey - will be added by hook if needed
        "Moderator",
        targetName
      );

      // Remove from local list immediately
      setBanList((prev) => prev.filter((b) => b.publicKey !== targetKey));
      addToast("success", `${targetName} has been unbanned`);
    } catch (error) {
      console.error("[ModerationTab] Failed to unban:", error);
      addToast("error", "Failed to unban member");
    } finally {
      setIsUnbanning(null);
    }
  };

  // Filter audit log
  const filteredAuditLog = auditFilter
    ? auditLog.filter(
        (entry) =>
          entry.action.toLowerCase().includes(auditFilter.toLowerCase()) ||
          entry.actorName.toLowerCase().includes(auditFilter.toLowerCase()) ||
          entry.targetName?.toLowerCase().includes(auditFilter.toLowerCase())
      )
    : auditLog;

  // Format action for display
  const formatAction = (action: string): string => {
    return action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Format timestamp
  const formatTime = (ts: number): string => {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - ts;

    // Less than 24 hours
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    // Less than 7 days
    if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: "short" }) + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (!canModerate) {
    return (
      <div className="p-4 text-nodes-text-muted text-sm">
        You don't have permission to view moderation settings.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-nodes-border pb-2">
        <button
          onClick={() => setActiveSubTab("bans")}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-t transition-colors ${
            activeSubTab === "bans"
              ? "bg-bg-tertiary text-nodes-text"
              : "text-nodes-text-muted hover:text-nodes-text"
          }`}
        >
          <UserX className="w-4 h-4" />
          Ban List ({banList.length})
        </button>
        <button
          onClick={() => setActiveSubTab("audit")}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-t transition-colors ${
            activeSubTab === "audit"
              ? "bg-bg-tertiary text-nodes-text"
              : "text-nodes-text-muted hover:text-nodes-text"
          }`}
        >
          <History className="w-4 h-4" />
          Audit Log ({auditLog.length})
        </button>
        <button
          onClick={loadModerationData}
          disabled={isLoading}
          className="ml-auto p-2 text-nodes-text-muted hover:text-nodes-text transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Ban List Tab */}
      {activeSubTab === "bans" && (
        <div className="space-y-3">
          {banList.length === 0 ? (
            <div className="text-nodes-text-muted text-sm py-4">
              No banned members.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {banList.map((ban) => (
                <div
                  key={ban.publicKey}
                  className="flex items-center justify-between p-3 bg-nodes-bg rounded-lg border border-nodes-border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-nodes-text truncate">
                      {ban.publicKey.slice(0, 16)}...
                    </div>
                    <div className="text-xs text-nodes-text-muted">
                      <Clock className="w-3 h-3 inline mr-1" />
                      Banned {formatTime(ban.bannedAt)}
                      {ban.reason && (
                        <span className="ml-2">
                          — {ban.reason}
                        </span>
                      )}
                    </div>
                  </div>
                  {canBan && (
                    <Button
                      variant="ghost"
                      onClick={() => handleUnban(ban.publicKey, ban.publicKey.slice(0, 8))}
                      disabled={isUnbanning === ban.publicKey}
                      className="shrink-0 text-accent-warning hover:text-accent-error"
                    >
                      {isUnbanning === ban.publicKey ? (
                        "..."
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-1" />
                          Unban
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit Log Tab */}
      {activeSubTab === "audit" && (
        <div className="space-y-3">
          <Input
            placeholder="Filter by action or name..."
            value={auditFilter}
            onChange={setAuditFilter}
          />

          {filteredAuditLog.length === 0 ? (
            <div className="text-nodes-text-muted text-sm py-4">
              {auditFilter ? "No matching entries." : "No moderation actions recorded."}
            </div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filteredAuditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="p-2 rounded hover:bg-nodes-bg/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      entry.action.includes("ban") ? "bg-red-500/20 text-red-400" :
                      entry.action.includes("kick") ? "bg-orange-500/20 text-orange-400" :
                      entry.action.includes("role") ? "bg-blue-500/20 text-blue-400" :
                      entry.action.includes("channel") ? "bg-purple-500/20 text-purple-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>
                      {formatAction(entry.action)}
                    </span>
                    <span className="text-xs text-nodes-text-muted">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  <div className="text-sm text-nodes-text mt-1">
                    <span className="font-medium">{entry.actorName}</span>
                    {entry.targetName && (
                      <>
                        {" → "}
                        <span className="text-nodes-text-muted">{entry.targetName}</span>
                      </>
                    )}
                    {entry.reason && (
                      <span className="text-nodes-text-muted italic ml-2">
                        "{entry.reason}"
                      </span>
                    )}
                    {entry.metadata && (
                      <span className="text-nodes-text-muted text-xs ml-2">
                        ({entry.metadata})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
