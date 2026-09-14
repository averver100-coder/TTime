import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Settings, 
  Clock, 
  CalendarDays, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Check,
  BookOpen,
  Coffee,
  CalendarCheck,
  ListFilter
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { SchoolLogo } from '../components/SchoolLogo';
import { fetchTeachers, getDefaultTeachers } from '../lib/store';
import { 
  Teacher, 
  DayOfWeek, 
  dayNames, 
  dayNamesShort,
  getDayFromIndex, 
  getCurrentTimeMinutes, 
  parseTimeString, 
  periods, 
  formatClassroom,
  formatClassroomShort,
  KOREAN_CONSONANTS,
  getInitialConsonant,
  getChosung,
  matchKorean
} from '../lib/timetableUtils';

const ALL_WEEKDAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const Home: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>(() => getDefaultTeachers());
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [logoClicks, setLogoClicks] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAllDirectory, setShowAllDirectory] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // State for detailed today's schedule view and directory mode
  const [showAllTodayPeriods, setShowAllTodayPeriods] = useState(false);
  const [consonantFilter, setConsonantFilter] = useState<string>('ALL');
  const [directoryViewMode, setDirectoryViewMode] = useState<'consonant' | 'all'>('consonant');

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTeachers().then(data => {
      setTeachers(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogoClick = () => {
    const newClicks = logoClicks + 1;
    setLogoClicks(newClicks);
    if (newClicks === 5) {
      setToastMessage('🎉 버버&싱글라이더가 만들었습니다!');
      setTimeout(() => setToastMessage(null), 3500);
      setLogoClicks(0);
    }
  };

  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSelectAllDays = () => {
    setSelectedDays([]);
  };

  // Strictly sorted teachers in Korean alphabetical order (가나다 순)
  const sortedTeachers = useMemo(() => {
    return [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const isChosungOnly = /^[ㄱ-ㅎ\s]+$/.test(trimmed);
    const trimmedClean = trimmed.replace(/\s+/g, '');

    return teachers
      .filter(t => {
        if (isChosungOnly) {
          const nameChosung = getChosung(t.name);
          return nameChosung.includes(trimmedClean);
        }

        const nameMatches = matchKorean(t.name, trimmed);
        const homeroomMatches = (t.homeroom || '').toLowerCase().includes(trimmed.toLowerCase()) ||
          `${t.homeroom}반`.includes(trimmed);
        return nameMatches || homeroomMatches;
      })
      .sort((a, b) => {
        // 1. Exact name match
        const aExact = a.name.toLowerCase() === trimmed.toLowerCase() ? 0 : 1;
        const bExact = b.name.toLowerCase() === trimmed.toLowerCase() ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;

        // 2. Exact chosung match
        const aChosung = getChosung(a.name);
        const bChosung = getChosung(b.name);
        const aChosungExact = aChosung === trimmedClean ? 0 : 1;
        const bChosungExact = bChosung === trimmedClean ? 0 : 1;
        if (aChosungExact !== bChosungExact) return aChosungExact - bChosungExact;

        // 3. Name or chosung starts with query
        const aStarts = a.name.toLowerCase().startsWith(trimmed.toLowerCase()) || aChosung.startsWith(trimmedClean) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(trimmed.toLowerCase()) || bChosung.startsWith(trimmedClean) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;

        return a.name.localeCompare(b.name, 'ko');
      });
  }, [query, teachers]);

  const handleSelectTeacher = (t: Teacher) => {
    setSelectedTeacher(t);
    setQuery(t.name);
    setIsDropdownOpen(false);
    setShowAllTodayPeriods(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (filteredTeachers.length > 0) {
      const trimmedClean = trimmed.replace(/\s+/g, '');
      const exact = filteredTeachers.find(t => 
        t.name.toLowerCase() === trimmed.toLowerCase() ||
        getChosung(t.name) === trimmedClean
      ) || filteredTeachers[0];
      handleSelectTeacher(exact);
    } else {
      setIsDropdownOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSelectedTeacher(null);
    setIsDropdownOpen(false);
    searchInputRef.current?.focus();
  };

  // Group teachers by initial consonant in Korean alphabetical order
  const teachersByConsonant = useMemo(() => {
    const map: Record<string, Teacher[]> = {};
    sortedTeachers.forEach(t => {
      const firstChar = t.name.charAt(0);
      const con = getInitialConsonant(firstChar);
      if (!map[con]) map[con] = [];
      map[con].push(t);
    });

    const groups: { con: string; list: Teacher[] }[] = [];
    KOREAN_CONSONANTS.forEach(con => {
      if (map[con] && map[con].length > 0) {
        groups.push({
          con,
          list: map[con].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        });
      }
    });

    if (map['#'] && map['#'].length > 0) {
      groups.push({
        con: '기타',
        list: map['#'].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      });
    }

    return groups;
  }, [sortedTeachers]);

  const activeConsonants = useMemo(() => {
    return teachersByConsonant.map(g => g.con);
  }, [teachersByConsonant]);

  // Recommended quick teachers sorted alphabetically
  const quickTeachers = useMemo(() => {
    if (sortedTeachers.length === 0) return [];
    const withHomeroom = sortedTeachers.filter(t => t.homeroom);
    return withHomeroom.slice(0, 8);
  }, [sortedTeachers]);

  const todayDay = getDayFromIndex(new Date().getDay());

  const renderCurrentStatus = () => {
    if (!selectedTeacher) return null;

    const now = currentTime;
    const currentDay = getDayFromIndex(now.getDay());
    const currentMins = getCurrentTimeMinutes(now);

    if (!currentDay) {
      return (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-6 flex items-center gap-3 text-gray-700">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-gray-800 text-sm">현재는 주말(휴일)입니다</h4>
            <p className="text-xs text-gray-500">아래에서 전체 주간 수업시간표를 확인하실 수 있습니다.</p>
          </div>
        </div>
      );
    }

    const todayTimetable = selectedTeacher.timetable[currentDay] || {};
    // Wed, Thu, Fri: 6 periods; Mon, Tue: 7 periods
    const maxPeriodToday = (currentDay === 'Wed' || currentDay === 'Thu' || currentDay === 'Fri') ? 6 : 7;
    const applicablePeriods = periods.filter(p => p.period <= maxPeriodToday);

    const firstPeriodStartMins = parseTimeString(applicablePeriods[0].start);
    const lastPeriodEndMins = parseTimeString(applicablePeriods[applicablePeriods.length - 1].end);

    const isBeforeSchool = currentMins < firstPeriodStartMins;
    const isAfterSchool = currentMins > lastPeriodEndMins;

    // Find current ongoing period
    const currentPeriod = applicablePeriods.find(p => {
      const s = parseTimeString(p.start);
      const e = parseTimeString(p.end);
      return currentMins >= s && currentMins <= e;
    });

    // Determine remaining periods after search time (excluding current ongoing period)
    const remainingPeriods = applicablePeriods.filter(p => parseTimeString(p.start) > currentMins);
    const nextUpcomingPeriodWithClass = applicablePeriods.find(p => {
      const s = parseTimeString(p.start);
      return s > currentMins && Boolean(todayTimetable[p.period]);
    });

    const remainingClasses = remainingPeriods.filter(p => Boolean(todayTimetable[p.period]));
    const totalTodayClasses = applicablePeriods.filter(p => Boolean(todayTimetable[p.period]));

    const shouldShowAll = isAfterSchool || showAllTodayPeriods;
    const displayPeriods = shouldShowAll ? applicablePeriods : remainingPeriods;

    return (
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-6">
        {/* Header with live time */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                오늘({dayNames[currentDay]}) 현재 수업 상태
              </h3>
              <p className="text-xs text-gray-500">
                현재 시각: {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 font-semibold rounded-full border ${
            currentPeriod && todayTimetable[currentPeriod.period]
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : isAfterSchool
              ? 'bg-gray-100 text-gray-600 border-gray-200'
              : isBeforeSchool
              ? 'bg-purple-50 text-purple-700 border-purple-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            {isAfterSchool 
              ? '수업 종료' 
              : isBeforeSchool 
              ? '수업 시작 전' 
              : currentPeriod 
              ? (todayTimetable[currentPeriod.period] ? `${currentPeriod.period}교시 수업 진행중` : `${currentPeriod.period}교시 공강`)
              : '쉬는 시간'}
          </span>
        </div>

        {/* Current State Banner */}
        {currentPeriod ? (
          <div className={`p-4 rounded-xl border mb-5 ${
            todayTimetable[currentPeriod.period] 
              ? 'bg-blue-50/90 border-blue-200 text-blue-950' 
              : 'bg-gray-50 border-gray-200 text-gray-800'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                </span>
                <span className="font-bold text-sm sm:text-base break-keep-all leading-snug">
                  {todayTimetable[currentPeriod.period] ? (
                    <>지금 현재는 {currentPeriod.period}교시 ({currentPeriod.start} ~ {currentPeriod.end}) 수업 진행중입니다.</>
                  ) : (
                    <>지금 현재는 {currentPeriod.period}교시 ({currentPeriod.start} ~ {currentPeriod.end}) 공강 시간입니다.</>
                  )}
                </span>
              </div>
              <span className="text-xs font-semibold text-blue-800 bg-white/90 px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                종료까지 약 {parseTimeString(currentPeriod.end) - currentMins}분 남음
              </span>
            </div>
            <div className="mt-2.5 text-sm flex items-center gap-2 flex-wrap">
              {todayTimetable[currentPeriod.period] ? (
                <>
                  <span className="text-xs text-blue-800 font-semibold">수업 장소:</span>
                  <span className="px-3 py-1 bg-blue-600 text-white font-bold rounded-lg text-sm shadow-xs">
                    {formatClassroom(todayTimetable[currentPeriod.period])}
                  </span>
                </>
              ) : (
                <span className="text-gray-600 font-medium text-xs sm:text-sm">
                  현재 교시는 <strong>공강 (배정된 수업 없음)</strong> 시간입니다.
                </span>
              )}
            </div>
          </div>
        ) : isBeforeSchool ? (
          <div className="p-4 rounded-xl border bg-purple-50/80 border-purple-200 text-purple-950 mb-5 text-sm flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-sm">오늘 수업 시작 전입니다.</span>
                <p className="text-xs text-purple-800 mt-0.5">1교시 08:30 시작 (첫 수업까지 약 {firstPeriodStartMins - currentMins}분 남음)</p>
              </div>
            </div>
            <span className="text-xs bg-white text-purple-700 font-semibold px-2.5 py-1 rounded-md border border-purple-200">
              오늘 총 {totalTodayClasses.length}개 수업 예정
            </span>
          </div>
        ) : isAfterSchool ? (
          <div className="p-4 rounded-xl border bg-gray-50 border-gray-200 text-gray-700 mb-5 text-sm flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gray-200 text-gray-600 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-gray-900 text-sm break-keep-all leading-snug">오늘({dayNames[currentDay]})의 모든 정규 수업이 종료되었습니다.</span>
                <p className="text-xs text-gray-500 mt-0.5 break-keep-all">아래에서 오늘 진행되었던 전체 시간표를 상세히 확인하실 수 있습니다.</p>
              </div>
            </div>
            <span className="text-xs text-gray-500 bg-white px-2.5 py-1 rounded-md border border-gray-200 font-medium">
              총 {totalTodayClasses.length}개 수업 완료
            </span>
          </div>
        ) : (
          <div className="p-4 rounded-xl border bg-emerald-50/80 border-emerald-200 text-emerald-950 mb-5 flex items-center justify-between flex-wrap gap-2 text-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Coffee className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-sm break-keep-all leading-snug">지금은 쉬는 시간입니다.</span>
                {nextUpcomingPeriodWithClass && (
                  <p className="text-xs text-emerald-800 mt-0.5 break-keep-all">
                    다음 {nextUpcomingPeriodWithClass.period}교시 시작까지 약 {parseTimeString(nextUpcomingPeriodWithClass.start) - currentMins}분 남았습니다.
                  </p>
                )}
              </div>
            </div>
            {nextUpcomingPeriodWithClass && (
              <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md border border-emerald-200">
                다음: {nextUpcomingPeriodWithClass.period}교시 ({formatClassroom(todayTimetable[nextUpcomingPeriodWithClass.period])})
              </span>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* Detailed Section: 검색 시간 이후 오늘 시간표 세부 내용 다 보여주기 */}
        {/* ========================================================================= */}
        <div className="pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-blue-600" />
              <h4 className="font-bold text-gray-900 text-sm">
                {shouldShowAll 
                  ? `오늘(${dayNames[currentDay]}) 전체 시간표 세부 내용` 
                  : `검색 시간 이후 오늘(${dayNames[currentDay]}) 남은 시간표 상세 안내`}
              </h4>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
                {shouldShowAll 
                  ? `총 수업 ${totalTodayClasses.length}개` 
                  : remainingClasses.length > 0 
                  ? `남은 수업 ${remainingClasses.length}개` 
                  : '남은 수업 없음'}
              </span>
            </div>

            {!isAfterSchool && (
              <button
                type="button"
                onClick={() => setShowAllTodayPeriods(!showAllTodayPeriods)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 border border-blue-200/60"
              >
                <ListFilter className="w-3 h-3" />
                {showAllTodayPeriods ? '검색 시간 이후만 보기' : '오늘 전체 시간표 보기'}
              </button>
            )}
          </div>

          {isAfterSchool && (
            <p className="text-xs text-gray-500 mb-3 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200/70">
              💡 현재 시각 기준 오늘의 모든 정규 수업이 종료되어 <strong>오늘 진행되었던 전체 시간표 내역</strong>을 상세히 보여드립니다.
            </p>
          )}

          {/* Detailed Period List */}
          <div className="space-y-2">
            {displayPeriods.map((p) => {
              const room = todayTimetable[p.period];
              const startM = parseTimeString(p.start);
              const endM = parseTimeString(p.end);
              const isOngoing = currentMins >= startM && currentMins <= endM;
              const isPast = currentMins > endM;
              const isNextClass = nextUpcomingPeriodWithClass?.period === p.period;

              return (
                <div
                  key={p.period}
                  className={`p-3 sm:p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isOngoing
                      ? 'bg-blue-50/90 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                      : isNextClass
                      ? 'bg-indigo-50/80 border-indigo-300 shadow-2xs'
                      : isPast
                      ? 'bg-gray-50/60 border-gray-200/80 opacity-70'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Period Badge */}
                      <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold shrink-0 transition ${
                        isOngoing
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isNextClass
                          ? 'bg-indigo-600 text-white'
                          : room
                          ? 'bg-blue-100 text-blue-900 border border-blue-200'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}>
                        <span className="text-xs leading-none">{p.period}교시</span>
                        <span className="text-[10px] font-medium opacity-80 mt-1">{p.start}</span>
                      </div>

                      {/* Period Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-500 font-semibold">
                            {p.start} ~ {p.end}
                          </span>

                          {isOngoing && (
                            <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">
                              현재 수업 중
                            </span>
                          )}
                          {isNextClass && (
                            <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold">
                              다음 예정 수업
                            </span>
                          )}
                          {isPast && (
                            <span className="text-[10px] text-gray-400 bg-gray-200/70 px-1.5 py-0.5 rounded font-medium">
                              종료됨
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {room ? (
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 text-sm sm:text-base">
                                {formatClassroom(room)}
                              </span>
                              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                수업 배정
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                              공강 (수업 없음)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Time relative status */}
                    <div className="text-right shrink-0">
                      {room ? (
                        isOngoing ? (
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-blue-600">수업 진행중</span>
                            <span className="text-[11px] text-blue-700 font-medium">약 {endM - currentMins}분 남음</span>
                          </div>
                        ) : isNextClass ? (
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200">
                              약 {startM - currentMins}분 후 시작
                            </span>
                          </div>
                        ) : isPast ? (
                          <span className="text-xs text-gray-400 font-medium">수업 완료</span>
                        ) : (
                          <span className="text-xs text-gray-500 font-medium">{startM - currentMins}분 후</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">공강</span>
                      )}
                    </div>
                  </div>
              );
            })}
          </div>

          {!shouldShowAll && remainingPeriods.length === 0 && (
            <div className="text-xs text-gray-500 text-center py-3 bg-gray-50 rounded-xl mt-2">
              오늘 검색 시간 이후 예정된 수업이 없습니다.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTimetable = () => {
    if (!selectedTeacher) return null;
    
    // Always show all weekdays if none selected
    const daysToShow: DayOfWeek[] = selectedDays.length > 0 ? selectedDays : ALL_WEEKDAYS;

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6 break-keep-all">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="w-5 h-5 text-blue-600 shrink-0" />
            <h3 className="font-bold text-gray-800 text-sm sm:text-base break-keep-all">
              {selectedTeacher.name} 선생님 수업시간표
            </h3>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 shrink-0 whitespace-nowrap">
            {selectedDays.length === 0 ? '전체 주간 (월~금)' : `${selectedDays.length}개 요일 선택됨`}
          </span>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[320px] table-fixed">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="py-2.5 px-1 sm:px-2 font-semibold text-gray-500 text-xs w-[64px] sm:w-20 text-center whitespace-nowrap">
                  교시
                </th>
                {daysToShow.map(day => {
                  const isToday = day === todayDay;
                  return (
                    <th 
                      key={day} 
                      className={`py-2.5 px-0.5 sm:px-2 font-bold text-xs text-center transition-colors ${
                        isToday ? 'bg-blue-50 text-blue-700 font-extrabold' : 'text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1 whitespace-nowrap flex-nowrap leading-tight">
                        <span className="whitespace-nowrap">
                          {daysToShow.length > 3 ? (
                            <>
                              <span className="inline sm:hidden">{dayNamesShort[day]}</span>
                              <span className="hidden sm:inline">{dayNames[day]}</span>
                            </>
                          ) : (
                            dayNames[day]
                          )}
                        </span>
                        {isToday && (
                          <span className="px-1 py-0.5 bg-blue-600 text-white rounded text-[10px] font-medium leading-none whitespace-nowrap shrink-0">
                            오늘
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.period} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                  <td className="py-2 px-1 sm:px-2 text-center border-r border-gray-100 bg-gray-50/30 whitespace-nowrap">
                    <div className="font-bold text-gray-800 text-xs sm:text-sm">{p.period}교시</div>
                    <div className="text-[10px] sm:text-[11px] text-gray-400 leading-tight mt-0.5">{p.start}~{p.end}</div>
                  </td>
                  {daysToShow.map(day => {
                    const room = selectedTeacher.timetable[day]?.[p.period];
                    // 월/화는 7교시까지, 수/목/금은 6교시까지
                    const isInvalidPeriod = (day === 'Wed' || day === 'Thu' || day === 'Fri') && p.period === 7;
                    const isToday = day === todayDay;
                    
                    return (
                      <td 
                        key={day} 
                        className={`py-2 px-0.5 sm:px-2 text-center ${
                          isToday ? 'bg-blue-50/30' : ''
                        } ${isInvalidPeriod ? 'bg-gray-50/60' : ''}`}
                      >
                        {isInvalidPeriod ? (
                          <span className="text-gray-300 text-xs">-</span>
                        ) : room ? (
                          <span className="inline-flex items-center justify-center px-1.5 py-1 sm:px-2.5 sm:py-1 bg-blue-100 text-blue-800 rounded-lg font-bold text-xs sm:text-xs shadow-2xs border border-blue-200/70 break-keep-all leading-tight text-center max-w-full">
                            {formatClassroomShort(room)}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <header className="bg-white px-4 py-3.5 shadow-xs sticky top-0 z-20 border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={handleLogoClick}>
            <SchoolLogo 
              className="w-10 h-10 object-contain shrink-0"
            />
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-xl font-bold text-gray-800 tracking-tight leading-tight">쌤타임</h1>
              <div className="text-[11px] sm:text-xs font-medium text-gray-500 leading-tight mt-0.5">
                <span className="block whitespace-nowrap">상일미디어 고등학교</span>
                <span className="block whitespace-nowrap">수업시간표</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton />
            <button 
              onClick={() => navigate('/admin')}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition"
              title="관리자 설정"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Live Time Ticker Bar */}
      <div className="bg-blue-600 text-white px-4 py-2 text-center text-xs font-medium shadow-inner flex items-center justify-center gap-2 sticky top-[65px] z-10">
        <Clock className="w-3.5 h-3.5 animate-pulse text-blue-200" />
        <span>
          {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
        </span>
        <span className="font-bold font-mono bg-blue-700/80 px-2.5 py-0.5 rounded text-blue-100">
          {currentTime.toLocaleTimeString('ko-KR')}
        </span>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-full text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      <main className="max-w-2xl mx-auto p-4 mt-2">
        {/* Search Bar with Instant Autocomplete Dropdown */}
        <div ref={searchContainerRef} className="relative mb-6">
          <form onSubmit={handleSearch} className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              className="block w-full pl-11 pr-24 py-3.5 bg-white border border-gray-200 rounded-2xl text-base shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="선생님 성함 또는 초성 검색 (예: 김가영, ㄱㄱㅇ)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => {
                if (query.trim()) setIsDropdownOpen(true);
              }}
              autoComplete="off"
            />
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition"
                  title="지우기"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-xs active:scale-95"
              >
                검색
              </button>
            </div>
          </form>

          {/* Autocomplete Dropdown List */}
          {isDropdownOpen && query.trim().length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto divide-y divide-gray-100 animate-in fade-in slide-in-from-top-2 duration-150">
              {filteredTeachers.length > 0 ? (
                filteredTeachers.map(t => (
                  <button
                    key={t.id || t.name}
                    type="button"
                    onClick={() => handleSelectTeacher(t)}
                    className="w-full text-left px-4 py-3.5 hover:bg-blue-50 transition flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800 group-hover:text-blue-600 transition text-base">
                        {t.name}
                      </span>
                      <span className="text-[11px] font-mono text-gray-400 bg-gray-100 group-hover:bg-blue-100/80 group-hover:text-blue-700 px-1.5 py-0.5 rounded transition">
                        {getChosung(t.name)}
                      </span>
                      <span className="text-xs text-gray-500">선생님</span>
                    </div>
                    {t.homeroom && (
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 group-hover:bg-blue-100 px-2.5 py-1 rounded-md border border-blue-100">
                        {formatClassroom(t.homeroom)} 담임
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-gray-500">
                  일치하는 선생님이 없습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Teacher Details & Timetable */}
        {selectedTeacher ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-4">
            {/* Teacher Header Bar */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {selectedTeacher.name} <span className="text-lg text-gray-500 font-normal">선생님</span>
                    </h2>
                    {selectedTeacher.homeroom && (
                      <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-100">
                        {formatClassroom(selectedTeacher.homeroom)} 담임
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    전체 주간 시간표 및 요일별 수업을 확인하세요.
                  </p>
                </div>

                <button
                  onClick={handleClear}
                  className="self-start sm:self-auto text-xs font-semibold text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-gray-200 transition"
                >
                  다른 선생님 선택
                </button>
              </div>

              {/* Day Filter Pills */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={handleSelectAllDays}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${
                    selectedDays.length === 0 
                      ? 'bg-blue-600 text-white shadow-xs' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  전체 (월~금)
                </button>
                {ALL_WEEKDAYS.map(dayKey => {
                  const isSelected = selectedDays.includes(dayKey);
                  const isToday = dayKey === todayDay;
                  return (
                    <button
                      key={dayKey}
                      onClick={() => toggleDay(dayKey)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 flex items-center gap-1 ${
                        isSelected 
                          ? 'bg-blue-600 text-white shadow-xs' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span>{dayNames[dayKey]}</span>
                      {isToday && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-600'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Show Current Status */}
            {renderCurrentStatus()}

            {/* Timetable Table */}
            {renderTimetable()}
          </div>
        ) : (
          /* Initial State with Complete Teacher Directory Accordion */
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowAllDirectory(!showAllDirectory)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800 text-base">
                      전체 선생님 명단 ({sortedTeachers.length}명)
                    </h3>
                    <span className="text-[11px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-100">
                      가나다 순 정렬
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    모든 선생님의 시간표를 가나다 순 또는 초성별로 쉽게 찾아보세요.
                  </p>
                </div>
                {showAllDirectory ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {showAllDirectory && (
                <div className="p-6 pt-2 border-t border-gray-100 space-y-4 max-h-[580px] overflow-y-auto">
                  {/* View Mode Switcher and Consonant Filter Chips */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg w-fit">
                      <button
                        type="button"
                        onClick={() => setDirectoryViewMode('consonant')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                          directoryViewMode === 'consonant'
                            ? 'bg-white text-blue-600 shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        초성별 가나다순
                      </button>
                      <button
                        type="button"
                        onClick={() => setDirectoryViewMode('all')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                          directoryViewMode === 'all'
                            ? 'bg-white text-blue-600 shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        가나다순 전체보기
                      </button>
                    </div>

                    {/* Quick Consonant Filter Chips when in consonant mode */}
                    {directoryViewMode === 'consonant' && (
                      <div className="flex flex-wrap gap-1 items-center">
                        <button
                          type="button"
                          onClick={() => setConsonantFilter('ALL')}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                            consonantFilter === 'ALL'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          전체
                        </button>
                        {activeConsonants.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setConsonantFilter(c)}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                              consonantFilter === c
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Rendering Teachers */}
                  {directoryViewMode === 'consonant' ? (
                    <div className="space-y-4">
                      {teachersByConsonant
                        .filter(g => consonantFilter === 'ALL' || g.con === consonantFilter)
                        .map(group => (
                          <div key={group.con}>
                            <div className="text-xs font-bold text-blue-600 mb-2 px-1 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                                {group.con}
                              </span>
                              <span>{group.con} ({group.list.length}명)</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {group.list.map(t => (
                                <button
                                  key={t.id || t.name}
                                  onClick={() => handleSelectTeacher(t)}
                                  className="px-2.5 py-1.5 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-gray-200 rounded-lg text-xs font-medium text-gray-800 hover:text-blue-700 transition"
                                >
                                  {t.name}
                                  {t.homeroom && (
                                    <span className="text-[10px] text-gray-500 ml-1">
                                      ({t.homeroom})
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    /* Unified Full List strictly in Korean Alphabetical Order */
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {sortedTeachers.map((t) => (
                        <button
                          key={t.id || t.name}
                          onClick={() => handleSelectTeacher(t)}
                          className="px-3 py-2 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-gray-200 rounded-xl text-left text-xs font-medium text-gray-800 hover:text-blue-700 transition flex items-center justify-between"
                        >
                          <span className="font-bold">{t.name}</span>
                          {t.homeroom ? (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                              {t.homeroom}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">교사</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

