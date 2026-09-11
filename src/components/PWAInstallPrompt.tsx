import React, { useState, useEffect } from 'react';
import { Download, Share2, PlusSquare, X, Smartphone, Check, ArrowDown, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { SchoolLogo } from './SchoolLogo';

interface PWAInstallPromptProps {
  forceOpenModal?: boolean;
  onCloseModal?: () => void;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  forceOpenModal = false,
  onCloseModal,
}) => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } = usePWAInstall();
  const [showBanner, setShowBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // Synchronize external modal trigger
  useEffect(() => {
    if (forceOpenModal) {
      setShowGuideModal(true);
    }
  }, [forceOpenModal]);

  // Initial automatic banner check
  useEffect(() => {
    // If running in standalone mode (already installed), do not show
    if (isInstalled) {
      setShowBanner(false);
      return;
    }

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem('ssaemtime_pwa_dismissed');
    if (dismissedAt) {
      const parsed = parseInt(dismissedAt, 10);
      // Remind after 24 hours
      if (Date.now() - parsed < 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Show banner after a gentle delay on mobile/desktop
    const timer = setTimeout(() => {
      setShowBanner(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [isInstalled]);

  const handleDismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem('ssaemtime_pwa_dismissed', Date.now().toString());
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowGuideModal(true);
      return;
    }

    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') {
        setInstallSuccess(true);
        setShowBanner(false);
        setTimeout(() => setInstallSuccess(false), 5000);
      }
    } else {
      // If browser doesn't expose deferred prompt (e.g. In-App browser or unsupported), show guide modal
      setShowGuideModal(true);
    }
  };

  const closeModal = () => {
    setShowGuideModal(false);
    if (onCloseModal) {
      onCloseModal();
    }
  };

  if (isInstalled && !forceOpenModal) {
    return null;
  }

  return (
    <>
      {/* Toast message upon successful install */}
      {installSuccess && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-bold animate-bounce">
          <Check className="w-5 h-5" />
          <span>쌤타임 앱이 홈 화면에 성공적으로 설치되었습니다!</span>
        </div>
      )}

      {/* Floating Bottom Install Banner (Active on Mobile / Web before install) */}
      {showBanner && !showGuideModal && !forceOpenModal && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-40 bg-white rounded-2xl p-4 shadow-2xl border border-blue-100 ring-1 ring-black/5 transition-all">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-2xs">
                <SchoolLogo className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-bold text-gray-900 truncate">쌤타임 앱 홈화면 설치</h4>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded">PWA</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                  앱으로 설치하면 주소창 없이 빠르고 편리하게 조회할 수 있습니다.
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
              className="flex-1 text-xs font-medium text-gray-500 hover:text-gray-700 py-2 rounded-xl hover:bg-gray-50 transition text-center"
            >
              나중에 하기
            </button>
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm shadow-blue-200"
            >
              <Download className="w-3.5 h-3.5" />
              {isIOS ? '설치 방법 확인' : '지금 앱 설치하기'}
            </button>
          </div>
        </div>
      )}

      {/* Comprehensive Install Guide Modal (For iOS Safari or Browsers needing manual step) */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center p-1">
                  <SchoolLogo className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">쌤타임 앱 설치 안내</h3>
                  <p className="text-[11px] text-gray-500">모바일 홈 화면 바로가기 추가</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Platform Specific Guidance */}
            <div className="my-5 space-y-4">
              {isIOS ? (
                // iOS Safari Steps
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-xl flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      아이폰(iOS) Safari 브라우저는 아래 <strong>2단계</strong>를 통해 홈 화면에 바로 설치할 수 있습니다.
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs text-gray-700">
                    <div className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
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

                    <div className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                        2
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 flex items-center gap-1.5">
                          <PlusSquare className="w-3.5 h-3.5 text-blue-600" /> ['홈 화면에 추가'] 선택
                        </p>
                        <p className="text-gray-500 text-[11px] mt-0.5">메뉴 목록을 아래로 스크롤하여 '홈 화면에 추가'를 누릅니다.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                        3
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">우측 상단 ['추가'] 터치 완료!</p>
                        <p className="text-gray-500 text-[11px] mt-0.5">홈 화면에 쌤타임 전용 앱 아이콘이 바로 생성됩니다.</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : isInstallable ? (
                // Android / Chrome with active native prompt
                <div className="text-center py-2 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <Download className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">원클릭으로 앱을 설치할 수 있습니다</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      아래 버튼을 누르면 브라우저의 공식 설치 창이 열립니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const outcome = await install();
                      if (outcome === 'accepted') {
                        closeModal();
                        setInstallSuccess(true);
                        setTimeout(() => setInstallSuccess(false), 5000);
                      }
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-md shadow-blue-200"
                  >
                    <Download className="w-4 h-4" />
                    지금 바로 설치하기
                  </button>
                </div>
              ) : (
                // Fallback for Android or other browsers when deferred prompt is not directly available
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3 rounded-xl flex items-start gap-2">
                    <Smartphone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>브라우저 메뉴에서 손쉽게 앱으로 설치할 수 있습니다.</span>
                  </div>

                  <div className="space-y-2.5 text-xs text-gray-700">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="font-bold text-gray-900 mb-1">크롬(Chrome) / 웨일 / 삼성인터넷:</p>
                      <p className="text-gray-600 text-[11px] leading-relaxed">
                        우측 상단 <strong>더보기(⋮ 또는 ≡)</strong> 메뉴를 누른 후 <strong>'홈 화면에 추가'</strong> 또는 <strong>'앱 설치'</strong>를 선택하세요.
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="font-bold text-gray-900 mb-1">카카오톡 등 인앱 브라우저로 접속한 경우:</p>
                      <p className="text-gray-600 text-[11px] leading-relaxed">
                        우측 하단 또는 상단 메뉴에서 <strong>'다른 브라우저로 열기(Safari 또는 Chrome)'</strong>를 선택한 뒤 설치해 주세요.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition text-center"
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
