import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  BellRing, 
  Calendar, 
  Clock, 
  Star, 
  X, 
  ChevronRight, 
  Check, 
  GraduationCap, 
  User, 
  ExternalLink,
  GripHorizontal,
  RotateCcw
} from 'lucide-react';
import { 
  Teacher, 
  ClassTimetable, 
  DayOfWeek, 
  dayNames, 
  periods, 
  formatClassroomShort, 
  formatClassTitle, 
  getDayFromIndex,
  parseTimeString,
  getCurrentTimeMinutes 
} from '../lib/timetableUtils';
import { BookmarkItem } from '../hooks/useBookmarks';

interface TodayScheduleNotificationToastProps {
  teachers: Teacher[];
  classes: ClassTimetable[];
  bookmarks: BookmarkItem[];
  currentTime: Date;
  isOpen: boolean;
  onClose: () => void;
  onSelectTeacher: (teacherName: string) => void;
  onSelectClass: (classCode: string) => void;
}

export const TodayScheduleNotificationToast: React.FC<TodayScheduleNotificationToastProps> = ({
  teachers,
  classes,
  bookmarks,
  currentTime,
  isOpen,
  onClose,
  onSelectTeacher,
  onSelectClass,
}) => {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);
  const DURATION_MS = 10000; // 10 seconds auto-dismiss

  // Draggable window state
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only primary mouse button (button 0)
    if (e.button !== 0) return;
    // Don't start drag if clicking interactive buttons
    if ((e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: offset.x,
      initialY: offset.y,
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: touch.clientX,
      mouseY: touch.clientY,
      initialX: offset.x,
      initialY: offset.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;
      setOffset({
        x: dragStartRef.current.initialX + deltaX,
        y: dragStartRef.current.initialY + deltaY,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragStartRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStartRef.current.mouseX;
      const deltaY = touch.clientY - dragStartRef.current.mouseY;
      setOffset({
        x: dragStartRef.current.initialX + deltaX,
        y: dragStartRef.current.initialY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission('unsupported');
    }
  }, []);

  const todayDay = getDayFromIndex(currentTime.getDay());
  const isWeekend = !todayDay;
  const currentMins = getCurrentTimeMinutes(currentTime);

  // Determine what to notify:
  // 1. Look for first bookmarked teacher or class
  // 2. If none, general school schedule
  const primaryBookmark = bookmarks.length > 0 ? bookmarks[0] : null;

  let scheduleTitle = '';
  let scheduleSubtitle = '';
  let targetType: 'teacher' | 'class' | 'general' = 'general';
  let targetId = '';
  let periodItems: { period: number; label: string; time: string; isOngoing: boolean }[] = [];
  let totalClassCount = 0;

  if (isWeekend) {
    scheduleTitle = '즐거운 주말입니다!';
    scheduleSubtitle = `오늘(${currentTime.toLocaleDateString('ko-KR', { weekday: 'long' })})은 정규 수업이 없는 주말입니다. 다음 주 시간표를 미리 확인해 보세요.`;
  } else if (todayDay) {
    const maxPeriod = (todayDay === 'Wed' || todayDay === 'Thu' || todayDay === 'Fri') ? 6 : 7;
    const applicablePeriods = periods.filter(p => p.period <= maxPeriod);

    if (primaryBookmark && primaryBookmark.type === 'teacher') {
      const teacher = teachers.find(t => t.name === primaryBookmark.id);
      if (teacher) {
        targetType = 'teacher';
        targetId = teacher.name;
        scheduleTitle = `${teacher.name} 선생님의 오늘 시간표`;
        
        applicablePeriods.forEach(p => {
          const room = teacher.timetable[todayDay]?.[p.period];
          const s = parseTimeString(p.start);
          const e = parseTimeString(p.end);
          const isOngoing = currentMins >= s && currentMins <= e;
          if (room) {
            totalClassCount++;
            periodItems.push({
              period: p.period,
              label: formatClassroomShort(room),
              time: `${p.start}~${p.end}`,
              isOngoing,
            });
          }
        });

        if (totalClassCount > 0) {
          scheduleSubtitle = `오늘(${dayNames[todayDay]}) 총 ${totalClassCount}시간 수업이 배정되어 있습니다.`;
        } else {
          scheduleSubtitle = `오늘(${dayNames[todayDay]})은 배정된 수업이 없는 날입니다.`;
        }
      }
    } else if (primaryBookmark && primaryBookmark.type === 'class') {
      const classItem = classes.find(c => c.classCode === primaryBookmark.id);
      if (classItem) {
        targetType = 'class';
        targetId = classItem.classCode;
        const cTitle = formatClassTitle(classItem.classCode);
        scheduleTitle = `${cTitle} 오늘 시간표`;

        applicablePeriods.forEach(p => {
          let teacherName = classItem.timetable?.[todayDay]?.[p.period] || '';
          if (!teacherName && todayDay === 'Fri' && p.period === 6) {
            teacherName = 'HR(자치)';
          }
          const s = parseTimeString(p.start);
          const e = parseTimeString(p.end);
          const isOngoing = currentMins >= s && currentMins <= e;
          
          if (teacherName) {
            totalClassCount++;
            periodItems.push({
              period: p.period,
              label: teacherName,
              time: `${p.start}~${p.end}`,
              isOngoing,
            });
          }
        });

        scheduleSubtitle = `오늘(${dayNames[todayDay]}) 총 ${applicablePeriods.length}교시 (${periods[0].start} ~ ${applicablePeriods[applicablePeriods.length - 1].end}) 수업입니다.`;
      }
    }

    // Default to general school schedule if no bookmark found
    if (targetType === 'general') {
      scheduleTitle = `오늘(${dayNames[todayDay]}) 정규 수업 안내`;
      scheduleSubtitle = `오늘(${dayNames[todayDay]})은 1교시부터 ${maxPeriod}교시(${periods[0].start} ~ ${applicablePeriods[applicablePeriods.length - 1].end})까지 수업이 진행됩니다.`;
    }
  }

  // Auto dismiss countdown
  useEffect(() => {
    if (!isOpen) {
      setProgress(100);
      return;
    }

    if (isHovered || isDragging) return;

    const intervalTime = 50;
    const step = (intervalTime / DURATION_MS) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev <= step) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isOpen, isHovered, isDragging, onClose]);

  // Request push notification permission and send instant notification
  const handleRequestPushNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        localStorage.setItem('ssamtime_push_notif_enabled', 'true');
        // Trigger push notification immediately
        const notifBody = periodItems.length > 0 
          ? periodItems.map(item => `${item.period}교시: ${item.label}`).join(' · ')
          : scheduleSubtitle;

        new Notification(`🔔 ${scheduleTitle}`, {
          body: notifBody,
          icon: '/favicon.ico',
        });
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err);
    }
  };

  const handleActionClick = () => {
    if (targetType === 'teacher' && targetId) {
      onSelectTeacher(targetId);
      onClose();
    } else if (targetType === 'class' && targetId) {
      onSelectClass(targetId);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed top-20 right-4 sm:right-6 z-50 max-w-md w-[calc(100%-2rem)] ${
        isDragging ? 'select-none pointer-events-auto' : ''
      }`}
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-blue-500/80 overflow-hidden ring-4 ring-blue-500/10 animate-in fade-in slide-in-from-top-4 duration-300">
        {/* Header Ribbon - Draggable by mouse & touch */}
        <div 
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className={`bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 py-2.5 text-white flex items-center justify-between select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          title="상단바를 마우스로 드래그하여 알림창 위치를 이동할 수 있습니다"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-0.5 rounded text-white/70 hover:text-white transition shrink-0" title="드래그하여 이동">
              <GripHorizontal className="w-4 h-4" />
            </div>
            <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <BellRing className="w-3.5 h-3.5 animate-bounce text-yellow-300" />
            </div>
            <span className="text-xs font-black tracking-wide flex items-center gap-1.5 truncate">
              <span>오늘의 수업 시간표 알림</span>
              {primaryBookmark && (
                <span className="bg-amber-400 text-amber-950 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold flex items-center gap-0.5 shrink-0">
                  <Star className="w-2.5 h-2.5 fill-amber-950" /> 즐겨찾기
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Position reset button if user moved the window */}
            {(offset.x !== 0 || offset.y !== 0) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOffset({ x: 0, y: 0 });
                }}
                className="text-white/80 hover:text-white text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/15 hover:bg-white/25 transition cursor-pointer flex items-center gap-1"
                title="원래 위치로 초기화"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">원위치</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3">
          {/* Title & Subtitle */}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {targetType === 'teacher' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  <User className="w-3 h-3" /> 선생님 시간표
                </span>
              ) : targetType === 'class' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                  <GraduationCap className="w-3 h-3" /> 학급 시간표
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                  <Calendar className="w-3 h-3" /> 학사 일정
                </span>
              )}
              <h4 className="text-sm font-extrabold text-gray-900 truncate">
                {scheduleTitle}
              </h4>
            </div>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              {scheduleSubtitle}
            </p>
          </div>

          {/* Period Chips (if available) */}
          {periodItems.length > 0 && (
            <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-200/80">
              <div className="text-[11px] font-bold text-gray-500 mb-1.5 flex items-center justify-between">
                <span>오늘의 수업 순서 ({periodItems.length}개)</span>
                <span className="text-[10px] text-blue-600 font-medium">실시간 상태</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                {periodItems.map(item => (
                  <div
                    key={item.period}
                    className={`px-2 py-1.5 rounded-lg text-xs flex flex-col justify-between transition-all ${
                      item.isOngoing
                        ? 'bg-blue-600 text-white font-bold shadow-xs ring-2 ring-blue-300'
                        : 'bg-white border border-gray-200/80 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-extrabold ${item.isOngoing ? 'text-white' : 'text-blue-700'}`}>
                        {item.period}교시
                      </span>
                      {item.isOngoing && (
                        <span className="text-[9px] bg-white/20 text-white px-1 py-0.2 rounded font-black animate-pulse">
                          진행중
                        </span>
                      )}
                    </div>
                    <div className="font-bold truncate mt-0.5">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No bookmark prompt tip */}
          {targetType === 'general' && !isWeekend && (
            <div className="text-[11px] text-amber-900 bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2">
              <Star className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0 mt-0.5" />
              <div>
                자주 확인하는 <strong>선생님</strong>이나 <strong>학급</strong>의 시간표에서 <strong>[⭐ 즐겨찾기]</strong>를 등록해 두시면, 다음 접속 시 해당 시간표가 이 알림에 자동으로 요약되어 표시됩니다.
              </div>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {targetId && (
              <button
                type="button"
                onClick={handleActionClick}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
              >
                <span>시간표 바로보기</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {notificationPermission === 'default' && (
              <button
                type="button"
                onClick={handleRequestPushNotification}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 whitespace-nowrap"
                title="브라우저 푸시 알림 허용"
              >
                <Bell className="w-3.5 h-3.5 text-indigo-600" />
                <span>푸시 알림 켜기</span>
              </button>
            )}

            {notificationPermission === 'granted' && (
              <div 
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] font-bold"
                title="브라우저 푸시 알림이 활성화되어 있습니다."
              >
                <Check className="w-3 h-3 text-emerald-600" />
                <span>푸시 알림 켜짐</span>
              </div>
            )}
          </div>
        </div>

        {/* Dismiss Progress Bar */}
        <div className="h-1 w-full bg-gray-100">
          <div 
            className="h-full bg-blue-500 transition-all ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
