import React from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { usePWAUpdate } from '../lib/pwaUpdateManager';

interface PWAUpdatePromptProps {
  /** Optional custom position: 'top' or 'bottom' (default: 'bottom') */
  position?: 'top' | 'bottom';
}

/**
 * PWA Service Worker Update Notification Banner / Toast
 * Designed to exactly match the ipass.srider.kr update prompt layout, styling, and animations.
 */
export const PWAUpdatePrompt: React.FC<PWAUpdatePromptProps> = ({
  position = 'bottom',
}) => {
  const { needRefresh, isUpdating, applyUpdate, dismissUpdate } = usePWAUpdate();

  if (!needRefresh) {
    return null;
  }

  const positionClasses =
    position === 'top'
      ? 'fixed top-5 right-5 z-50 max-w-sm w-[calc(100vw-2.5rem)] sm:w-auto p-4 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-blue-500/40 backdrop-blur-md animate-in fade-in slide-in-from-top-5 duration-300 ring-1 ring-white/10'
      : 'fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100vw-2.5rem)] sm:w-auto p-4 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-blue-500/40 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300 ring-1 ring-white/10';

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
              새로운 업데이트가 있습니다!
            </h4>
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 font-bold rounded">
              NEW
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-300 leading-relaxed">
            최신 기능과 안정성 개선 사항이 배포되었습니다. 지금 새로고침하여 최신 버전을 적용하세요.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              id="pwa-refresh-btn"
              onClick={() => applyUpdate()}
              disabled={isUpdating}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer ring-1 ring-blue-400/40 disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : 'animate-spin'}`}
                style={{ animationDuration: isUpdating ? '1s' : '3s' }}
              />
              <span>{isUpdating ? '새로고침 적용 중...' : '새로고침 (업데이트)'}</span>
            </button>

            <button
              type="button"
              onClick={dismissUpdate}
              disabled={isUpdating}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              나중에
            </button>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={dismissUpdate}
          disabled={isUpdating}
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
