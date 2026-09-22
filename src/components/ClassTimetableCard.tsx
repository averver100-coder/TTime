import React, { useState } from 'react';
import { 
  GraduationCap, 
  Clock, 
  CalendarDays, 
  ChevronRight, 
  User, 
  Sparkles, 
  CalendarCheck,
  CheckCircle2,
  X,
  Star
} from 'lucide-react';
import { useBookmarks } from '../hooks/useBookmarks';
import { 
  ClassTimetable, 
  DayOfWeek, 
  dayNames, 
  dayNamesShort, 
  getDayFromIndex, 
  getCurrentTimeMinutes, 
  parseTimeString, 
  periods,
  formatClassTitle,
  Teacher
} from '../lib/timetableUtils';

interface ClassTimetableCardProps {
  classItem: ClassTimetable;
  teachers: Teacher[];
  currentTime: Date;
  onClose?: () => void;
  onSelectTeacher?: (teacherName: string) => void;
}

const ALL_WEEKDAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const ClassTimetableCard: React.FC<ClassTimetableCardProps> = ({
  classItem,
  teachers,
  currentTime,
  onClose,
  onSelectTeacher
}) => {
  const [selectedDayTab, setSelectedDayTab] = useState<'ALL' | DayOfWeek>('ALL');
  const { isBookmarked, toggleBookmark } = useBookmarks();

  const isClassBookmarked = isBookmarked('class', classItem.classCode);

  const handleToggleBookmark = () => {
    toggleBookmark({
      type: 'class',
      id: classItem.classCode,
      title: formatClassTitle(classItem.classCode),
      subtitle: `${classItem.grade}-${classItem.classNum} (${classItem.classCode})`
    });
  };

  const todayDay = getDayFromIndex(currentTime.getDay());
  const currentMins = getCurrentTimeMinutes(currentTime);

  // Find homeroom teacher if any
  const homeroomTeacher = teachers.find(t => 
    t.homeroom === classItem.classCode || 
    t.homeroom === `${classItem.grade}-${classItem.classNum}` ||
    t.homeroom === `${classItem.grade}${String(classItem.classNum).padStart(2, '0')}`
  );

  // Real-time period status for today
  let currentPeriodInfo: {
    status: 'class' | 'break' | 'lunch' | 'before_school' | 'after_school' | 'weekend';
    periodNum?: number;
    teacherName?: string;
    nextPeriodNum?: number;
    nextTeacherName?: string;
    timeRange?: string;
  } = { status: 'after_school' };

  if (!todayDay) {
    currentPeriodInfo = { status: 'weekend' };
  } else {
    const todaySched = classItem.timetable?.[todayDay] || {};
    const firstPeriodStart = parseTimeString(periods[0].start);
    const lastPeriodEnd = parseTimeString(periods[periods.length - 1].end);

    if (currentMins < firstPeriodStart) {
      currentPeriodInfo = {
        status: 'before_school',
        nextPeriodNum: 1,
        nextTeacherName: todaySched[1] || ''
      };
    } else if (currentMins >= lastPeriodEnd) {
      currentPeriodInfo = { status: 'after_school' };
    } else {
      let activePeriod = periods.find(p => {
        const start = parseTimeString(p.start);
        const end = parseTimeString(p.end);
        return currentMins >= start && currentMins <= end;
      });

      if (activePeriod) {
        currentPeriodInfo = {
          status: 'class',
          periodNum: activePeriod.period,
          teacherName: todaySched[activePeriod.period] || '',
          timeRange: `${activePeriod.start} ~ ${activePeriod.end}`
        };
      } else {
        // Break or lunch
        const p4End = parseTimeString(periods[3].end);
        const p5Start = parseTimeString(periods[4].start);

        if (currentMins > p4End && currentMins < p5Start) {
          currentPeriodInfo = {
            status: 'lunch',
            nextPeriodNum: 5,
            nextTeacherName: todaySched[5] || ''
          };
        } else {
          // Normal 10 min break
          const nextP = periods.find(p => parseTimeString(p.start) > currentMins);
          currentPeriodInfo = {
            status: 'break',
            nextPeriodNum: nextP?.period,
            nextTeacherName: nextP ? todaySched[nextP.period] || '' : ''
          };
        }
      }
    }
  }

  const daysToDisplay = selectedDayTab === 'ALL' ? ALL_WEEKDAYS : [selectedDayTab];

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-6 transition-all">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 p-5 sm:p-6 text-white relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all"
            title="닫기"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-xs tracking-wide">
            {classItem.grade}학년 {classItem.classNum}반
          </span>
          {homeroomTeacher && (
            <button
              onClick={() => onSelectTeacher && onSelectTeacher(homeroomTeacher.name)}
              className="px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold flex items-center gap-1 hover:bg-amber-300 transition-colors cursor-pointer"
            >
              <User className="w-3 h-3" />
              담임: {homeroomTeacher.name} 선생님
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleBookmark}
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              isClassBookmarked
                ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 ring-2 ring-amber-300'
                : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs'
            }`}
            title={isClassBookmarked ? '즐겨찾기 해제' : '즐겨찾기에 추가'}
          >
            <Star className={`w-3.5 h-3.5 ${isClassBookmarked ? 'fill-amber-950 text-amber-950' : 'text-white'}`} />
            <span>{isClassBookmarked ? '즐겨찾기됨' : '즐겨찾기'}</span>
          </button>
        </div>

        <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
          <GraduationCap className="w-7 h-7 sm:w-8 sm:h-8 text-blue-200" />
          {formatClassTitle(classItem.classCode)}
        </h3>
        <p className="text-blue-100 text-xs sm:text-sm mt-1">
          상일미디어고등학교 실시간 학급 수업시간표
        </p>
      </div>

      {/* Real-time Status Card */}
      <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              currentPeriodInfo.status === 'class'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 animate-pulse'
                : currentPeriodInfo.status === 'break' || currentPeriodInfo.status === 'lunch'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-200 text-gray-600'
            }`}>
              <Clock className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">
                  {todayDay ? `${dayNames[todayDay]} 실시간 상태` : '주말 / 휴일'}
                </span>
                {todayDay && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                )}
              </div>

              <div className="font-bold text-gray-900 text-base sm:text-lg flex items-center gap-1.5 flex-wrap">
                {currentPeriodInfo.status === 'class' && (
                  <>
                    <span className="text-blue-600">{currentPeriodInfo.periodNum}교시 수업 진행 중</span>
                    {todayDay === 'Fri' && currentPeriodInfo.periodNum === 6 ? (
                      <div className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className="text-indigo-700 font-bold bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200 text-sm">
                          HR (학급 자치활동)
                        </span>
                        {currentPeriodInfo.teacherName && currentPeriodInfo.teacherName !== 'HR' && (
                          <button
                            onClick={() => onSelectTeacher && onSelectTeacher(currentPeriodInfo.teacherName!)}
                            className="text-gray-800 underline decoration-blue-400 hover:text-blue-600 cursor-pointer text-sm font-semibold"
                          >
                            ({currentPeriodInfo.teacherName} 선생님)
                          </button>
                        )}
                      </div>
                    ) : currentPeriodInfo.teacherName && currentPeriodInfo.teacherName !== 'HR' ? (
                      <button
                        onClick={() => onSelectTeacher && onSelectTeacher(currentPeriodInfo.teacherName!)}
                        className="text-gray-800 underline decoration-blue-400 hover:text-blue-600 cursor-pointer"
                      >
                        ({currentPeriodInfo.teacherName} 선생님)
                      </button>
                    ) : (
                      <span className="text-gray-500">(자습/공강)</span>
                    )}
                  </>
                )}

                {currentPeriodInfo.status === 'break' && (
                  <span className="text-amber-700">
                    쉬는 시간 {currentPeriodInfo.nextPeriodNum && `(다음: ${currentPeriodInfo.nextPeriodNum}교시 ${todayDay === 'Fri' && currentPeriodInfo.nextPeriodNum === 6 ? `HR · ${currentPeriodInfo.nextTeacherName} 선생님` : (currentPeriodInfo.nextTeacherName ? `${currentPeriodInfo.nextTeacherName} 선생님` : '')})`}
                  </span>
                )}

                {currentPeriodInfo.status === 'lunch' && (
                  <span className="text-amber-700">
                    점심 시간 (다음: 5교시 {currentPeriodInfo.nextTeacherName ? `${currentPeriodInfo.nextTeacherName} 선생님` : ''})
                  </span>
                )}

                {currentPeriodInfo.status === 'before_school' && (
                  <span className="text-gray-700">
                    등교 전 (1교시: {currentPeriodInfo.nextTeacherName ? `${currentPeriodInfo.nextTeacherName} 선생님` : '수업 없음'})
                  </span>
                )}

                {currentPeriodInfo.status === 'after_school' && (
                  <span className="text-gray-600">
                    오늘 수업이 모두 종료되었습니다 (하교)
                  </span>
                )}

                {currentPeriodInfo.status === 'weekend' && (
                  <span className="text-gray-600">주말(휴일)입니다</span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right text-xs text-gray-500 font-medium self-end sm:self-center">
            {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 기준
          </div>
        </div>
      </div>

      {/* Day Tabs */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-gray-500" />
            <h4 className="text-sm font-bold text-gray-800">요일별 수업시간표</h4>
          </div>

          {/* Quick Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setSelectedDayTab('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                selectedDayTab === 'ALL'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              전체
            </button>
            {ALL_WEEKDAYS.map(day => {
              const isToday = day === todayDay;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDayTab(day)}
                  className={`px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    selectedDayTab === day
                      ? 'bg-white text-blue-600 font-bold shadow-xs'
                      : isToday
                      ? 'text-blue-700 font-bold hover:bg-white/60'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>{dayNamesShort[day]}</span>
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Timetable Matrix */}
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-left border-collapse min-w-[320px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-xs font-bold text-gray-500">
                <th className="py-3 px-2 w-16 text-center bg-gray-50/90 border-r border-gray-100">교시</th>
                {daysToDisplay.map(day => {
                  const isToday = todayDay === day;
                  return (
                    <th 
                      key={day}
                      className={`py-3 px-3 text-center transition-all ${
                        isToday 
                          ? 'bg-blue-100/90 text-blue-950 font-black border-t-2 border-t-blue-600 border-x-2 border-x-blue-300 shadow-2xs' 
                          : 'text-gray-700 font-bold border-b border-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className={`text-xs sm:text-sm ${isToday ? 'font-black text-blue-950' : 'font-bold'}`}>
                          {dayNames[day]}
                        </span>
                        {isToday && (
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-black leading-none shadow-xs">
                            오늘
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {periods.map(period => {
                const isCurrentActivePeriod = currentPeriodInfo.status === 'class' && currentPeriodInfo.periodNum === period.period;

                return (
                  <tr 
                    key={period.period}
                    className={`transition-colors ${
                      isCurrentActivePeriod ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'
                    }`}
                  >
                    {/* Period Label */}
                    <td className={`py-3 px-2 text-center text-xs font-semibold border-r border-gray-100 ${
                      isCurrentActivePeriod ? 'bg-blue-50/70 text-blue-900 font-bold' : 'text-gray-600 bg-gray-50/40'
                    }`}>
                      <div className="flex items-center justify-center gap-1">
                        {isCurrentActivePeriod && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
                        )}
                        <span className="font-bold text-gray-800">{period.period}교시</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                        {period.start}
                      </div>
                    </td>

                    {/* Day Cells */}
                    {daysToDisplay.map(day => {
                      const teacherName = classItem.timetable?.[day]?.[period.period] || '';
                      const isFriday6 = day === 'Fri' && period.period === 6;
                      const isToday = todayDay === day;
                      const isNow = isToday && isCurrentActivePeriod;

                      return (
                        <td 
                          key={day}
                          className={`py-2.5 px-2.5 text-center align-middle transition-all ${
                            isToday 
                              ? `border-x-2 border-x-blue-300/80 ${
                                  isNow 
                                    ? 'bg-blue-100/90 font-bold ring-2 ring-inset ring-blue-500/40 shadow-inner' 
                                    : 'bg-blue-50/60 hover:bg-blue-100/50'
                                }` 
                              : ''
                          }`}
                        >
                          {teacherName ? (
                            <button
                              onClick={() => onSelectTeacher && onSelectTeacher(teacherName)}
                              className={`w-full py-2 px-2 rounded-xl text-xs sm:text-sm transition-all cursor-pointer group flex flex-col items-center justify-center gap-0.5 ${
                                isNow
                                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300 font-black'
                                  : isToday
                                  ? 'bg-white border-2 border-blue-400 text-blue-950 hover:bg-blue-600 hover:text-white shadow-xs font-bold'
                                  : 'bg-white border border-gray-200 text-gray-800 hover:border-blue-400 hover:text-blue-600 hover:shadow-xs font-medium'
                              }`}
                              title={`${teacherName} 선생님의 시간표 보기${isFriday6 ? ' (HR 학급자치활동)' : ''}`}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="tracking-tight">{teacherName}</span>
                                {isFriday6 && (
                                  <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded leading-tight ${
                                    isNow
                                      ? 'bg-white/25 text-white'
                                      : 'bg-indigo-600 text-white'
                                  }`}>
                                    HR
                                  </span>
                                )}
                              </div>
                              {isNow && (
                                <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded-full font-bold">
                                  진행 중
                                </span>
                              )}
                            </button>
                          ) : isFriday6 ? (
                            <div
                              className={`w-full py-2 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                                isNow
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : isToday
                                  ? 'bg-white border-2 border-blue-400 text-blue-950 shadow-xs'
                                  : 'bg-white border border-gray-200 text-gray-800'
                              }`}
                              title="HR (학급 자치활동)"
                            >
                              <span className="text-[10px] font-extrabold bg-indigo-600 text-white px-1.5 py-0.2 rounded leading-tight">
                                HR
                              </span>
                              {isNow && (
                                <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded-full font-normal">
                                  진행 중
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className={`text-xs ${isToday ? 'text-blue-400/80 font-semibold' : 'text-gray-300 font-light'}`}>-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500 flex-wrap gap-2">
          <span>* 선생님 이름을 클릭하면 해당 선생님의 전체 수업시간표를 확인할 수 있습니다.</span>
          {ALL_WEEKDAYS.includes(todayDay) && daysToDisplay.includes(todayDay) && (
            <span className="inline-flex items-center gap-1.5 text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              오늘({dayNames[todayDay]}) 열 강조 표시 중
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
