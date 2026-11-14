import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, RefreshCw, X, Sparkles } from 'lucide-react';
import {
  isRecentlyUpdated,
  isBuildAcknowledged,
  markRecentlyUpdated,
  broadcastSkipWaitingToAllWorkers,
  cleanTestUrlParams,
} from '../lib/pwaUpdateManager';
import {
  checkServerVersionStrict,
  getAppReleaseVersion,
  getBuildId,
  isNewerReleaseVersion,
} from '../lib/version';

interface PWAUpdatePromptProps {
  /** Optional position override: 'top' (default, matching IT Desk) or 'bottom' */
  position?: 'top' | 'bottom';
  /** Version update detected directly by App.tsx startup/background checks */
  externalUpdate?: { version: string; buildId: string } | null;
  onClearExternalUpdate?: () => void;
}

const DISMISSED_BUILD_ID_KEY = 'pwa_update_dismissed_build_id';

/**
 * PWA Service Worker & Server Release Update Notification Banner / Toast
 *
 * Loop-Free & Version-Strict Architecture:
 * 1. Only activates when server release version is strictly higher than the running client
 *    version (`isNewerReleaseVersion(remote, current)`), or an unacknowledged waiting worker exists.
 * 2. Enforces 5-minute cooldown and persistent buildId acknowledgment for background prompts,
 *    while allowing explicit manual `[업데이트 확인]` checks to display any strictly newer version.
 * 3. One-click update purges stale browser CacheStorage entries, sends SKIP_WAITING, and reloads.
 */
