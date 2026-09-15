import React, { useState, useEffect, useMemo } from 'react';
import { Utensils, Calendar, ChevronLeft, ChevronRight, User, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';
import { LunchDutyDay, LunchDutyMonthRecord } from '../types/lunchDuty';
import { fetchLunchDutyMonth } from '../lib/lunchDutyStore';
import { getKSTDate } from '../lib/gateDutyStore';
import { Teacher } from '../lib/timetableUtils';

interface TodayLunchDutyProps {
  teachers: Teacher[];
  onSelectTeacher?: (teacher: Teacher) => void;
}

export const TodayLunchDuty: React.FC<TodayLunchDutyProps> = ({ teachers, onSelectTeacher }) => {
  const [dutyRecord, setDutyRecord] = useState<LunchDutyMonthRecord | null>(null);
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
        const record = await fetchLunchDutyMonth(kst.yearMonth);
        if (isMounted) {
          setDutyRecord(record);
        }
      } catch (err) {
        console.error('Failed to load lunch duty:', err);
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
  const targetedDuty: LunchDutyDay | null = useMemo(() => {
    if (!dutyRecord || !dutyRecord.duties) return null;
    return dutyRecord.duties.find(d => {
      return d.date === targetedDateInfo.dateStr || (d.month === targetedDateInfo.month && d.day === targetedDateInfo.day);
    }) || null;
  }, [dutyRecord, targetedDateInfo]);

  // Find next upcoming duty if today has none
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

  const rolesConfig = [
    {
      roleKey: 'general',
      title: '총괄지도',
      colorBadge: 'bg-purple-50 text-purple-700 border-purple-200',
      cardBg: 'bg-white hover:bg-purple-50/40 border-gray-200 hover:border-purple-300',
      avatarBg: 'bg-purple-100 text-purple-700 border border-purple-200',
      teacherName: targetedDuty?.generalTeacher || (targetedDuty?.teachers && targetedDuty.teachers[0]) || '',
    },
    {
      roleKey: 'grade3',
      title: '3학년',
      colorBadge: 'bg-blue-50 text-blue-700 border-blue-200',
      cardBg: 'bg-white hover:bg-blue-50/40 border-gray-200 hover:border-blue-300',
      avatarBg: 'bg-blue-100 text-blue-700 border border-blue-200',
      teacherName: targetedDuty?.grade3Teacher || (targetedDuty?.teachers && targetedDuty.teachers[1]) || '',
    },
    {
      roleKey: 'grade2',
      title: '2학년',
      colorBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cardBg: 'bg-white hover:bg-emerald-50/40 border-gray-200 hover:border-emerald-300',
      avatarBg: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      teacherName: targetedDuty?.grade2Teacher || (targetedDuty?.teachers && targetedDuty.teachers[2]) || '',
    },
    {
      roleKey: 'grade1',
      title: '1학년',
      colorBadge: 'bg-amber-50 text-amber-700 border-amber-200',
      cardBg: 'bg-white hover:bg-amber-50/40 border-gray-200 hover:border-amber-300',
      avatarBg: 'bg-amber-100 text-amber-700 border border-amber-200',
      teacherName: targetedDuty?.grade1Teacher || (targetedDuty?.teachers && targetedDuty.teachers[3]) || '',
    },
  ];

  return (
    <section className="bg-white rounded-2xl border-2 border-amber-200 shadow-xs overflow-hidden transition hover:shadow-md">
      {/* Header Banner - White with Amber Accent */}
      <div className="bg-amber-50/70 border-b border-amber-100 px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Utensils className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-amber-950">
                오늘의 급식 감독 선생님
              </h3>
              <p className="text-xs text-amber-700/90 mt-0.5 truncate">
                점심시간 학생 안전 및 질서 지도 담당
              </p>
            </div>
          </div>

          {/* Date Selector Pill */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-white px-2.5 py-1 rounded-xl border border-amber-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setDayOffset(prev => prev - 1)}
              className="p-1 hover:bg-amber-50 rounded-lg text-gray-500 hover:text-amber-700 transition"
              title="어제"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 px-1.5 text-xs font-bold text-gray-800 whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span>
                {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek[0]})
              </span>
              {targetedDateInfo.isToday && (
                <span className="text-[10px] bg-amber-600 text-white font-extrabold px-1.5 py-0.2 rounded-md ml-1 shadow-2xs">
                  오늘
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDayOffset(prev => prev + 1)}
              className="p-1 hover:bg-amber-50 rounded-lg text-gray-500 hover:text-amber-700 transition"
              title="내일"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {dayOffset !== 0 && (
              <button
                type="button"
                onClick={() => setDayOffset(0)}
                className="text-[10px] text-amber-600 hover:text-amber-800 font-semibold underline ml-1 px-1 py-0.5"
              >
                오늘로
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body Content */}
      <div className="p-5 space-y-4">
        {/* Special Note / Exam / Event Tag (if any) */}
        {targetedDuty?.note && (
          <div className="flex items-center justify-end">
            <div className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{targetedDuty.note}</span>
            </div>
          </div>
        )}

        {/* Assigned Teachers Cards Grid */}
        {loading ? (
          <div className="py-8 flex items-center justify-center text-gray-400 text-xs">
            급식 감독 일정을 불러오는 중입니다...
          </div>
        ) : targetedDuty ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {rolesConfig.map(role => {
              const teacherObj = role.teacherName ? findTeacherByName(role.teacherName) : undefined;
              const hasTimetable = !!teacherObj;

              return (
                <div
                  key={role.roleKey}
                  onClick={() => {
                    if (teacherObj && onSelectTeacher) {
                      onSelectTeacher(teacherObj);
                    }
                  }}
                  className={`relative p-3.5 rounded-xl border ${role.cardBg} transition ${
                    hasTimetable && onSelectTeacher
                      ? 'cursor-pointer hover:shadow-sm hover:scale-[1.01]'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${role.colorBadge}`}>
                      {role.title}
                    </span>
                    {hasTimetable && onSelectTeacher && (
                      <span className="text-[10px] text-orange-600 font-semibold flex items-center gap-0.5">
                        시간표 <ExternalLink className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-xs shrink-0 ${role.avatarBg}`}>
                      {role.teacherName ? role.teacherName[0] : '?'}
                    </div>

                    <div className="min-w-0 flex-1">
                      {role.teacherName ? (
                        <div>
                          <p className="text-base font-bold text-gray-900 leading-snug truncate group-hover:text-orange-700 transition">
                            {role.teacherName}
                          </p>
                          <p className="text-[11px] text-gray-500 font-normal leading-tight">
                            선생님
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-gray-400">미배정</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State for Weekend or Holidays */
          <div className="py-6 px-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek})은 급식 지도 일정이 없습니다.
            </p>
            {nextUpcomingDuty && (
              <p className="text-xs text-orange-600 font-medium">
                다음 예정일: {nextUpcomingDuty.month}월 {nextUpcomingDuty.day}일({nextUpcomingDuty.dayOfWeek}) —{' '}
                {nextUpcomingDuty.generalTeacher && `총괄: ${nextUpcomingDuty.generalTeacher} 선생님`}
              </p>
            )}
          </div>
        )}

        {/* Monthly schedule toggle */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowFullSchedule(!showFullSchedule)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-orange-600 py-1 transition"
          >
            <span>{dutyRecord?.title || '이번 달'} 급식 감독 전체 일정표</span>
            {showFullSchedule ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <span className="text-[11px] text-gray-400">
            급식 감독 시간: 오후 12:20 ~ 13:20
          </span>
        </div>

        {/* Full Month Accordion Table */}
        {showFullSchedule && dutyRecord && dutyRecord.duties && (
          <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200/80 space-y-2 max-h-72 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-medium">
                  <th className="py-1.5 px-2">날짜(요일)</th>
                  <th className="py-1.5 px-2">총괄지도</th>
                  <th className="py-1.5 px-2">3학년</th>
                  <th className="py-1.5 px-2">2학년</th>
                  <th className="py-1.5 px-2">1학년</th>
                  <th className="py-1.5 px-2">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dutyRecord.duties.map(d => {
                  const isCurrentTarget = d.date === targetedDateInfo.dateStr;
                  return (
                    <tr
                      key={d.id || d.date}
                      className={`hover:bg-orange-50/50 transition ${isCurrentTarget ? 'bg-orange-100/60 font-bold text-orange-950' : 'text-gray-700'}`}
                    >
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {d.month}/{String(d.day).padStart(2, '0')}({d.dayOfWeek ? d.dayOfWeek[0] : ''})
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap font-semibold text-purple-900">
                        {d.generalTeacher || (d.teachers && d.teachers[0]) || '-'}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {d.grade3Teacher || (d.teachers && d.teachers[1]) || '-'}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {d.grade2Teacher || (d.teachers && d.teachers[2]) || '-'}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {d.grade1Teacher || (d.teachers && d.teachers[3]) || '-'}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap text-gray-400">
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
