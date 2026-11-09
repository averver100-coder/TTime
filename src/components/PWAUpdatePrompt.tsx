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
import { checkServerVersionStrict, getAppReleaseVersion, getBuildId } from '../lib/version';

interface PWAUpdatePromptProps {
  /** Optional position override: 'top' (default, matching IT Desk) or 'bottom' */
  position?: 'top' | 'bottom';
}

const DISMISSED_BUILD_ID_KEY = 'pwa_update_dismissed_build_id';

/**
 * PWA Service Worker Update Notification Banner / Toast
 * Matches IT Desk (https://device.srider.kr/) UX & Design.
 *
 * Loop-Free Architecture:
 * 1. Driven strictly by Service Worker `needRefresh` (`registration.waiting`), never forcing
 *    a prompt when there is no waiting worker to activate.
 * 2. Enforces an unconditional 5-minute cooldown (`isRecentlyUpdated()`) and persistent
 *    buildId acknowledgment (`markRecentlyUpdated(remoteBuildId)`) as soon as the user clicks
 *    "새로고침", making infinite reload loops impossible.
 * 3. Includes full diagnostic console logs for `needRefresh` state and SW lifecycle events.
 */
export const PWAUpdatePrompt: React.FC<PWAUpdatePromptProps> = ({ position = 'top' }) => {
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [isManualTest, setIsManualTest] = useState<boolean>(false);
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
        console.log(`[PWAUpdatePrompt] [${source}] Calling registration.update()`);
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

      // 4. If a worker is already waiting upon registration, trigger refresh prompt if not recently updated
      if (registration.waiting && !isRecentlyUpdated()) {
        console.log(
          '[PWAUpdatePrompt] registration.waiting is present on mount -> setting needRefresh(true)'
        );
        setNeedRefresh(true);
      }

      // 5. Watch for service worker update lifecycle
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('[PWAUpdatePrompt] Service Worker updatefound event fired:', {
          installingState: newWorker?.state,
        });
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            console.log('[PWAUpdatePrompt] Installing Service Worker statechange:', {
              state: newWorker.state,
              hasController: Boolean(navigator.serviceWorker.controller),
            });
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller &&
              !isRecentlyUpdated()
            ) {
              console.log(
                '[PWAUpdatePrompt] New Service Worker installed & waiting -> setting needRefresh(true)'
              );
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

  // Log component mount and initial state
  useEffect(() => {
    console.log('[PWAUpdatePrompt] Component mounted:', {
      clientVersion: getAppReleaseVersion(),
      clientBuildId: getBuildId(),
      initialNeedRefresh: needRefresh,
      recentlyUpdatedGuard: isRecentlyUpdated(),
    });
  }, []);

  // Dedicated diagnostic logger & visibility evaluation when `needRefresh` changes
  useEffect(() => {
    let isMounted = true;

    console.log('[PWAUpdatePrompt] needRefresh state changed:', {
      needRefresh,
      currentShowPrompt: showPrompt,
      recentlyUpdatedGuard: isRecentlyUpdated(),
      clientVersion: getAppReleaseVersion(),
      clientBuildId: getBuildId(),
    });

    if (!needRefresh) return;

    // Gate 1: Never show prompt if user just refreshed for an update within the last 5 minutes
    if (isRecentlyUpdated()) {
      console.log(
        '[PWAUpdatePrompt] needRefresh=true suppressed by 5-minute post-update guard.'
      );
      setNeedRefresh(false);
      setShowPrompt(false);
      return;
    }

    const verifyAndShow = async () => {
      try {
        const checkResult = await checkServerVersionStrict();
        if (!isMounted) return;

        console.log(
          '[PWAUpdatePrompt] needRefresh=true -> Server version verification:',
          checkResult
        );

        const targetBuildId = checkResult.remoteBuildId || '';
        const targetVersion = checkResult.remoteVersion || getAppReleaseVersion();

        // Gate 2: If this specific buildId was already applied or dismissed, suppress prompt
        if (targetBuildId && isBuildDismissedOrApplied(targetBuildId)) {
          console.log(
            `[PWAUpdatePrompt] needRefresh=true suppressed because buildId (${targetBuildId}) was already applied or dismissed.`
          );
          setNeedRefresh(false);
          setShowPrompt(false);
          return;
        }

        // Gate 3: Ensure a waiting worker actually exists or server has a genuinely different release
        const reg = swRegistrationRef.current;
        if (!reg?.waiting && !checkResult.hasNewRelease) {
          console.log(
            '[PWAUpdatePrompt] needRefresh=true suppressed: no waiting worker and server version matches client.'
          );
          setNeedRefresh(false);
          setShowPrompt(false);
          return;
        }

        setNewVersionLabel(targetVersion);
        setRemoteBuildId(targetBuildId);
        console.log(
          '[PWAUpdatePrompt] All visibility gates passed -> setting showPrompt(true) for version:',
          targetVersion
        );
        setShowPrompt(true);
      } catch (err) {
        if (!isMounted) return;
        console.warn('[PWAUpdatePrompt] Version check error while needRefresh=true:', err);
        if (swRegistrationRef.current?.waiting && !isRecentlyUpdated()) {
          setNewVersionLabel(getAppReleaseVersion());
          setShowPrompt(true);
        }
      }
    };

    verifyAndShow();

    return () => {
      isMounted = false;
    };
  }, [needRefresh, setNeedRefresh, isBuildDismissedOrApplied]);

  // Log whenever `showPrompt` visibility state changes
  useEffect(() => {
    console.log('[PWAUpdatePrompt] Visibility state (showPrompt) changed:', {
      showPrompt,
      isManualTest,
      displayedVersion: newVersionLabel || getAppReleaseVersion(),
      remoteBuildId,
    });
  }, [showPrompt, isManualTest, newVersionLabel, remoteBuildId]);

  // Controllerchange: reload once safely when the new service worker activates
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let hasReloaded = false;
    const onControllerChange = () => {
      console.log('[PWAUpdatePrompt] navigator.serviceWorker controllerchange fired!', {
        hasReloaded,
      });
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
      console.log('[PWAUpdatePrompt] URL test parameter detected -> showing prompt');
      setIsManualTest(true);
      setShowPrompt(true);
    }

    const handleCustomPrompt = async (e: Event) => {
      const customEvent = e as CustomEvent<{
        forceTest?: boolean;
        remoteVersion?: string;
        remoteBuildId?: string;
      }>;
      console.log(
        '[PWAUpdatePrompt] Custom event pwa-show-update-prompt received:',
        customEvent.detail
      );

      if (customEvent?.detail?.forceTest) {
        setIsManualTest(true);
        setNewVersionLabel(getAppReleaseVersion());
        setRemoteBuildId('test-build');
        setShowPrompt(true);
        return;
      }

      if (isRecentlyUpdated()) return;

      if (customEvent?.detail?.remoteVersion) {
        const bId = customEvent.detail.remoteBuildId || '';
        if (bId && isBuildDismissedOrApplied(bId)) return;
        setNewVersionLabel(customEvent.detail.remoteVersion);
        setRemoteBuildId(bId);
        setShowPrompt(true);
        return;
      }

      const check = await checkServerVersionStrict();
      if (check.hasNewRelease && !isBuildDismissedOrApplied(check.remoteBuildId)) {
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

  // Apply update and reload
  const handleApplyUpdate = async () => {
    if (isUpdating) return;
    console.log('[PWAUpdatePrompt] User clicked Apply Update (새로고침) for buildId:', remoteBuildId);
    setIsUpdating(true);

    cleanTestUrlParams();
    // Immediately record 5-minute cooldown and acknowledge buildId BEFORE reloading
    markRecentlyUpdated(remoteBuildId || getBuildId());
    try {
      if (remoteBuildId) {
        sessionStorage.setItem(DISMISSED_BUILD_ID_KEY, remoteBuildId);
      }
    } catch {}

    setShowPrompt(false);
    setIsManualTest(false);
    setNeedRefresh(false);

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

    // Fallback reload if controllerchange does not fire within 600ms
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleDismiss = () => {
    console.log('[PWAUpdatePrompt] User dismissed update prompt for buildId:', remoteBuildId);
    setShowPrompt(false);
    setIsManualTest(false);
    setNeedRefresh(false);
    cleanTestUrlParams();
    // Also mark buildId as acknowledged so it won't re-pop in this session
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

  const isVisible = showPrompt && (isManualTest || !isRecentlyUpdated());

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
            {/* Left: Animated icon and titles matching screenshot */}
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
                  <span className="px-1.5 py-0.5 bg-white/20 text-[10px] font-extrabold rounded-md text-white border border-white/30 tracking-tight">
                    {newVersionLabel || getAppReleaseVersion()}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-blue-100/90 truncate mt-0.5">
                  {isUpdating
                    ? '잠시 후 페이지가 자동으로 새로고침됩니다.'
                    : '새로운 릴리즈가 배포되었습니다. 지금 새로고침하여 적용하세요.'}
                </p>
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleApplyUpdate}
                disabled={isUpdating}
                className="bg-white hover:bg-blue-50 text-blue-700 font-extrabold px-3.5 py-2 rounded-xl text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed"
                title="새로운 버전을 적용하고 새로고침합니다"
              >
                {isUpdating ? (
                  <Loader2 size={13} className="animate-spin text-blue-600" />
                ) : (
                  <RefreshCw size={13} className="text-blue-600" />
                )}
                <span>{isUpdating ? '적용 중...' : '새로고침'}</span>
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
