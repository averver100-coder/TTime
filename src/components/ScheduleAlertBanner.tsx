import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  BellRing, 
  X, 
  Check, 
  Coffee, 
  ArrowRightLeft, 
  UserCheck, 
  Megaphone,
  Smartphone,
  ChevronRight
} from 'lucide-react';
import { ScheduleAlert } from '../types/notification';
import { subscribeToScheduleAlerts, markAlertAsRead } from '../lib/notificationStore';
import { requestPushPermission } from '../lib/firebaseMessaging';

interface ScheduleAlertBannerProps {
  currentTeacherName?: string;
  onSelectTeacher?: (name: string) => void;
}

export const ScheduleAlertBanner: React.FC<ScheduleAlertBannerProps> = ({
  currentTeacherName,
  onSelectTeacher
}) => {
  const [activeAlert, setActiveAlert] = useState<ScheduleAlert | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dismissed_alert_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [hasPushPermission, setHasPushPermission] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setHasPushPermission(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    // Subscribe to incoming push alerts in real-time
    const unsubscribe = subscribeToScheduleAlerts(
      currentTeacherName || null,
      (newAlert) => {
        if (!dismissedIds.includes(newAlert.id)) {
          setActiveAlert(newAlert);
        }
      },
      (allAlerts) => {
        // Find latest unread relevant alert within last 24 hours
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recent = allAlerts.find(a => 
          a.createdAt > oneDayAgo && 
          !dismissedIds.includes(a.id) &&
          (!currentTeacherName || a.targetTeacher === 'ALL' || a.targetTeacher === currentTeacherName)
        );
        if (recent && !activeAlert) {
          setActiveAlert(recent);
        }
      }
    );

    return () => unsubscribe();
  }, [currentTeacherName, dismissedIds]);

  const handleDismiss = () => {
    if (activeAlert) {
      const updated = [...dismissedIds, activeAlert.id];
      setDismissedIds(updated);
      try {
        localStorage.setItem('dismissed_alert_ids', JSON.stringify(updated.slice(-50)));
      } catch {}
      if (currentTeacherName) {
        markAlertAsRead(activeAlert.id, currentTeacherName);
      }
      setActiveAlert(null);
    }
  };

  const handleEnablePush = async () => {
    const res = await requestPushPermission(currentTeacherName);
    if (res.granted) {
      setHasPushPermission(true);
    }
  };

  if (!activeAlert) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-md w-[calc(100vw-2.5rem)] animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white rounded-2xl shadow-xl border-2 border-rose-200/80 p-4 sm:p-5 relative overflow-hidden backdrop-blur-md">
        {/* Decorative Top Accent Bar */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${
          activeAlert.type === 'FREE_PERIOD'
            ? 'bg-amber-500'
            : activeAlert.type === 'PERIOD_CHANGE'
            ? 'bg-blue-500'
            : activeAlert.type === 'SUBSTITUTION'
            ? 'bg-purple-500'
            : 'bg-rose-500'
        }`} />

        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
            activeAlert.type === 'FREE_PERIOD'
              ? 'bg-amber-100 text-amber-800'
              : activeAlert.type === 'PERIOD_CHANGE'
              ? 'bg-blue-100 text-blue-800'
              : activeAlert.type === 'SUBSTITUTION'
              ? 'bg-purple-100 text-purple-800'
              : 'bg-rose-100 text-rose-800'
          }`}>
            {activeAlert.type === 'FREE_PERIOD' && <Coffee className="w-5 h-5 animate-pulse" />}
            {activeAlert.type === 'PERIOD_CHANGE' && <ArrowRightLeft className="w-5 h-5 animate-pulse" />}
            {activeAlert.type === 'SUBSTITUTION' && <UserCheck className="w-5 h-5 animate-pulse" />}
            {activeAlert.type === 'NOTICE' && <Megaphone className="w-5 h-5 animate-pulse" />}
          </div>

          {/* Text Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                activeAlert.type === 'FREE_PERIOD'
                  ? 'bg-amber-100 text-amber-800'
                  : activeAlert.type === 'PERIOD_CHANGE'
                  ? 'bg-blue-100 text-blue-800'
                  : activeAlert.type === 'SUBSTITUTION'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {activeAlert.type === 'FREE_PERIOD' ? '공강 발생' : activeAlert.type === 'PERIOD_CHANGE' ? '수업 변경' : activeAlert.type === 'SUBSTITUTION' ? '보강/대강' : '긴급 공지'}
              </span>
              <span className="text-[11px] text-gray-500">
                수신: <strong className="text-gray-900">{activeAlert.targetTeacher === 'ALL' ? '전체 교원' : `${activeAlert.targetTeacher} 선생님`}</strong>
              </span>
            </div>

            <h4 className="text-sm font-bold text-gray-900 leading-snug">
              {activeAlert.title}
            </h4>

            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              {activeAlert.message}
            </p>

            {/* Action buttons */}
            <div className="mt-3.5 flex items-center justify-between gap-2 pt-2 border-t border-gray-100 flex-wrap">
              <div className="flex items-center gap-1.5">
                {!hasPushPermission && (
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    className="flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-lg transition"
                  >
                    <Smartphone className="w-3 h-3" />
                    푸시 알림 켜기
                  </button>
                )}
                {activeAlert.targetTeacher !== 'ALL' && onSelectTeacher && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTeacher(activeAlert.targetTeacher);
                      handleDismiss();
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5"
                  >
                    시간표 보기
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className="flex items-center gap-1 text-xs font-bold bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg transition shadow-2xs cursor-pointer ml-auto"
              >
                <Check className="w-3.5 h-3.5" />
                확인 완료
              </button>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
