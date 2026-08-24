import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ToastProvider} from './components/shared/ToastProvider.tsx';
import {ErrorBoundary} from './components/shared/ErrorBoundary.tsx';
import './index.css';

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
