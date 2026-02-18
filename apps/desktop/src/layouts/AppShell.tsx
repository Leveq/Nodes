import { useEffect, useState, useCallback } from "react";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";
import { useNavigationStore } from "../stores/navigation-store";
import { useDMStore } from "../stores/dm-store";
import { useSocialStore } from "../stores/social-store";
import { useVoiceStore } from "../stores/voice-store";
import { useSearchStore } from "../stores/search-store";
import { useNodeSubscriptions } from "../hooks/useNodeSubscriptions";
import { useMemberSubscription } from "../hooks/useMemberSubscription";
import { useRoleSubscriptions } from "../hooks/useRoleSubscriptions";
import { useDMSubscriptions } from "../hooks/useDMSubscriptions";
import { usePresenceSubscriptions } from "../hooks/usePresenceSubscriptions";
import { usePresenceStatus } from "../hooks/usePresenceStatus";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useGracefulShutdown } from "../hooks/useGracefulShutdown";
import { useModerationEvents } from "../hooks/useModerationEvents";
import { useDirectoryRefresh } from "../hooks/useDirectoryRefresh";
import { useTransport } from "../providers/TransportProvider";
import { initNotificationManager } from "../services/notification-manager";
import { NodeSidebar } from "./NodeSidebar";
import { ChannelSidebar } from "./ChannelSidebar";
import { MainContent } from "./MainContent";
import { MemberSidebar } from "./MemberSidebar";
import { StatusBar } from "./StatusBar";
import { DMSidebar, DMView } from "../components/dm";
import { RequestsPanel } from "../components/social";
import { ProfilePopup } from "../components/profile";
import { SettingsPage } from "../components/settings";
import { EditProfileModal } from "../components/modals";
import { SearchOverlay } from "../components/search";
import { DiscoveryPage } from "../components/discovery";
import type { DMConversation } from "@nodes/core";

/**
 * AppShell is the primary layout for the application.
 * Based on Discord's layout pattern:
 * - Node sidebar (narrow, left)
 * - Channel sidebar (medium width)
 * - Main content area (fills remaining space)
 * - Member sidebar (medium width, collapsible)
 * - Status bar (full width bottom)
 */
