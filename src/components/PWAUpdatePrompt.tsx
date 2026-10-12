import React, { useState } from 'react';
import { Sparkles, X, Loader2, RefreshCw } from 'lucide-react';
import {
  usePWAUpdate,
  isRecentlyUpdated,
  markRecentlyUpdated,
  cleanTestUrlParams,
  broadcastSkipWaitingToAllWorkers,
} from '../lib/pwaUpdateManager';

interface PWAUpdatePromptProps {
  /** Optional custom position: 'top' or 'bottom' (default: 'bottom') */
  position?: 'top' | 'bottom';
}

/**
 * PWA Service Worker Update Notification Banner / Toast
 * Features 5-layer infinite loop defense:
 * 1. sessionStorage guard (pwa_update_recently - 15s suppression)
 * 2. Direct SKIP_WAITING broadcast & button progress state (Loader2, [적용 중...], double-click lock)
 * 3. URL test parameter auto-cleanup (?test_update=1 removal via history.replaceState)
 * 4. controllerchange duplicate reload lock (hasReloaded)
 * 5. Workbox cleanupOutdatedCaches & clientsClaim
 */
export const PWAUpdatePrompt: React.FC<PWAUpdatePromptProps> = ({
  position = 'bottom',
}) => {
  const { needRefresh, isUpdating, applyUpdate, dismissUpdate } = usePWAUpdate();
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  // Defense 1: If user closed prompt, or if updated within last 15 seconds, suppress popup completely
  if (isDismissed || isRecentlyUpdated()) {
    return null;
  }

  // Only render when update is detected or in the process of applying
  if (!needRefresh && !isApplying) {
    return null;
  }

  const handleApplyUpdate = async () => {
    if (isApplying || isUpdating) return;

    // Defense 1: Immediately mark 15s sessionStorage guard
    markRecentlyUpdated();

    // Defense 2: Immediately change button state to [적용 중...] with Loader2 to prevent double-clicks
    setIsApplying(true);

    // Defense 3: Clean test parameters (?test_update=1) from URL bar
    cleanTestUrlParams();

    // Defense 2: Explicitly broadcast SKIP_WAITING to all registered service workers' waiting instances
    try {
      await broadcastSkipWaitingToAllWorkers();
    } catch (e) {
      console.warn('[PWA] Broadcast SKIP_WAITING error:', e);
    }

    // Dismiss popup from view smoothly to prevent flicker
    setTimeout(() => {
      setIsDismissed(true);
    }, 350);

    // Apply update and reload
    try {
      await applyUpdate();
    } catch (err) {
      console.error('[PWA] applyUpdate failed:', err);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    dismissUpdate();
  };

  const positionClasses =
    position === 'top'
      ? 'fixed top-5 right-5 z-50 max-w-sm w-[calc(100vw-2.5rem)] sm:w-auto p-4 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-blue-500/40 backdrop-blur-md animate-in fade-in slide-in-from-top-5 duration-300 ring-1 ring-white/10'
      : 'fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100vw-2.5rem)] sm:w-auto p-4 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-blue-500/40 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300 ring-1 ring-white/10';

  const isBusy = isApplying || isUpdating;

  return (
    <div
      role="alert"
      id="pwa-update-toast"
      className={positionClasses}
    >
      <div className="flex items-start gap-3">
        {/* Sparkles Icon Box */}
        <div className="p-2.5 bg-blue-600/30 text-blue-400 rounded-xl shrink-0 mt-0.5 border border-blue-400/30">
          <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
        </div>

        {/* Text and Actions */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-bold text-white">
              새로운 업데이트가 있습니다.
            </h4>
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 font-bold rounded">
              NEW
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-300 leading-relaxed">
            최신 버전이 배포되었습니다. 지금 새로고침하여 적용하세요.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              id="pwa-refresh-btn"
              onClick={handleApplyUpdate}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer ring-1 ring-blue-400/40 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>적용 중...</span>
                </>
              ) : (
                <>
                  <RefreshCw
                    className="w-3.5 h-3.5 animate-spin"
                    style={{ animationDuration: '3s' }}
                  />
                  <span>새로운 업데이트가 있습니다. 새로고침</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              disabled={isBusy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              나중에
            </button>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          disabled={isBusy}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors shrink-0 -mr-1 -mt-1 cursor-pointer disabled:opacity-50"
          aria-label="닫기"
          title="닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
