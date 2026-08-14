import { Component } from 'react';

/*
 * View-level error boundary. Catches render/lifecycle errors in the view
 * subtree so one broken view can never white-screen the whole shell: the
 * sidebar, header and navigation stay usable, and the operator sees an inline
 * recovery surface instead of a dead page.
 *
 * Scope it around the view area only (App.jsx), never the whole app - a crash
 * in the sidebar should still take the shell down loudly rather than render
 * half the UI inside a recovery card.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('view error boundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          data-testid="view-error-boundary"
          className="flex flex-col items-center justify-center gap-4 py-24 text-center"
        >
          <p className="max-w-md text-sm text-foreground">
            {this.props.fallbackText || 'Something went wrong rendering this view.'}
          </p>
          <button
            type="button"
            className="h-11 shrink-0 rounded-md border border-border bg-card px-4 text-sm text-foreground hover:bg-accent"
            onClick={() => window.location.reload()}
          >
            {this.props.reloadText || 'Reload'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
