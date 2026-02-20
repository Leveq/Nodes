import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getSearchIndex } from "./services/search-index";
import { ThemeEngine } from "./services/theme-engine";
import { configureAvatarManager } from "@nodes/transport-gun";

// Detect if running in Tauri
const isTauri = !!(window as any).__TAURI_INTERNALS__;

// Configure IPFS endpoints for avatar pinning/fetching
// These env vars are set in .env.local or via deploy script
// Use Tauri's native HTTP client for server pinning to bypass CORS (desktop only)
if (isTauri) {
  // Dynamic import to avoid errors in browser
  import("@tauri-apps/plugin-http").then(({ fetch: tauriFetch }) => {
    configureAvatarManager({
      ipfsApiUrl: import.meta.env.VITE_IPFS_API_URL,
      ipfsGatewayUrl: import.meta.env.VITE_IPFS_GATEWAY_URL,
      serverPinFetch: tauriFetch as unknown as typeof fetch,
    });
  });
} else {
  // Web: use regular fetch for server pinning
  configureAvatarManager({
    ipfsApiUrl: import.meta.env.VITE_IPFS_API_URL,
    ipfsGatewayUrl: import.meta.env.VITE_IPFS_GATEWAY_URL,
  });
}

// Load theme before React renders to prevent flash of unstyled content
ThemeEngine.loadFromLocalStorage();

// Initialize search index at app startup
const searchIndex = getSearchIndex();
searchIndex.initialize().catch(console.error);

// Expose for debugging
(window as any).__searchIndex = searchIndex;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
