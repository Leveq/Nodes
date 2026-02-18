import { memo, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { MentionRenderer } from "./MentionRenderer";

// Import a dark theme for syntax highlighting
import "highlight.js/styles/github-dark.css";

interface MarkdownRendererProps {
  content: string;
}

// Pattern strings - NO /g flag for .test() calls (which maintain lastIndex state)
// Note: Hyphen at end of character class is treated as literal
const MENTION_PATTERN = /<@[a-zA-Z0-9_.+-]+>|<@&[a-zA-Z0-9_.+-]+>|<@everyone>|<@here>/;

// Escaped mention pattern (after HTML entity encoding)
const ESCAPED_MENTION_PATTERN = /&lt;@[a-zA-Z0-9_.+-]+&gt;|&lt;@&amp;[a-zA-Z0-9_.+-]+&gt;|&lt;@everyone&gt;|&lt;@here&gt;/;

// Regex to detect markdown syntax (common patterns)
const MARKDOWN_SYNTAX_REGEX = /(\*\*|__|\*|_|~~|```|`|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^>\s|\[.*\]\(.*\)|!\[.*\]\(.*\))/m;

/**
 * Check if content has markdown formatting
 */
function hasMarkdownSyntax(content: string): boolean {
  return MARKDOWN_SYNTAX_REGEX.test(content);
}

/**
 * Check if content contains @mentions (raw or escaped)
 */
function hasMentions(content: string): boolean {
  return MENTION_PATTERN.test(content) || ESCAPED_MENTION_PATTERN.test(content);
}

/**
 * Unescape HTML entities back to mention tokens for MentionRenderer
 */
function unescapeMentions(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Process React children to detect and render mentions in text
 */
function processTextWithMentions(children: React.ReactNode): React.ReactNode {
  if (!children) return children;

  // Process each child
  const processChild = (child: React.ReactNode): React.ReactNode => {
    // Only process string children
    if (typeof child === "string") {
      // Check for escaped or raw mentions
      if (hasMentions(child)) {
        // Unescape HTML entities and render with MentionRenderer
        const unescaped = unescapeMentions(child);
        return <MentionRenderer content={unescaped} />;
      }
      return child;
    }

    // For arrays, process each element
    if (Array.isArray(child)) {
      return child.map((c, i) => <span key={i}>{processChild(c)}</span>);
    }

    // Return non-string children as-is
    return child;
  };

  // Handle array of children or single child
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <span key={index}>{processChild(child)}</span>
    ));
  }

  return processChild(children);
}

