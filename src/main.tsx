import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ToastProvider} from './components/shared/ToastProvider.tsx';
import {ErrorBoundary} from './components/shared/ErrorBoundary.tsx';
import './index.css';

import { API_BASE_URL } from './services/api';
import { registerServiceWorkerAtStartup } from './services/pwa';

/**
 * Open the connection to the image host before anything asks for a photo.
 *
 * <p>Every listing image is served by the API, which is a different origin
 * from the app itself - the app is on Vercel, the API on its own domain. The
 * browser therefore cannot fetch the first photo until it has done a DNS
 * lookup, a TCP handshake and a TLS negotiation with a host it has never
 * spoken to, and only then starts the download. On a strong connection that
 * is invisible; on a weak or high-latency mobile link it is several hundred
 * milliseconds of nothing happening, paid once per cold load, before the
 * first pixel is even requested.
 *
 * <p>`preconnect` gets that handshake under way while React is still
 * mounting. Done here rather than as a static tag in index.html because the
 * host comes from the build's environment and is empty in local development,
 * where a hint to nowhere is at best wasted and at worst a real lookup for a
 * hostname that does not exist.
 */
function preconnectToImageHost(): void {
  if (!API_BASE_URL) return;
  try {
    const { origin } = new URL(API_BASE_URL);
    if (origin === window.location.origin) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    // Images are a plain GET with no credentials; announcing otherwise opens
    // a second, separate connection that nothing then uses.
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch {
    // A malformed base URL is not worth failing the boot over - it will
    // surface far more loudly on the first API call.
  }
}

preconnectToImageHost();

/*
 * Offline support and installability, for everyone rather than only for people
 * who turned notifications on. Chrome will not offer to install an app whose
 * service worker has no fetch handler, and the worker was previously
 * registered only by enablePush - so most visitors had no worker at all.
 */
registerServiceWorkerAtStartup();



createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      * Outside ToastProvider, not inside: the boundary's own fallback must not
      * depend on a provider that may itself be the thing that threw.
      */}
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
