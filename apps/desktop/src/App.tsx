import "./styles/globals.css";
import { useState } from "react";
import { AuthGate } from "./components/auth/AuthGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ToastContainer";
import { TransportProvider } from "./providers/TransportProvider";
import { AppShell } from "./layouts/AppShell";
import { SplashScreen } from "./components/SplashScreen";

function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleFirstPaint = () => {
    const isTauri = !!(window as any).__TAURI_INTERNALS__;
    if (isTauri) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        getCurrentWindow().show().catch(console.error);
      });
    }
  };

  return (
    <>
      {showSplash && (
        <SplashScreen
          onDone={() => setShowSplash(false)}
          onFirstPaint={handleFirstPaint}
        />
      )}
      <ErrorBoundary>
        <TransportProvider>
          <AuthGate>
            <AppShell />
          </AuthGate>
        </TransportProvider>
        <ToastContainer />
      </ErrorBoundary>
    </>
  );
}

export default App;
