export interface RelayStatus {
  url: string;
  connected: boolean;
  latency: number | null; // ms, null if unreachable
  lastChecked: number;
}

export class RelayHealthMonitor {
  private relays: Map<string, RelayStatus> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(statuses: RelayStatus[]) => void> = new Set();
  private customFetch: typeof fetch | undefined;

  start(urls: string[], intervalMs: number = 30000, customFetch?: typeof fetch) {
    this.customFetch = customFetch;
    // Initialize all relays
    for (const url of urls) {
      this.relays.set(url, {
        url,
        connected: false,
        latency: null,
        lastChecked: 0,
      });
    }

    // Ping immediately, then on interval
    this.pingAll();
    this.intervalId = setInterval(() => this.pingAll(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Pause health checks (e.g. app hidden / system sleep).
   * Keeps relay state intact but stops pinging.
   */
  pause() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Resume health checks after a pause.
   * Pings immediately then restarts the interval.
   */
  resume(intervalMs: number = 30000) {
    if (this.intervalId) return; // already running
    if (this.relays.size === 0) return; // never started
    this.pingAll();
    this.intervalId = setInterval(() => this.pingAll(), intervalMs);
  }

  getStatuses(): RelayStatus[] {
    return Array.from(this.relays.values());
  }

  getConnectedCount(): number {
    return Array.from(this.relays.values()).filter(r => r.connected).length;
  }

  onStatusChange(listener: (statuses: RelayStatus[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async pingAll() {
    const promises = Array.from(this.relays.keys()).map(url => this.ping(url));
    await Promise.allSettled(promises);
    this.notifyListeners();
  }

  private async ping(url: string) {
    // Convert wss:// to https:// for health check
    const httpUrl = url
      .replace('wss://', 'https://')
      .replace('ws://', 'http://')
      .replace('/gun', '/health');

    const start = Date.now();
    try {
      const fetchFn = this.customFetch || fetch;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      // customFetch (Tauri native) can read the response normally.
      // Browser fetch may hit CORS — use no-cors as fallback so we
      // can at least detect reachability (opaque response = server up).
      let connected = false;
      let latency: number | null = null;

      if (this.customFetch) {
        const res = await fetchFn(httpUrl, { signal: controller.signal });
        clearTimeout(timeout);
        connected = res.ok;
      } else {
        // Try normal CORS fetch first
        try {
          const res = await fetchFn(httpUrl, { signal: controller.signal });
          clearTimeout(timeout);
          connected = res.ok;
        } catch {
          // CORS blocked — retry with no-cors (opaque response, but reachable = connected)
          clearTimeout(timeout);
          const controller2 = new AbortController();
          const timeout2 = setTimeout(() => controller2.abort(), 5000);
          await fetchFn(httpUrl, { signal: controller2.signal, mode: 'no-cors' });
          clearTimeout(timeout2);
          connected = true; // Didn't throw → server is reachable
        }
      }

      latency = connected ? Date.now() - start : null;
      this.relays.set(url, {
        url,
        connected,
        latency,
        lastChecked: Date.now(),
      });
    } catch {
      this.relays.set(url, {
        url,
        connected: false,
        latency: null,
        lastChecked: Date.now(),
      });
    }
  }

  private notifyListeners() {
    const statuses = this.getStatuses();
    for (const listener of this.listeners) {
      listener(statuses);
    }
  }
}