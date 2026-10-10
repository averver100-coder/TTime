import React from 'react';
import { RefreshCw, Sparkles, X, ArrowUpCircle } from 'lucide-react';
import { usePWAUpdate } from '../lib/pwaUpdateManager';

interface PWAUpdatePromptProps {
  /** Optional custom position: 'top' or 'bottom' (default: 'bottom') */
  position?: 'top' | 'bottom';
}

export const PWAUpdatePrompt: React.FC<PWAUpdatePromptProps> = ({
  position = 'bottom',
}) => {
  const { needRefresh, isUpdating, applyUpdate, dismissUpdate } = usePWAUpdate();

  if (!needRefresh) {
    return null;
  }

  const positionClasses =
    position === 'top'
      ? 'top-4 inset-x-4 sm:inset-x-auto sm:right-6'
      : 'bottom-4 inset-x-4 sm:inset-x-auto sm:right-6';

  return (
    <aside
      aria-label="PWA 업데이트 알림"
      aria-live="polite"
      className={`fixed ${positionClasses} z-50 max-w-md w-auto animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto`}
    >
      <div className="bg-slate-900/95 backdrop-blur-md text-white border border-blue-500/30 rounded-2xl p-4 shadow-2xl shadow-blue-950/50 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start gap-3 justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 shadow-inner flex-shrink-0 animate-pulse">
              <Sparkles className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white tracking-wide">
                  UPDATE
                </span>
                <h4 className="text-sm font-bold text-white tracking-tight">
                  새로운 업데이트가 있습니다.
                </h4>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                새로운 버전의 쌤타임이 준비되었습니다. 최신 변경사항을 적용하려면 새로고침하세요.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissUpdate}
            aria-label="알림 닫기"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10">
          <button
            type="button"
            onClick={dismissUpdate}
            disabled={isUpdating}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            나중에
          </button>

          <button
            type="button"
            onClick={() => applyUpdate()}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-md shadow-blue-700/30 transition-all hover:scale-102 active:scale-98 disabled:opacity-50 disabled:pointer-events-none"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`}
            />
            <span>{isUpdating ? '적용 중...' : '새로고침'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
