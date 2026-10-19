import React, { useState } from 'react';
import { RefreshCw, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePWAUpdate } from '../lib/pwaUpdateManager';

export const Footer: React.FC = () => {
  const navigate = useNavigate();
  const { checkForUpdate, isChecking } = usePWAUpdate();
  const [checkedMsg, setCheckedMsg] = useState<string | null>(null);

  const handleManualCheck = async () => {
    const hasUpdate = await checkForUpdate();
    if (!hasUpdate) {
      setCheckedMsg('최신 버전 사용 중');
      setTimeout(() => setCheckedMsg(null), 3000);
    }
  };

  const handleAdminClick = () => {
    navigate('/admin');
  };

  return (
    <footer className="w-full py-6 mt-8 text-center text-xs text-gray-400 select-none">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3">
        {/* Mobile: Copyright text with Lock icon right next to it, matching uploaded reference */}
        <div className="flex items-center justify-center gap-1.5">
          <p>Copyright 2026. 버버&amp;싱글라이더</p>
          <button
            type="button"
            onClick={handleAdminClick}
            className="sm:hidden inline-flex items-center justify-center p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded border border-gray-300 transition-colors cursor-pointer"
            title="관리자 페이지"
            aria-label="관리자 페이지"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="hidden sm:inline text-gray-300">|</span>

        {/* Update Check Button & PC Lock icon (placed next to Update button on PC) */}
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={handleManualCheck}
            disabled={isChecking}
            className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600 transition-colors cursor-pointer py-1 px-2 rounded hover:bg-gray-100"
            title="Service Worker 캐시 및 최신 앱 배포 여부를 확인합니다."
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin text-blue-500' : ''}`} />
            <span>{isChecking ? '업데이트 확인 중...' : checkedMsg || '업데이트 확인'}</span>
          </button>

          <button
            type="button"
            onClick={handleAdminClick}
            className="hidden sm:inline-flex items-center justify-center p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded border border-gray-300 transition-colors cursor-pointer"
            title="관리자 페이지"
            aria-label="관리자 페이지"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
};
