import React, { useState } from 'react';
import { RefreshCw, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePWAUpdate } from '../lib/pwaUpdateManager';
import { checkServerVersionStrict, getAppReleaseVersion, showVersionToast } from '../lib/version';

export const Footer: React.FC = () => {
  const navigate = useNavigate();
  const { checkForUpdate, isChecking } = usePWAUpdate();
  const [checkedMsg, setCheckedMsg] = useState<string | null>(null);
  const currentVersion = getAppReleaseVersion();

  const handleManualCheck = async () => {
    const releaseVer = getAppReleaseVersion();
    const hasUpdate = await checkForUpdate();

    if (hasUpdate) {
      const strict = await checkServerVersionStrict().catch(() => null);
      const targetVer = strict?.remoteVersion || releaseVer;
      setCheckedMsg(`새 버전 (${targetVer})`);
      showVersionToast(targetVer, true);
      setTimeout(() => setCheckedMsg(null), 4000);
    } else {
      setCheckedMsg('최신 버전');
      showVersionToast(releaseVer, false);
      setTimeout(() => setCheckedMsg(null), 3500);
    }
  };

  const handleAdminClick = () => {
    navigate('/admin');
  };

  return (
    <footer className="w-full py-6 mt-8 text-center text-xs text-slate-500 select-none">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 px-3">
        <span className="text-slate-500 font-normal tracking-tight whitespace-nowrap">
          Copyright 2026 버버&amp;싱글라이더
        </span>

        {/* Version Pill matching uploaded design */}
        <span
          className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100/90 border border-slate-200/90 text-slate-600 text-xs font-medium font-mono tabular-nums tracking-tight whitespace-nowrap"
          title={`현재 적용된 버전: ${currentVersion}`}
        >
          {currentVersion}
        </span>

        {/* Update Check Pill Button */}
        <button
          type="button"
          onClick={handleManualCheck}
          disabled={isChecking}
          className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/90 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          title="서버의 최신 배포 버전을 확인하고 새 업데이트가 있으면 즉시 적용합니다."
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-600 shrink-0 ${isChecking ? 'animate-spin text-blue-600' : ''}`} />
          <span>{isChecking ? '확인 중...' : checkedMsg || '업데이트 확인'}</span>
        </button>

        {/* Circular Admin Lock Button */}
        <button
          type="button"
          onClick={handleAdminClick}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/60 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0"
          title="관리자 페이지"
          aria-label="관리자 페이지"
        >
          <Lock className="w-3.5 h-3.5" />
        </button>
      </div>
    </footer>
  );
};
