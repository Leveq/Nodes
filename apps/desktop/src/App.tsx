import "./styles/globals.css";
import { AuthGate } from "./components/auth/AuthGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ToastContainer";
import { TransportProvider } from "./providers/TransportProvider";
import { AppShell } from "./layouts/AppShell";
import { useUpdater } from "./hooks/useUpdater";

function App() {
  useUpdater();

  return (
    <ErrorBoundary>
      <TransportProvider>
        <AuthGate>
          <AppShell />
        </AuthGate>
      </TransportProvider>
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
