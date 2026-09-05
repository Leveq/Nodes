/// <reference types="vite/client" />

interface Window {
  // Injected by the Tauri runtime; absent in plain-browser builds.
  __TAURI_INTERNALS__?: unknown;
}
