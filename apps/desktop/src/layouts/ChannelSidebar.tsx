import { useState, useCallback, useRef, useEffect } from "react";
import { useNodeStore } from "../stores/node-store";
import { useMessageStore } from "../stores/message-store";
import { useVoiceStore } from "../stores/voice-store";
import { CreateChannelModal, NodeSettingsModal, ChannelSettingsModal } from "../components/modals";
import { ChannelListSkeleton } from "../components/ui";
import { VoiceChannelEntry, VoiceConnectionBar } from "../components/voice";
import { usePermissions } from "../hooks/usePermissions";
import { useVoiceTransport } from "../providers/TransportProvider";

/**
 * ChannelSidebar displays the channel list for the active Node.
 * Shows Node name, channel list, and create channel button.
 */
export function ChannelSidebar() {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const channels = useNodeStore((s) => s.channels);
  const activeChannelId = useNodeStore((s) => s.activeChannelId);
  const setActiveChannel = useNodeStore((s) => s.setActiveChannel);
  const nodes = useNodeStore((s) => s.nodes);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(null);
  
  // Voice state and transport
  const voiceTransport = useVoiceTransport();
  const voiceState = useVoiceStore((s) => s.state);
  
  // Permission checks
  const { canManageChannels, canConnectVoice } = usePermissions();

  // Compute active node instead of using method that calls get()
  const node = nodes.find((n) => n.id === activeNodeId) || null;
  const nodeChannels = activeNodeId ? channels[activeNodeId] || [] : [];
  const isChannelsLoading = activeNodeId ? channels[activeNodeId] === undefined : false;
  
  // Voice channel handlers
  const handleJoinVoice = useCallback(async (channelId: string) => {
    if (!voiceTransport || !activeNodeId) return;
    
    try {
      if (voiceState.channelId === channelId) {
        // Already in this channel - do nothing or toggle to leave
        return;
      }
      await voiceTransport.join(channelId, activeNodeId);
    } catch (err) {
      console.error("[Voice] Failed to join channel:", err);
    }
  }, [voiceTransport, activeNodeId, voiceState.channelId]);
  
  const handleMuteToggle = useCallback(async () => {
    if (!voiceTransport) return;
    await voiceTransport.setMuted(!voiceState.muted);
  }, [voiceTransport, voiceState.muted]);
  
  const handleDeafenToggle = useCallback(async () => {
    if (!voiceTransport) return;
    await voiceTransport.setDeafened(!voiceState.deafened);
  }, [voiceTransport, voiceState.deafened]);
  
  const handleDisconnect = useCallback(async () => {
    if (!voiceTransport) return;
    await voiceTransport.leave();
  }, [voiceTransport]);

  if (!activeNodeId || !node) {
    return (
      <div className="w-60 bg-depth-secondary border-r border-surface-border flex flex-col shrink-0">
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-text-muted text-sm text-center">
            Select or create a Node to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-depth-secondary border-r border-surface-border flex flex-col shrink-0">
      {/* Node header */}
      <button
        onClick={() => setShowSettings(true)}
        className="h-12 px-4 flex items-center justify-between border-b border-surface-border hover:bg-surface-hover transition-colors"
      >
        <span className="font-semibold text-nodes-text truncate">
          {node.name}
        </span>
        <svg
          className="w-4 h-4 text-nodes-text-muted shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-4">
        {/* Text channels section */}
        <div className="px-2">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-nodes-text-muted uppercase tracking-wide">
              Text Channels
            </span>
            {canManageChannels && (
              <button
                onClick={() => setShowCreateChannel(true)}
                className="text-nodes-text-muted hover:text-nodes-text transition-colors"
                title="Create Channel"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Channel items */}
          {isChannelsLoading ? (
            <ChannelListSkeleton />
          ) : (
            <>
              {nodeChannels
                .filter((c) => c.type === "text")
                .map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channelId={channel.id}
                    name={channel.name}
                    isActive={channel.id === activeChannelId}
                    onClick={() => setActiveChannel(channel.id)}
                    onOpenSettings={() => setChannelSettingsId(channel.id)}
                  />
                ))}

              {nodeChannels.filter((c) => c.type === "text").length === 0 && (
                <p className="px-2 py-4 text-nodes-text-muted text-sm">
                  No text channels yet.
                  {canManageChannels && " Click + to create one."}
                </p>
              )}
            </>
          )}
        </div>

        {/* Voice channels section */}
        <div className="px-2 mt-4">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-nodes-text-muted uppercase tracking-wide">
              Voice Channels
            </span>
            {canManageChannels && (
              <button
                onClick={() => setShowCreateChannel(true)}
                className="text-nodes-text-muted hover:text-nodes-text transition-colors"
                title="Create Voice Channel"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Voice channel items */}
          {!isChannelsLoading && (
            <>
              {nodeChannels
                .filter((c) => c.type === "voice")
                .map((channel) => (
                  <VoiceChannelEntry
                    key={channel.id}
                    channelId={channel.id}
                    channelName={channel.name}
                    isActive={voiceState.channelId === channel.id}
                    onJoin={() => canConnectVoice && handleJoinVoice(channel.id)}
                  />
                ))}

              {nodeChannels.filter((c) => c.type === "voice").length === 0 && (
                <p className="px-2 py-2 text-nodes-text-muted text-sm">
                  No voice channels yet.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Voice connection bar */}
      {voiceState.channelId && (
        <VoiceConnectionBar
          onMuteToggle={handleMuteToggle}
          onDeafenToggle={handleDeafenToggle}
          onDisconnect={handleDisconnect}
        />
      )}

      {/* Modals */}
      {showCreateChannel && activeNodeId && (
        <CreateChannelModal
          nodeId={activeNodeId}
          onClose={() => setShowCreateChannel(false)}
        />
      )}
      {showSettings && (
        <NodeSettingsModal onClose={() => setShowSettings(false)} />
      )}
      {channelSettingsId && (
        <ChannelSettingsModal
          channelId={channelSettingsId}
          onClose={() => setChannelSettingsId(null)}
        />
      )}
    </div>
  );
}

interface ChannelItemProps {
  channelId: string;
  name: string;
  isActive: boolean;
  onClick: () => void;
  onOpenSettings?: () => void;
}

function ChannelItem({ channelId, name, isActive, onClick, onOpenSettings }: ChannelItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  
  const unreadCount = useMessageStore((s) => s.unreadCounts[channelId] || 0);
  const clearUnread = useMessageStore((s) => s.clearUnread);
  const { canEditChannelSettings, canManageChannels } = usePermissions();
  const canOpenSettings = canEditChannelSettings || canManageChannels;

  const handleClick = () => {
    onClick();
    clearUnread(channelId);
  };
  
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (canOpenSettings && onOpenSettings) {
      setMenuPos({ x: e.clientX, y: e.clientY });
      setShowMenu(true);
    }
  };
  
  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  const hasUnread = unreadCount > 0;
  const displayCount = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`channel-item w-full flex items-center gap-1.5 text-left ${
          isActive
            ? "channel-item-active"
            : hasUnread
            ? "text-text-primary"
            : ""
        }`}
      >
        <span className="text-lg leading-none">#</span>
        <span className={`truncate flex-1 ${hasUnread ? "font-semibold" : ""}`}>
          {name}
        </span>
        {hasUnread && !isActive && (
          <span className="bg-accent-primary text-white text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
            {displayCount}
          </span>
        )}
      </button>
      
      {/* Context menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-bg-float border border-nodes-border rounded-lg shadow-lg py-1 min-w-44"
          style={{ top: menuPos.y, left: menuPos.x }}
        >
          <button
            onClick={() => {
              setShowMenu(false);
              onOpenSettings?.();
            }}
            className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Edit Channel
          </button>
        </div>
      )}
    </>
  );
}
