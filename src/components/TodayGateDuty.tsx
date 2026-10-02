import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  User, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  RotateCcw,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { GateDutyDay, GateDutyMonthRecord } from '../types/gateDuty';
import { getKSTDate, fetchGateDutyMonth } from '../lib/gateDutyStore';
import { Teacher } from '../lib/timetableUtils';

interface TodayGateDutyProps {
  teachers: Teacher[];
  onSelectTeacher?: (teacher: Teacher) => void;
  selectedDate?: string; // "YYYY-MM-DD"
  onDateChange?: (dateStr: string) => void;
}

export const TodayGateDuty: React.FC<TodayGateDutyProps> = ({ 
  teachers, 
  onSelectTeacher,
  selectedDate,
  onDateChange
}) => {
  const kstToday = useMemo(() => getKSTDate(), []);
  
  // Controlled or uncontrolled dateStr
  const [internalDateStr, setInternalDateStr] = useState<string>(() => {
    return selectedDate || kstToday.dateStr;
  });

  const currentDateStr = selectedDate || internalDateStr;

  const handleDateChange = (newDateStr: string) => {
    setInternalDateStr(newDateStr);
    if (onDateChange) {
      onDateChange(newDateStr);
    }
  };

  const [dutyRecord, setDutyRecord] = useState<GateDutyMonthRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showFullSchedule, setShowFullSchedule] = useState<boolean>(false);

  // Month navigation state for the full schedule table
  const [tableYearMonth, setTableYearMonth] = useState<string>(() => {
    return (selectedDate || kstToday.dateStr).slice(0, 7);
  });
  const [tableDutyRecord, setTableDutyRecord] = useState<GateDutyMonthRecord | null>(null);
  const [tableLoading, setTableLoading] = useState<boolean>(false);

  // Compute targeted date info
  const targetedDateInfo = useMemo(() => {
    const kst = getKSTDate();
    let d: Date;
    if (currentDateStr) {
      const [y, m, day] = currentDateStr.split('-').map(Number);
      d = new Date(y, (m || 1) - 1, day || 1);
    } else {
      d = new Date(kst.year, kst.month - 1, kst.day);
    }

    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dayOfWeekNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayOfWeek = dayOfWeekNames[d.getDay()];

    const mPad = String(month).padStart(2, '0');
    const dPad = String(day).padStart(2, '0');
    const dateStr = `${year}-${mPad}-${dPad}`;
    const yearMonth = `${year}-${mPad}`;

    const isToday = dateStr === kst.dateStr;
    const isPast = dateStr < kst.dateStr;

    return {
      dateStr,
      yearMonth,
      year,
      month,
      day,
      dayOfWeek,
      isToday,
      isPast,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    };
  }, [currentDateStr]);

  // Keep tableYearMonth in sync when target month changes
  useEffect(() => {
    setTableYearMonth(targetedDateInfo.yearMonth);
  }, [targetedDateInfo.yearMonth]);

  // Load duty schedule for the targeted month
  useEffect(() => {
    let isMounted = true;
    const ym = targetedDateInfo.yearMonth;

    const loadData = async () => {
      setLoading(true);
      try {
        const record = await fetchGateDutyMonth(ym);
        if (isMounted) {
          setDutyRecord(record);
        }
      } catch (err) {
        console.error('Failed to load gate duty for', ym, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [targetedDateInfo.yearMonth]);

  // Load duty schedule for the table month if different from dutyRecord
  useEffect(() => {
    let isMounted = true;
    if (dutyRecord && dutyRecord.yearMonth === tableYearMonth) {
      setTableDutyRecord(dutyRecord);
      return;
    }

    const loadTableData = async () => {
      setTableLoading(true);
      try {
        const record = await fetchGateDutyMonth(tableYearMonth);
        if (isMounted) {
          setTableDutyRecord(record);
        }
      } catch (err) {
        console.error('Failed to load table gate duty for', tableYearMonth, err);
      } finally {
        if (isMounted) setTableLoading(false);
      }
    };

    loadTableData();

    return () => {
      isMounted = false;
    };
  }, [tableYearMonth, dutyRecord]);

  // Shift day by +/- N days
  const shiftDay = (days: number) => {
    const [y, m, day] = currentDateStr.split('-').map(Number);
    const d = new Date(y, m - 1, day + days);
    const mPad = String(d.getMonth() + 1).padStart(2, '0');
    const dPad = String(d.getDate()).padStart(2, '0');
    handleDateChange(`${d.getFullYear()}-${mPad}-${dPad}`);
  };

  // Switch table month
  const shiftTableMonth = (months: number) => {
    const [y, m] = tableYearMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + months, 1);
    const mPad = String(d.getMonth() + 1).padStart(2, '0');
    setTableYearMonth(`${d.getFullYear()}-${mPad}`);
  };

  // Find duty for targeted date
  const targetedDuty: GateDutyDay | null = useMemo(() => {
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

  // Find teacher object by name for homeroom/timetable linking
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
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-blue-950">
                  교문 지도 선생님
                </h3>
                {targetedDateInfo.isToday ? (
                  <span className="text-[10px] bg-blue-600 text-white font-extrabold px-1.5 py-0.2 rounded-md shadow-2xs">
                    오늘
                  </span>
                ) : targetedDateInfo.isPast ? (
                  <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.2 rounded-md border border-slate-300">
                    과거 이력 조회
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-md border border-amber-200">
                    예정 일정
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-600/90 mt-0.5 truncate">
                등굣길 학생 안전 지도 담당 (08:00 ~ 08:15)
              </p>
            </div>
          </div>

          {/* Interactive Date Selector with Native Date Picker & Quick Actions */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
            <div className="flex items-center bg-white px-1.5 py-1 rounded-xl border border-blue-200 shadow-2xs">
              <button
                type="button"
                onClick={() => shiftDay(-1)}
                className="p-1 hover:bg-blue-50 rounded-lg text-gray-500 hover:text-blue-700 transition cursor-pointer"
                title="이전 날짜 (어제)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Clickable Date with Hidden Date Picker */}
              <div className="relative flex items-center px-1">
                <label className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold text-gray-800 hover:text-blue-700 hover:bg-blue-50/70 rounded-md cursor-pointer transition">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek[0]})
                  </span>
                  <input
                    type="date"
                    value={targetedDateInfo.dateStr}
                    onChange={(e) => {
                      if (e.target.value) handleDateChange(e.target.value);
                    }}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    title="날짜 선택 (과거 날짜 포함)"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => shiftDay(1)}
                className="p-1 hover:bg-blue-50 rounded-lg text-gray-500 hover:text-blue-700 transition cursor-pointer"
                title="다음 날짜 (내일)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Jumps */}
            {!targetedDateInfo.isToday && (
              <button
                type="button"
                onClick={() => handleDateChange(kstToday.dateStr)}
                className="inline-flex items-center gap-1 text-[11px] bg-white hover:bg-blue-50 text-blue-700 font-bold px-2 py-1.5 rounded-xl border border-blue-200 shadow-2xs transition cursor-pointer"
                title="오늘 날짜로 즉시 이동"
              >
                <RotateCcw className="w-3 h-3" />
                <span>오늘</span>
              </button>
            )}

            {/* Quick 9월 17일 button for instant verification */}
            {currentDateStr !== '2026-09-17' && (
              <button
                type="button"
                onClick={() => handleDateChange('2026-09-17')}
                className="text-[11px] bg-blue-100/70 hover:bg-blue-200/70 text-blue-800 font-semibold px-2 py-1.5 rounded-xl border border-blue-200 transition cursor-pointer"
                title="9월 17일 교문지도 확인"
              >
                9월 17일 조회
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Loading Indicator */}
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm animate-pulse flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 animate-spin text-blue-600" />
            <span>{targetedDateInfo.month}월 교문 지도 일정을 불러오는 중입니다...</span>
          </div>
        ) : targetedDuty && targetedDuty.teachers.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span className="font-semibold text-gray-700">
                {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek}) 지도 담당 교사
              </span>
              {targetedDateInfo.isPast && (
                <span className="text-slate-500 font-medium">※ 과거 실시 완료된 기록입니다.</span>
              )}
            </div>

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
          /* Empty State for Weekend or Dates with no duties */
          <div className="py-6 px-4 bg-gray-50 rounded-xl border border-gray-200/80 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek})에는{' '}
              {targetedDateInfo.isWeekend ? '주말 교문 지도가 없습니다.' : '등록된 교문 지도 일정이 없습니다.'}
            </p>
            {nextUpcomingDuty ? (
              <p className="text-xs text-blue-600 font-medium">
                다음 예정일: {nextUpcomingDuty.month}월 {nextUpcomingDuty.day}일({nextUpcomingDuty.dayOfWeek}) — {nextUpcomingDuty.teachers.join(', ')} 선생님
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                하단의 <strong>[교문 지도 전체 일정표]</strong>를 펼쳐 과거 9월 또는 다른 일정을 확인하실 수 있습니다.
              </p>
            )}
          </div>
        )}

        {/* Monthly schedule toggle */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowFullSchedule(!showFullSchedule)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-blue-700 py-1 transition cursor-pointer"
          >
            <span>교문 지도 전체 일정표 및 과거 이력 목록</span>
            {showFullSchedule ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <span className="text-[11px] text-gray-400">
            교문 지도 시간: 오전 08:00 ~ 08:15
          </span>
        </div>

        {/* Full Month Accordion Table with Month Switcher and Click-to-Select */}
        {showFullSchedule && (
          <div className="mt-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 space-y-3">
            {/* Table Month Switcher Header */}
            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-2xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftTableMonth(-1)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600 transition cursor-pointer"
                  title="이전 달"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-gray-900">
                  {tableYearMonth.split('-')[0]}년 {parseInt(tableYearMonth.split('-')[1], 10)}월 전체 교문지도 목록
                </span>
                <button
                  type="button"
                  onClick={() => shiftTableMonth(1)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600 transition cursor-pointer"
                  title="다음 달"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-blue-600 font-medium hidden sm:inline">
                  💡 날짜 행을 클릭하면 해당 일자로 즉시 변경됩니다.
                </span>
                {tableYearMonth !== '2026-09' && (
                  <button
                    type="button"
                    onClick={() => setTableYearMonth('2026-09')}
                    className="text-[10px] text-blue-700 hover:underline font-bold px-1.5 py-0.5 bg-blue-50 rounded border border-blue-200"
                  >
                    9월 이동
                  </button>
                )}
              </div>
            </div>

            {/* Duties Table */}
            {tableLoading ? (
              <div className="py-6 text-center text-xs text-gray-400 animate-pulse">
                일정표를 불러오는 중입니다...
              </div>
            ) : tableDutyRecord && tableDutyRecord.duties && tableDutyRecord.duties.length > 0 ? (
              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100/90 text-gray-600 sticky top-0 z-10 border-b border-gray-200">
                    <tr>
                      <th className="py-2 px-3 font-bold w-28">날짜 (요일)</th>
                      <th className="py-2 px-3 font-bold">지도교사</th>
                      <th className="py-2 px-3 font-bold">비고</th>
                      <th className="py-2 px-2 text-center w-16">선택</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tableDutyRecord.duties.map(d => {
                      const isSelected = d.date === currentDateStr;
                      return (
                        <tr
                          key={d.id || d.date}
                          onClick={() => handleDateChange(d.date)}
                          className={`transition cursor-pointer ${
                            isSelected 
                              ? 'bg-blue-100/80 font-bold text-blue-950 ring-1 ring-inset ring-blue-300' 
                              : 'hover:bg-blue-50/50 text-gray-700'
                          }`}
                        >
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="font-semibold">
                              {d.month}월 {String(d.day).padStart(2, '0')}일
                            </span>
                            <span className="text-gray-500 font-normal ml-1">
                              ({d.dayOfWeek ? d.dayOfWeek.replace('요일', '') : ''})
                            </span>
                          </td>
                          <td className="py-2 px-3 font-medium">
                            <div className="flex flex-wrap gap-1">
                              {d.teachers.map((name, i) => {
                                const t = findTeacherByName(name);
                                return (
                                  <span
                                    key={i}
                                    className={`px-2 py-0.5 rounded text-xs transition ${
                                      isSelected
                                        ? 'bg-blue-600 text-white font-bold'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {name}
                                    {t?.homeroom ? ` (${t.homeroom}반)` : ''}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-gray-500">
                            {d.note || '-'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {isSelected ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-700 font-black bg-white px-1.5 py-0.5 rounded border border-blue-200">
                                <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                조회중
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 group-hover:text-blue-600">
                                선택
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-gray-500 bg-white rounded-lg border border-dashed border-gray-200">
                {tableYearMonth.split('-')[0]}년 {parseInt(tableYearMonth.split('-')[1], 10)}월에 등록된 교문지도 일정이 없습니다.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
