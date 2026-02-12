interface NewMessagesBannerProps {
  onClick: () => void;
}

/**
 * NewMessagesBanner is a floating button that appears when the user has scrolled up
 * and new messages arrive. Clicking it scrolls to the bottom.
 */
export function NewMessagesBanner({ onClick }: NewMessagesBannerProps) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-nodes-primary text-white text-sm font-medium rounded-full shadow-lg hover:bg-nodes-primary/90 transition-all flex items-center gap-2"
    >
      <span>↓</span>
      <span>New messages</span>
    </button>
  );
}
