import { useNodeStore } from "../stores/node-store";
import { ChannelView } from "../components/channel";

interface MainContentProps {
  showMembers: boolean;
  onToggleMembers: () => void;
}

/**
 * MainContent is the primary content area.
 * In Milestone 1.5, this will show channel messages.
 * For now, it shows placeholder content and empty states.
 */
export function MainContent({ showMembers, onToggleMembers }: MainContentProps) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const activeChannelId = useNodeStore((s) => s.activeChannelId);
  const nodes = useNodeStore((s) => s.nodes);
  const channels = useNodeStore((s) => s.channels);
  const loadingChannels = useNodeStore((s) => s.loadingChannels);
  
  const isLoadingChannels = activeNodeId ? loadingChannels[activeNodeId] ?? false : false;
  
  // Compute active node/channel instead of using methods that call get()
  const activeNode = nodes.find((n) => n.id === activeNodeId) || null;
  const nodeChannels = activeNodeId ? channels[activeNodeId] || [] : [];
  const activeChannel = nodeChannels.find((c) => c.id === activeChannelId) || null;

  // No Nodes joined
  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-nodes-bg">
        <EmptyNoNodes />
      </div>
    );
  }

  // No Node selected (shouldn't happen if we have Nodes)
  if (!activeNodeId || !activeNode) {
    return (
      <div className="flex-1 flex flex-col bg-nodes-bg">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-nodes-text-muted">Select a Node to continue.</p>
        </div>
      </div>
    );
  }

  // No channel selected - show loading spinner if channels are loading
  if (!activeChannelId || !activeChannel) {
    return (
      <div className="flex-1 flex flex-col bg-nodes-bg">
        <Header
          title={activeNode.name}
          showMembers={showMembers}
          onToggleMembers={onToggleMembers}
        />
        <div className="flex-1 flex items-center justify-center">
          {isLoadingChannels ? (
            <div className="w-8 h-8 border-2 border-nodes-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <p className="text-nodes-text-muted">Select a channel to start chatting.</p>
          )}
        </div>
      </div>
    );
  }

  // Channel selected — show ChannelView
  return (
    <div className="flex-1 flex flex-col bg-nodes-bg">
      <Header
        title={`#${activeChannel.name}`}
        subtitle={activeChannel.topic}
        showMembers={showMembers}
        onToggleMembers={onToggleMembers}
      />

      {/* Channel messages */}
      <ChannelView
        channelId={activeChannelId}
        channelName={activeChannel.name}
        channelTopic={activeChannel.topic}
      />
    </div>
  );
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  showMembers: boolean;
  onToggleMembers: () => void;
}

function Header({ title, subtitle, showMembers, onToggleMembers }: HeaderProps) {
  return (
    <div className="h-12 px-4 flex items-center justify-between border-b border-nodes-border shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="font-semibold text-nodes-text truncate">{title}</h1>
        {subtitle && (
          <>
            <span className="text-nodes-border">|</span>
            <span className="text-nodes-text-muted text-sm truncate">
              {subtitle}
            </span>
          </>
        )}
      </div>

      <button
        onClick={onToggleMembers}
        className={`p-1.5 rounded transition-colors ${
          showMembers
            ? "text-nodes-text bg-nodes-surface"
            : "text-nodes-text-muted hover:text-nodes-text"
        }`}
        title={showMembers ? "Hide Members" : "Show Members"}
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
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </button>
    </div>
  );
}

function EmptyNoNodes() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-nodes-accent/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-nodes-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-nodes-text mb-3">
          No Nodes Yet
        </h2>
        <p className="text-nodes-text-muted mb-6">
          Nodes are communities where you can chat with others. Create your own
          or join an existing one.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <p className="text-sm text-nodes-text-muted">
            Use the buttons on the left sidebar to get started
          </p>
        </div>
      </div>
    </div>
  );
}
