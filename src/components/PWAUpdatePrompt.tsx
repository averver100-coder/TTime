import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import {
  isRecentlyUpdated,
  markRecentlyUpdated,
  broadcastSkipWaitingToAllWorkers,
  cleanTestUrlParams,
} from '../lib/pwaUpdateManager';
import { checkServerVersionStrict, getAppReleaseVersion } from '../lib/version';

interface PWAUpdatePromptProps {
  /** Optional position override: 'top' (default, matching IT Desk) or 'bottom' */
  position?: 'top' | 'bottom';
}

/**
 * PWA Service Worker Update Notification Banner / Toast
 * Matches IT Desk (https://device.srider.kr/) UX & Design.
 * 
 * Stability Enhancements:
 * 1. Static Build/Version Pinning:
 *    - Compares strictly against pinned release strings and build IDs.
 *    - Never uses dynamic Date.now() or greater-than (>) timestamp math.
 * 2. Relaxed Polling & Focus Monitoring:
 *    - Removed aggressive visibilitychange checks on every tab switch.
 *    - Safe 60-minute periodic interval with strict server pre-verification.
 * 3. Strict Version Mismatch Requirement:
 *    - Even if Service Worker fires updatefound/waiting, it confirms with /api/version
 *      that a genuine new release was deployed before displaying the update prompt.
 *    - False positives are automatically suppressed.
 */
export const PWAUpdatePrompt: React.FC<PWAUpdatePromptProps> = ({ position = 'top' }) => {
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [newVersionLabel, setNewVersionLabel] = useState<string>('');

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Safe periodic check every 60 minutes with strict version pre-check
        const intervalId = setInterval(async () => {
          if (isRecentlyUpdated()) return;
          try {
            const check = await checkServerVersionStrict();
            if (check.hasNewRelease) {
              await registration.update();
            }
          } catch (err) {
            console.debug('[PWA] Periodic SW update check notice:', err);
          }
        }, 60 * 60 * 1000);

        return () => {
          clearInterval(intervalId);
        };
      }
    },
    onRegisterError(err) {
      console.warn('[PWA] Service Worker registration error:', err);
    },
  });

  // Strict verification whenever useRegisterSW indicates an update is waiting
  useEffect(() => {
    let isMounted = true;

    const verifyUpdate = async () => {
      if (!needRefresh) {
        if (!showPrompt) {
          setShowPrompt(false);
        }
        return;
      }

      if (isRecentlyUpdated()) {
        setNeedRefresh(false);
        setShowPrompt(false);
        return;
      }

      // Check if user dismissed this version in current session
      try {
        const dismissedVer = sessionStorage.getItem('pwa_update_dismissed');
        if (dismissedVer && dismissedVer === getAppReleaseVersion()) {
          setNeedRefresh(false);
          setShowPrompt(false);
          return;
        }
      } catch {}

      // Strict version verification with server
      const checkResult = await checkServerVersionStrict();
      if (!isMounted) return;

      if (checkResult.hasNewRelease) {
        setNewVersionLabel(checkResult.remoteVersion || '');
        setShowPrompt(true);
      } else {
        // False positive detected: Service worker re-checked but release is identical
        console.debug(
          '[PWA] False positive update suppressed: Current version matches server',
          checkResult.currentVersion
        );
        setNeedRefresh(false);
        setShowPrompt(false);
      }
    };

    verifyUpdate();

    return () => {
      isMounted = false;
    };
  }, [needRefresh, setNeedRefresh, showPrompt]);

  // Controllerchange: reload once safely when the new service worker activates
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let hasReloaded = false;
    const onControllerChange = () => {
      if (!hasReloaded) {
        hasReloaded = true;
        markRecentlyUpdated();
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  // Support manual tests (?test_update=1, ?test_pwa=1, or 'pwa-show-update-prompt' event)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    if (url.searchParams.get('test_update') === '1' || url.searchParams.get('test_pwa') === '1') {
      if (!isRecentlyUpdated()) {
        setShowPrompt(true);
      }
    }

    const handleCustomPrompt = async (e: Event) => {
      const customEvent = e as CustomEvent<{ forceTest?: boolean }>;
      if (customEvent?.detail?.forceTest) {
        setShowPrompt(true);
        return;
      }

      if (isRecentlyUpdated()) return;

      const check = await checkServerVersionStrict();
      if (check.hasNewRelease) {
        setNewVersionLabel(check.remoteVersion || '');
        setShowPrompt(true);
      }
    };

    window.addEventListener('pwa-show-update-prompt', handleCustomPrompt);
    return () => {
      window.removeEventListener('pwa-show-update-prompt', handleCustomPrompt);
    };
  }, []);

  // Apply update and reload
  const handleApplyUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    // Clean test query parameters from address bar
    cleanTestUrlParams();

    // Set 5-minute guard to suppress immediate re-prompting
    markRecentlyUpdated();
    setShowPrompt(false);
    setNeedRefresh(false);

    // Direct SKIP_WAITING broadcast to any waiting worker
    try {
      await broadcastSkipWaitingToAllWorkers();
    } catch (err) {
      console.debug('[PWA] Service worker skipWaiting broadcast error:', err);
    }

    // Trigger updateServiceWorker
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.debug('[PWA] updateServiceWorker execution error:', err);
    }

    // Fallback reload if controllerchange event does not fire within 600ms
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setNeedRefresh(false);
    cleanTestUrlParams();
    try {
      sessionStorage.setItem('pwa_update_dismissed', getAppReleaseVersion());
    } catch {}
  };

  const positionClass =
    position === 'bottom'
      ? 'fixed bottom-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-[460px] sm:max-w-xl z-[9999] pointer-events-auto'
      : 'fixed top-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-[460px] sm:max-w-xl z-[9999] pointer-events-auto';

  return (
    <AnimatePresence>
      {showPrompt && !isRecentlyUpdated() && (
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
                  <RefreshCw
                    size={18}
                    className="animate-spin"
                    style={{ animationDuration: '3s' }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-tight truncate text-white">
                    {isUpdating ? '최신 버전 적용 중...' : '새로운 업데이트가 있습니다'}
                  </span>
                  <span className="px-1.5 py-0.2 bg-white/20 text-[10px] font-extrabold rounded text-white border border-white/30">
                    {newVersionLabel ? newVersionLabel : 'UPDATE'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-blue-100/90 truncate">
                  {isUpdating
                    ? '잠시 후 페이지가 자동으로 새로고침됩니다.'
                    : '새로운 릴리즈가 배포되었습니다. 지금 새로고침하세요.'}
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
