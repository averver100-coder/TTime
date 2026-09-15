import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Calendar, Clock, ChevronLeft, ChevronRight, User, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';
import { GateDutyDay, GateDutyMonthRecord } from '../types/gateDuty';
import { getKSTDate, fetchGateDutyMonth } from '../lib/gateDutyStore';
import { Teacher } from '../lib/timetableUtils';

interface TodayGateDutyProps {
  teachers: Teacher[];
  onSelectTeacher?: (teacher: Teacher) => void;
}

export const TodayGateDuty: React.FC<TodayGateDutyProps> = ({ teachers, onSelectTeacher }) => {
  const [dutyRecord, setDutyRecord] = useState<GateDutyMonthRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentHour, setCurrentHour] = useState<number>(8);
  const [currentMinute, setCurrentMinute] = useState<number>(20);
  
  // Selected offset from today (0 = today, -1 = yesterday, +1 = tomorrow, etc.)
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [showFullSchedule, setShowFullSchedule] = useState<boolean>(false);

  // Load duty schedule
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const kst = getKSTDate();
        const record = await fetchGateDutyMonth(kst.yearMonth);
        if (isMounted) {
          setDutyRecord(record);
        }
      } catch (err) {
        console.error('Failed to load gate duty:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    // Live clock update every 10 seconds
    const updateTime = () => {
      const kst = getKSTDate();
      setCurrentTime(kst.timeStr);
      setCurrentHour(kst.hour);
      setCurrentMinute(kst.minute);
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  // Compute targeted date based on offset
  const targetedDateInfo = useMemo(() => {
    const kst = getKSTDate();
    const baseDate = new Date(kst.year, kst.month - 1, kst.day);
    baseDate.setDate(baseDate.getDate() + dayOffset);

    const year = baseDate.getFullYear();
    const month = baseDate.getMonth() + 1;
    const day = baseDate.getDate();
    const dayOfWeekNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayOfWeek = dayOfWeekNames[baseDate.getDay()];

    const mPad = String(month).padStart(2, '0');
    const dPad = String(day).padStart(2, '0');
    const dateStr = `${year}-${mPad}-${dPad}`;

    return {
      dateStr,
      year,
      month,
      day,
      dayOfWeek,
      isToday: dayOffset === 0,
      isWeekend: baseDate.getDay() === 0 || baseDate.getDay() === 6,
    };
  }, [dayOffset]);

  // Find duty for targeted date
  const targetedDuty: GateDutyDay | null = useMemo(() => {
    if (!dutyRecord || !dutyRecord.duties) return null;
    return dutyRecord.duties.find(d => {
      return d.date === targetedDateInfo.dateStr || (d.month === targetedDateInfo.month && d.day === targetedDateInfo.day);
    }) || null;
  }, [dutyRecord, targetedDateInfo]);

  // Next upcoming duty if today has none
  const nextUpcomingDuty = useMemo(() => {
    if (!dutyRecord || !dutyRecord.duties || targetedDuty) return null;
    const kst = getKSTDate();
    return dutyRecord.duties.find(d => d.date >= kst.dateStr) || null;
  }, [dutyRecord, targetedDuty]);

  // Find teacher object by name for rich homeroom / timetable linking
  const findTeacherByName = (name: string): Teacher | undefined => {
    const cleanName = name.replace(/\(.*?\)/g, '').trim();
    return teachers.find(t => t.name === cleanName || t.name === name);
  };

  // Status calculation (Korean school gate duty is 08:00 ~ 08:40)
  const dutyStatus = useMemo(() => {
    if (!targetedDateInfo.isToday) return null;
    if (!targetedDuty) return null;

    const totalMinutes = currentHour * 60 + currentMinute;
    const startMinutes = 8 * 60;       // 08:00
    const endMinutes = 8 * 60 + 15;    // 08:15

    if (totalMinutes < startMinutes) {
      return {
        label: '아침 08:00부터 교문 지도 예정',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500',
      };
    } else if (totalMinutes >= startMinutes && totalMinutes <= endMinutes) {
      return {
        label: '현재 교문 지도 진행 중 (08:00~08:15)',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse',
        dotClass: 'bg-emerald-500',
      };
    } else {
      return {
        label: '오늘 교문 지도 완료 (08:00~08:15)',
        badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
        dotClass: 'bg-gray-400',
      };
    }
  }, [targetedDateInfo.isToday, targetedDuty, currentHour, currentMinute]);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition hover:shadow-md">
      {/* Header Banner */}
      <div className="bg-linear-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs border border-white/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  오늘의 교문 지도 선생님
                </h3>
                {targetedDateInfo.isToday && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30 backdrop-blur-xs">
                    실시간 안내
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5">
                안전하고 활기찬 등굣길을 이끌어 주시는 교문 지도 담당 선생님입니다.
              </p>
            </div>
          </div>

          {/* Date Navigation Pills */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-black/20 p-1 rounded-xl backdrop-blur-xs border border-white/10">
            <button
              type="button"
              onClick={() => setDayOffset(prev => prev - 1)}
              className="p-1 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition"
              title="이전 날"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setDayOffset(0)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                dayOffset === 0
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setDayOffset(prev => prev + 1)}
              className="p-1 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition"
              title="다음 날"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Date & Time Status Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-gray-800">
              {targetedDateInfo.year}년 {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek})
            </span>
            {targetedDateInfo.isToday ? (
              <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-md border border-blue-100">
                오늘
              </span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-md">
                {dayOffset > 0 ? `+${dayOffset}일 후` : `${Math.abs(dayOffset)}일 전`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            {targetedDateInfo.isToday && currentTime && (
              <span className="inline-flex items-center gap-1 text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                현재 시각 {currentTime}
              </span>
            )}
            {dutyStatus && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${dutyStatus.badgeClass}`}>
                <span className={`w-2 h-2 rounded-full ${dutyStatus.dotClass}`} />
                {dutyStatus.label}
              </span>
            )}
          </div>
        </div>

        {/* Teachers List / Content */}
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm animate-pulse">
            교문 지도 일정을 불러오는 중입니다...
          </div>
        ) : targetedDuty && targetedDuty.teachers.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {targetedDuty.teachers.map((teacherName, idx) => {
                const matchedTeacher = findTeacherByName(teacherName);
                return (
                  <div
                    key={`${teacherName}-${idx}`}
                    onClick={() => {
                      if (matchedTeacher && onSelectTeacher) {
                        onSelectTeacher(matchedTeacher);
                      }
                    }}
                    className={`p-4 rounded-xl border transition group ${
                      matchedTeacher && onSelectTeacher
                        ? 'bg-blue-50/40 hover:bg-blue-50 border-blue-100 hover:border-blue-300 cursor-pointer shadow-2xs'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs group-hover:scale-105 transition-transform">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-bold text-gray-900 group-hover:text-blue-700 transition">
                              {teacherName}
                            </span>
                            <span className="text-xs text-gray-500 font-normal">선생님</span>
                          </div>
                          {matchedTeacher?.homeroom ? (
                            <span className="text-[11px] text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded font-medium">
                              {matchedTeacher.homeroom}반 담임
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-500">
                              교문 지도 담당교사
                            </span>
                          )}
                        </div>
                      </div>

                      {matchedTeacher && onSelectTeacher && (
                        <span className="text-xs font-semibold text-blue-600 group-hover:underline flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                          시간표 보기
                          <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Note badge if any */}
            {targetedDuty.note && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-semibold">참고 사항:</span>
                <span>{targetedDuty.note}</span>
              </div>
            )}
          </div>
        ) : (
          /* No duty scheduled for this date */
          <div className="py-6 px-4 bg-gray-50 rounded-xl border border-gray-200/80 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {targetedDateInfo.isWeekend ? '주말에는 교문 지도가 없습니다.' : '지정된 교문 지도 일정이 없습니다.'}
            </p>
            {nextUpcomingDuty && (
              <p className="text-xs text-blue-600 font-medium">
                다음 예정일: {nextUpcomingDuty.month}월 {nextUpcomingDuty.day}일({nextUpcomingDuty.dayOfWeek}) — {nextUpcomingDuty.teachers.join(', ')} 선생님
              </p>
            )}
          </div>
        )}

        {/* Monthly schedule toggle */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowFullSchedule(!showFullSchedule)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-blue-600 py-1 transition"
          >
            <span>{dutyRecord?.title || '이번 달'} 교문 지도 전체 일정표</span>
            {showFullSchedule ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <span className="text-[11px] text-gray-400">
            교문 지도 시간: 오전 08:00 ~ 08:15
          </span>
        </div>

        {/* Full Month Accordion Table */}
        {showFullSchedule && dutyRecord && dutyRecord.duties && (
          <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200/80 space-y-2 max-h-72 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-medium">
                  <th className="py-1.5 px-2">날짜(요일)</th>
                  <th className="py-1.5 px-2">지도교사</th>
                  <th className="py-1.5 px-2">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dutyRecord.duties.map(d => {
                  const isCurrentTarget = d.date === targetedDateInfo.dateStr;
                  return (
                    <tr
                      key={d.id || d.date}
                      className={`hover:bg-blue-50/50 transition ${isCurrentTarget ? 'bg-blue-100/60 font-bold text-blue-900' : 'text-gray-700'}`}
                    >
                      <td className="py-2 px-2 whitespace-nowrap">
                        {d.month}/{String(d.day).padStart(2, '0')}({d.dayOfWeek?.replace('요일', '') || ''})
                      </td>
                      <td className="py-2 px-2 font-medium">
                        <div className="flex flex-wrap gap-1">
                          {d.teachers.map((name, i) => {
                            const t = findTeacherByName(name);
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  if (t && onSelectTeacher) onSelectTeacher(t);
                                }}
                                className={`px-1.5 py-0.5 rounded transition ${
                                  t ? 'bg-white hover:bg-blue-600 hover:text-white border border-gray-200 text-gray-800' : ''
                                }`}
                              >
                                {name}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-gray-500">
                        {d.note || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
