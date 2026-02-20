import { useState, useRef, useEffect } from "react";
import { Film } from "lucide-react";
import { GifPicker } from "./GifPicker";
import { GiphyService, type GiphyGif } from "../../services/giphy-service";

interface GifButtonProps {
  onGifSelect: (gifUrl: string) => void;
  disabled?: boolean;
}

/**
 * GifButton opens the GIF picker for selecting and sending GIFs.
 * 
 * When a GIF is selected, it calls onGifSelect with the full URL
 * which can be sent as a message.
 */
export function GifButton({ onGifSelect, disabled }: GifButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Check if Giphy is configured
  const isConfigured = GiphyService.isConfigured();

  // Close picker when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        pickerRef.current &&
        !pickerRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleGifSelect = (gif: GiphyGif) => {
    // Send the full URL - this will be rendered inline
    onGifSelect(gif.fullUrl);
    setIsOpen(false);
  };

  // Don't render if Giphy is not configured
  if (!isConfigured) {
    return null;
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`p-2 rounded-lg transition-colors ${
          disabled
            ? "text-nodes-text-muted/50 cursor-not-allowed"
            : isOpen
              ? "text-nodes-primary bg-nodes-primary/10"
              : "text-nodes-text-muted hover:text-nodes-text hover:bg-nodes-bg"
        }`}
        title="Send a GIF"
      >
        <Film className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Picker positioned above the button */}
          <div
            ref={pickerRef}
            className="absolute bottom-full left-0 mb-2 z-50"
          >
            <GifPicker
              onSelect={handleGifSelect}
              onClose={() => setIsOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default GifButton;
