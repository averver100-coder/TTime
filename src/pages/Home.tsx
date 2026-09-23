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
  ListFilter,
  Home as HomeIcon,
  Star,
  GraduationCap,
  Bell,
  Download,
  Loader2
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { SchoolLogo } from '../components/SchoolLogo';
import { TodayGateDuty } from '../components/TodayGateDuty';
import { TodayLunchDuty } from '../components/TodayLunchDuty';
import { TodayMeal } from '../components/TodayMeal';
import { ClassTimetableCard } from '../components/ClassTimetableCard';
import { BookmarkSection } from '../components/BookmarkSection';
import { TodayScheduleNotificationToast } from '../components/TodayScheduleNotificationToast';
import { useBookmarks } from '../hooks/useBookmarks';
import { exportElementAsPng } from '../lib/exportImage';
import { fetchTeachers, getDefaultTeachers, fetchClassTimetables, getDefaultClassTimetables } from '../lib/store';
import { 
  Teacher, 
  ClassTimetable,
  DayOfWeek, 
  dayNames, 
  dayNamesShort,
  getDayFromIndex, 
  getCurrentTimeMinutes, 
  parseTimeString, 
  periods, 
  formatClassroom,
  formatClassroomShort,
  formatClassTitle,
  matchClassCode,
  getClassMatchScore,
  KOREAN_CONSONANTS,
  getInitialConsonant,
  getChosung,
  decomposeConsonants,
  matchKorean
} from '../lib/timetableUtils';
import { Footer } from '../components/Footer';
const ALL_WEEKDAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const Home: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>(() => getDefaultTeachers());
  const [classes, setClasses] = useState<ClassTimetable[]>(() => getDefaultClassTimetables());
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassTimetable | null>(null);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [logoClicks, setLogoClicks] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAllDirectory, setShowAllDirectory] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isTodayNotificationOpen, setIsTodayNotificationOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isExportingTeacher, setIsExportingTeacher] = useState(false);
  const teacherCardRef = useRef<HTMLDivElement>(null);

  const handleExportTeacherTimetable = async () => {
    if (!teacherCardRef.current || !selectedTeacher || isExportingTeacher) return;
    try {
      setIsExportingTeacher(true);
      await exportElementAsPng(teacherCardRef.current, {
        filename: `${selectedTeacher.name}선생님_시간표`,
        backgroundColor: '#ffffff'
      });
    } catch (err) {
      console.error('Failed to export teacher timetable:', err);
      alert('시간표 이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setIsExportingTeacher(false);
    }
  };

  // Auto show today's schedule notification on app startup
  useEffect(() => {
    const hasNotifiedThisSession = sessionStorage.getItem('ssamtime_today_startup_notified_v1');
    if (!hasNotifiedThisSession) {
      sessionStorage.setItem('ssamtime_today_startup_notified_v1', 'true');
      const timer = setTimeout(() => {
        setIsTodayNotificationOpen(true);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, []);

  // Bookmarks management
  const {
    bookmarks,
    isBookmarked,
    toggleBookmark,
    removeBookmark,
    clearAllBookmarks
  } = useBookmarks();

  // Quick class grade filter
  const [activeGradeFilter, setActiveGradeFilter] = useState<'all' | 1 | 2 | 3>('all');

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
    fetchClassTimetables().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setClasses(data);
      }
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
    if (selectedTeacher || selectedClass || query) {
      handleClear();
    }
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

  // Sorted classes 101 -> 311
  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => a.classCode.localeCompare(b.classCode, 'ko', { numeric: true }));
  }, [classes]);

  // Filtered classes by query (e.g. "11", "25", "311", "101", "1-1", "1학년 1반")
  const filteredClasses = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return sortedClasses
      .filter(c => matchClassCode(c, trimmed))
      .sort((a, b) => {
        const scoreA = getClassMatchScore(a, trimmed);
        const scoreB = getClassMatchScore(b, trimmed);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.classCode.localeCompare(b.classCode, 'ko', { numeric: true });
      });
  }, [query, sortedClasses]);

  const filteredTeachers = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const decomposedTrimmed = decomposeConsonants(trimmed);
    const isChosungOnly = /^[ㄱ-ㅎ\s]+$/.test(decomposedTrimmed);
    const trimmedClean = decomposedTrimmed.replace(/\s+/g, '');
    const tenseExpandedClean = trimmedClean.replace(/ㄲ/g, 'ㄱㄱ').replace(/ㄸ/g, 'ㄷㄷ').replace(/ㅃ/g, 'ㅂㅂ').replace(/ㅆ/g, 'ㅅㅅ').replace(/ㅉ/g, 'ㅈㅈ');

    return teachers
      .filter(t => {
        if (isChosungOnly) {
          const nameChosung = getChosung(t.name);
          return (
            nameChosung.includes(trimmedClean) ||
            nameChosung.includes(tenseExpandedClean)
          );
        }

        const nameMatches = matchKorean(t.name, trimmed);
        const homeroomMatches = (() => {
          if (!t.homeroom) return false;
          const hr = t.homeroom.toLowerCase();
          const hrClean = hr.replace(/[\s-]/g, ''); // e.g. "2-5" -> "25"
          if (hr.includes(trimmed.toLowerCase())) return true;
          if (`${hr}반`.includes(trimmed)) return true;
          if (hrClean === trimmedClean || `${hrClean}반` === trimmedClean) return true;
          return false;
        })();
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
        const aChosungExact = (aChosung === trimmedClean || aChosung === tenseExpandedClean) ? 0 : 1;
        const bChosungExact = (bChosung === trimmedClean || bChosung === tenseExpandedClean) ? 0 : 1;
        if (aChosungExact !== bChosungExact) return aChosungExact - bChosungExact;

        // 3. Name or chosung starts with query
        const aStarts = (
          a.name.toLowerCase().startsWith(trimmed.toLowerCase()) || 
          aChosung.startsWith(trimmedClean) || 
          aChosung.startsWith(tenseExpandedClean)
        ) ? 0 : 1;
        const bStarts = (
          b.name.toLowerCase().startsWith(trimmed.toLowerCase()) || 
          bChosung.startsWith(trimmedClean) || 
          bChosung.startsWith(tenseExpandedClean)
        ) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;

        return a.name.localeCompare(b.name, 'ko');
      });
  }, [query, teachers]);

  const handleSelectTeacher = (t: Teacher) => {
    setSelectedTeacher(t);
    setSelectedClass(null);
    setQuery(t.name);
    setIsDropdownOpen(false);
    setShowAllTodayPeriods(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectClass = (c: ClassTimetable) => {
    setSelectedClass(c);
    setSelectedTeacher(null);
    setQuery(formatClassTitle(c.classCode));
    setActiveGradeFilter(c.grade as 1 | 2 | 3);
    setIsDropdownOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    // Check if class matches first when input resembles class code/grade
    const isClassPattern = /^\d{1,3}$|^\d-\d{1,2}$|^\d학년|\d반$/.test(trimmed.replace(/\s+/g, ''));
    if (isClassPattern && filteredClasses.length > 0) {
      handleSelectClass(filteredClasses[0]);
      return;
    }

    if (filteredTeachers.length > 0) {
      const decomposed = decomposeConsonants(trimmed);
      const trimmedClean = decomposed.replace(/\s+/g, '');
      const tenseExpandedClean = trimmedClean.replace(/ㄲ/g, 'ㄱㄱ').replace(/ㄸ/g, 'ㄷㄷ').replace(/ㅃ/g, 'ㅂㅂ').replace(/ㅆ/g, 'ㅅㅅ').replace(/ㅉ/g, 'ㅈㅈ');
      const exact = filteredTeachers.find(t => {
        const tChosung = getChosung(t.name);
        return (
          t.name.toLowerCase() === trimmed.toLowerCase() ||
          tChosung === trimmedClean ||
          tChosung === tenseExpandedClean
        );
      }) || filteredTeachers[0];
      handleSelectTeacher(exact);
    } else if (filteredClasses.length > 0) {
      handleSelectClass(filteredClasses[0]);
    } else {
      setIsDropdownOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSelectedTeacher(null);
    setSelectedClass(null);
    setIsDropdownOpen(false);
    setActiveGradeFilter('all');
    searchInputRef.current?.focus();
  };

  const handleToggleTeacherBookmark = (t: Teacher) => {
    const wasBookmarked = isBookmarked('teacher', t.name);
    toggleBookmark({
      type: 'teacher',
      id: t.name,
      title: `${t.name} 선생님`,
      subtitle: t.homeroom ? `${formatClassroom(t.homeroom)} 담임` : undefined,
    });
    setToastMessage(wasBookmarked ? `⭐ '${t.name} 선생님' 즐겨찾기가 해제되었습니다.` : `⭐ '${t.name} 선생님'이 즐겨찾기에 추가되었습니다.`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleToggleClassBookmark = (c: ClassTimetable) => {
    const wasBookmarked = isBookmarked('class', c.classCode);
    const title = formatClassTitle(c.classCode);
    toggleBookmark({
      type: 'class',
      id: c.classCode,
      title: title,
      subtitle: `${c.grade}-${c.classNum} (${c.classCode})`,
    });
    setToastMessage(wasBookmarked ? `⭐ '${title}' 즐겨찾기가 해제되었습니다.` : `⭐ '${title}'이 즐겨찾기에 추가되었습니다.`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSelectTeacherByName = (teacherName: string) => {
    const matched = teachers.find(t => t.name === teacherName);
    if (matched) {
      handleSelectTeacher(matched);
    } else {
      setQuery(teacherName);
      setIsDropdownOpen(true);
    }
  };

  const handleSelectClassByCode = (classCode: string) => {
    const matched = classes.find(c => c.classCode === classCode);
    if (matched) {
      handleSelectClass(matched);
    } else {
      setQuery(classCode);
      setIsDropdownOpen(true);
    }
  };

  const handleGradeButtonClick = (grade: 1 | 2 | 3) => {
    if (activeGradeFilter === grade && isDropdownOpen) {
      // Toggle off if already opened
      setIsDropdownOpen(false);
      setQuery('');
      setActiveGradeFilter('all');
    } else {
      setActiveGradeFilter(grade);
      setQuery(`${grade}학년`);
      setIsDropdownOpen(true);
    }
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
    const currentMins = getCurrentTimeMinutes(currentTime);

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
          <table className="w-full text-left border-collapse min-w-[340px] table-fixed">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="py-3 px-1 sm:px-2 font-semibold text-gray-500 text-xs w-[64px] sm:w-20 text-center whitespace-nowrap bg-gray-50/90 border-r border-gray-100">
                  교시
                </th>
                {daysToShow.map(day => {
                  const isToday = day === todayDay;
                  return (
                    <th 
                      key={day} 
                      className={`py-3 px-0.5 sm:px-2 text-xs text-center transition-all ${
                        isToday 
                          ? 'bg-blue-100/90 text-blue-950 font-black border-t-2 border-t-blue-600 border-x-2 border-x-blue-300 shadow-2xs' 
                          : 'font-bold text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap flex-nowrap leading-tight">
                        <span className={`whitespace-nowrap ${isToday ? 'text-blue-950 font-black' : ''}`}>
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
                          <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-[10px] font-black leading-none whitespace-nowrap shrink-0 shadow-xs">
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
              {periods.map(p => {
                const startM = parseTimeString(p.start);
                const endM = parseTimeString(p.end);
                const isPeriodActiveNow = currentMins >= startM && currentMins <= endM;

                return (
                  <tr key={p.period} className="border-b border-gray-100/80 hover:bg-gray-50/40 transition">
                    <td className={`py-2 px-1 sm:px-2 text-center border-r border-gray-100 whitespace-nowrap transition-colors ${
                      isPeriodActiveNow ? 'bg-blue-50/70' : 'bg-gray-50/40'
                    }`}>
                      <div className="flex items-center justify-center gap-1">
                        {isPeriodActiveNow && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
                        )}
                        <span className={`font-bold text-xs sm:text-sm ${isPeriodActiveNow ? 'text-blue-700' : 'text-gray-800'}`}>
                          {p.period}교시
                        </span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-gray-400 leading-tight mt-0.5">{p.start}~{p.end}</div>
                    </td>
                    {daysToShow.map(day => {
                      const room = selectedTeacher.timetable[day]?.[p.period];
                      // 월/화는 7교시까지, 수/목/금은 6교시까지
                      const isInvalidPeriod = (day === 'Wed' || day === 'Thu' || day === 'Fri') && p.period === 7;
                      const isToday = day === todayDay;
                      const isCellActiveNow = isToday && isPeriodActiveNow;
                      
                      return (
                        <td 
                          key={day} 
                          className={`py-2 px-0.5 sm:px-2 text-center transition-all ${
                            isToday 
                              ? `border-x-2 border-x-blue-300/80 ${
                                  isCellActiveNow 
                                    ? 'bg-blue-100/90 ring-2 ring-inset ring-blue-500/40 shadow-inner' 
                                    : 'bg-blue-50/60 hover:bg-blue-100/50'
                                }` 
                              : isInvalidPeriod ? 'bg-gray-50/70' : ''
                          }`}
                        >
                          {isInvalidPeriod ? (
                            <span className="text-gray-300 text-xs font-semibold">-</span>
                          ) : room ? (
                            isCellActiveNow ? (
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <span className="inline-flex items-center justify-center px-1.5 py-1 sm:px-2 sm:py-1 bg-blue-600 text-white rounded-lg font-black text-xs shadow-xs ring-2 ring-blue-300 break-keep-all leading-tight text-center max-w-full">
                                  {formatClassroomShort(room)}
                                </span>
                                <span className="text-[9px] font-black text-blue-700 bg-blue-200/90 px-1 py-0.2 rounded leading-tight">
                                  수업중
                                </span>
                              </div>
                            ) : isToday ? (
                              <span className="inline-flex items-center justify-center px-1.5 py-1 sm:px-2.5 sm:py-1 bg-blue-600 text-white rounded-lg font-extrabold text-xs shadow-2xs hover:bg-blue-700 break-keep-all leading-tight text-center max-w-full transition">
                                {formatClassroomShort(room)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center px-1.5 py-1 sm:px-2.5 sm:py-1 bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg font-semibold text-xs border border-slate-200/80 break-keep-all leading-tight text-center max-w-full transition">
                                {formatClassroomShort(room)}
                              </span>
                            )
                          ) : isToday ? (
                            <span className="text-blue-400/80 font-medium text-xs">-</span>
                          ) : (
                            <span className="text-gray-300 text-xs">-</span>
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
        {/* Timetable Footer Note */}
        {ALL_WEEKDAYS.includes(todayDay) && daysToShow.includes(todayDay) && (
          <div className="px-4 py-2.5 bg-blue-50/50 border-t border-blue-100/60 flex items-center justify-between text-[11px] text-blue-800">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <strong>오늘 요일({dayNames[todayDay]})</strong> 열이 파란색으로 강조되어 있습니다.
            </span>
            <span className="text-blue-600 font-semibold hidden sm:inline">
              현재 시각: {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <header className="bg-white px-4 py-3 sm:py-3.5 shadow-xs sticky top-0 z-20 border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4 cursor-pointer select-none group" onClick={handleLogoClick}>
            <SchoolLogo 
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain shrink-0 drop-shadow-sm transition-transform group-hover:scale-105 active:scale-95"
            />
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight leading-tight">쌤타임</h1>
              <div className="text-[11px] sm:text-xs font-medium text-gray-500 leading-tight mt-0.5">
                <span className="block whitespace-nowrap">상일미디어고등학교</span>
                <span className="block whitespace-nowrap">실시간 수업시간표</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(selectedTeacher || query) && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200/80 transition shadow-2xs active:scale-95"
                title="첫화면으로 이동 (오늘의 교문지도 보기)"
              >
                <HomeIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>홈으로</span>
              </button>
            )}
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
      <div className="bg-blue-600 text-white px-4 py-2 text-center text-xs font-medium shadow-inner flex items-center justify-center gap-2 sticky top-[65px] z-10 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 animate-pulse text-blue-200" />
          <span>
            {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
          </span>
          <span className="font-bold font-mono bg-blue-700/80 px-2 py-0.5 rounded text-blue-100 text-[11px]">
            {currentTime.toLocaleTimeString('ko-KR')}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsTodayNotificationOpen(true)}
          className="inline-flex items-center gap-1 bg-blue-500/80 hover:bg-blue-700 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-blue-300/40 shadow-2xs transition active:scale-95 cursor-pointer"
          title="오늘의 수업 시간표 알림 보기"
        >
          <Bell className="w-3 h-3 text-yellow-300" />
          <span>오늘 시간표 알림</span>
        </button>
      </div>

      {/* Today's Schedule Notification Toast (Startup & On-demand) */}
      <TodayScheduleNotificationToast
        teachers={teachers}
        classes={classes}
        bookmarks={bookmarks}
        currentTime={currentTime}
        isOpen={isTodayNotificationOpen}
        onClose={() => setIsTodayNotificationOpen(false)}
        onSelectTeacher={handleSelectTeacherByName}
        onSelectClass={handleSelectClassByCode}
      />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-full text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      <main className="max-w-2xl mx-auto p-4 mt-2">
        {/* Main Teacher & Class Timetable Search Card (Highlighted) */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-blue-500/80 shadow-lg shadow-blue-500/10 mb-6 relative">
          <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                  실시간 수업시간표 검색
                </h2>
                <p className="text-[11px] text-gray-500">
                  선생님 성함이나 초성 또는 학년반(예: 101, 1-1)을 검색해 실시간 시간표를 확인하세요
                </p>
              </div>
            </div>

            {(selectedTeacher || selectedClass) && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition flex items-center gap-1 cursor-pointer"
              >
                <HomeIcon className="w-3.5 h-3.5" />
                <span>검색 초기화</span>
              </button>
            )}
          </div>

          {/* Search Bar with Instant Autocomplete Dropdown */}
          <div ref={searchContainerRef} className="relative">
            <form onSubmit={handleSearch} className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-blue-500" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                className="block w-full pl-11 pr-24 py-3.5 bg-blue-50/30 hover:bg-white border-2 border-blue-200 focus:border-blue-600 rounded-2xl text-base font-medium shadow-inner focus:bg-white focus:ring-4 focus:ring-blue-100 outline-none transition"
                placeholder="이름 또는 학년반 검색(예: 101,11,ㄱㄱㅇ)"
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
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition cursor-pointer"
                    title="지우기"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition shadow-sm active:scale-95 cursor-pointer"
                >
                  검색
                </button>
              </div>
            </form>

            {/* Autocomplete Dropdown List with Classes & Teachers */}
            {isDropdownOpen && (
              <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl max-h-80 overflow-y-auto divide-y divide-gray-100 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* 0. Quick Bookmarks List when query is empty but bookmarks exist */}
                {query.trim().length === 0 && bookmarks.length > 0 && (
                  <div className="p-2 bg-amber-50/40">
                    <div className="text-[11px] font-bold text-amber-800 px-2 py-1 flex items-center justify-between uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>즐겨찾는 바로가기 ({bookmarks.length}개)</span>
                      </div>
                      <span className="text-[10px] text-amber-700 font-normal">자주 찾는 시간표</span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {bookmarks.map(b => (
                        <button
                          key={`${b.type}-${b.id}`}
                          type="button"
                          onClick={() => {
                            if (b.type === 'teacher') {
                              handleSelectTeacherByName(b.id);
                            } else {
                              handleSelectClassByCode(b.id);
                            }
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-amber-100/60 transition flex items-center justify-between group cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-amber-200/70 text-amber-800 flex items-center justify-center font-bold text-xs">
                              <Star className="w-3 h-3 fill-amber-600 text-amber-600" />
                            </span>
                            <span className="font-bold text-gray-800 text-sm">
                              {b.title}
                            </span>
                            {b.subtitle && (
                              <span className="text-[11px] text-gray-500 font-medium">
                                ({b.subtitle})
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                            이동 →
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1. Class Matches Section */}
                {filteredClasses.length > 0 && (
                  <div className="p-2 bg-slate-50/60">
                    <div className="text-[11px] font-bold text-indigo-700 px-2 py-1 flex items-center gap-1.5 uppercase tracking-wider">
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>학년반 수업시간표 ({filteredClasses.length}개)</span>
                    </div>
                    <div className="space-y-1">
                      {filteredClasses.map(c => {
                        const isCBookmarked = isBookmarked('class', c.classCode);
                        return (
                          <div
                            key={c.classCode}
                            onClick={() => handleSelectClass(c)}
                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition flex items-center justify-between group cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                                <GraduationCap className="w-3.5 h-3.5" />
                              </span>
                              <span className="font-bold text-gray-900 group-hover:text-indigo-700 transition text-sm">
                                {formatClassTitle(c.classCode)}
                              </span>
                              <span className="text-[11px] text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                                {c.grade}-{c.classNum}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleClassBookmark(c);
                                }}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${
                                  isCBookmarked
                                    ? 'text-amber-500 hover:bg-amber-100/70'
                                    : 'text-gray-300 hover:text-amber-500 hover:bg-gray-100'
                                }`}
                                title={isCBookmarked ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                              >
                                <Star className={`w-4 h-4 ${isCBookmarked ? 'fill-amber-400 text-amber-500' : ''}`} />
                              </button>
                              <span className="text-xs font-semibold text-indigo-600 bg-white px-2.5 py-1 rounded-md border border-indigo-100 shadow-2xs">
                                시간표 보기 →
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Teachers Matches Section */}
                {filteredTeachers.length > 0 && (
                  <div className="p-2">
                    <div className="text-[11px] font-bold text-gray-500 px-2 py-1 flex items-center gap-1.5 uppercase tracking-wider">
                      <span>선생님 수업시간표 ({filteredTeachers.length}명)</span>
                    </div>
                    <div className="space-y-1">
                      {filteredTeachers.map(t => {
                        const isTBookmarked = isBookmarked('teacher', t.name);
                        return (
                          <div
                            key={t.id || t.name}
                            onClick={() => handleSelectTeacher(t)}
                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50 transition flex items-center justify-between group cursor-pointer"
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
                            <div className="flex items-center gap-1.5 shrink-0">
                              {t.homeroom && (
                                <span className="text-xs font-semibold text-blue-700 bg-blue-50 group-hover:bg-blue-100 px-2.5 py-1 rounded-md border border-blue-100">
                                  {formatClassroom(t.homeroom)} 담임
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleTeacherBookmark(t);
                                }}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${
                                  isTBookmarked
                                    ? 'text-amber-500 hover:bg-amber-100/70'
                                    : 'text-gray-300 hover:text-amber-500 hover:bg-gray-100'
                                }`}
                                title={isTBookmarked ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                              >
                                <Star className={`w-4 h-4 ${isTBookmarked ? 'fill-amber-400 text-amber-500' : ''}`} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {query.trim().length > 0 && filteredClasses.length === 0 && filteredTeachers.length === 0 && (
                  <div className="p-5 text-center text-sm text-gray-500">
                    일치하는 선생님 또는 학년반이 없습니다.
                    <div className="text-xs text-gray-400 mt-1">
                      예: "101", "1-1", "203", "김가영" 형태로 검색해 보세요.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Class Shortcut Bar */}
          <div className="mt-4 pt-3.5 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-gray-800">학년반 빠른 바로가기</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => handleGradeButtonClick(1)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    activeGradeFilter === 1
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  1학년
                </button>
                <button
                  type="button"
                  onClick={() => handleGradeButtonClick(2)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    activeGradeFilter === 2
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  2학년
                </button>
                <button
                  type="button"
                  onClick={() => handleGradeButtonClick(3)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    activeGradeFilter === 3
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  3학년
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Class Schedule View */}
        {selectedClass && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            <ClassTimetableCard 
              classItem={selectedClass} 
              teachers={teachers} 
              currentTime={currentTime}
              onClose={handleClear}
              onSelectTeacher={(teacherName) => {
                const matched = teachers.find(t => t.name === teacherName);
                if (matched) {
                  handleSelectTeacher(matched);
                } else {
                  // Fallback: search query with that teacher's name
                  setQuery(teacherName);
                  setIsDropdownOpen(true);
                }
              }}
            />
          </div>
        )}

        {/* Selected Teacher Details & Timetable */}
        {selectedTeacher ? (
          <div ref={teacherCardRef} className="animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-4">
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

                <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportTeacherTimetable}
                    disabled={isExportingTeacher}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 px-3.5 py-2 rounded-xl border border-gray-200 transition shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="선생님 시간표 이미지로 저장"
                  >
                    {isExportingTeacher ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                    ) : (
                      <Download className="w-4 h-4 text-gray-600" />
                    )}
                    <span>이미지 저장</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleTeacherBookmark(selectedTeacher)}
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-2xs active:scale-95 cursor-pointer ${
                      isBookmarked('teacher', selectedTeacher.name)
                        ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 ring-2 ring-amber-300'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                    }`}
                    title={isBookmarked('teacher', selectedTeacher.name) ? '즐겨찾기 해제' : '즐겨찾기에 추가'}
                  >
                    <Star className={`w-4 h-4 ${isBookmarked('teacher', selectedTeacher.name) ? 'fill-amber-950 text-amber-950' : 'text-amber-600'}`} />
                    <span>{isBookmarked('teacher', selectedTeacher.name) ? '즐겨찾기됨' : '즐겨찾기'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3.5 py-2 rounded-xl border border-blue-200 transition shadow-2xs active:scale-95"
                    title="첫화면으로 이동"
                  >
                    <HomeIcon className="w-4 h-4 text-blue-600" />
                    <span>홈으로</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-xl border border-gray-200 transition"
                  >
                    다른 검색
                  </button>
                </div>
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

            {/* Bottom Return to Home Card */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-center sm:text-left">
                <p className="text-xs sm:text-sm font-bold text-gray-800">
                  다른 선생님 시간표나 오늘의 교문 지도, 급식 감독을 확인하시겠습니까?
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  첫화면으로 이동하면 오늘의 교문 지도, 급식 감독 선생님과 전체 명단을 바로 볼 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition active:scale-95 shrink-0"
              >
                <HomeIcon className="w-4 h-4" />
                <span>홈으로 이동</span>
              </button>
            </div>
          </div>
        ) : !selectedClass ? (
          /* Initial State with Bookmarks & Complete Teacher Directory */
          <div className="space-y-6">
            {/* Bookmarks Section */}
            <BookmarkSection
              bookmarks={bookmarks}
              onSelectTeacher={handleSelectTeacherByName}
              onSelectClass={handleSelectClassByCode}
              onRemoveBookmark={(type, id) => {
                removeBookmark(type, id);
                setToastMessage('⭐ 즐겨찾기가 해제되었습니다.');
                setTimeout(() => setToastMessage(null), 2000);
              }}
              onClearAll={() => {
                clearAllBookmarks();
                setToastMessage('⭐ 즐겨찾기가 모두 삭제되었습니다.');
                setTimeout(() => setToastMessage(null), 2000);
              }}
            />

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
                              {group.list.map(t => {
                                const isTBookmarked = isBookmarked('teacher', t.name);
                                return (
                                  <button
                                    key={t.id || t.name}
                                    onClick={() => handleSelectTeacher(t)}
                                    className={`px-2.5 py-1.5 border rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                                      isTBookmarked
                                        ? 'bg-amber-50/70 border-amber-300 text-amber-950 font-bold'
                                        : 'bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border-gray-200 text-gray-800 hover:text-blue-700'
                                    }`}
                                  >
                                    {isTBookmarked && (
                                      <Star className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />
                                    )}
                                    <span>{t.name}</span>
                                    {t.homeroom && (
                                      <span className="text-[10px] text-gray-500 ml-0.5">
                                        ({t.homeroom})
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    /* Unified Full List strictly in Korean Alphabetical Order */
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {sortedTeachers.map((t) => {
                        const isTBookmarked = isBookmarked('teacher', t.name);
                        return (
                          <button
                            key={t.id || t.name}
                            onClick={() => handleSelectTeacher(t)}
                            className={`px-3 py-2 border rounded-xl text-left text-xs font-medium transition flex items-center justify-between cursor-pointer ${
                              isTBookmarked
                                ? 'bg-amber-50/70 border-amber-300 text-amber-950 shadow-2xs'
                                : 'bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border-gray-200 text-gray-800 hover:text-blue-700'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isTBookmarked && (
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                              )}
                              <span className="font-bold truncate">{t.name}</span>
                            </div>
                            {t.homeroom ? (
                              <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-medium shrink-0">
                                {t.homeroom}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 shrink-0">교사</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 오늘의 교문 지도 선생님 코너 */}
            <TodayGateDuty 
              teachers={teachers} 
              onSelectTeacher={handleSelectTeacher} 
            />

            {/* 오늘의 급식 감독 선생님 코너 */}
            <TodayLunchDuty 
              teachers={teachers} 
              onSelectTeacher={handleSelectTeacher} 
            />

            {/* 오늘의 급식 코너 */}
            <TodayMeal />
          </div>
        ) : null}
      </main>

      {/* Subtle Copyright Notice */}
      <Footer />
    </div>
  );
};

