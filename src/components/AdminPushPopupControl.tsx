import React, { useState } from 'react';
import { 
  Bell, 
  BellOff, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  ShieldCheck,
  Eye,
  Sliders
} from 'lucide-react';
import { usePushPopupConfig, updatePushPopupConfig } from '../lib/pushConfigStore';

interface AdminPushPopupControlProps {
  currentUserEmail?: string;
  onMessage?: (msg: string) => void;
  onPreviewPopup?: () => void;
}

export const AdminPushPopupControl: React.FC<AdminPushPopupControlProps> = ({
  currentUserEmail = 'admin',
  onMessage,
  onPreviewPopup
}) => {
  const { showPushPopup, loading, lastUpdated, updatedBy } = usePushPopupConfig();
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectChange = async (newVal: boolean) => {
    if (newVal === showPushPopup) return;
    setIsSaving(true);
    try {
      await updatePushPopupConfig(newVal, currentUserEmail);
      const text = newVal 
        ? '🔔 푸시 팝업창이 [켜기]로 설정되었습니다. 메인 화면에서 푸시창이 자동으로 표시됩니다.' 
        : '🔕 푸시 팝업창이 [끄기]로 설정되었습니다. 메인 화면에서 푸시창이 나타나지 않습니다.';
      onMessage?.(text);
    } catch (err) {
      console.error('Failed to update push popup setting:', err);
      onMessage?.('❌ 푸시 팝업창 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 transition hover:shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl transition ${
            showPushPopup 
              ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' 
              : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
          }`}>
            {showPushPopup ? <Bell className="w-5 h-5 animate-pulse" /> : <BellOff className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-1.5">
                메인 화면 푸시 팝업창 제어
              </h2>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                showPushPopup
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}>
                {showPushPopup ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>현재: 푸시창 켜짐 (화면 표시)</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>현재: 푸시창 꺼짐 (화면 숨김)</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              사용자가 앱에 접속했을 때 나타나는 <strong>푸시 팝업창(오늘의 시간표 및 급식/교문지도 알림)</strong>의 자동 노출 여부를 선택합니다.
            </p>
          </div>
        </div>

        {/* Preview Button */}
        {onPreviewPopup && (
          <button
            type="button"
            onClick={onPreviewPopup}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition cursor-pointer shrink-0 self-start sm:self-auto"
            title="푸시 알림 팝업창 미리보기"
          >
            <Eye className="w-3.5 h-3.5 text-gray-600" />
            <span>푸시창 미리보기</span>
          </button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* Select Box Control */}
        <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-200">
          <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              푸시창 켜기/끄기 선택 상자
            </span>
            {isSaving && (
              <span className="text-[11px] text-blue-600 flex items-center gap-1 font-normal">
                <Loader2 className="w-3 h-3 animate-spin" />
                저장 중...
              </span>
            )}
          </label>

          <div className="relative">
            <select
              value={showPushPopup ? 'enabled' : 'disabled'}
              disabled={loading || isSaving}
              onChange={(e) => handleSelectChange(e.target.value === 'enabled')}
              className={`w-full py-2.5 px-3.5 text-sm font-bold rounded-xl border appearance-none transition bg-white shadow-2xs cursor-pointer focus:outline-none focus:ring-2 ${
                showPushPopup
                  ? 'border-emerald-300 text-emerald-900 focus:ring-emerald-400'
                  : 'border-rose-300 text-rose-900 focus:ring-rose-400'
              }`}
            >
              <option value="enabled" className="text-emerald-800 font-bold py-1">
                🔔 푸시창 켜기 (화면에서 푸시창 자동 노출)
              </option>
              <option value="disabled" className="text-rose-800 font-bold py-1">
                🔕 푸시창 끄기 (화면에서 푸시창 나타나지 않음)
              </option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={loading || isSaving}
              onClick={() => handleSelectChange(true)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                showPushPopup
                  ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>푸시창 켜기</span>
            </button>
            <button
              type="button"
              disabled={loading || isSaving}
              onClick={() => handleSelectChange(false)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                !showPushPopup
                  ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-rose-50 hover:text-rose-700'
              }`}
            >
              <BellOff className="w-3.5 h-3.5" />
              <span>푸시창 끄기</span>
            </button>
          </div>
        </div>

        {/* Explanation Card */}
        <div className="p-4 rounded-xl border border-gray-100 bg-white space-y-2 text-xs">
          <div className="font-bold text-gray-800 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            동작 안내 및 적용 범위
          </div>
          <ul className="space-y-1.5 text-gray-600 list-disc list-inside leading-relaxed text-[11.5px]">
            <li>
              <span className="font-semibold text-emerald-700">[푸시창 켜기]</span> 선택 시: 사용자 기기 접속 시 오늘의 시간표·교문·급식 알림창이 자동으로 팝업됩니다.
            </li>
            <li>
              <span className="font-semibold text-rose-700">[푸시창 끄기]</span> 선택 시: 사용자 화면에 푸시 팝업창이 전혀 나타나지 않습니다.
            </li>
            <li>
              관리자가 설정을 변경하면 모든 접속자의 화면에 <strong>실시간으로 즉시 반영</strong>됩니다.
            </li>
          </ul>
          {lastUpdated && (
            <div className="pt-1 text-[11px] text-gray-400 border-t border-gray-100">
              최근 변경: {new Date(lastUpdated).toLocaleString('ko-KR')} ({updatedBy || '관리자'})
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
