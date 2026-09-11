import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Register service worker for PWA support and offline caching
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New PWA content available, please refresh.');
  },
  onOfflineReady() {
    console.log('PWA is ready to work offline.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

