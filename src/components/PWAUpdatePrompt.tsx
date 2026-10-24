import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, RefreshCw, X } from 'lucide-react';

interface PWAUpdatePromptProps {
  /** Optional position override: 'top' (default, matching IT Desk) or 'bottom' */
  position?: 'top' | 'bottom';
}

/**
 * PWA Service Worker Update Notification Banner / Toast
 * Exact match with IT Desk (https://device.srider.kr/)
 * 
 * Key stability features:
 * 1. 15-second sessionStorage guard ('pwa_update_recently') to prevent repeated/duplicate prompts
 * 2. Instant check on document visibility change (switches back to tab/app -> immediate update detection)
 * 3. 30-minute periodic background check
 * 4. Single-reload controllerchange listener with reload guard
 * 5. Direct SKIP_WAITING message broadcast to waiting workers
 * 6. Top-center floating toast with spring animation & backdrop-blur gradient
 * 7. Test support: ?test_update=1, ?test_pwa=1, and 'pwa-show-update-prompt' event
 */
export const PWAUpdatePrompt: React.FC<PWAUpdatePromptProps> = ({ position = 'top' }) => {
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // 15-second sessionStorage guard to prevent duplicate notifications after reload
  const isRecentlyUpdated = (): boolean => {
    try {
      if (typeof window === 'undefined') return false;
      const stored = sessionStorage.getItem('pwa_update_recently');
      if (stored && Date.now() - parseInt(stored, 10) < 15000) {
        return true;
      }
    } catch {}
    return false;
  };

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Periodic background check every 30 minutes
        const intervalId = setInterval(() => {
          if (!isRecentlyUpdated()) {
            registration.update().catch((err) => {
              console.debug('Service Worker periodic check notice:', err);
            });
          }
        }, 30 * 60 * 1000);

        // Immediate check when user returns to app/tab (fastest response)
        const onVisibilityChange = () => {
          if (document.visibilityState === 'visible' && !isRecentlyUpdated()) {
            registration.update().catch((err) => {
              console.debug('Service Worker visibility check notice:', err);
            });
          }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
          clearInterval(intervalId);
          document.removeEventListener('visibilitychange', onVisibilityChange);
        };
      }
    },
    onRegisterError(err) {
      console.warn('PWA Service Worker registration error:', err);
    },
  });

  // Guard: if needRefresh is triggered but within 15s of a recent update, suppress it
  useEffect(() => {
    if (needRefresh && isRecentlyUpdated()) {
      setNeedRefresh(false);
    }
  }, [needRefresh, setNeedRefresh]);

  // Controllerchange: when the new service worker activates, reload safely once
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let hasReloaded = false;
    const onControllerChange = () => {
      if (!hasReloaded) {
        hasReloaded = true;
        try {
          sessionStorage.setItem('pwa_update_recently', Date.now().toString());
        } catch {}
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  // Listen for test query parameters (?test_update=1, ?test_pwa=1) and custom event
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('test_update') === '1' || url.searchParams.get('test_pwa') === '1') {
      if (!isRecentlyUpdated()) {
        setNeedRefresh(true);
      }
    }

    const onShowUpdate = () => {
      if (!isRecentlyUpdated()) {
        setNeedRefresh(true);
      }
    };

    window.addEventListener('pwa-show-update-prompt', onShowUpdate);
    return () => {
      window.removeEventListener('pwa-show-update-prompt', onShowUpdate);
    };
  }, [setNeedRefresh]);

  // Apply update and reload
  const handleApplyUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    // Clean test parameters from URL bar
    try {
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.has('test_update') || url.searchParams.has('test_pwa')) {
          url.searchParams.delete('test_update');
          url.searchParams.delete('test_pwa');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
        }
      }
    } catch {}

    // Mark 15s session storage guard to prevent duplicate notifications
    try {
      sessionStorage.setItem('pwa_update_recently', Date.now().toString());
    } catch {}

    setNeedRefresh(false);

    // Direct SKIP_WAITING broadcast to any waiting worker
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }
    } catch (err) {
      console.debug('Service worker skipWaiting direct message error:', err);
    }

    // Trigger updateServiceWorker
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.debug('updateServiceWorker execution error:', err);
    }

    // Fallback reload if controllerchange event does not fire within 600ms
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
  };

  const positionClass =
    position === 'bottom'
      ? 'fixed bottom-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-[460px] sm:max-w-xl z-[9999] pointer-events-auto'
      : 'fixed top-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-auto sm:min-w-[460px] sm:max-w-xl z-[9999] pointer-events-auto';

  return (
    <AnimatePresence>
      {needRefresh && !isRecentlyUpdated() && (
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
                    UPDATE
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-blue-100/90 truncate">
                  {isUpdating
                    ? '잠시 후 페이지가 자동으로 새로고침됩니다.'
                    : '최신 개선사항이 적용되었습니다. 지금 새로고침하세요.'}
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

