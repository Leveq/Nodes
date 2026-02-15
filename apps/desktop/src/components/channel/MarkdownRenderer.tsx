import { memo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";

// Import a dark theme for syntax highlighting
import "highlight.js/styles/github-dark.css";

interface MarkdownRendererProps {
  content: string;
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
  // Don't render empty content
  if (!content || !content.trim()) {
    return null;
  }

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
      <p className="wrap-break-word whitespace-pre-wrap my-0.5">{children}</p>
    ),

    // Lists
    ul: ({ children }) => (
      <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>
    ),
    li: ({ children }) => <li className="text-nodes-text">{children}</li>,

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

  return (
    <div className="markdown-content text-nodes-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;
