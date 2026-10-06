import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Share2, 
  PlusSquare, 
  X, 
  Smartphone, 
  Check, 
  Sparkles, 
  Copy, 
  AlertCircle, 
  Monitor, 
  Laptop
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { SchoolLogo } from './SchoolLogo';

export const PWAInstallButton: React.FC = () => {
  const { 
    isInstallable, 
    isInstalled, 
    isIOS, 
    isDesktop,
    isWindows,
    isMac,
    isWhale, 
    install,
  } = usePWAInstall();

  const [showModal, setShowModal] = useState(false);
  const [showTopBanner, setShowTopBanner] = useState(false);
  const [installedToast, setInstalledToast] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Auto-show install prompt banner if not installed
  useEffect(() => {
    if (isInstalled) {
      setShowTopBanner(false);
      return;
    }

    const dismissed = localStorage.getItem('ssaemtime_pwa_dismissed_time');
    if (dismissed) {
      const time = parseInt(dismissed, 10);
      // Don't show auto-banner for 24h if dismissed
      if (Date.now() - time < 24 * 60 * 60 * 1000) {
        return;
      }
    }

    const timer = setTimeout(() => {
      setShowTopBanner(true);
    }, 800);

    return () => clearTimeout(timer);
  }, [isInstalled]);

  const handleDismissBanner = () => {
    setShowTopBanner(false);
    localStorage.setItem('ssaemtime_pwa_dismissed_time', Date.now().toString());
  };

  const handleInstallAction = async () => {
    if (isIOS) {
      // iOS doesn't support beforeinstallprompt, must show visual guide
      setShowModal(true);
      return;
    }

    setIsInstalling(true);
    try {
      // Try native install prompt first
      const outcome = await install();
      if (outcome === 'accepted') {
        setShowTopBanner(false);
        setShowModal(false);
        setInstalledToast(true);
        setTimeout(() => setInstalledToast(false), 5000);
      } else {
        // Show guidance modal
        setShowModal(true);
      }
    } catch {
      setShowModal(true);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 3000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 3000);
    }
  };

  if (isInstalled) {
    return null;
  }

  return (
    <>
      {/* Installed Success Toast */}
      {installedToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-bold animate-bounce">
          <Check className="w-5 h-5" />
          <span>
            {isDesktop ? '쌤타임이 바탕화면 및 앱 목록에 성공적으로 설치되었습니다!' : '쌤타임이 홈 화면에 성공적으로 추가되었습니다!'}
          </span>
        </div>
      )}

      {/* Copied Toast */}
      {copiedToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>주소가 복사되었습니다. 브라우저 주소창에 붙여넣으세요!</span>
        </div>
      )}

      {/* Header Install Button - Shown on both desktop and mobile with gradient & pulse */}
      <button
        type="button"
        onClick={handleInstallAction}
        disabled={isInstalling}
        className="shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white border border-blue-400/40 rounded-xl text-xs font-bold transition shadow-xs shadow-blue-500/25 active:scale-95 disabled:opacity-60 cursor-pointer relative"
        title="바탕화면 및 홈 화면에 앱 설치하기"
      >
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
        </span>
        <Download className="w-3.5 h-3.5 text-white shrink-0 animate-pulse" />
        <span className="whitespace-nowrap">앱 설치</span>
      </button>

      {/* Top Floating Gradient Install Banner with Pulse Animation */}
      {showTopBanner && !showModal && (
        <div className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-40 w-[94%] sm:w-[540px] max-w-xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 text-white rounded-2xl p-4 sm:p-5 shadow-2xl shadow-blue-950/35 border border-blue-400/35 backdrop-blur-md ring-1 ring-white/10 animate-in fade-in slide-in-from-top-4 duration-300 overflow-hidden">
          {/* Decorative Ambient Radial Gradient Glows */}
          <div className="absolute -top-12 -right-12 w-44 h-44 bg-indigo-400/25 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-400/20 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Logo with Animated Ping Beacon */}
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm border border-white/25 p-1 flex items-center justify-center shadow-inner overflow-hidden">
                    <SchoolLogo className="w-full h-full object-contain drop-shadow" />
                  </div>
                  {/* Pulsing Beacon */}
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400 border-2 border-indigo-900"></span>
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm sm:text-base font-black text-white tracking-tight">
                      {isDesktop ? '쌤타임 PC 정식 앱 설치' : '쌤타임 앱 홈 화면 설치'}
                    </h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black bg-amber-400/20 border border-amber-300/40 text-amber-200 rounded-full animate-pulse">
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      {isDesktop ? '바탕화면 등록' : '공식 PWA'}
                    </span>
                  </div>
                  <p className="text-xs text-blue-100/90 leading-tight mt-1">
                    {isDesktop 
                      ? '주소창 없는 전체화면 & 독립 창으로 빠른 시간표 조회' 
                      : '홈 화면에 추가하여 주소창 없이 앱처럼 실시간 시간표 조회'}
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={handleDismissBanner}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/15 rounded-xl transition shrink-0 cursor-pointer"
                title="배너 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 mt-3.5 pt-3 border-t border-white/15">
              <button
                type="button"
                onClick={handleDismissBanner}
                className="text-xs font-semibold text-blue-100/80 hover:text-white py-2 px-3 rounded-xl hover:bg-white/10 transition text-center cursor-pointer"
              >
                다음에
              </button>
              <button
                type="button"
                onClick={handleInstallAction}
                disabled={isInstalling}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/25 transition-all transform hover:scale-[1.01] active:scale-95 animate-pulse cursor-pointer disabled:opacity-60"
              >
                {isDesktop ? (
                  <Monitor className="w-4 h-4 text-slate-950" />
                ) : (
                  <Download className="w-4 h-4 text-slate-950 animate-bounce" />
                )}
                <span>{isIOS ? '설치 방법 안내' : isDesktop ? 'PC 앱 바로 설치' : '지금 앱 바로 설치'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Install Guide Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center p-1 shrink-0">
                  <SchoolLogo className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    {isDesktop ? 'PC 쌤타임 앱 설치 안내' : '쌤타임 앱 설치'}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    {isDesktop ? '브라우저 공식 기능으로 바탕화면에 정식 앱 등록' : '주소표시줄 없는 전체화면 앱'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Platform Specific Guides */}
            <div className="my-4 space-y-3.5">
              {/* PC Desktop Dedicated Experience */}
              {isDesktop ? (
                <div className="space-y-3.5">
                  {/* Browser Native App Installation (Official & Recommended) */}
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200/80 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Laptop className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-blue-950">크롬 / 엣지 브라우저에서 공식 앱 설치</h4>
                          <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded">권장</span>
                        </div>
                        <p className="text-xs text-blue-800/90 leading-relaxed mt-1">
                          보안 경고 없이 <strong>고화질 쌤타임 로고 아이콘이 바탕화면과 시작 메뉴에 정식 앱으로 등록</strong>되며, 주소창 없는 깔끔한 독립 창으로 실행됩니다.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1 text-xs text-gray-700">
                      <div className="flex items-start gap-2.5 bg-white/95 p-2.5 rounded-xl border border-blue-100/80 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">1</span>
                        <div className="leading-snug">
                          브라우저 <strong>상단 주소창 우측 끝</strong>의 <strong>[설치] 아이콘(모니터 모양 🖥️)</strong>을 클릭합니다.
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 bg-white/95 p-2.5 rounded-xl border border-blue-100/80 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">2</span>
                        <div className="leading-snug">
                          또는 브라우저 우측 상단 더보기 <strong>(⋮)</strong> 메뉴 → <strong>[전송, 저장 및 공유]</strong> (또는 [앱]) → <strong>[쌤타임 설치...]</strong>를 클릭합니다.
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5 bg-white/95 p-2.5 rounded-xl border border-blue-100/80 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">3</span>
                        <div className="leading-snug">
                          확인 창에서 <strong>[설치]</strong> 버튼을 누르면 윈도우 바탕화면과 작업표시줄에 쌤타임 공식 앱이 즉시 생성됩니다!
                        </div>
                      </div>
                    </div>

                    {isInstallable && (
                      <button
                        type="button"
                        onClick={async () => {
                          const outcome = await install();
                          if (outcome === 'accepted') {
                            setShowModal(false);
                            setInstalledToast(true);
                            setTimeout(() => setInstalledToast(false), 5000);
                          }
                        }}
                        className="w-full mt-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-98 transition"
                      >
                        <Download className="w-4 h-4" />
                        <span>브라우저 앱 자동 설치 창 띄우기</span>
                      </button>
                    )}
                  </div>

                  {/* Bookmark Shortcut (Ctrl + D) Tip */}
                  <div className="p-3 bg-gray-50 border border-gray-200/80 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-1 bg-white border border-gray-300 rounded font-mono font-bold text-[11px] text-gray-800 shrink-0">Ctrl + D</span>
                      <span className="text-gray-600 truncate">북마크바에 등록하여 클릭 한 번으로 이동하기</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="shrink-0 py-1.5 px-3 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Copy className="w-3.5 h-3.5 text-gray-500" />
                      <span>주소 복사</span>
                    </button>
                  </div>
                </div>
              ) : isWhale ? (
                /* Mobile Whale Browser */
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">네이버 웨일 브라우저 안내</h4>
                      <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                        웨일 모바일 브라우저는 브라우저 자체 정책상 '홈 화면에 추가' 시 상단 주소표시줄이 브라우저 창으로 남을 수 있습니다.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-amber-200/60 text-xs text-amber-950">
                    <p className="font-bold text-[11px] mb-1.5 flex items-center gap-1 text-blue-700">
                      ✨ 주소표시줄 없는 100% 독립 앱으로 설치하려면:
                    </p>
                    <p className="text-[11px] leading-relaxed text-gray-700 mb-2.5">
                      아래 <strong>[주소 복사]</strong> 버튼을 누른 뒤, <strong>Chrome(크롬)</strong>이나 <strong>삼성 인터넷</strong>에 붙여넣어 접속하시면 주소표시줄이 전혀 없는 순수 앱으로 즉시 설치됩니다.
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>현재 페이지 주소 복사하기</span>
                    </button>
                  </div>
                </div>
              ) : isIOS ? (
                /* iOS Safari Guide */
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-xl flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      아이폰 Safari는 아래 <strong>3단계</strong>로 홈 화면에 앱을 설치할 수 있습니다:
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs text-gray-700">
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                        1
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 flex items-center gap-1.5">
                          Safari 하단의 <Share2 className="w-3.5 h-3.5 text-blue-600" /> [공유] 버튼 터치
                        </p>
                        <p className="text-gray-500 text-[11px] mt-0.5">화면 하단 중앙의 네모 위 화살표 아이콘을 누릅니다.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                        2
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 flex items-center gap-1.5">
                          <PlusSquare className="w-3.5 h-3.5 text-blue-600" /> ['홈 화면에 추가'] 선택
                        </p>
                        <p className="text-gray-500 text-[11px] mt-0.5">메뉴 목록을 아래로 내려 '홈 화면에 추가'를 누릅니다.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                        3
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">우측 상단 ['추가'] 터치</p>
                        <p className="text-gray-500 text-[11px] mt-0.5">홈 화면 아이콘을 누르면 주소창 없이 앱으로 실행됩니다.</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : isInstallable ? (
                /* Android / Chrome Mobile One-Click Install */
                <div className="text-center py-2 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <Download className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">자동 앱 설치가 가능합니다</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      아래 버튼을 누르면 브라우저 공식 앱 설치 팝업이 바로 나타납니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const outcome = await install();
                      if (outcome === 'accepted') {
                        setShowModal(false);
                        setInstalledToast(true);
                        setTimeout(() => setInstalledToast(false), 5000);
                      }
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-xs shadow-md shadow-blue-200 active:scale-98 whitespace-nowrap"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span>지금 바로 설치하기</span>
                  </button>
                </div>
              ) : (
                /* General / Android Mobile fallback instructions */
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3 rounded-xl flex items-start gap-2">
                    <Smartphone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>브라우저 메뉴에서 손쉽게 앱으로 설치할 수 있습니다:</span>
                  </div>

                  <div className="space-y-2 text-xs text-gray-700">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="font-bold text-gray-900 mb-1">Chrome(크롬) / 삼성 인터넷:</p>
                      <p className="text-gray-600 text-[11px] leading-relaxed">
                        우측 상단 <strong>더보기(⋮ 또는 ≡)</strong> 메뉴를 누른 후 <strong>'홈 화면에 추가'</strong> 또는 <strong>'앱 설치'</strong>를 누르시면 주소표시줄 없는 앱이 설치됩니다.
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="font-bold text-gray-900 mb-1">웨일(Whale) 브라우저에서 추가:</p>
                      <p className="text-gray-600 text-[11px] leading-relaxed">
                        하단 우측 <strong>메뉴(≡)</strong> → <strong>'홈 화면에 추가'</strong>를 선택하세요. (※ 주소창 없는 전체화면은 Chrome 설치 권장)
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="w-full py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-600" />
                    <span>주소 복사하기</span>
                  </button>
                </div>
              )}
            </div>

              {/* Close Button */}
              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition text-center cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
};

export const PWAInstallModalGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { isDesktop, isIOS, isInstallable, install } = usePWAInstall();
  const [copiedToast, setCopiedToast] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 3000);
    } catch {
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      {copiedToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-60 bg-gray-900 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>주소가 복사되었습니다. 브라우저 주소창에 붙여넣으세요!</span>
        </div>
      )}

      <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center p-1 shrink-0">
              <SchoolLogo className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                {isDesktop ? 'PC 쌤타임 앱 설치 안내' : '쌤타임 앱 설치'}
              </h3>
              <p className="text-[11px] text-gray-500">
                {isDesktop ? '브라우저 공식 기능으로 바탕화면에 정식 앱 등록' : '주소표시줄 없는 전체화면 앱'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Specific Guides */}
        <div className="my-4 space-y-3.5">
          {/* PC Desktop Dedicated Experience */}
          {isDesktop ? (
            <div className="space-y-3.5">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200/80 rounded-2xl space-y-3 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-bold text-blue-950">크롬 / 엣지 브라우저에서 공식 앱 설치</h4>
                      <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded">권장</span>
                    </div>
                    <p className="text-xs text-blue-800/90 leading-relaxed mt-1">
                      보안 경고 없이 <strong>고화질 쌤타임 로고 아이콘이 바탕화면과 시작 메뉴에 정식 앱으로 등록</strong>되며, 주소창 없는 깔끔한 독립 창으로 실행됩니다.
                    </p>
                  </div>
                </div>

                {isInstallable && (
                  <button
                    type="button"
                    onClick={async () => {
                      await install();
                      onClose();
                    }}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-98 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>지금 바로 브라우저 앱 설치 팝업 띄우기</span>
                  </button>
                )}

                <div className="p-3 bg-white/80 rounded-xl border border-blue-100 text-xs text-gray-700 space-y-1.5">
                  <p className="font-bold text-gray-900">수동으로 설치하는 방법 (주소창 아이콘):</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 text-[11px] leading-relaxed">
                    <li>브라우저 상단 <strong>주소창 오른쪽 끝의 설치 아이콘(⊕ 또는 컴퓨터 모양)</strong>을 클릭합니다.</li>
                    <li><strong>'설치'</strong>를 누르면 1초 만에 바탕화면에 아이콘이 생성됩니다.</li>
                  </ol>
                </div>
              </div>
            </div>
          ) : isIOS ? (
            /* iOS Safari Experience */
            <div className="space-y-3">
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5">
                <Share2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-900 leading-relaxed font-medium">
                  아이폰/아이패드는 <strong>Safari(사파리) 브라우저</strong>에서 접속하셔야 홈 화면에 설치할 수 있습니다.
                </p>
              </div>

              <div className="space-y-2 text-xs text-gray-700">
                <div className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  <div className="leading-relaxed">
                    하단 또는 상단 툴바의 <strong>공유 버튼</strong>
                    <Share2 className="inline w-3.5 h-3.5 mx-1 text-blue-600" />
                    을 누릅니다.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  <div className="leading-relaxed">
                    메뉴를 아래로 내려 <strong>'홈 화면에 추가'</strong>
                    <PlusSquare className="inline w-3.5 h-3.5 mx-1 text-blue-600" />
                    를 선택합니다.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  <div className="leading-relaxed">
                    우측 상단 <strong>'추가'</strong>를 누르면 홈 화면에 쌤타임 앱 아이콘이 생성됩니다.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyUrl}
                className="w-full py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-gray-600" />
                <span>주소 복사하여 Safari에서 열기</span>
              </button>
            </div>
          ) : (
            /* Android Experience */
            <div className="space-y-3">
              {isInstallable ? (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-2">
                  <h4 className="text-sm font-bold text-gray-900">자동 앱 설치가 가능합니다</h4>
                  <p className="text-xs text-gray-600">
                    아래 버튼을 누르면 브라우저 공식 앱 설치 팝업이 바로 나타납니다.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      await install();
                      onClose();
                    }}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-98 cursor-pointer"
                  >
                    지금 바로 앱 설치 팝업 띄우기
                  </button>
                </div>
              ) : null}

              <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3 rounded-xl flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>브라우저 메뉴에서 손쉽게 앱으로 설치할 수 있습니다:</span>
              </div>

              <div className="space-y-2 text-xs text-gray-700">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="font-bold text-gray-900 mb-1">Chrome(크롬) / 삼성 인터넷:</p>
                  <p className="text-gray-600 text-[11px] leading-relaxed">
                    우측 상단 <strong>더보기(⋮ 또는 ≡)</strong> 메뉴를 누른 후 <strong>'홈 화면에 추가'</strong> 또는 <strong>'앱 설치'</strong>를 누르시면 주소표시줄 없는 앱이 설치됩니다.
                  </p>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="font-bold text-gray-900 mb-1">웨일(Whale) 브라우저에서 추가:</p>
                  <p className="text-gray-600 text-[11px] leading-relaxed">
                    하단 우측 <strong>메뉴(≡)</strong> → <strong>'홈 화면에 추가'</strong>를 선택하세요. (※ 주소창 없는 전체화면은 Chrome 설치 권장)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyUrl}
                className="w-full py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-gray-600" />
                <span>주소 복사하기</span>
              </button>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition text-center cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export const PWAInstallTopBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstalled, isIOS, isDesktop, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const dismissedTime = localStorage.getItem('ssaemtime_pwa_top_banner_dismissed');
    if (dismissedTime) {
      const time = parseInt(dismissedTime, 10);
      if (Date.now() - time < 24 * 60 * 60 * 1000) {
        setDismissed(true);
      }
    }
  }, []);

  if (isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('ssaemtime_pwa_top_banner_dismissed', Date.now().toString());
  };

  const handleInstall = async () => {
    if (isIOS) {
      setShowModal(true);
      return;
    }
    setIsInstalling(true);
    try {
      const outcome = await install();
      if (outcome !== 'accepted') {
        setShowModal(true);
      }
    } catch {
      setShowModal(true);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <>
      <div className={`relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 text-white rounded-2xl p-4 sm:p-4.5 shadow-xl shadow-blue-950/20 border border-blue-400/35 backdrop-blur-md ring-1 ring-white/10 animate-in fade-in slide-in-from-top-3 duration-300 ${className}`}>
        {/* Ambient Radial Gradient Glows */}
        <div className="absolute -top-12 -right-12 w-44 h-44 bg-indigo-400/25 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-400/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm border border-white/25 p-1 flex items-center justify-center shadow-inner overflow-hidden">
                <SchoolLogo className="w-full h-full object-contain drop-shadow" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400 border-2 border-indigo-900"></span>
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm sm:text-base font-black text-white tracking-tight">
                  {isDesktop ? '쌤타임 PC 정식 앱 설치' : '쌤타임 앱 홈 화면 설치'}
                </h4>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black bg-amber-400/20 border border-amber-300/40 text-amber-200 rounded-full animate-pulse">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  {isDesktop ? '바탕화면 등록' : '공식 PWA'}
                </span>
              </div>
              <p className="text-xs text-blue-100/90 leading-tight mt-1">
                {isDesktop 
                  ? '주소창 없는 전체화면 & 독립 창으로 빠른 시간표 조회' 
                  : '홈 화면에 추가하여 주소창 없이 앱처럼 실시간 시간표 조회'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 justify-end">
            <button
              type="button"
              onClick={handleInstall}
              disabled={isInstalling}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/25 transition-all transform hover:scale-[1.01] active:scale-95 animate-pulse cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {isDesktop ? (
                <Monitor className="w-4 h-4 text-slate-950" />
              ) : (
                <Download className="w-4 h-4 text-slate-950 animate-bounce" />
              )}
              <span>{isIOS ? '설치 방법 안내' : isDesktop ? 'PC 앱 바로 설치' : '지금 앱 바로 설치'}</span>
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-2 text-white/70 hover:text-white hover:bg-white/15 rounded-xl transition shrink-0 cursor-pointer"
              title="배너 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <PWAInstallModalGuide onClose={() => setShowModal(false)} />
      )}
    </>
  );
};
