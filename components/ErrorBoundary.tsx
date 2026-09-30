import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw, Home, ArrowLeft } from 'lucide-react';
import { logger } from '../services/appLogger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  variant?: 'fullscreen' | 'inline';
  onReset?: () => void;
  resetLabel?: string;
  onNavigateHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('UIErrorBoundary', `React rendering exception caught: ${error?.message || error}`, {
      stack: errorInfo?.componentStack
    }, 'ReactComponentRender', undefined, undefined);
    console.warn('[AutomatiQA Safe Boundary] Recovered from rendering error:', error?.message || error, errorInfo?.componentStack);
  }

  private handleReset = () => {
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (e) {}
    }
    this.setState({ hasError: false, error: null });
  };

  private handleHome = () => {
    if (this.props.onNavigateHome) {
      try {
        this.props.onNavigateHome();
      } catch (e) {}
    } else if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (e) {}
    }
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      let errorMessage = this.state.error?.message || "A temporary display issue occurred while rendering this section.";
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.operationType && parsed.authInfo) {
            isFirestoreError = true;
            errorMessage = `Service notification: ${parsed.error || 'Temporary connectivity delay'}.`;
          }
        }
      } catch (e) {
        // Not a JSON error message, use sanitized text
      }

      if (this.props.variant === 'inline') {
        return (
          <div className="w-full min-h-[400px] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="max-w-xl w-full bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-10 text-center">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-100">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-3">
                Unable to Display Section
              </h2>
              <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8 break-words max-w-md mx-auto">
                {errorMessage}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-md shadow-indigo-100 active:scale-95 transition-all"
                >
                  <RefreshCcw size={14} />
                  {this.props.resetLabel || 'Try Again'}
                </button>
                {this.props.onNavigateHome && (
                  <button
                    onClick={this.handleHome}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    <Home size={14} />
                    Go to Dashboard
                  </button>
                )}
                <button
                  onClick={this.handleReload}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-50 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all border border-slate-200"
                >
                  Reload App
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-md w-full bg-slate-900 rounded-[2.5rem] border border-slate-800 shadow-2xl p-10 text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mx-auto mb-6 border border-amber-500/20">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight mb-3">
              Unable to Display View
            </h1>
            <p className="text-sm text-slate-400 font-medium leading-relaxed mb-8 break-words">
              {errorMessage}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-3 px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-900/20 active:scale-95 transition-all"
              >
                <RefreshCcw size={16} />
                {this.props.resetLabel || 'Try Recovering View'}
              </button>
              {this.props.onNavigateHome && (
                <button
                  onClick={this.handleHome}
                  className="w-full flex items-center justify-center gap-3 px-8 py-3 bg-slate-800 text-slate-200 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-700 active:scale-95 transition-all border border-slate-700"
                >
                  <Home size={16} />
                  Return to Dashboard
                </button>
              )}
              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-3 px-8 py-3 bg-slate-800/60 text-slate-400 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all border border-slate-800"
              >
                Reload Application
              </button>
            </div>
            {isFirestoreError && (
              <p className="mt-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Data synchronization will resume automatically when connected.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
