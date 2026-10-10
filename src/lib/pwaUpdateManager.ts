/**
 * PWA Service Worker Update Detection & Management
 * 
 * Detects new service worker deployments and provides:
 * 1. Reactive state for UI prompts ("새로운 업데이트가 있습니다. 새로고침")
 * 2. Background periodic checks (every 15 min & tab focus)
 * 3. Manual update trigger
 * 4. Graceful cache update & reload
 */

import { registerSW } from 'virtual:pwa-register';

export interface PWAUpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  isChecking: boolean;
  isUpdating: boolean;
  lastCheckedAt: Date | null;
}

type UpdateListener = (state: PWAUpdateState) => void;

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let currentRegistration: ServiceWorkerRegistration | null = null;
const listeners = new Set<UpdateListener>();

let state: PWAUpdateState = {
  needRefresh: false,
  offlineReady: false,
  isChecking: false,
  isUpdating: false,
  lastCheckedAt: null,
};

function notify() {
  listeners.forEach(fn => {
    try {
      fn({ ...state });
    } catch (e) {
      console.warn('[PWA] Listener error:', e);
    }
  });
}

/**
 * Initializes Service Worker registration and update detection
 */
export function initPWAUpdateManager() {
  if (typeof window === 'undefined') return;

  // 1. Register with virtual:pwa-register
  try {
    updateSWFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('[PWA] New version detected (onNeedRefresh)');
        state.needRefresh = true;
        notify();
      },
      onOfflineReady() {
        console.log('[PWA] Content cached for offline use');
        state.offlineReady = true;
        notify();
      },
      onRegisteredSW(swUrl, registration) {
        if (!registration) return;
        currentRegistration = registration;
        state.lastCheckedAt = new Date();

        // Check if there is already a waiting service worker
        if (registration.waiting) {
          console.log('[PWA] Service worker already waiting');
          state.needRefresh = true;
          notify();
        }

        // Listen for new updates found
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New content is available once current controller is superseded
                console.log('[PWA] New content available from installing worker');
                state.needRefresh = true;
                notify();
              }
            }
          });
        });

        // Periodic background update check every 15 minutes
        setInterval(() => {
          checkForPWAUpdate().catch(() => {});
        }, 15 * 60 * 1000);
      },
      onRegisterError(error) {
        console.error('[PWA] Service worker registration failed:', error);
      },
    });
  } catch (err) {
    console.warn('[PWA] Failed to call registerSW:', err);
  }

  // 2. Window focus & visibility change listener to check for latest deployment
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForPWAUpdate().catch(() => {});
      }
    });

    window.addEventListener('focus', () => {
      checkForPWAUpdate().catch(() => {});
    });
  }

  // 3. Listen to controllerchange event to reload smoothly when new SW takes control
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

/**
 * Manually check if an update is available on server
 */
export async function checkForPWAUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    state.isChecking = true;
    notify();

    let reg = currentRegistration;
    if (!reg) {
      reg = await navigator.serviceWorker.getRegistration();
      if (reg) currentRegistration = reg;
    }

    if (reg) {
      await reg.update();
      state.lastCheckedAt = new Date();

      if (reg.waiting) {
        state.needRefresh = true;
        notify();
        return true;
      }
    }
    return state.needRefresh;
  } catch (err) {
    console.warn('[PWA] Error checking for SW update:', err);
    return false;
  } finally {
    state.isChecking = false;
    notify();
  }
}

/**
 * Apply the update and reload the page to activate the latest app version
 */
export async function applyPWAUpdate() {
  state.isUpdating = true;
  notify();

  try {
    // 1. If updateSWFn is available, invoke it
    if (updateSWFn) {
      await updateSWFn(true);
      return;
    }

    // 2. Fallback: tell waiting service worker to skipWaiting
    if (currentRegistration?.waiting) {
      currentRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        // Direct hard reload
        window.location.reload();
      }
    }
  } catch (err) {
    console.error('[PWA] Failed to apply update, forcing page reload:', err);
    window.location.reload();
  }
}

/**
 * Dismiss the update prompt for the current session (e.g. user clicked "Later")
 */
export function dismissPWAUpdatePrompt() {
  state.needRefresh = false;
  notify();
}

/**
 * Force simulate an update prompt (useful for testing & admin preview)
 */
export function simulatePWAUpdateForTest() {
  state.needRefresh = true;
  notify();
}

/**
 * React state hook
 */
import { useEffect, useState } from 'react';

export function usePWAUpdate(): PWAUpdateState & {
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  checkForUpdate: () => Promise<boolean>;
} {
  const [currentState, setCurrentState] = useState<PWAUpdateState>({ ...state });

  useEffect(() => {
    const listener: UpdateListener = (updatedState) => {
      setCurrentState(updatedState);
    };

    listeners.add(listener);
    setCurrentState({ ...state });

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    ...currentState,
    applyUpdate: applyPWAUpdate,
    dismissUpdate: dismissPWAUpdatePrompt,
    checkForUpdate: checkForPWAUpdate,
  };
}
