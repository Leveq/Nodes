import { useState } from "react";
import { check } from "@tauri-apps/plugin-updater";

type UpdateStatus = "idle" | "checking" | "up-to-date" | "downloading" | "installed" | "error";

/**
 * About settings section: version, links, philosophy.
 */
export function AboutSettings() {
  const version = "1.0.0-beta"; // TODO: pull from package.json or build env
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  async function handleCheckForUpdates() {
    setUpdateStatus("checking");
    setUpdateVersion(null);
    try {
      const update = await check();
      if (!update) {
        setUpdateStatus("up-to-date");
        return;
      }
      setUpdateVersion(update.version);
      setUpdateStatus("downloading");
      await update.downloadAndInstall();
      setUpdateStatus("installed");
    } catch {
      setUpdateStatus("error");
    }
  }

  const updateLabel: Record<UpdateStatus, string> = {
    idle: "Check for Updates",
    checking: "Checking…",
    "up-to-date": "You're up to date ✓",
    downloading: `Downloading ${updateVersion ?? "update"}…`,
    installed: "Restart to apply update",
    error: "Check failed — try again",
  };

  return (
    <div className="space-y-8">
      {/* Logo and Version */}
      <section className="text-center py-4">
        <div className="w-20 h-20 rounded-2xl bg-nodes-primary flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="4" r="2" />
            <circle cx="12" cy="20" r="2" />
            <circle cx="4" cy="12" r="2" />
            <circle cx="20" cy="12" r="2" />
            <line x1="12" y1="7" x2="12" y2="9" stroke="currentColor" strokeWidth="1.5" />
            <line x1="12" y1="15" x2="12" y2="17" stroke="currentColor" strokeWidth="1.5" />
            <line x1="7" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" />
            <line x1="15" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-nodes-text mb-1">Nodes</h1>
        <p className="text-nodes-text-muted text-sm">v{version}</p>
      </section>

      {/* Description */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">About Nodes</h2>
        <p className="text-nodes-text-muted leading-relaxed">
          Nodes is an open-source, decentralized communication platform. Built on peer-to-peer technology, 
          it enables secure messaging without relying on central servers or corporate intermediaries.
        </p>
      </section>

      {/* Philosophy */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Philosophy</h2>
        <blockquote className="border-l-4 border-nodes-primary pl-4 italic text-nodes-text-muted">
          "Communication should be decentralized, encrypted, and owned by the people who use it. 
          Your identity is a cryptographic keypair. No servers, no corporate middlemen, just math."
        </blockquote>
      </section>

      {/* Links */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Links</h2>
        <div className="space-y-2">
          <a
            href="https://github.com/leveq/nodes"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 bg-nodes-bg rounded-lg hover:bg-nodes-surface transition-colors"
          >
            <svg className="w-5 h-5 text-nodes-text-muted" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span className="text-nodes-text">GitHub Repository</span>
            <svg className="w-4 h-4 text-nodes-text-muted ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            href="https://nodes.services/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 bg-nodes-bg rounded-lg hover:bg-nodes-surface transition-colors"
          >
            <svg className="w-5 h-5 text-nodes-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-nodes-text">Documentation</span>
            <svg className="w-4 h-4 text-nodes-text-muted ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            href="https://nodes.services/contactus"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 bg-nodes-bg rounded-lg hover:bg-nodes-surface transition-colors"
          >
            <svg className="w-5 h-5 text-nodes-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-nodes-text">Report an Issue</span>
            <svg className="w-4 h-4 text-nodes-text-muted ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </section>

      {/* Build Info */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Build Info</h2>
        <div className="bg-nodes-bg rounded-lg p-4 text-sm font-mono space-y-1">
          <div className="flex justify-between">
            <span className="text-nodes-text-muted">Version</span>
            <span className="text-nodes-text">{version}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nodes-text-muted">Platform</span>
            <span className="text-nodes-text">{navigator.platform}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nodes-text-muted">Runtime</span>
            <span className="text-nodes-text">Tauri 2.x + React</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nodes-text-muted">Transport</span>
            <span className="text-nodes-text">GunJS</span>
          </div>
        </div>
      </section>

      {/* Updates */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Updates</h2>
        <button
          onClick={handleCheckForUpdates}
          disabled={updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installed"}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors
            ${updateStatus === "up-to-date" || updateStatus === "installed"
              ? "bg-nodes-accent/20 text-nodes-accent cursor-default"
              : updateStatus === "error"
              ? "bg-nodes-danger/20 text-nodes-danger hover:bg-nodes-danger/30"
              : "bg-nodes-primary hover:bg-nodes-primary/90 text-white disabled:opacity-60 disabled:cursor-wait"
            }`}
        >
          {(updateStatus === "checking" || updateStatus === "downloading") && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {updateLabel[updateStatus]}
        </button>
      </section>

      {/* Footer */}
      <section className="text-center pt-4 border-t border-nodes-border">
        <p className="text-nodes-text-muted text-sm">
          Made with ❤️ for a decentralized future
        </p>
      </section>
    </div>
  );
}