export const PWAUpdatePrompt: React.FC<PWAUpdatePromptProps> = ({
  position = 'top',
  externalUpdate = null,
  onClearExternalUpdate,
}) => {
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [isManualTest, setIsManualTest] = useState<boolean>(false);
  const [isManualCheckTriggered, setIsManualCheckTriggered] = useState<boolean>(false);
  const [newVersionLabel, setNewVersionLabel] = useState<string>('');
  const [remoteBuildId, setRemoteBuildId] = useState<string>('');
  const swRegistrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  /**
   * Evaluate whether a specific remoteBuildId was explicitly dismissed or already applied
   */
  const isBuildDismissedOrApplied = useCallback((targetBuildId: string): boolean => {
    if (!targetBuildId) return false;
    if (isBuildAcknowledged(targetBuildId)) return true;
    try {
      const dismissedId = sessionStorage.getItem(DISMISSED_BUILD_ID_KEY);
      return Boolean(dismissedId && dismissedId === targetBuildId);
    } catch {
      return false;
    }
  }, []);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      console.log('[PWAUpdatePrompt] Service Worker registered:', {
        swUrl,
        hasRegistration: Boolean(registration),
        activeState: registration?.active?.state,
        waitingState: registration?.waiting?.state,
        installingState: registration?.installing?.state,
      });

      if (!registration) return;
      swRegistrationRef.current = registration;

      const triggerSWCheck = (source: string) => {
        if (isRecentlyUpdated()) {
          console.log(`[PWAUpdatePrompt] [${source}] Skipped SW check (recently updated guard active)`);
          return;
        }
        registration.update().catch((err) => {
          console.debug(`[PWAUpdatePrompt] [${source}] registration.update() notice:`, err);
        });
      };

      // 1. Initial background SW update check 3 seconds after registration
      const initialTimer = setTimeout(() => {
        triggerSWCheck('initial-3s');
      }, 3000);

      // 2. Periodic background SW update check every 5 minutes
      const intervalId = setInterval(() => {
        triggerSWCheck('interval-5m');
      }, 5 * 60 * 1000);

      // 3. Check for SW updates on tab focus (throttled to once every 60s)
      let lastFocusCheck = Date.now();
      const handleVisibilityChange = () => {
        const now = Date.now();
        if (document.visibilityState === 'visible' && !isRecentlyUpdated()) {
          if (now - lastFocusCheck > 60 * 1000) {
            lastFocusCheck = now;
            triggerSWCheck('visibilitychange');
          }
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // 4. If a worker is already waiting upon registration, trigger refresh evaluation
      if (registration.waiting && !isRecentlyUpdated()) {
        setNeedRefresh(true);
      }

      // 5. Watch for service worker update lifecycle
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller &&
              !isRecentlyUpdated()
            ) {
              setNeedRefresh(true);
            }
          });
        }
      });

      return () => {
        clearTimeout(initialTimer);
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    },
    onRegisterError(err) {
      console.warn('[PWAUpdatePrompt] Service Worker registration error:', err);
    },
  });

  // React to strictly newer release detected by App.tsx startup / background checks
  useEffect(() => {
    if (!externalUpdate) return;
    if (isRecentlyUpdated()) return;
    if (!isNewerReleaseVersion(externalUpdate.version, getAppReleaseVersion())) return;
    if (externalUpdate.buildId && isBuildDismissedOrApplied(externalUpdate.buildId)) return;

    setNewVersionLabel(externalUpdate.version);
    setRemoteBuildId(externalUpdate.buildId);
    setShowPrompt(true);
  }, [externalUpdate, isBuildDismissedOrApplied]);

  // Dedicated diagnostic evaluation when Service Worker `needRefresh` changes
  useEffect(() => {
    let isMounted = true;
    if (!needRefresh) return;

    if (isRecentlyUpdated()) {
      setNeedRefresh(false);
      setShowPrompt(false);
      return;
    }

    const verifyAndShow = async () => {
      try {
        const checkResult = await checkServerVersionStrict();
        if (!isMounted) return;

        const targetBuildId = checkResult.remoteBuildId || '';
        const targetVersion = checkResult.remoteVersion || getAppReleaseVersion();

        if (targetBuildId && isBuildDismissedOrApplied(targetBuildId)) {
          setNeedRefresh(false);
          setShowPrompt(false);
          return;
        }

        const reg = swRegistrationRef.current;
        if (!checkResult.hasNewRelease && !reg?.waiting) {
          setNeedRefresh(false);
          setShowPrompt(false);
          return;
        }

        // Even with a waiting worker, avoid prompting if server and client versions are identical
        if (!checkResult.hasNewRelease && checkResult.remoteVersion === checkResult.currentVersion) {
          setNeedRefresh(false);
          setShowPrompt(false);
          return;
        }

        setNewVersionLabel(targetVersion);
        setRemoteBuildId(targetBuildId);
        setShowPrompt(true);
      } catch (err) {
        if (!isMounted) return;
        console.warn('[PWAUpdatePrompt] Version check error while needRefresh=true:', err);
      }
    };

    verifyAndShow();

    return () => {
      isMounted = false;
    };
  }, [needRefresh, setNeedRefresh, isBuildDismissedOrApplied]);

  // Controllerchange: reload once safely when the new service worker activates
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let hasReloaded = false;
    const onControllerChange = () => {
      if (!hasReloaded) {
        hasReloaded = true;
        markRecentlyUpdated(remoteBuildId);
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, [remoteBuildId]);

  // Support manual tests (?test_update=1, ?test_pwa=1, or 'pwa-show-update-prompt' event)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    if (url.searchParams.get('test_update') === '1' || url.searchParams.get('test_pwa') === '1') {
      setIsManualTest(true);
      setShowPrompt(true);
    }

    const handleCustomPrompt = async (e: Event) => {
      const customEvent = e as CustomEvent<{
        forceTest?: boolean;
        forceManual?: boolean;
        remoteVersion?: string;
        remoteBuildId?: string;
      }>;

      if (customEvent?.detail?.forceTest) {
        setIsManualTest(true);
        setNewVersionLabel(getAppReleaseVersion());
        setRemoteBuildId('test-build');
        setShowPrompt(true);
        return;
      }

      const isManual = Boolean(customEvent?.detail?.forceManual);
      if (!isManual && isRecentlyUpdated()) return;

      if (customEvent?.detail?.remoteVersion) {
        const bId = customEvent.detail.remoteBuildId || '';
        const rVer = customEvent.detail.remoteVersion;
        if (!isManual && bId && isBuildDismissedOrApplied(bId)) return;
        if (isManual || isNewerReleaseVersion(rVer, getAppReleaseVersion())) {
          setIsManualCheckTriggered(isManual);
          setNewVersionLabel(rVer);
          setRemoteBuildId(bId);
          setShowPrompt(true);
        }
        return;
      }

      const check = await checkServerVersionStrict();
      if (check.hasNewRelease && (isManual || !isBuildDismissedOrApplied(check.remoteBuildId))) {
        setIsManualCheckTriggered(isManual);
        setNewVersionLabel(check.remoteVersion || getAppReleaseVersion());
        setRemoteBuildId(check.remoteBuildId || '');
        setShowPrompt(true);
      }
    };

    window.addEventListener('pwa-show-update-prompt', handleCustomPrompt);
    return () => {
      window.removeEventListener('pwa-show-update-prompt', handleCustomPrompt);
    };
  }, [isBuildDismissedOrApplied]);

  // Apply update and reload with one click
  const handleApplyUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    cleanTestUrlParams();
    markRecentlyUpdated(remoteBuildId || getBuildId());
    try {
      if (remoteBuildId) {
        sessionStorage.setItem(DISMISSED_BUILD_ID_KEY, remoteBuildId);
      }
    } catch {}

    setShowPrompt(false);
    setIsManualTest(false);
    setIsManualCheckTriggered(false);
    setNeedRefresh(false);
    onClearExternalUpdate?.();

    // Purge cached assets if CacheStorage API exists so updated chunks are fetched cleanly
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch (err) {
      console.debug('[PWAUpdatePrompt] Cache clear notice:', err);
    }

    // Direct SKIP_WAITING broadcast to all waiting workers
    try {
      await broadcastSkipWaitingToAllWorkers();
    } catch (err) {
      console.debug('[PWAUpdatePrompt] Service worker skipWaiting broadcast error:', err);
    }

    // Trigger updateServiceWorker
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.debug('[PWAUpdatePrompt] updateServiceWorker execution error:', err);
    }

    // Force fresh reload
    setTimeout(() => {
      window.location.reload();
    }, 350);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setIsManualTest(false);
    setIsManualCheckTriggered(false);
    setNeedRefresh(false);
    onClearExternalUpdate?.();
    cleanTestUrlParams();
    markRecentlyUpdated(remoteBuildId || getBuildId());
    try {
      if (remoteBuildId) {
        sessionStorage.setItem(DISMISSED_BUILD_ID_KEY, remoteBuildId);
      }
    } catch {}
  };

  const positionClass =
    position === 'bottom'
      ? 'fixed bottom-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-[460px] sm:max-w-xl z-[9999] pointer-events-auto'
      : 'fixed top-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-[460px] sm:max-w-xl z-[9999] pointer-events-auto';

  const isVisible = showPrompt && (isManualTest || isManualCheckTriggered || !isRecentlyUpdated());
  const currentVersion = getAppReleaseVersion();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          role="alert"
          aria-live="polite"
          aria-label="앱 업데이트 알림"
          initial={{ opacity: 0, y: position === 'bottom' ? 40 : -40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: position === 'bottom' ? 30 : -30, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className={positionClass}
        >
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl shadow-2xl shadow-blue-600/30 border border-white/25 backdrop-blur-md flex items-center justify-between gap-3">
            {/* Left: Animated icon and titles */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0 shadow-inner">
                {isUpdating ? (
                  <Loader2 size={18} className="animate-spin text-white" />
                ) : (
                  <Sparkles size={18} className="text-amber-300 fill-amber-300/30" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm tracking-tight truncate text-white">
                    {isUpdating ? '최신 버전 적용 중...' : '새로운 업데이트가 있습니다'}
                  </span>
                  <span className="px-2 py-0.5 bg-white/20 text-[11px] font-extrabold rounded-md text-white border border-white/30 tracking-tight font-mono tabular-nums">
                    {newVersionLabel || currentVersion}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-blue-100/90 truncate mt-0.5">
                  {isUpdating
                    ? '잠시 후 최신 버전으로 자동 전환됩니다.'
                    : `현재 ${currentVersion} → ${newVersionLabel || currentVersion} 최신 버전으로 원클릭 갱신하세요.`}
                </p>
              </div>
            </div>

            {/* Right: One-click Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleApplyUpdate}
                disabled={isUpdating}
                className="bg-white hover:bg-blue-50 text-blue-700 font-extrabold px-3.5 py-2 rounded-xl text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                title="새로운 버전을 적용하고 새로고침합니다"
              >
                {isUpdating ? (
                  <Loader2 size={13} className="animate-spin text-blue-600" />
                ) : (
                  <RefreshCw size={13} className="text-blue-600" />
                )}
                <span>{isUpdating ? '적용 중...' : '지금 업데이트'}</span>
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                disabled={isUpdating}
                className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
                title="닫기"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
