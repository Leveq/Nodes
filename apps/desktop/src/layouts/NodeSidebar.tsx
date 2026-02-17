import { useState } from "react";
import { Compass } from "lucide-react";
import { useNodeStore } from "../stores/node-store";
import { useNavigationStore } from "../stores/navigation-store";
import { useDMStore } from "../stores/dm-store";
import { useSocialStore } from "../stores/social-store";
import { CreateNodeModal } from "../components/modals/CreateNodeModal";
import { JoinNodeModal } from "../components/modals/JoinNodeModal";

/**
 * NodeSidebar displays a vertical list of Node icons.
 * Clicking a Node icon selects it, updating the channel sidebar.
 * Also includes a DM icon at the top for direct messages.
 */
export function NodeSidebar() {
  const nodes = useNodeStore((s) => s.nodes);
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const setActiveNode = useNodeStore((s) => s.setActiveNode);
  const viewMode = useNavigationStore((s) => s.viewMode);
  const setViewMode = useNavigationStore((s) => s.setViewMode);
  const dmUnreadCounts = useDMStore((s) => s.unreadCounts);
  const incomingRequests = useSocialStore((s) => s.incomingRequests);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Calculate total DM unread count
  const totalDMUnread = Object.values(dmUnreadCounts).reduce((sum, count) => sum + count, 0);

  const handleDMClick = () => {
    setViewMode("dm");
  };

  const handleFriendsClick = () => {
    setViewMode("friends");
    // Clear active DM when leaving DM view so useDMSubscriptions can re-subscribe
    useDMStore.getState().setActiveConversation(null);
  };

  const handleNodeClick = (nodeId: string) => {
    setViewMode("node");
    setActiveNode(nodeId);
    // Clear active DM when leaving DM view so useDMSubscriptions can re-subscribe
    useDMStore.getState().setActiveConversation(null);
  };

  const handleExploreClick = () => {
    setViewMode("discovery");
    // Clear active DM when leaving DM view
    useDMStore.getState().setActiveConversation(null);
  };

  return (
    <div className="w-[72px] bg-depth-tertiary flex flex-col items-center py-3 gap-2 shrink-0">
      {/* DM icon */}
      <DMIcon
        isActive={viewMode === "dm"}
        onClick={handleDMClick}
        unreadCount={totalDMUnread}
      />

      {/* Friends icon */}
      <FriendsIcon
        isActive={viewMode === "friends"}
        onClick={handleFriendsClick}
        requestCount={incomingRequests.length}
      />

      {/* Separator */}
      <div className="w-8 h-[2px] bg-nodes-border rounded-full my-1" />

      {/* Node icons */}
      {nodes.map((node) => (
        <NodeIcon
          key={node.id}
          icon={node.icon}
          name={node.name}
          isActive={viewMode === "node" && node.id === activeNodeId}
          onClick={() => handleNodeClick(node.id)}
        />
      ))}

      {/* Separator before action buttons */}
      <div className="w-8 h-[2px] bg-nodes-border rounded-full my-1" />

      {/* Explore button */}
      <button
        onClick={handleExploreClick}
        className={`w-12 h-12 rounded-full transition-all duration-200 flex items-center justify-center ${
          viewMode === "discovery"
            ? "bg-nodes-accent text-white rounded-2xl"
            : "bg-nodes-surface text-nodes-accent hover:bg-nodes-accent hover:text-white hover:rounded-2xl"
        }`}
        title="Explore Public Nodes"
      >
        <Compass className="w-5 h-5" />
      </button>

      {/* Create Node button */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="w-12 h-12 rounded-full bg-nodes-surface hover:bg-nodes-accent hover:text-white transition-all duration-200 flex items-center justify-center text-nodes-accent text-2xl font-light"
        title="Create a Node"
      >
        +
      </button>

      {/* Join Node button */}
      <button
        onClick={() => setShowJoinModal(true)}
        className="w-12 h-12 rounded-full bg-nodes-surface hover:bg-nodes-accent hover:text-white transition-all duration-200 flex items-center justify-center text-nodes-accent group"
        title="Join a Node"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
          />
        </svg>
      </button>

      {/* Modals */}
      {showCreateModal && (
        <CreateNodeModal onClose={() => setShowCreateModal(false)} />
      )}
      {showJoinModal && (
        <JoinNodeModal onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
}

interface NodeIconProps {
  icon: string;
  name: string;
  isActive: boolean;
  onClick: () => void;
}

function NodeIcon({ icon, name, isActive, onClick }: NodeIconProps) {
  // Generate a consistent color from the node name
  const colors = [
    "bg-purple-500",
    "bg-blue-500",
    "bg-green-500",
    "bg-yellow-500",
    "bg-red-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-cyan-500",
  ];
  const colorIndex =
    name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    colors.length;
  const bgColor = colors[colorIndex];

  return (
    <div className="relative group">
      {/* Active indicator */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 rounded-r-full bg-white transition-all duration-200 ${
          isActive ? "h-10" : "h-0 group-hover:h-5"
        }`}
      />

      <button
        onClick={onClick}
        className={`w-12 h-12 flex items-center justify-center text-white text-lg font-semibold transition-all duration-200 ${bgColor} ${
          isActive ? "rounded-2xl" : "rounded-full hover:rounded-2xl"
        }`}
        title={name}
      >
        {icon.length === 1 ? icon : icon.charAt(0)}
      </button>
    </div>
  );
}

interface DMIconProps {
  isActive: boolean;
  onClick: () => void;
  unreadCount: number;
}

function DMIcon({ isActive, onClick, unreadCount }: DMIconProps) {
  return (
    <div className="relative group">
      {/* Active indicator */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 rounded-r-full bg-white transition-all duration-200 ${
          isActive ? "h-10" : "h-0 group-hover:h-5"
        }`}
      />

      <button
        onClick={onClick}
        className={`w-12 h-12 flex items-center justify-center text-white transition-all duration-200 bg-nodes-primary ${
          isActive ? "rounded-2xl" : "rounded-full hover:rounded-2xl"
        }`}
        title="Direct Messages"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </button>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </div>
  );
}

interface FriendsIconProps {
  isActive: boolean;
  onClick: () => void;
  requestCount: number;
}

function FriendsIcon({ isActive, onClick, requestCount }: FriendsIconProps) {
  return (
    <div className="relative group">
      {/* Active indicator */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 rounded-r-full bg-white transition-all duration-200 ${
          isActive ? "h-10" : "h-0 group-hover:h-5"
        }`}
      />

      <button
        onClick={onClick}
        className={`w-12 h-12 flex items-center justify-center text-white transition-all duration-200 bg-green-600 ${
          isActive ? "rounded-2xl" : "rounded-full hover:rounded-2xl"
        }`}
        title="Friends"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </button>

      {/* Request badge */}
      {requestCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {requestCount > 99 ? "99+" : requestCount}
        </span>
      )}
    </div>
  );
}
