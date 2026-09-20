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
  X
} from 'lucide-react';
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
            {ALL_WEEKDAYS.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDayTab(day)}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedDayTab === day
                    ? 'bg-white text-blue-600 font-bold shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {dayNamesShort[day]}
              </button>
            ))}
          </div>
        </div>

        {/* Timetable Matrix */}
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-left border-collapse min-w-[320px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-xs font-bold text-gray-500">
                <th className="py-2.5 px-3 w-16 text-center">교시</th>
                {daysToDisplay.map(day => {
                  const isToday = todayDay === day;
                  return (
                    <th 
                      key={day}
                      className={`py-2.5 px-3 text-center transition-colors ${
                        isToday ? 'bg-blue-50/80 text-blue-700 font-extrabold' : ''
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{dayNames[day]}</span>
                        {isToday && (
                          <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px]">
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
                    <td className="py-3 px-2 text-center text-xs font-semibold text-gray-600 bg-gray-50/40">
                      <div className="font-bold text-gray-800">{period.period}교시</div>
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
                          className={`py-2.5 px-3 text-center align-middle transition-colors ${
                            isNow 
                              ? 'bg-blue-100/60 font-bold' 
                              : isToday 
                              ? 'bg-blue-50/20' 
                              : ''
                          }`}
                        >
                          {teacherName ? (
                            <button
                              onClick={() => onSelectTeacher && onSelectTeacher(teacherName)}
                              className={`w-full py-1.5 px-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer group flex flex-col items-center justify-center gap-0.5 ${
                                isNow
                                  ? isFriday6
                                    ? 'bg-indigo-600 text-white shadow-xs border-2 border-indigo-700'
                                    : 'bg-blue-600 text-white shadow-xs'
                                  : isFriday6
                                  ? 'bg-indigo-50/70 border-2 border-indigo-400 text-indigo-950 hover:border-indigo-600 hover:bg-indigo-100/80 shadow-2xs'
                                  : 'bg-white border border-gray-100 text-gray-800 hover:border-blue-400 hover:text-blue-600 hover:shadow-xs'
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
                                <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded-full font-normal">
                                  진행 중
                                </span>
                              )}
                            </button>
                          ) : isFriday6 ? (
                            <div
                              className={`w-full py-1.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                                isNow
                                  ? 'bg-indigo-600 text-white shadow-xs border-2 border-indigo-700'
                                  : 'bg-indigo-50/70 border-2 border-indigo-400 text-indigo-900 shadow-2xs'
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
                            <span className="text-gray-300 text-xs font-light">-</span>
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

        <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
          <span>* 선생님 이름을 클릭하면 해당 선생님의 전체 수업시간표를 확인할 수 있습니다.</span>
          {todayDay && (
            <span className="text-blue-600 font-medium">파란색 열: 오늘 시간표</span>
          )}
        </div>
      </div>
    </div>
  );
};
