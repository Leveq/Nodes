import "./styles/globals.css";
import { AuthGate } from "./components/auth/AuthGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ToastContainer";
import { TransportProvider } from "./providers/TransportProvider";
import { AppShell } from "./layouts/AppShell";

function App() {
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
