import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getSearchIndex } from "./services/search-index";

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