export function AppShell() {
  const isAuthenticated = useIdentityStore((s) => s.isAuthenticated);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const isLoadingNodes = useNodeStore((s) => s.isLoading);
  const viewMode = useNavigationStore((s) => s.viewMode);
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const conversations = useDMStore((s) => s.conversations);
  const initializeSocial = useSocialStore((s) => s.initialize);
  const [showMembers, setShowMembers] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Voice state for keyboard shortcuts
  const { voice } = useTransport();
  const voiceState = useVoiceStore((s) => s.state);
  
  // Search state
  const toggleSearch = useSearchStore((s) => s.toggle);
  
  // UI state for settings and profile
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);

  // Keyboard shortcut handlers
  const handleCloseModal = useCallback(() => {
    if (showSettings) {
      setShowSettings(false);
    } else if (showEditProfile) {
      setShowEditProfile(false);
    } else if (showProfile) {
      setShowProfile(false);
      setProfileUserId(null);
    }
  }, [showSettings, showProfile, showEditProfile]);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  // Voice toggle handlers
  const handleToggleMute = useCallback(() => {
    if (voice && voiceState.channelId) {
      voice.setMuted(!voiceState.muted);
    }
  }, [voice, voiceState.channelId, voiceState.muted]);

  const handleToggleDeafen = useCallback(() => {
    if (voice && voiceState.channelId) {
      voice.setDeafened(!voiceState.deafened);
    }
  }, [voice, voiceState.channelId, voiceState.deafened]);

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    onOpenSettings: handleOpenSettings,
    onCloseModal: handleCloseModal,
    onQuickSwitcher: toggleSearch,
    onToggleMute: handleToggleMute,
    onToggleDeafen: handleToggleDeafen,
  });

  // Function to open a user's profile popup
  const openUserProfile = useCallback((userId: string) => {
    setProfileUserId(userId);
    setShowProfile(true);
  }, []);

  // Get active conversation details
  const activeConversation = conversations.find(
    (c: DMConversation) => c.id === activeConversationId
  );

  // Subscribe to all channels in the active Node for unread tracking
  useNodeSubscriptions();

  // Subscribe to member changes for the active Node
  useMemberSubscription();

  // Subscribe to roles for the active Node
  useRoleSubscriptions();

  // Subscribe to kick/ban events for the current user
  useModerationEvents();

  // Subscribe to all DM conversations for unread tracking
  useDMSubscriptions();

  // Subscribe to presence changes for node members
  usePresenceSubscriptions();

  // Set user's presence status to online
  usePresenceStatus();

  // Handle graceful shutdown (set offline, cleanup)
  useGracefulShutdown();

  // Refresh directory listings for owned Nodes periodically
  useDirectoryRefresh();

  // Load user's Nodes, DM conversations, and social data on mount
  useEffect(() => {
    if (isAuthenticated && publicKey) {
      Promise.all([
        useNodeStore.getState().loadUserNodes(),
        useDMStore.getState().loadConversations(),
        initializeSocial(publicKey),
        initNotificationManager(),
      ]).finally(() => {
        setInitialLoadComplete(true);
      });
    }
  }, [isAuthenticated, publicKey, initializeSocial]);

  // Show loading screen during initial load
  if (!initialLoadComplete && isLoadingNodes) {
    return (
      <div className="h-screen w-screen bg-depth-base flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-accent-primary flex items-center justify-center animate-pulse glow-accent">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="4" r="2" />
              <circle cx="12" cy="20" r="2" />
              <circle cx="4" cy="12" r="2" />
              <circle cx="20" cy="12" r="2" />
              <line x1="12" y1="7" x2="12" y2="9" stroke="currentColor" strokeWidth="1.5" />
              <line x1="12" y1="15" x2="12" y2="17" stroke="currentColor" strokeWidth="1.5" />
              <line x1="7" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" />
              <line x1="15" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <p className="text-text-muted text-sm">Loading your Nodes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-depth-base text-text-primary flex flex-col overflow-hidden">
      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node sidebar - narrow left bar with Node icons and DM button */}
        <NodeSidebar />

        {/* Secondary sidebar - changes based on view mode */}
        {viewMode === "node" && <ChannelSidebar />}
        {viewMode === "dm" && <DMSidebar onUserClick={openUserProfile} />}
        {viewMode === "friends" && <RequestsPanel onUserClick={openUserProfile} />}
        {/* Discovery mode has no secondary sidebar */}

        {/* Main content area - changes based on view mode */}
        {viewMode === "node" && (
          <MainContent
            showMembers={showMembers}
            onToggleMembers={() => setShowMembers(!showMembers)}
          />
        )}
        {viewMode === "dm" && (
          <div className="flex-1 flex flex-col bg-nodes-bg overflow-hidden">
            {activeConversation ? (
              <DMView
                conversationId={activeConversation.id}
                recipientKey={activeConversation.recipientKey}
                onUserClick={openUserProfile}
              />
            ) : (
              <DMEmptyState />
            )}
          </div>
        )}
        {viewMode === "friends" && <FriendsEmptyState />}
        {viewMode === "discovery" && <DiscoveryPage />}

        {/* Member sidebar - always mounted to preserve state, hidden when not in node view */}
        <div className={viewMode === "node" && showMembers ? "" : "hidden"}>
          <MemberSidebar onUserClick={openUserProfile} />
        </div>
      </div>

      {/* Status bar / User panel */}
      <StatusBar 
        onOpenSettings={() => setShowSettings(true)} 
        onOpenProfile={() => setShowEditProfile(true)}
      />

      {/* Settings overlay */}
      {showSettings && (
        <SettingsPage onClose={() => setShowSettings(false)} />
      )}

      {/* Edit profile modal */}
      {showEditProfile && (
        <EditProfileModal onClose={() => setShowEditProfile(false)} />
      )}

      {/* Search overlay */}
      <SearchOverlay />

      {/* Profile popup for viewing other users */}
      {showProfile && profileUserId && (
        <ProfilePopup
          publicKey={profileUserId}
          onClose={() => {
            setShowProfile(false);
            setProfileUserId(null);
          }}
          onEditProfile={() => setShowEditProfile(true)}
        />
      )}
    </div>
  );
}

/**
 * Empty state for DMs when no conversation is selected.
 */
function DMEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-20 h-20 rounded-full bg-nodes-surface flex items-center justify-center mb-4">
        <svg
          className="w-10 h-10 text-nodes-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-nodes-text mb-2">
        Your Direct Messages
      </h2>
      <p className="text-nodes-text-muted text-sm max-w-md">
        Select a conversation from the sidebar or start a new one by clicking the + button.
      </p>
      <p className="text-nodes-text-muted text-xs mt-4 flex items-center gap-1">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
        </svg>
        All messages are end-to-end encrypted
      </p>
    </div>
  );
}

/**
 * Empty state for Friends view.
 */
function FriendsEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-nodes-bg">
      <div className="w-20 h-20 rounded-full bg-nodes-surface flex items-center justify-center mb-4">
        <svg
          className="w-10 h-10 text-nodes-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-nodes-text mb-2">
        Friends & Requests
      </h2>
      <p className="text-nodes-text-muted text-sm max-w-md">
        Manage your friends and respond to friend requests from the sidebar.
        Add friends by clicking on members in any Node.
      </p>
    </div>
  );
}
