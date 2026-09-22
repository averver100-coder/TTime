import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Send, 
  Clock, 
  Calendar, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Coffee, 
  ArrowRightLeft, 
  UserCheck, 
  Megaphone,
  History,
  Trash2,
  RefreshCw,
  Smartphone
} from 'lucide-react';
import { Teacher, DayOfWeek, dayNames, periods } from '../lib/timetableUtils';
import { NotificationType, ScheduleAlert } from '../types/notification';
import { sendScheduleAlert, fetchRecentAlerts } from '../lib/notificationStore';
import { requestPushPermission } from '../lib/firebaseMessaging';

interface AdminScheduleAlertSenderProps {
  teachers: Teacher[];
  onMessage?: (msg: { text: string; type: 'success' | 'error' | 'info' }) => void;
}

export const AdminScheduleAlertSender: React.FC<AdminScheduleAlertSenderProps> = ({
  teachers,
  onMessage,
}) => {
  const [alertType, setAlertType] = useState<NotificationType>('FREE_PERIOD');
  const [targetTeacher, setTargetTeacher] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Tue');
  const [selectedPeriod, setSelectedPeriod] = useState<number>(3);
  const [originalClass, setOriginalClass] = useState<string>('2-3 (미디어실)');
  const [newClass, setNewClass] = useState<string>('공강 (학생 자습)');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('교무기획부');
  const [isSending, setIsSending] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState<ScheduleAlert[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Set default teacher once available
  useEffect(() => {
    if (teachers.length > 0 && !targetTeacher) {
      setTargetTeacher(teachers[0].name);
    }
  }, [teachers, targetTeacher]);

  // Load history
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await fetchRecentAlerts(15);
      setRecentAlerts(history);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Update default message template when parameters change
  useEffect(() => {
    const dayLabel = dayNames[selectedDay];
    const targetName = targetTeacher === 'ALL' ? '선생님 여러분' : `${targetTeacher} 선생님`;

    if (alertType === 'FREE_PERIOD') {
      setCustomTitle(`[공강 안내] ${dayLabel} ${selectedPeriod}교시 수업 공강 안내`);
      setCustomMessage(`${targetName}, ${dayLabel} ${selectedPeriod}교시 예정되어 있던 [${originalClass || '수업'}]이(가) 공강(학생 자습/행사)으로 변경되었습니다.`);
    } else if (alertType === 'PERIOD_CHANGE') {
      setCustomTitle(`[수업 변경] ${dayLabel} ${selectedPeriod}교시 수업 장소/시간 변경`);
      setCustomMessage(`${targetName}, ${dayLabel} ${selectedPeriod}교시 수업이 [${originalClass || '기존 수업'}]에서 [${newClass || '변경 수업'}]으로 변경되었으니 확인 부탁드립니다.`);
    } else if (alertType === 'SUBSTITUTION') {
      setCustomTitle(`[보강/대강] ${dayLabel} ${selectedPeriod}교시 보강 배정 안내`);
      setCustomMessage(`${targetName}, ${dayLabel} ${selectedPeriod}교시 [${newClass || '해당 학급'}] 보강(대강) 수업으로 배정되었습니다. 교실 입실 바랍니다.`);
    } else {
      if (!customTitle) setCustomTitle(`[긴급 시간표 공지] 교무부 안내`);
      if (!customMessage) setCustomMessage(`선생님 여러분, 금일 시간표 변동 사항이 있으니 쌤타임 시간표를 확인해 주시기 바랍니다.`);
    }
  }, [alertType, targetTeacher, selectedDay, selectedPeriod, originalClass, newClass]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetTeacher) {
      onMessage?.({ text: '수신 대상 선생님을 선택해주세요.', type: 'error' });
      return;
    }
    if (!customTitle.trim() || !customMessage.trim()) {
      onMessage?.({ text: '알림 제목과 내용을 입력해주세요.', type: 'error' });
      return;
    }

    setIsSending(true);
    try {
      const alert = await sendScheduleAlert({
        type: alertType,
        title: customTitle.trim(),
        message: customMessage.trim(),
        targetTeacher,
        dayOfWeek: dayNames[selectedDay],
        period: selectedPeriod,
        originalClass: originalClass.trim(),
        newClass: newClass.trim(),
        sender: senderName.trim(),
      });

      onMessage?.({ 
        text: `⚡ [${targetTeacher === 'ALL' ? '전체 교원' : targetTeacher + ' 선생님'}]께 푸시 알림이 즉시 발송되었습니다!`, 
        type: 'success' 
      });

      // Update history list
      setRecentAlerts(prev => [alert, ...prev.filter(a => a.id !== alert.id)].slice(0, 15));
    } catch (err) {
      console.error(err);
      onMessage?.({ text: '푸시 알림 발송 중 오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Bell className="w-5 h-5 animate-bounce" />
            </span>
            <h2 className="text-lg font-bold text-gray-900">
              수업 변경 및 공강 즉시 푸시 알림 발송
            </h2>
            <span className="text-xs px-2.5 py-0.5 bg-amber-100 text-amber-800 font-extrabold rounded-full border border-amber-300 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              서비스 준비중
            </span>
            <span className="text-xs px-2 py-0.5 bg-rose-100 text-rose-700 font-bold rounded-full">
              FCM 실시간 연동
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            공강 발생, 수업 교실/시간 변경, 보강(대강) 발생 시 선생님들 스마트폰 및 브라우저로 즉시 푸시 알림을 발송합니다.
            <span className="ml-1 text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              (현재 시범 운영 검토 기간으로 정식 서비스 오픈 준비중입니다)
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => requestPushPermission()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
        >
          <Smartphone className="w-3.5 h-3.5 text-gray-500" />
          내 기기 푸시 알림 테스트
        </button>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSend} className="space-y-5">
        {/* Step 1: Alert Type Selector */}
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-2">
            1. 알림 유형 선택
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setAlertType('FREE_PERIOD');
                setNewClass('공강 (학생 자습)');
              }}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left transition cursor-pointer ${
                alertType === 'FREE_PERIOD'
                  ? 'bg-amber-50/70 border-amber-300 text-amber-900 shadow-2xs font-bold ring-2 ring-amber-400/20'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Coffee className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold">공강 발생</div>
                <div className="text-[11px] text-gray-500">수업 결강/자습 처리</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setAlertType('PERIOD_CHANGE');
                setNewClass('제2컴퓨터실');
              }}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left transition cursor-pointer ${
                alertType === 'PERIOD_CHANGE'
                  ? 'bg-blue-50/70 border-blue-300 text-blue-900 shadow-2xs font-bold ring-2 ring-blue-400/20'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold">수업 시간·실 변경</div>
                <div className="text-[11px] text-gray-500">교실/시간 맞교환</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setAlertType('SUBSTITUTION');
                setNewClass('2-4반 보강');
              }}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left transition cursor-pointer ${
                alertType === 'SUBSTITUTION'
                  ? 'bg-purple-50/70 border-purple-300 text-purple-900 shadow-2xs font-bold ring-2 ring-purple-400/20'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold">보강 / 대강 배정</div>
                <div className="text-[11px] text-gray-500">출장 교원 대체 수업</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setAlertType('NOTICE');
              }}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left transition cursor-pointer ${
                alertType === 'NOTICE'
                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 shadow-2xs font-bold ring-2 ring-emerald-400/20'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold">긴급 시간표 공지</div>
                <div className="text-[11px] text-gray-500">전체 교원 안내</div>
              </div>
            </button>
          </div>
        </div>

        {/* Step 2: Target Teacher & Time Slot */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-gray-500" />
              수신 선생님
            </label>
            <select
              value={targetTeacher}
              onChange={(e) => setTargetTeacher(e.target.value)}
              className="w-full text-xs font-medium border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400"
            >
              <option value="ALL">📢 [전체 교원] 모든 선생님께 알림</option>
              <optgroup label="선생님 선택">
                {teachers.map(t => (
                  <option key={t.id || t.name} value={t.name}>
                    {t.name} 선생님 {t.homeroom ? `(${t.homeroom})` : ''}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              해당 요일
            </label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value as DayOfWeek)}
              className="w-full text-xs font-medium border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400"
            >
              {(Object.keys(dayNames) as DayOfWeek[]).map(d => (
                <option key={d} value={d}>{dayNames[d]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              해당 교시
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(Number(e.target.value))}
              className="w-full text-xs font-medium border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400"
            >
              {periods.map(p => (
                <option key={p.period} value={p.period}>{p.period}교시</option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 3: Class details for change / free period */}
        {alertType !== 'NOTICE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50/70 p-3.5 rounded-xl border border-gray-200/80">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                기존 예정 수업 / 학급
              </label>
              <input
                type="text"
                value={originalClass}
                onChange={(e) => setOriginalClass(e.target.value)}
                placeholder="예: 2-3 (미디어실)"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {alertType === 'FREE_PERIOD' ? '변경 상태' : alertType === 'SUBSTITUTION' ? '배정 학급/교실' : '변경 교실/시간'}
              </label>
              <input
                type="text"
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                placeholder="예: 공강 (학생 자습)"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>
          </div>
        )}

        {/* Step 4: Notification Title & Body preview/edit */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              알림 제목
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full text-xs font-bold border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              알림 상세 내용 (선생님 스마트폰 화면에 표시될 문구)
            </label>
            <textarea
              rows={3}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-xl p-3 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 leading-relaxed resize-none"
            />
          </div>
        </div>

        {/* Live Notification Preview Box */}
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-rose-400" />
              선생님 기기 화면 실시간 푸시 미리보기
            </span>
            <span className="text-slate-400 font-mono">지금</span>
          </div>
          <div className="bg-slate-800/90 rounded-lg p-3 border border-slate-700/60 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">
              쌤
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>{customTitle || '수업 변경 알림'}</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-rose-500/30 text-rose-300 rounded font-normal">쌤타임</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                {customMessage || '알림 내용이 여기에 표시됩니다.'}
              </p>
              <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-2">
                <span>발신: {senderName}</span>
                <span>•</span>
                <span>수신: {targetTeacher === 'ALL' ? '전체 교원' : `${targetTeacher} 선생님`}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <div className="text-xs text-gray-500">
            * 발송 즉시 대상 교원 기기에 실시간 푸시 알림 및 브라우저 알림이 전달됩니다.
          </div>
          <button
            type="submit"
            disabled={isSending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
          >
            {isSending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>선생님께 즉시 푸시 알림 발송</span>
          </button>
        </div>
      </form>

      {/* History Section */}
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <History className="w-4 h-4 text-gray-500" />
            최근 발송된 수업 변경 / 공강 알림 내역
          </h3>
          <button
            type="button"
            onClick={loadHistory}
            className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {recentAlerts.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400 bg-gray-50 rounded-xl">
            최근 발송된 알림 내역이 없습니다.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {recentAlerts.map(alert => (
              <div
                key={alert.id}
                className="p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      alert.type === 'FREE_PERIOD'
                        ? 'bg-amber-100 text-amber-800'
                        : alert.type === 'PERIOD_CHANGE'
                        ? 'bg-blue-100 text-blue-800'
                        : alert.type === 'SUBSTITUTION'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {alert.type === 'FREE_PERIOD' ? '공강' : alert.type === 'PERIOD_CHANGE' ? '수업변경' : alert.type === 'SUBSTITUTION' ? '보강/대강' : '공지'}
                    </span>
                    <span className="text-xs font-bold text-gray-900 truncate">
                      {alert.title}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      수신: <strong className="text-gray-700">{alert.targetTeacher === 'ALL' ? '전체' : alert.targetTeacher}</strong>
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-1">
                    {alert.message}
                  </p>
                </div>
                <div className="text-[11px] text-gray-400 shrink-0 sm:text-right">
                  {new Date(alert.createdAt).toLocaleString('ko-KR', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