/**
 * MarkdownRenderer renders message content with Markdown formatting.
 *
 * Supports:
 * - **bold**, *italic*, ~~strikethrough~~
 * - `inline code` and ```code blocks``` with syntax highlighting
 * - > blockquotes
 * - Links (open in external browser via Tauri)
 * - Lists (ordered and unordered)
 * - Headings (scaled down for chat context)
 *
 * Memoized by content string to avoid re-parsing unchanged messages.
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  // Compute these BEFORE any returns (hooks must be called unconditionally)
  const contentHasMentions = content ? hasMentions(content) : false;
  const contentHasMarkdown = content ? hasMarkdownSyntax(content) : false;
  
  // If content has BOTH markdown and mentions, we need to escape mentions
  // so markdown doesn't mangle them. We'll use HTML entities.
  const processedContent = useMemo(() => {
    if (!content || !contentHasMentions) return content || "";
    
    // Create fresh regex with global flag for replacement
    const mentionRegex = new RegExp(MENTION_PATTERN.source, 'g');
    
    // Replace < and > in mention tokens with HTML entities
    // This prevents markdown from interpreting them as HTML
    return content.replace(mentionRegex, (match) => {
      return match
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    });
  }, [content, contentHasMentions]);

  // Handle link clicks - open in external browser
  const handleLinkClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string | undefined) => {
      e.preventDefault();
      if (!href) return;

      // Check for javascript: protocol (security)
      if (href.toLowerCase().startsWith("javascript:")) {
        console.warn("[Markdown] Blocked javascript: URL");
        return;
      }

      // Open in external browser via Tauri
      // Falls back to window.open for browser-only testing
      if (window.__TAURI_INTERNALS__) {
        import("@tauri-apps/plugin-shell").then(({ open }) => {
          open(href).catch(console.error);
        });
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    },
    []
  );

  // Custom component renderers for chat context
  const components: Components = {
    // Links - open externally
    a: ({ href, children }) => (
      <a
        href={href}
        onClick={(e) => handleLinkClick(e, href)}
        className="text-nodes-primary hover:underline cursor-pointer"
        title={href}
      >
        {children}
      </a>
    ),

    // Scale down headings for chat (they shouldn't dominate)
    h1: ({ children }) => (
      <span className="block font-bold text-lg mt-2 mb-1">{children}</span>
    ),
    h2: ({ children }) => (
      <span className="block font-bold text-base mt-2 mb-1">{children}</span>
    ),
    h3: ({ children }) => (
      <span className="block font-semibold text-sm mt-1 mb-0.5">{children}</span>
    ),
    h4: ({ children }) => (
      <span className="block font-semibold text-sm mt-1 mb-0.5">{children}</span>
    ),
    h5: ({ children }) => (
      <span className="block font-medium text-sm">{children}</span>
    ),
    h6: ({ children }) => (
      <span className="block font-medium text-sm text-nodes-text-muted">
        {children}
      </span>
    ),

    // Inline code
    code: ({ className, children, ...props }) => {
      // Check if this is a code block (has language class) or inline
      const isCodeBlock = className?.includes("language-");
      
      if (isCodeBlock) {
        // Code blocks are wrapped in <pre> by rehype-highlight
        return (
          <code className={`${className} text-sm`} {...props}>
            {children}
          </code>
        );
      }

      // Inline code
      return (
        <code className="bg-nodes-surface px-1.5 py-0.5 rounded text-sm font-mono text-pink-400">
          {children}
        </code>
      );
    },

    // Code blocks (wraps the code element)
    pre: ({ children }) => (
      <pre className="bg-nodes-depth rounded-lg p-3 my-2 overflow-x-auto border border-nodes-border text-sm">
        {children}
      </pre>
    ),

    // Blockquotes - Discord-style left border
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-nodes-border pl-3 my-2 text-nodes-text-muted italic">
        {children}
      </blockquote>
    ),

    // Paragraphs - preserve whitespace handling
    p: ({ children }) => (
      <p className="wrap-break-word whitespace-pre-wrap my-0.5">{processTextWithMentions(children)}</p>
    ),

    // Lists
    ul: ({ children }) => (
      <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>
    ),
    li: ({ children }) => <li className="text-nodes-text">{processTextWithMentions(children)}</li>,

    // Strong (bold)
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),

    // Emphasis (italic)
    em: ({ children }) => <em className="italic">{children}</em>,

    // Strikethrough
    del: ({ children }) => (
      <del className="line-through text-nodes-text-muted">{children}</del>
    ),

    // Horizontal rule
    hr: () => <hr className="border-nodes-border my-4" />,

    // Images in markdown (basic support)
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt || ""}
        className="max-w-full h-auto rounded my-2"
        loading="lazy"
      />
    ),

    // Tables (GFM)
    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full border border-nodes-border rounded">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-nodes-surface">{children}</thead>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr className="border-b border-nodes-border">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left text-sm font-semibold">{children}</th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 text-sm">{children}</td>
    ),
  };

  // Early returns AFTER all hooks are defined
  // Don't render empty content
  if (!content || !content.trim()) {
    return null;
  }

  // Fast path: If content has mentions but NO markdown syntax, 
  // render directly with MentionRenderer (avoids markdown mangling mentions)
  if (contentHasMentions && !contentHasMarkdown) {
    return (
      <div className="markdown-content text-nodes-text">
        <p className="wrap-break-word whitespace-pre-wrap my-0.5">
          <MentionRenderer content={content} />
        </p>
      </div>
    );
  }

  return (
    <div className="markdown-content text-nodes-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;
