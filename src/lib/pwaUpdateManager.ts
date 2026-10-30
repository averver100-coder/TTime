import { useState } from 'react';
import { checkServerVersionStrict } from './version';

const RECENT_UPDATE_GUARD_KEY = 'pwa_update_recently';
const GUARD_DURATION_MS = 5 * 60 * 1000; // 5 minutes guard after applying update

/**
 * Check if the page was refreshed for an update within the last 5 minutes
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
 * Record update timestamp in sessionStorage to suppress re-prompting for 5 minutes
 */
export function markRecentlyUpdated(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(RECENT_UPDATE_GUARD_KEY, Date.now().toString());
  } catch (e) {
    console.debug('[PWA] Failed to record recent update timestamp:', e);
  }
}

/**
 * Automatically remove test query parameters like ?test_update=1 or ?test_pwa=1
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
    if (url.searchParams.has('test_pwa')) {
      url.searchParams.delete('test_pwa');
      changed = true;
    }
    if (changed) {
      const cleanPath = url.pathname + (url.search ? url.search : '') + url.hash;
      window.history.replaceState({}, document.title, cleanPath || '/');
    }
  } catch (e) {
    console.debug('[PWA] Failed to clean test params:', e);
  }
}

/**
 * Direct SKIP_WAITING broadcast to all registered Service Workers
 */
export async function broadcastSkipWaitingToAllWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  } catch (e) {
    console.debug('[PWA] Failed to broadcast SKIP_WAITING:', e);
  }
}

/**
 * Force simulate an update prompt for testing (e.g., from Admin page)
 */
export function simulatePWAUpdateForTest(): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(RECENT_UPDATE_GUARD_KEY);
    } catch {}
    window.dispatchEvent(new CustomEvent('pwa-show-update-prompt', { detail: { forceTest: true } }));
  }
}

/**
 * Manually check if a genuine new update is available on server
 * 
 * Strict check criteria:
 * 1. Queries /api/version for static build/release identifiers.
 * 2. Only if the server's release version or build ID explicitly differs from current app,
 *    an update notification is prompted.
 * 3. Never relies on dynamic timestamps or '>' size comparisons.
 */
export async function checkForPWAUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false;
  }

  try {
    // 1. Strict version comparison check first
    const strictResult = await checkServerVersionStrict();
    if (!strictResult.hasNewRelease) {
      // Deployed version is identical to current instance - suppress any false prompt
      return false;
    }

    // 2. If new version confirmed on server, notify SW and prompt
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => {});
      }
    }

    if (!isRecentlyUpdated()) {
      window.dispatchEvent(new CustomEvent('pwa-show-update-prompt'));
      return true;
    }
    return false;
  } catch (err) {
    console.debug('[PWA] Error checking for SW update:', err);
    return false;
  }
}

/**
 * Lightweight React hook for footer or admin manual update check
 */
export function usePWAUpdate() {
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const triggerCheck = async (): Promise<boolean> => {
    setIsChecking(true);
    try {
      return await checkForPWAUpdate();
    } finally {
      setIsChecking(false);
    }
  };

  return {
    isChecking,
    checkForUpdate: triggerCheck,
    applyUpdate: async () => {
      markRecentlyUpdated();
      broadcastSkipWaitingToAllWorkers().catch(() => {});
      window.location.reload();
    },
    dismissUpdate: () => {},
  };
}
