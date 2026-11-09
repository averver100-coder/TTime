import { useState } from 'react';
import { checkServerVersionStrict, getBuildId } from './version';

const RECENT_UPDATE_GUARD_KEY = 'pwa_update_recently';
const ACK_BUILD_ID_KEY = 'pwa_ack_build_id';
const GUARD_DURATION_MS = 5 * 60 * 1000; // 5 minutes strict guard after applying update

/**
 * Unconditionally check if the page was refreshed for an update within the last 5 minutes.
 * Never bypasses this cooldown, preventing any possibility of an infinite reload loop.
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
 * Check if a specific buildId was already applied or dismissed
 */
export function isBuildAcknowledged(targetBuildId?: string): boolean {
  if (!targetBuildId || typeof window === 'undefined') return false;
  try {
    const sessionAck = sessionStorage.getItem(ACK_BUILD_ID_KEY);
    const localAck = localStorage.getItem(ACK_BUILD_ID_KEY);
    return sessionAck === targetBuildId || localAck === targetBuildId;
  } catch {
    return false;
  }
}

/**
 * Record update timestamp and acknowledged buildId to suppress re-prompting and loops
 */
export function markRecentlyUpdated(appliedBuildId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(RECENT_UPDATE_GUARD_KEY, Date.now().toString());
    const idToStore = appliedBuildId || getBuildId();
    if (idToStore) {
      sessionStorage.setItem(ACK_BUILD_ID_KEY, idToStore);
      localStorage.setItem(ACK_BUILD_ID_KEY, idToStore);
    }
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
        console.log('[PWA] Broadcasting SKIP_WAITING to waiting worker');
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
      sessionStorage.removeItem(ACK_BUILD_ID_KEY);
      sessionStorage.removeItem('pwa_update_dismissed_build_id');
    } catch {}
    console.log('[PWA] Simulating update prompt for test');
    window.dispatchEvent(new CustomEvent('pwa-show-update-prompt', { detail: { forceTest: true } }));
  }
}

/**
 * Manually check if a genuine new update is available on server or waiting in SW
 */
export async function checkForPWAUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false;
  }

  try {
    console.log('[PWA] Manual update check initiated...');

    // 1. Check Service Worker registration and trigger update check
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => {});
        if (reg.waiting) {
          const strict = await checkServerVersionStrict().catch(() => null);
          console.log('[PWA] Manual check found waiting Service Worker:', {
            remoteVersion: strict?.remoteVersion,
            remoteBuildId: strict?.remoteBuildId,
          });
          window.dispatchEvent(
            new CustomEvent('pwa-show-update-prompt', {
              detail: {
                remoteVersion: strict?.remoteVersion || '',
                remoteBuildId: strict?.remoteBuildId || '',
              },
            })
          );
          return true;
        }
      }
    }

    // 2. Strict version comparison check against server
    const strictResult = await checkServerVersionStrict();
    console.log('[PWA] Manual check server version comparison:', strictResult);

    if (strictResult.hasNewRelease && !isBuildAcknowledged(strictResult.remoteBuildId)) {
      window.dispatchEvent(
        new CustomEvent('pwa-show-update-prompt', {
          detail: {
            remoteVersion: strictResult.remoteVersion,
            remoteBuildId: strictResult.remoteBuildId,
          },
        })
      );
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
