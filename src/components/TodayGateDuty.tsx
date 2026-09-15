import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Calendar, ChevronLeft, ChevronRight, User, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';
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

    return () => {
      isMounted = false;
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

  return (
    <section className="bg-white rounded-2xl border-2 border-blue-200 shadow-xs overflow-hidden transition hover:shadow-md">
      {/* Header Banner - White with Blue Accent */}
      <div className="bg-blue-50/70 border-b border-blue-100 px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-blue-950">
                오늘의 교문 지도 선생님
              </h3>
              <p className="text-xs text-blue-600/90 mt-0.5 truncate">
                등굣길 학생 안전 지도 담당
              </p>
            </div>
          </div>

          {/* Date Selector Pill */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-white px-2.5 py-1 rounded-xl border border-blue-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setDayOffset(prev => prev - 1)}
              className="p-1 hover:bg-blue-50 rounded-lg text-gray-500 hover:text-blue-700 transition"
              title="어제"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 px-1.5 text-xs font-bold text-gray-800 whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>
                {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek[0]})
              </span>
              {targetedDateInfo.isToday && (
                <span className="text-[10px] bg-blue-600 text-white font-extrabold px-1.5 py-0.2 rounded-md ml-1 shadow-2xs">
                  오늘
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDayOffset(prev => prev + 1)}
              className="p-1 hover:bg-blue-50 rounded-lg text-gray-500 hover:text-blue-700 transition"
              title="내일"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {dayOffset !== 0 && (
              <button
                type="button"
                onClick={() => setDayOffset(0)}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline ml-1 px-1 py-0.5"
              >
                오늘로
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 sm:p-6 space-y-4">
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
                    className={`p-3.5 rounded-xl border transition group ${
                      matchedTeacher && onSelectTeacher
                        ? 'bg-white hover:bg-blue-50/50 border-gray-200 hover:border-blue-300 cursor-pointer shadow-2xs'
                        : 'bg-gray-50/70 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-sm border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-bold text-gray-900 group-hover:text-blue-700 transition">
                              {teacherName}
                            </span>
                            <span className="text-xs text-gray-500 font-normal">선생님</span>
                          </div>
                          {matchedTeacher?.homeroom && (
                            <span className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-medium inline-block mt-0.5">
                              {matchedTeacher.homeroom}반 담임
                            </span>
                          )}
                        </div>
                      </div>

                      {matchedTeacher && onSelectTeacher && (
                        <span className="text-xs font-semibold text-blue-600 group-hover:text-blue-700 flex items-center gap-1 opacity-70 group-hover:opacity-100 transition">
                          시간표
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
