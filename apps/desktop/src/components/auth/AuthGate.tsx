import { useIdentityStore } from "../../stores/identity-store";
import { CreateIdentity } from "./CreateIdentity";
import { Login } from "./Login";
import { ImportBackup } from "./ImportBackup";
import { useState, useEffect, type ReactNode } from "react";

interface AuthGateProps {
  children: React.ReactNode;
}

function TransitionWrapper({ children, show }: { children: ReactNode; show: boolean }) {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
      // Wait for exit animation
      const timer = setTimeout(() => setShouldRender(false), 150);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!shouldRender) return null;

  return (
    <div
      className={`transition-all duration-150 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * AuthGate wraps the main app and handles the authentication flow.
 * If no identity exists, shows CreateIdentity.
 * If identity exists but not authenticated, shows Login.
 * If authenticated, renders children (the main app).
 */
export function AuthGate({ children }: AuthGateProps) {
  const isAuthenticated = useIdentityStore((s) => s.isAuthenticated);
  const isLoading = useIdentityStore((s) => s.isLoading);
  const [mode, setMode] = useState<"login" | "create" | "import">(
    localStorage.getItem("nodes:keystore") ? "login" : "create",
  );
  const [activeMode, setActiveMode] = useState(mode);

  // Sync mode with localStorage when authentication state changes
  useEffect(() => {
    if (!isAuthenticated) {
      const hasKeystore = localStorage.getItem("nodes:keystore");
      setMode(hasKeystore ? "login" : "create");
    }
  }, [isAuthenticated]);

  // Handle mode transition animation
  useEffect(() => {
    // Small delay to allow exit animation
    const timer = setTimeout(() => setActiveMode(mode), 150);
    return () => clearTimeout(timer);
  }, [mode]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-nodes-bg flex items-center justify-center">
        <div className="text-nodes-primary text-xl animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <TransitionWrapper show={activeMode === "create"}>
          <CreateIdentity
            onSwitchToLogin={() => setMode("login")}
            onSwitchToImport={() => setMode("import")}
          />
        </TransitionWrapper>
        <TransitionWrapper show={activeMode === "import"}>
          <ImportBackup
            onSwitchToCreate={() => setMode("create")}
            onSwitchToLogin={() => setMode("login")}
          />
        </TransitionWrapper>
        <TransitionWrapper show={activeMode === "login"}>
          <Login
            onSwitchToCreate={() => setMode("create")}
            onSwitchToImport={() => setMode("import")}
          />
        </TransitionWrapper>
      </>
    );
  }

  return <>{children}</>;
}
