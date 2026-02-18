import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNodeStore } from "../../stores/node-store";
import type { NodeMember } from "@nodes/core";
import { createUserMention } from "@nodes/core";
import { AtSign, Users, Radio } from "lucide-react";

// Empty array constant to avoid re-renders from new array reference
const EMPTY_MEMBERS: NodeMember[] = [];

interface MentionOption {
  id: string;
  type: "user" | "everyone" | "here";
  displayName: string;
  publicKey?: string; // Only for users
}

interface MentionAutocompleteProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onMentionSelect: (mention: string) => void;
  isEnabled?: boolean;
}

/**
 * MentionAutocomplete provides @mention autocomplete functionality
 * 
 * - Detects @ trigger in input
 * - Shows filtered list of members + @everyone/@here
 * - Supports keyboard navigation and mouse selection
 * - Inserts mention token into text
 */
export function MentionAutocomplete({
  inputRef,
  onMentionSelect,
  isEnabled = true,
}: MentionAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<{ top: number; left: number } | null>(null);
  const [triggerStart, setTriggerStart] = useState<number>(-1);
  
  const popupRef = useRef<HTMLDivElement>(null);
  
  // Get members for current node - use separate selectors to avoid closure issues
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const membersMap = useNodeStore((s) => s.members);
  const displayNameCache = useNodeStore((s) => s.displayNameCache);
  const members = (activeNodeId && membersMap[activeNodeId]) || EMPTY_MEMBERS;

  // Build options list with resolved display names
  const options = useMemo(() => {
    const result: MentionOption[] = [];

    // Add special mentions
    result.push(
      { id: "everyone", type: "everyone", displayName: "everyone" },
      { id: "here", type: "here", displayName: "here" }
    );

    // Add members with resolved display names from cache
    console.log("[MentionAutocomplete] Building options, members:", members.length);
    for (const member of members) {
      const cached = displayNameCache[member.publicKey];
      const displayName = cached?.name || member.displayName || member.publicKey.slice(0, 8);
      console.log("[MentionAutocomplete] Member:", { publicKey: member.publicKey.slice(0, 20), displayName });
      result.push({
        id: member.publicKey,
        type: "user",
        displayName,
        publicKey: member.publicKey,
      });
    }

    return result;
  }, [members, displayNameCache]);

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    if (!query) return options;
    
    const lowerQuery = query.toLowerCase();
    return options.filter((opt) =>
      opt.displayName.toLowerCase().includes(lowerQuery)
    );
  }, [options, query]);

  // Reset selected index when filtered options change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredOptions.length]);

  // Get caret position in textarea
  const getCaretCoordinates = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return null;

    const { selectionStart } = textarea;
    const text = textarea.value.substring(0, selectionStart);
    
    // Create a hidden div to measure text
    const mirror = document.createElement("div");
    const computed = window.getComputedStyle(textarea);
    
    // Copy relevant styles
    const styles = [
      "font-family", "font-size", "font-weight", "letter-spacing",
      "line-height", "padding-top", "padding-right", "padding-bottom",
      "padding-left", "border-width", "box-sizing", "width"
    ];
    
    styles.forEach((prop) => {
      mirror.style.setProperty(prop, computed.getPropertyValue(prop));
    });
    
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    
    // Add text content with a marker
    mirror.textContent = text;
    const marker = document.createElement("span");
    marker.textContent = "|";
    mirror.appendChild(marker);
    
    document.body.appendChild(mirror);
    
    const rect = textarea.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    
    // Calculate position relative to textarea
    const left = markerRect.left - mirrorRect.left + rect.left;
    const top = markerRect.top - mirrorRect.top + rect.top;
    
    document.body.removeChild(mirror);
    
    return { top, left };
  }, [inputRef]);

  // Handle input changes to detect @ trigger
  const handleInput = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea || !isEnabled) return;

    const { value, selectionStart } = textarea;
    
    // Look backwards from cursor for @
    let atIndex = -1;
    for (let i = selectionStart - 1; i >= 0; i--) {
      const char = value[i];
      if (char === "@") {
        // Check if @ is at start or preceded by whitespace
        if (i === 0 || /\s/.test(value[i - 1])) {
          atIndex = i;
          break;
        }
      }
      // Stop if we hit whitespace (no @ found in this "word")
      if (/\s/.test(char)) break;
    }

    if (atIndex !== -1) {
      const searchQuery = value.substring(atIndex + 1, selectionStart);
      // Only open if query doesn't contain spaces
      if (!/\s/.test(searchQuery)) {
        setQuery(searchQuery);
        setTriggerStart(atIndex);
        setIsOpen(true);
        setCursorPosition(getCaretCoordinates());
        return;
      }
    }

    // No valid trigger found
    setIsOpen(false);
    setQuery("");
    setTriggerStart(-1);
  }, [inputRef, isEnabled, getCaretCoordinates]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || filteredOptions.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case "Enter":
        case "Tab":
          if (isOpen && filteredOptions[selectedIndex]) {
            e.preventDefault();
            const option = filteredOptions[selectedIndex];
            const textarea = inputRef.current;
            if (!textarea || triggerStart === -1) return;

            // Build the mention token
            let mentionToken: string;
            if (option.type === "user" && option.publicKey) {
              mentionToken = createUserMention(option.publicKey);
            } else if (option.type === "everyone") {
              mentionToken = "<@everyone>";
            } else if (option.type === "here") {
              mentionToken = "<@here>";
            } else {
              return;
            }

            // Replace @query with mention token
            const { value, selectionStart } = textarea;
            const before = value.substring(0, triggerStart);
            const after = value.substring(selectionStart);
            const newValue = before + mentionToken + " " + after;

            // Notify parent to update content
            onMentionSelect(newValue);

            // Close popup
            setIsOpen(false);
            setQuery("");
            setTriggerStart(-1);

            // Refocus and set cursor position after mention
            setTimeout(() => {
              if (textarea) {
                const newCursorPos = triggerStart + mentionToken.length + 1;
                textarea.focus();
                textarea.setSelectionRange(newCursorPos, newCursorPos);
              }
            }, 0);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setQuery("");
          break;
      }
    },
    [isOpen, filteredOptions, selectedIndex, inputRef, triggerStart, onMentionSelect]
  );

  // Select an option
  const selectOption = useCallback(
    (option: MentionOption) => {
      console.log("[MentionAutocomplete] selectOption called:", { 
        type: option.type, 
        displayName: option.displayName, 
        publicKey: option.publicKey?.slice(0, 30) 
      });
      
      const textarea = inputRef.current;
      if (!textarea || triggerStart === -1) return;

      // Build the mention token
      let mentionToken: string;
      if (option.type === "user" && option.publicKey) {
        mentionToken = createUserMention(option.publicKey);
        console.log("[MentionAutocomplete] Created user mention token:", mentionToken.slice(0, 50));
      } else if (option.type === "everyone") {
        mentionToken = "<@everyone>";
      } else if (option.type === "here") {
        mentionToken = "<@here>";
      } else {
        return;
      }

      // Replace @query with mention token
      const { value, selectionStart } = textarea;
      const before = value.substring(0, triggerStart);
      const after = value.substring(selectionStart);
      const newValue = before + mentionToken + " " + after;

      // Notify parent to update content
      onMentionSelect(newValue);

      // Close popup
      setIsOpen(false);
      setQuery("");
      setTriggerStart(-1);

      // Refocus and set cursor position after mention
      setTimeout(() => {
        if (textarea) {
          const newCursorPos = triggerStart + mentionToken.length + 1;
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [inputRef, triggerStart, onMentionSelect]
  );

  // Attach event listeners
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.addEventListener("input", handleInput);
    textarea.addEventListener("keydown", handleKeyDown as EventListener);
    textarea.addEventListener("click", handleInput);

    return () => {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("keydown", handleKeyDown as EventListener);
      textarea.removeEventListener("click", handleInput);
    };
  }, [handleInput, handleKeyDown, inputRef]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inputRef]);

  // Scroll selected item into view
  useEffect(() => {
    if (!popupRef.current) return;
    const selected = popupRef.current.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen || !cursorPosition || filteredOptions.length === 0) {
    return null;
  }

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-depth-secondary border border-surface-border rounded-lg shadow-lg py-1 min-w-50 max-w-75 max-h-60 overflow-y-auto"
      style={{
        bottom: `calc(100vh - ${cursorPosition.top}px + 8px)`,
        left: cursorPosition.left,
      }}
    >
      <div className="px-2 py-1 text-xs text-text-muted uppercase tracking-wide">
        Mention
      </div>
      {filteredOptions.map((option, index) => (
        <button
          key={option.id}
          data-selected={index === selectedIndex}
          onClick={() => selectOption(option)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
            index === selectedIndex
              ? "bg-accent-primary/20 text-text-primary"
              : "text-text-secondary hover:bg-surface-hover"
          }`}
        >
          {option.type === "user" && (
            <AtSign className="w-4 h-4 text-text-muted shrink-0" />
          )}
          {option.type === "everyone" && (
            <Users className="w-4 h-4 text-text-muted shrink-0" />
          )}
          {option.type === "here" && (
            <Radio className="w-4 h-4 text-text-muted shrink-0" />
          )}
          <span className="truncate">{option.displayName}</span>
          {option.type === "everyone" && (
            <span className="text-xs text-text-muted ml-auto">All members</span>
          )}
          {option.type === "here" && (
            <span className="text-xs text-text-muted ml-auto">Online members</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default MentionAutocomplete;
