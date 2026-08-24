import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Last line of defence against a blank page.
 *
 * <p>Since React 16 an uncaught error during render unmounts the whole tree, not
 * the component that threw. Without a boundary anywhere above it, one malformed
 * listing or one undefined field in an API response takes the entire app down to
 * white - no message, no reload prompt, and no way for the person to tell
 * whether it was them, their connection, or us.
 *
 * <p>It has to be a class. There is still no hook equivalent for
 * `componentDidCatch`, and `useErrorBoundary` in userland libraries is the same
 * class underneath.
 *
 * <p>Deliberately not placed per-screen. A screen-level boundary that keeps the
 * nav alive sounds better than this, but it also means a broken screen renders
 * chrome that implies the app is fine; at this size, one honest recovery screen
 * beats several partial ones.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  failed: boolean;
  /** Kept for the retry key below, not for display - see the note in render. */
  attempt: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    /*
     * The only record that this happened.
     *
     * Left as a console call on purpose: wiring an error reporter here is a
     * one-line change once there is a DSN to send to, and inventing one now
     * would mean shipping a dependency that silently fails to report. The
     * component stack is the useful half - a minified stack trace alone rarely
     * identifies which screen broke.
     */
    console.error('[CampusMarket] Unhandled render error:', error, info.componentStack);
  }

  private retry = () => {
    // Remount rather than reload where possible: a transient failure - a bad
    // response already replaced by a good one - recovers without losing the
    // page. A reload is the fallback the button below offers separately.
    this.setState((prev) => ({ failed: false, attempt: prev.attempt + 1 }));
  };

  render() {
    if (!this.state.failed) {
      // The key is what makes retry actually re-mount the subtree. Without it
      // React reuses the existing instances, including whichever one is holding
      // the state that threw.
      return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff] px-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#e5eeff] shadow-card p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>

          <h1 className="text-xl font-bold text-[#0b1c30] mb-2">This page stopped working</h1>
          <p className="text-sm text-[#737686] mb-6">
            Something broke while drawing the screen. Nothing you did caused it, and
            anything you had already saved is safe.
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={this.retry}
              className="w-full px-4 py-2.5 rounded-xl bg-[#007d55] text-white text-sm font-bold hover:bg-[#006242] transition-colors flex items-center justify-center gap-2"
            >
              <RotateCw className="w-4 h-4" /> Try again
            </button>
            <button
              onClick={() => window.location.assign('/')}
              className="w-full px-4 py-2.5 rounded-xl border border-[#c3c6d7] text-[#434655] text-sm font-semibold hover:bg-[#f8f9ff] transition-colors"
            >
              Back to browsing
            </button>
          </div>
        </div>
      </div>
    );
  }
}
