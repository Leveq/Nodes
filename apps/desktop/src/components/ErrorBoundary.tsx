import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndRestart = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-nodes-bg flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="text-5xl mb-4">😵</div>
            <h1 className="text-2xl font-bold text-nodes-text mb-2">
              Something went wrong
            </h1>
            <p className="text-nodes-text-muted mb-6">
              The app encountered an unexpected error. You can try reloading, or
              clear all data and start fresh.
            </p>

            <div className="flex gap-3 mb-6">
              <button
                onClick={this.handleReload}
                className="flex-1 bg-nodes-primary hover:bg-nodes-primary-light text-white font-medium py-3 rounded-lg transition-colors"
              >
                Reload
              </button>
              <button
                onClick={this.handleClearAndRestart}
                className="flex-1 bg-nodes-danger/20 hover:bg-nodes-danger text-nodes-danger hover:text-white font-medium py-3 rounded-lg transition-colors"
              >
                Clear Data & Restart
              </button>
            </div>

            <button
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              className="text-sm text-nodes-text-muted hover:text-nodes-text transition-colors"
            >
              {this.state.showDetails ? "Hide details" : "Show details"}
            </button>

            {this.state.showDetails && this.state.error && (
              <div className="mt-4 p-4 bg-nodes-surface border border-nodes-border rounded-lg text-left">
                <p className="text-nodes-danger font-mono text-sm mb-2">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                <pre className="text-xs text-nodes-text-muted overflow-auto max-h-40">
                  {this.state.error.stack}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
