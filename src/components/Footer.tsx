import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePWAUpdate } from '../lib/pwaUpdateManager';

export const Footer: React.FC = () => {
  const { checkForUpdate, isChecking } = usePWAUpdate();
  const [checkedMsg, setCheckedMsg] = useState<string | null>(null);

  const handleManualCheck = async () => {
    const hasUpdate = await checkForUpdate();
    if (!hasUpdate) {
      setCheckedMsg('최신 버전 사용 중');
      setTimeout(() => setCheckedMsg(null), 3000);
    }
  };

  return (
    <footer className="w-full py-6 mt-8 text-center text-xs text-gray-400 select-none">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-4">
        <p>Copyright 2026. 버버&amp;싱글라이더</p>
        <span className="hidden sm:inline text-gray-300">|</span>
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
      </div>
    </footer>
  );
};

