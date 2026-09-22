import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  X, 
  Coffee, 
  ArrowRightLeft, 
  UserCheck, 
  Megaphone, 
  Smartphone, 
  Check, 
  Search,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { ScheduleAlert, NotificationType } from '../types/notification';
import { fetchRecentAlerts } from '../lib/notificationStore';
import { requestPushPermission } from '../lib/firebaseMessaging';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTeacher?: (teacherName: string) => void;
  currentTeacherName?: string;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  onSelectTeacher,
  currentTeacherName
}) => {
  const [alerts, setAlerts] = useState<ScheduleAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushStatus(Notification.permission);
    } else {
      setPushStatus('unsupported');
    }
  }, []);

  const loadAlerts = async () => {
    setIsLoading(true);
    try {
      const data = await fetchRecentAlerts(40);
      setAlerts(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAlerts();
    }
  }, [isOpen]);

  const handleEnablePush = async () => {
    const res = await requestPushPermission(currentTeacherName);
    if (res.granted) {
      setPushStatus('granted');
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filterType !== 'ALL' && alert.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTeacher = alert.targetTeacher.toLowerCase().includes(q);
      const matchTitle = alert.title.toLowerCase().includes(q);
      const matchMessage = alert.message.toLowerCase().includes(q);
      return matchTeacher || matchTitle || matchMessage;
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-rose-50/50 via-white to-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-gray-900">
                  수업 변경 및 공강 알림 센터
                </h3>
                <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 font-extrabold rounded-full border border-amber-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  서비스 준비중
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-rose-100 text-rose-700 font-bold rounded-full">
                  실시간 푸시
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs text-gray-500">
                  선생님별 시간표 변경, 교실 맞교환 및 공강 발생 알림
                </p>
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  ※ 현재 시범 운영 검토 기간으로 정식 서비스 오픈 준비중입니다.
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Push notification banner */}
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-gray-700 truncate">
              {pushStatus === 'granted' ? (
                <strong className="text-blue-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-blue-600" />
                  스마트폰/브라우저 푸시 알림 수신 중
                </strong>
              ) : (
                <span>수업 변경 시 즉시 알림을 받으시려면 푸시를 켜주세요.</span>
              )}
            </span>
          </div>

          {pushStatus !== 'granted' && (
            <button
              type="button"
              onClick={handleEnablePush}
              className="px-2.5 py-1 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
            >
              알림 허용하기
            </button>
          )}
        </div>

        {/* Search & Filter bar */}
        <div className="p-3 border-b border-gray-100 space-y-2 bg-gray-50/50">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="선생님 성함 또는 내용 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
            {[
              { id: 'ALL', label: '전체' },
              { id: 'FREE_PERIOD', label: '☕ 공강 발생' },
              { id: 'PERIOD_CHANGE', label: '🔄 수업 변경' },
              { id: 'SUBSTITUTION', label: '👥 보강/대강' },
              { id: 'NOTICE', label: '📢 긴급 공지' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterType(f.id)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer text-xs ${
                  filterType === f.id
                    ? 'bg-gray-900 text-white font-bold shadow-2xs'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {isLoading ? (
            <div className="text-center py-10 text-xs text-gray-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
              알림을 불러오는 중...
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs">
              <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2 opacity-50" />
              표시할 수업 변경 및 공강 알림이 없습니다.
            </div>
          ) : (
            filteredAlerts.map(alert => (
              <div
                key={alert.id}
                className="p-3.5 rounded-xl border border-gray-100 bg-white hover:border-gray-300 shadow-2xs transition group"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    alert.type === 'FREE_PERIOD'
                      ? 'bg-amber-100 text-amber-800'
                      : alert.type === 'PERIOD_CHANGE'
                      ? 'bg-blue-100 text-blue-800'
                      : alert.type === 'SUBSTITUTION'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {alert.type === 'FREE_PERIOD' && <Coffee className="w-4 h-4" />}
                    {alert.type === 'PERIOD_CHANGE' && <ArrowRightLeft className="w-4 h-4" />}
                    {alert.type === 'SUBSTITUTION' && <UserCheck className="w-4 h-4" />}
                    {alert.type === 'NOTICE' && <Megaphone className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          alert.type === 'FREE_PERIOD'
                            ? 'bg-amber-100 text-amber-800'
                            : alert.type === 'PERIOD_CHANGE'
                            ? 'bg-blue-100 text-blue-800'
                            : alert.type === 'SUBSTITUTION'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {alert.type === 'FREE_PERIOD' ? '공강' : alert.type === 'PERIOD_CHANGE' ? '수업변경' : alert.type === 'SUBSTITUTION' ? '보강' : '공지'}
                        </span>
                        <span className="text-xs font-bold text-gray-900">
                          {alert.title}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {new Date(alert.createdAt).toLocaleString('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed">
                      {alert.message}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-gray-100 text-[11px]">
                      <span className="text-gray-500">
                        수신: <strong className="text-gray-800">{alert.targetTeacher === 'ALL' ? '전체 교원' : `${alert.targetTeacher} 선생님`}</strong>
                      </span>

                      {alert.targetTeacher !== 'ALL' && onSelectTeacher && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectTeacher(alert.targetTeacher);
                            onClose();
                          }}
                          className="flex items-center gap-0.5 text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                        >
                          해당 시간표 보기
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>* 교무부에서 변경 등록 시 자동으로 실시간 수신됩니다.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
