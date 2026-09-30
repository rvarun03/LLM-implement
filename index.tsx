import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { GlobalCopyProtection } from './components/GlobalCopyProtection';
import './index.css';

// Handle global cross-origin script errors and WebSocket HMR disconnects gracefully
if (typeof window !== 'undefined') {
  const isIgnoredError = (msg: any) => {
    const str = String(msg || '').toLowerCase();
    return !msg || str.includes('script error') || str.includes('websocket') || str.includes('vite') || str === '[object object]';
  };

  window.onerror = function (message, source, lineno, colno, error) {
    const msgStr = String(message || (error && error.message) || '');
    if (isIgnoredError(msgStr) || !source) {
      return true;
    }
    return false;
  };

  window.addEventListener('error', (event) => {
    const msg = String(event.message || (event.error && event.error.message) || '');
    const isResourceError = Boolean(event.target && event.target !== window);

    if (isIgnoredError(msg) || isResourceError) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reasonMsg = String(event.reason?.message || event.reason || '');
    if (isIgnoredError(reasonMsg)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <GlobalCopyProtection>
        <App />
      </GlobalCopyProtection>
    </ErrorBoundary>
  </React.StrictMode>
);