/**
 * Appearance settings section (placeholder for Phase 2).
 */
export function AppearanceSettings() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Theme</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Theme customization is coming in a future update.
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 max-w-xs px-4 py-3 rounded-lg border-2 border-nodes-primary bg-nodes-primary/10 text-nodes-text cursor-not-allowed"
            disabled
          >
            <div className="font-medium mb-1">Dark</div>
            <div className="text-xs opacity-70">Current theme</div>
          </button>
          <button
            className="flex-1 max-w-xs px-4 py-3 rounded-lg border-2 border-nodes-border bg-nodes-bg text-nodes-text-muted cursor-not-allowed opacity-50"
            disabled
          >
            <div className="font-medium mb-1">Light</div>
            <div className="text-xs opacity-70">Coming soon</div>
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Message Display</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Choose how messages appear in channels and DMs.
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 max-w-xs px-4 py-3 rounded-lg border-2 border-nodes-primary bg-nodes-primary/10 text-nodes-text cursor-not-allowed"
            disabled
          >
            <div className="font-medium mb-1">Comfortable</div>
            <div className="text-xs opacity-70">Standard spacing</div>
          </button>
          <button
            className="flex-1 max-w-xs px-4 py-3 rounded-lg border-2 border-nodes-border bg-nodes-bg text-nodes-text-muted cursor-not-allowed opacity-50"
            disabled
          >
            <div className="font-medium mb-1">Compact</div>
            <div className="text-xs opacity-70">Coming soon</div>
          </button>
        </div>
      </section>

      <section className="py-8 text-center">
        <div className="w-16 h-16 rounded-full bg-nodes-bg flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-nodes-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
          </svg>
        </div>
        <p className="text-nodes-text-muted text-sm">
          More appearance options coming soon!
        </p>
      </section>
    </div>
  );
}
