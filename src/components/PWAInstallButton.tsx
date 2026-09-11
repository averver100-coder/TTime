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
  Laptop,
  FolderDown
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
    downloadDesktopShortcut
  } = usePWAInstall();

  const [showModal, setShowModal] = useState(false);
  const [showBottomBanner, setShowBottomBanner] = useState(false);
  const [installedToast, setInstalledToast] = useState(false);
  const [downloadedToast, setDownloadedToast] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Auto-show install prompt banner if not installed
  useEffect(() => {
    if (isInstalled) {
      setShowBottomBanner(false);
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
      setShowBottomBanner(true);
    }, 1200);

    return () => clearTimeout(timer);
  }, [isInstalled]);

  const handleDismissBanner = () => {
    setShowBottomBanner(false);
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
        setShowBottomBanner(false);
        setShowModal(false);
        setInstalledToast(true);
        setTimeout(() => setInstalledToast(false), 5000);
      } else if (isDesktop) {
        // On PC, if browser prompt was unavailable or dismissed, automatically create shortcut file and show guide
        downloadDesktopShortcut();
        setDownloadedToast(true);
        setTimeout(() => setDownloadedToast(false), 4500);
        setShowModal(true);
      } else {
        // Mobile fallback guide
        setShowModal(true);
      }
    } catch {
      if (isDesktop) {
        downloadDesktopShortcut();
        setDownloadedToast(true);
        setTimeout(() => setDownloadedToast(false), 4500);
      }
      setShowModal(true);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleManualDownloadShortcut = () => {
    downloadDesktopShortcut();
    setDownloadedToast(true);
    setTimeout(() => setDownloadedToast(false), 4500);
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

      {/* Desktop Shortcut Downloaded Toast */}
      {downloadedToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-300">
          <FolderDown className="w-5 h-5" />
          <span>바탕화면 바로가기 파일이 다운로드되었습니다! (바탕화면으로 이동하여 실행)</span>
        </div>
      )}

      {/* Copied Toast */}
      {copiedToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>주소가 복사되었습니다. 브라우저 주소창에 붙여넣으세요!</span>
        </div>
      )}

      {/* Header Install Button - Protected from wrapping and truncation */}
      <button
        type="button"
        onClick={handleInstallAction}
        disabled={isInstalling}
        className="shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition shadow-2xs hover:shadow-xs active:scale-95 disabled:opacity-60"
        title={isDesktop ? 'PC 바탕화면에 바로가기 아이콘 생성하기' : '홈 화면에 앱 설치하기'}
      >
        {isDesktop ? (
          <Monitor className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        )}
        <span className="whitespace-nowrap">앱 설치</span>
      </button>

      {/* Floating Bottom Install Banner */}
      {showBottomBanner && !showModal && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-40 bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-blue-100 ring-1 ring-blue-500/10 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-2xs">
                <SchoolLogo className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-bold text-gray-900 truncate">
                    {isDesktop ? '쌤타임 바탕화면 바로가기 설치' : '쌤타임 앱 홈화면 설치'}
                  </h4>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-md shrink-0">
                    {isDesktop ? 'PC 앱' : 'PWA'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isDesktop 
                    ? '바탕화면에 아이콘을 생성하여 주소창 없이 편리하게 확인하세요.' 
                    : '홈 화면에 추가하여 주소창 없이 앱처럼 편리하게 확인하세요.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismissBanner}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition shrink-0"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleDismissBanner}
              className="flex-1 text-xs font-semibold text-gray-500 hover:text-gray-700 py-2 rounded-xl hover:bg-gray-50 transition text-center"
            >
              다음에
            </button>
            <button
              type="button"
              onClick={handleInstallAction}
              disabled={isInstalling}
              className="flex-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm shadow-blue-200 active:scale-98 disabled:opacity-60 shrink-0 whitespace-nowrap"
            >
              {isDesktop ? (
                <Monitor className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isIOS ? '설치 방법 안내' : isDesktop ? '바탕화면에 설치하기' : '지금 앱 설치하기'}</span>
            </button>
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
                    {isDesktop ? 'PC 바탕화면 바로가기 생성' : '쌤타임 앱 설치'}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    {isDesktop ? '바탕화면에서 1초 만에 바로가기 실행' : '주소표시줄 없는 전체화면 앱'}
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
                  {/* Option 1: Direct Desktop Shortcut Download */}
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                        <Monitor className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-blue-950">방법 1. 바탕화면 바로가기 파일 다운로드</h4>
                        <p className="text-[11px] text-blue-800 leading-relaxed mt-0.5">
                          다운로드된 바로가기 파일(<strong>.url</strong>)을 PC 바탕화면으로 드래그해 놓으시면 언제든 아이콘 클릭 한 번으로 실행됩니다.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleManualDownloadShortcut}
                      className="w-full mt-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-98 transition"
                    >
                      <Download className="w-4 h-4" />
                      <span>바탕화면 바로가기 파일(.url) 받기</span>
                    </button>
                  </div>

                  {/* Option 2: Browser Standalone App Install (Chrome/Edge) */}
                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs text-gray-700">
                    <div className="flex items-center gap-1.5 font-bold text-gray-900">
                      <Laptop className="w-4 h-4 text-gray-700" />
                      <span>방법 2. 브라우저 앱(PWA)으로 설치 (권장)</span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      Chrome(크롬) 또는 Edge 브라우저를 이용하시면 브라우저 창 대신 <strong>독립된 앱 창</strong>으로 실행되는 바탕화면 아이콘이 설치됩니다:
                    </p>

                    <div className="space-y-1.5 pl-1 text-[11px]">
                      <div className="flex items-start gap-2 bg-white p-2 rounded-lg border border-gray-100">
                        <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-700 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                        <span>브라우저 <strong>상단 주소창 우측 끝</strong>의 <strong>[설치]</strong> 아이콘(컴퓨터 모니터 모양) 클릭</span>
                      </div>
                      <div className="flex items-start gap-2 bg-white p-2 rounded-lg border border-gray-100">
                        <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-700 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                        <span>또는 우측 상단 더보기 <strong>(⋮)</strong> 메뉴 → <strong>[전송, 저장 및 공유]</strong> → <strong>[바로가기 만들기...]</strong> (또는 [앱] → [쌤타임 설치]) 클릭</span>
                      </div>
                      <div className="flex items-start gap-2 bg-white p-2 rounded-lg border border-gray-100">
                        <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-700 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
                        <span><strong>'창으로 열기'</strong> 체크 후 <strong>[만들기/설치]</strong>를 누르면 바탕화면에 주소창 없는 쌤타임 앱 아이콘이 바로 생성됩니다!</span>
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
                        className="w-full mt-2 py-2 px-3 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>브라우저 자동 설치 창 띄우기</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="w-full py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-600" />
                    <span>현재 웹페이지 주소 복사하기</span>
                  </button>
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
                className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition text-center"
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
