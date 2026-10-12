/**
 * PWA Service Worker Update Detection & Management
 * 
 * 5-Layer Infinite Loop Defense System:
 * 1. sessionStorage guard ('pwa_update_recently' - 15s suppression)
 * 2. Direct SKIP_WAITING broadcast & button progress locking (Loader2)
 * 3. URL test parameter auto-cleanup (?test_update=1 removal via history.replaceState)
 * 4. controllerchange duplicate reload lock (hasReloaded)
 * 5. Workbox cleanupOutdatedCaches & clientsClaim
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

const RECENT_UPDATE_GUARD_KEY = 'pwa_update_recently';
const GUARD_DURATION_MS = 15000; // 15 seconds

/**
 * Defense 1: Check if page was refreshed for an update within the last 15 seconds
 */
export function isRecentlyUpdated(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = sessionStorage.getItem(RECENT_UPDATE_GUARD_KEY);
    if (!stored) return false;
    const timestamp = parseInt(stored, 10);
    if (isNaN(timestamp)) return false;
    return Date.now() - timestamp < GUARD_DURATION_MS;
  } catch {
    return false;
  }
}

/**
 * Defense 1: Record update timestamp in sessionStorage to suppress re-prompting for 15s
 */
export function markRecentlyUpdated(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(RECENT_UPDATE_GUARD_KEY, Date.now().toString());
  } catch (e) {
    console.warn('[PWA] Failed to record recent update timestamp:', e);
  }
}

/**
 * Defense 3: Automatically remove test query parameters like ?test_update=1
 */
export function cleanTestUrlParams(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('test_update')) {
      url.searchParams.delete('test_update');
      changed = true;
    }
    if (url.searchParams.has('test_pwa_update')) {
      url.searchParams.delete('test_pwa_update');
      changed = true;
    }
    if (changed) {
      const cleanPath = url.pathname + (url.search ? url.search : '') + url.hash;
      window.history.replaceState({}, document.title, cleanPath || '/');
    }
  } catch (e) {
    console.warn('[PWA] Failed to clean test params:', e);
  }
}

/**
 * Defense 2: Direct SKIP_WAITING broadcast to all registered Service Workers
 */
export async function broadcastSkipWaitingToAllWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      if (reg.waiting) {
        console.log('[PWA] Explicitly sending SKIP_WAITING to waiting worker');
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  } catch (e) {
    console.warn('[PWA] Failed to broadcast SKIP_WAITING:', e);
  }
}

// Defense 4: Duplicate event reload lock
let hasReloaded = false;

export function triggerSafeReload(): void {
  if (hasReloaded) return;
  hasReloaded = true;
  if (typeof window !== 'undefined') {
    cleanTestUrlParams();
    window.location.reload();
  }
}

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
 * Initializes Service Worker registration and update detection with 5-layer defenses
 */
export function initPWAUpdateManager() {
  if (typeof window === 'undefined') return;

  // 1. Register with virtual:pwa-register
  try {
    updateSWFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (isRecentlyUpdated()) {
          console.log('[PWA] onNeedRefresh suppressed by 15s recent update guard');
          return;
        }
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
          if (isRecentlyUpdated()) {
            console.log('[PWA] Waiting worker suppressed by 15s recent update guard');
          } else {
            console.log('[PWA] Service worker already waiting');
            state.needRefresh = true;
            notify();
          }
        }

        // Listen for new updates found
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                if (isRecentlyUpdated()) {
                  console.log('[PWA] Installing worker installed, suppressed by 15s guard');
                } else {
                  console.log('[PWA] New content available from installing worker');
                  state.needRefresh = true;
                  notify();
                }
              }
            }
          });
        });

        // Periodic background update check every 15 minutes
        setInterval(() => {
          if (!isRecentlyUpdated()) {
            checkForPWAUpdate().catch(() => {});
          }
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
      if (document.visibilityState === 'visible' && !isRecentlyUpdated()) {
        checkForPWAUpdate().catch(() => {});
      }
    });

    window.addEventListener('focus', () => {
      if (!isRecentlyUpdated()) {
        checkForPWAUpdate().catch(() => {});
      }
    });
  }

  // 3. Defense 4: Controller change event listener with hasReloaded lock
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] controllerchange triggered, initiating safe reload');
      triggerSafeReload();
    });
  }

  // Support ?test_update=1 in URL if present and not recently updated
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('test_update') === '1' && !isRecentlyUpdated()) {
      state.needRefresh = true;
      notify();
    }
  } catch {}
}

/**
 * Manually check if an update is available on server
 */
export async function checkForPWAUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  if (isRecentlyUpdated()) {
    console.log('[PWA] Manual update check suppressed by 15s recent update guard');
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
        if (!isRecentlyUpdated()) {
          state.needRefresh = true;
          notify();
          return true;
        }
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
 * Implements Defenses 1, 2, 3, and 4
 */
export async function applyPWAUpdate() {
  // Defense 1: Set 15s session storage guard
  markRecentlyUpdated();

  // Defense 3: Clean test params from URL
  cleanTestUrlParams();

  // Defense 2: Update internal state & clear needRefresh
  state.isUpdating = true;
  state.needRefresh = false;
  notify();

  try {
    // Defense 2: Broadcast SKIP_WAITING to all SW registrations
    await broadcastSkipWaitingToAllWorkers();

    // If updateSWFn is available, invoke it
    if (updateSWFn) {
      await updateSWFn(true);
    } else if (currentRegistration?.waiting) {
      currentRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    // Safety fallback: if controllerchange doesn't trigger reload within 1.2s, reload safely
    setTimeout(() => {
      triggerSafeReload();
    }, 1200);
  } catch (err) {
    console.error('[PWA] Failed to apply update, forcing safe reload:', err);
    triggerSafeReload();
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
  // Clear any recent update guard so testing immediately works
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(RECENT_UPDATE_GUARD_KEY);
    } catch {}
  }
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
