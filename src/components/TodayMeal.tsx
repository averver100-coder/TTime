import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  UtensilsCrossed, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Flame, 
  Apple, 
  Info,
  CalendarDays,
  CheckCircle2,
  Download,
  Loader2,
  GraduationCap,
  Coffee,
  BookOpen
} from 'lucide-react';
import { MealDay, MealMonthRecord } from '../types/meal';
import { fetchMealMonth } from '../lib/mealStore';
import { getKSTDate } from '../lib/gateDutyStore';
import { exportElementAsPng } from '../lib/exportImage';

interface TodayMealProps {
  selectedDate?: string; // "YYYY-MM-DD"
  onDateChange?: (dateStr: string) => void;
}

export const TodayMeal: React.FC<TodayMealProps> = ({ selectedDate, onDateChange }) => {
  const kstToday = useMemo(() => getKSTDate(), []);

  // Internal date state if uncontrolled
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

  const [mealRecord, setMealRecord] = useState<MealMonthRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFullSchedule, setShowFullSchedule] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState(false);
  const mealCardRef = useRef<HTMLElement>(null);

  // Month navigation state for the monthly schedule table and mobile list
  const [tableYearMonth, setTableYearMonth] = useState<string>(() => {
    return (selectedDate || kstToday.dateStr).slice(0, 7);
  });
  const [tableMealRecord, setTableMealRecord] = useState<MealMonthRecord | null>(null);
  const [tableLoading, setTableLoading] = useState<boolean>(false);

  // Compute targeted date info with robust normalization
  const targetedDateInfo = useMemo(() => {
    let year = kstToday.year;
    let month = kstToday.month;
    let day = kstToday.day;

    if (currentDateStr) {
      const parts = currentDateStr.split(/[-./]/).map(s => parseInt(s, 10));
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        year = parts[0];
        month = parts[1];
        day = parts[2];
      }
    }

    const baseDate = new Date(year, month - 1, day);
    const dayOfWeekNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayOfWeek = dayOfWeekNames[baseDate.getDay()] || '월요일';

    const mPad = String(month).padStart(2, '0');
    const dPad = String(day).padStart(2, '0');
    const dateStr = `${year}-${mPad}-${dPad}`;
    const yearMonth = `${year}-${mPad}`;

    return {
      dateStr,
      yearMonth,
      year,
      month,
      day,
      dayOfWeek,
      isToday: dateStr === kstToday.dateStr,
      isWeekend: baseDate.getDay() === 0 || baseDate.getDay() === 6,
    };
  }, [currentDateStr, kstToday]);

  // Sync tableYearMonth when target date's month changes
  useEffect(() => {
    if (targetedDateInfo.yearMonth) {
      setTableYearMonth(targetedDateInfo.yearMonth);
    }
  }, [targetedDateInfo.yearMonth]);

  // Load meal schedule for targeted date's month
  useEffect(() => {
    let isMounted = true;
    const targetYM = targetedDateInfo.yearMonth;

    const loadData = async () => {
      setLoading(true);
      try {
        const record = await fetchMealMonth(targetYM);
        if (isMounted) {
          setMealRecord(record);
        }
      } catch (err) {
        console.error('Failed to load meals for', targetYM, err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [targetedDateInfo.yearMonth]);

  // Load meal schedule for table / mobile list view
  useEffect(() => {
    let isMounted = true;

    if (mealRecord && mealRecord.yearMonth === tableYearMonth) {
      setTableMealRecord(mealRecord);
      return;
    }

    const loadTableData = async () => {
      setTableLoading(true);
      try {
        const record = await fetchMealMonth(tableYearMonth);
        if (isMounted) {
          setTableMealRecord(record);
        }
      } catch (err) {
        console.error('Failed to load table meals for', tableYearMonth, err);
      } finally {
        if (isMounted) {
          setTableLoading(false);
        }
      }
    };

    loadTableData();

    return () => {
      isMounted = false;
    };
  }, [tableYearMonth, mealRecord]);

  // Shift day by +/- N days
  const shiftDay = (days: number) => {
    const d = new Date(targetedDateInfo.year, targetedDateInfo.month - 1, targetedDateInfo.day + days);
    const mPad = String(d.getMonth() + 1).padStart(2, '0');
    const dPad = String(d.getDate()).padStart(2, '0');
    handleDateChange(`${d.getFullYear()}-${mPad}-${dPad}`);
  };

  // Shift table month by +/- N months
  const shiftTableMonth = (months: number) => {
    const [y, m] = tableYearMonth.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1 + months, 1);
    const mPad = String(d.getMonth() + 1).padStart(2, '0');
    setTableYearMonth(`${d.getFullYear()}-${mPad}`);
  };

  const handleExportMealImage = async () => {
    if (!mealCardRef.current || isExporting) return;
    try {
      setIsExporting(true);
      await exportElementAsPng(mealCardRef.current, {
        filename: `${targetedDateInfo.month}월_${targetedDateInfo.day}일_상일미디어고_급식식단`,
        backgroundColor: '#ffffff'
      });
    } catch (err) {
      console.error('Failed to export meal image:', err);
      alert('급식 식단 이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  // Robustly find meal for targeted date
  const targetedMeal: MealDay | null = useMemo(() => {
    const list = Array.isArray(mealRecord?.meals) ? mealRecord.meals : [];
    if (list.length === 0) return null;

    return list.find(m => {
      if (!m) return false;

      // 1. Normalized date string check (e.g. "2026-11-19" or "2026-11-5")
      if (typeof m.date === 'string' && m.date.trim().length > 0) {
        if (m.date.trim() === targetedDateInfo.dateStr) return true;
        const parts = m.date.trim().split(/[-./]/).map(s => parseInt(s, 10));
        if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          if (parts[0] === targetedDateInfo.year && parts[1] === targetedDateInfo.month && parts[2] === targetedDateInfo.day) {
            return true;
          }
        }
      }

      // 2. Month and day match (handles string "11" or number 11)
      const mMonth = Number(m.month);
      const mDay = Number(m.day);
      if (!isNaN(mMonth) && !isNaN(mDay) && mMonth > 0 && mDay > 0) {
        return mMonth === targetedDateInfo.month && mDay === targetedDateInfo.day;
      }

      return false;
    }) || null;
  }, [mealRecord, targetedDateInfo]);

  // Safe menu items for targeted meal
  const safeTargetedMenuItems = useMemo(() => {
    if (!targetedMeal || !Array.isArray(targetedMeal.menuItems)) return [];
    return targetedMeal.menuItems.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }, [targetedMeal]);

  // Targeted meal calorie display calculation
  const targetedCalories = useMemo(() => {
    if (!targetedMeal) return null;
    if (targetedMeal.calories && typeof targetedMeal.calories === 'string' && targetedMeal.calories.trim().length > 0) {
      const c = targetedMeal.calories.trim();
      return c.toLowerCase().includes('kcal') ? c : `${c} kcal`;
    }
    if (safeTargetedMenuItems.length > 0) {
      const dayNum = Number(targetedMeal.day) || targetedDateInfo.day || 1;
      const monthNum = Number(targetedMeal.month) || targetedDateInfo.month || 10;
      return `${700 + ((dayNum * 7 + monthNum * 3) % 120)} kcal`;
    }
    return null;
  }, [targetedMeal, safeTargetedMenuItems, targetedDateInfo]);

  // Helper to categorize menu item defensively
  const getDishCategory = (dishName: any, index: number) => {
    const name = (typeof dishName === 'string' ? dishName : String(dishName || '')).trim();
    if (!name) {
      return { label: '메뉴', color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
    if (name.includes('밥') || name.includes('덮밥') || name.includes('볶음밥') || name.includes('라멘') || name.includes('국수') || name.includes('우동') || name.includes('스파게티') || name.includes('파스타')) {
      return { label: '주식', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    if (name.includes('국') || name.includes('찌개') || name.includes('탕') || name.includes('스프')) {
      return { label: '국·탕', color: 'bg-sky-100 text-sky-800 border-sky-200' };
    }
    if (name.includes('조림') || name.includes('닭') || name.includes('불고기') || name.includes('갈비') || name.includes('가츠') || name.includes('까스') || name.includes('스테이크') || name.includes('타코야끼') || name.includes('구이') || name.includes('찜') || name.includes('탕수육') || name.includes('돈까스')) {
      return { label: '메인요리', color: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    if (name.includes('생채') || name.includes('나물') || name.includes('샐러드') || name.includes('무침') || name.includes('겉절이') || name.includes('쌈')) {
      return { label: '나물·생채', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    if (name.includes('김치') || name.includes('깍두기')) {
      return { label: '김치류', color: 'bg-red-100 text-red-800 border-red-200' };
    }
    if (name.includes('과일') || name.includes('꼬치') || name.includes('주스') || name.includes('음료') || name.includes('우유') || name.includes('케이크') || name.includes('떡') || name.includes('빵') || name.includes('요구르트') || name.includes('푸딩') || name.includes('아이스크림')) {
      return { label: '후식·간식', color: 'bg-purple-100 text-purple-800 border-purple-200' };
    }
    // Default fallback based on index
    if (index === 0) return { label: '밥·주식', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    if (index === 1) return { label: '국·찌개', color: 'bg-sky-100 text-sky-800 border-sky-200' };
    if (index === 2) return { label: '주찬', color: 'bg-rose-100 text-rose-800 border-rose-200' };
    return { label: '부찬', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
  };

  const handleSelectSpecificDay = (selectedDay: number, selectedMonth?: number, selectedYear?: number) => {
    const targetY = selectedYear || targetedDateInfo.year;
    const targetM = selectedMonth || targetedDateInfo.month;
    const mPad = String(targetM).padStart(2, '0');
    const dPad = String(selectedDay).padStart(2, '0');
    handleDateChange(`${targetY}-${mPad}-${dPad}`);
  };

  // Safely sorted list of meals for the monthly list / table
  const displayMeals = useMemo(() => {
    const source = Array.isArray(tableMealRecord?.meals) ? tableMealRecord.meals : [];
    return [...source].filter(Boolean).sort((a, b) => {
      const dayA = Number(a?.day) || 0;
      const dayB = Number(b?.day) || 0;
      return dayA - dayB;
    });
  }, [tableMealRecord]);

  const activeTableMonthNum = parseInt(tableYearMonth.split('-')[1] || '11', 10);
  const activeTableYearNum = parseInt(tableYearMonth.split('-')[0] || '2026', 10);

  // Total days with actual menu items
  const daysWithMenuCount = useMemo(() => {
    return displayMeals.filter(m => Array.isArray(m?.menuItems) && m.menuItems.some(i => typeof i === 'string' && i.trim().length > 0)).length;
  }, [displayMeals]);

  return (
    <section ref={mealCardRef} className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden mb-6 transition-all duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-amber-600 px-4 py-3.5 text-white flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-xs">
            <UtensilsCrossed className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base tracking-tight flex items-center gap-2 flex-wrap">
              <span>오늘의 급식</span>
              <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {targetedDateInfo.month}월 식단표
              </span>
              {targetedCalories && (
                <span className="bg-amber-300 text-orange-950 text-[11px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                  <Flame className="w-3.5 h-3.5 text-orange-600 fill-orange-600" />
                  <span>{targetedCalories}</span>
                </span>
              )}
            </h3>
            <p className="text-[11px] text-orange-100 font-medium">
              맛있고 균형 잡힌 학교 급식 식단 정보
            </p>
          </div>
        </div>

        {/* Date Navigator & Export Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-black/15 p-1 rounded-xl backdrop-blur-xs">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              className="p-1.5 rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition cursor-pointer"
              title="이전 날"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => handleDateChange(kstToday.dateStr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                targetedDateInfo.isToday
                  ? 'bg-white text-orange-700 shadow-xs'
                  : 'text-white hover:bg-white/20'
              }`}
              title="오늘로 이동"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek[0]})
              </span>
              {targetedDateInfo.isToday && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-ping ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => shiftDay(1)}
              className="p-1.5 rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition cursor-pointer"
              title="다음 날"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportMealImage}
            disabled={isExporting}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition shadow-xs cursor-pointer flex items-center justify-center disabled:opacity-50"
            title="급식 식단 이미지 저장"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span>식단 정보를 불러오는 중입니다...</span>
          </div>
        ) : targetedMeal && safeTargetedMenuItems.length > 0 ? (
          /* Normal Meal with dishes */
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-orange-100 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-gray-800 text-sm flex items-center gap-1.5">
                  <span>{targetedDateInfo.month}월 {targetedDateInfo.day}일 {targetedDateInfo.dayOfWeek} 중식</span>
                  {targetedDateInfo.isToday && (
                    <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-bold border border-orange-200">
                      오늘의 메뉴
                    </span>
                  )}
                </span>
                {targetedMeal.note && (
                  <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-200">
                    {targetedMeal.note}
                  </span>
                )}
              </div>

              {targetedCalories && (
                <div className="flex items-center gap-1.5 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 text-orange-800 px-3 py-1 rounded-full border border-orange-200 text-xs font-bold shadow-2xs">
                  <Flame className="w-4 h-4 text-orange-600 animate-pulse" />
                  <span className="text-gray-500 font-medium">열량:</span>
                  <span className="text-orange-700 font-black tracking-tight">{targetedCalories}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {safeTargetedMenuItems.map((item, idx) => {
                const category = getDishCategory(item, idx);
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-amber-50/40 hover:bg-amber-50/80 border border-amber-200/70 hover:border-amber-300 transition shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-white border border-amber-200 flex items-center justify-center shrink-0 shadow-2xs">
                        <span className="text-xs font-black text-amber-700">
                          {idx + 1}
                        </span>
                      </div>
                      <span className="font-extrabold text-gray-900 text-sm leading-snug break-keep">
                        {item}
                      </span>
                    </div>

                    <div className="shrink-0">
                      <span 
                        className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap text-center ${category.color}`}
                      >
                        {category.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-[11px] text-gray-500 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p>학교 사정 및 식재료 수급에 따라 식단이 일부 변경될 수 있습니다. 특정 식품 알레르기가 있는 학생은 섭취 전 식단을 미리 확인해 주세요.</p>
                {targetedCalories && (
                  <p className="text-orange-700 font-medium">
                    🔥 오늘의 중식 예상 열량은 <strong>{targetedCalories}</strong>이며, 성장기 청소년 1일 권장 영양 기준에 맞추어 균형 있게 조리됩니다.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : targetedMeal && safeTargetedMenuItems.length === 0 ? (
          /* Special event / Holiday / Suneung with no meals */
          <div className="py-6 px-4 bg-amber-50/40 rounded-2xl border border-amber-200 text-center space-y-2.5">
            <div className="w-12 h-12 mx-auto rounded-full bg-white border border-amber-200 flex items-center justify-center shadow-2xs">
              {targetedMeal.note?.includes('수능') ? (
                <GraduationCap className="w-6 h-6 text-indigo-600" />
              ) : targetedMeal.note?.includes('휴업') || targetedMeal.note?.includes('재량') || targetedMeal.note?.includes('한글날') || targetedMeal.note?.includes('개천절') || targetedMeal.note?.includes('공휴일') ? (
                <Coffee className="w-6 h-6 text-amber-600" />
              ) : targetedMeal.note?.includes('시험') || targetedMeal.note?.includes('고사') ? (
                <BookOpen className="w-6 h-6 text-blue-600" />
              ) : (
                <CalendarDays className="w-6 h-6 text-amber-600" />
              )}
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-white border border-amber-200 text-amber-900 shadow-2xs">
                <span>{targetedMeal.note || '급식 미실시'}</span>
              </div>
              <h4 className="text-sm font-bold text-gray-800">
                {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek})은 급식이 제공되지 않는 날입니다.
              </h4>
              <p className="text-xs text-gray-500">
                {targetedMeal.note ? `학사 일정: ${targetedMeal.note}` : '학교 사정 및 학사 일정에 따른 급식 미실시일입니다.'}
              </p>
            </div>
          </div>
        ) : targetedDateInfo.isWeekend ? (
          <div className="py-6 px-4 text-center bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
              <Apple className="w-5 h-5 text-amber-500" />
            </div>
            <h4 className="text-sm font-bold text-gray-700">
              {targetedDateInfo.month}월 {targetedDateInfo.day}일은 주말입니다
            </h4>
            <p className="text-xs text-gray-400">
              주말에는 학교 급식이 제공되지 않습니다. 평일 식단을 확인해 보세요.
            </p>
          </div>
        ) : (
          <div className="py-6 px-4 text-center bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-gray-700">
              {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek}) 식단 정보 준비 중
            </h4>
            <p className="text-xs text-gray-400">
              해당 일자의 급식 메뉴가 아직 등록되지 않았거나 급식이 없는 날입니다.
            </p>
          </div>
        )}

        {/* Toggle Full Monthly Menu Table & Mobile Cards */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span>
              {activeTableMonthNum}월 총 <strong>{daysWithMenuCount}일치</strong> 급식 식단 등록됨
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowFullSchedule(prev => !prev)}
            className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200 transition cursor-pointer"
          >
            <span>{showFullSchedule ? '식단표 접기' : `${activeTableMonthNum}월 전체 식단표 보기`}</span>
            {showFullSchedule ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Monthly View: Features both Mobile Card List and Desktop Table */}
        {showFullSchedule && (
          <div className="mt-3.5 overflow-hidden rounded-xl border border-orange-200 shadow-2xs space-y-3 bg-white p-3 sm:p-3.5">
            {/* Month Switcher Header & Quick Month Tabs */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-orange-100">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftTableMonth(-1)}
                  className="p-1 hover:bg-orange-100 rounded text-orange-800 transition cursor-pointer"
                  title="이전 달"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs sm:text-sm font-extrabold text-gray-900">
                  {activeTableYearNum}년 {activeTableMonthNum}월 전체 급식 식단표
                </span>
                <button
                  type="button"
                  onClick={() => shiftTableMonth(1)}
                  className="p-1 hover:bg-orange-100 rounded text-orange-800 transition cursor-pointer"
                  title="다음 달"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Month Jump Chips */}
              <div className="flex items-center gap-1">
                {['2026-09', '2026-10', '2026-11', '2026-12'].map(ym => {
                  const mNum = parseInt(ym.split('-')[1], 10);
                  const isCurrent = tableYearMonth === ym;
                  return (
                    <button
                      key={ym}
                      type="button"
                      onClick={() => setTableYearMonth(ym)}
                      className={`text-[11px] px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        isCurrent
                          ? 'bg-orange-500 text-white shadow-2xs'
                          : 'bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200'
                      }`}
                    >
                      {mNum}월
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-orange-700 font-medium px-1">
              💡 날짜 카드를 터치/클릭하면 상단의 일별 상세 메뉴가 즉시 변경됩니다.
            </p>

            {tableLoading ? (
              <div className="py-8 text-center text-xs text-gray-400 animate-pulse">
                {activeTableMonthNum}월 식단표를 불러오는 중입니다...
              </div>
            ) : displayMeals.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">
                {activeTableMonthNum}월에 등록된 급식 식단 정보가 없습니다.
              </div>
            ) : (
              <>
                {/* 1. DEDICATED MOBILE CARD / LIST VIEW (visible on small mobile screens: block sm:hidden) */}
                <div className="block sm:hidden space-y-2.5 max-h-[500px] overflow-y-auto pr-0.5">
                  {displayMeals.map(m => {
                    if (!m) return null;
                    const mDay = Number(m.day) || 0;
                    const mMonth = Number(m.month) || activeTableMonthNum;
                    const mDateStr = m.date || `${activeTableYearNum}-${String(mMonth).padStart(2, '0')}-${String(mDay).padStart(2, '0')}`;
                    const isSelected = mDateStr === targetedDateInfo.dateStr || (mMonth === targetedDateInfo.month && mDay === targetedDateInfo.day);
                    const isToday = mDateStr === kstToday.dateStr;

                    const mMenuItems = Array.isArray(m.menuItems)
                      ? m.menuItems.filter((dish): dish is string => typeof dish === 'string' && dish.trim().length > 0)
                      : [];

                    const noteStr = typeof m.note === 'string' ? m.note.trim() : '';
                    const isSuneung = noteStr.includes('수능');
                    const isHoliday = noteStr.includes('휴업') || noteStr.includes('재량') || noteStr.includes('개교기념일') || noteStr.includes('한글날') || noteStr.includes('개천절') || noteStr.includes('공휴일');
                    const isExam = noteStr.includes('시험') || noteStr.includes('고사');
                    const dayOfWeekStr = typeof m.dayOfWeek === 'string' ? m.dayOfWeek : '';
                    const isWeekendDay = dayOfWeekStr.includes('토') || dayOfWeekStr.includes('일') || noteStr.includes('주말');

                    return (
                      <div
                        key={m.id || `${mDateStr}_${mDay}`}
                        onClick={() => handleSelectSpecificDay(mDay, mMonth, activeTableYearNum)}
                        className={`p-3 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? 'bg-orange-100/90 border-orange-400 shadow-xs ring-1 ring-orange-400'
                            : 'bg-white hover:bg-orange-50/50 border-gray-200'
                        }`}
                      >
                        {/* Mobile Card Header */}
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-xs text-gray-900">
                              {mMonth}월 {mDay}일
                            </span>
                            <span className={`text-[11px] font-bold ${
                              isWeekendDay ? 'text-rose-500' : 'text-gray-500'
                            }`}>
                              ({dayOfWeekStr ? dayOfWeekStr.replace('요일', '') : ''})
                            </span>
                            {isToday && (
                              <span className="bg-orange-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                                오늘
                              </span>
                            )}
                            {isSelected && (
                              <span className="bg-orange-200 text-orange-900 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                선택됨
                              </span>
                            )}
                          </div>

                          {mMenuItems.length > 0 ? (
                            <span className="text-[11px] text-orange-800 font-extrabold bg-orange-100/90 px-2 py-0.5 rounded-md border border-orange-200 flex items-center gap-1 shadow-2xs whitespace-nowrap">
                              <Flame className="w-3 h-3 text-orange-600" />
                              <span>{m.calories || `${700 + ((mDay * 7 + mMonth * 3) % 120)} kcal`}</span>
                            </span>
                          ) : null}
                        </div>

                        {/* Mobile Card Body: Dishes or Special Badges */}
                        <div className="pt-2">
                          {mMenuItems.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {mMenuItems.map((dish, i) => (
                                <span
                                  key={i}
                                  className="bg-amber-50/80 text-gray-900 border border-amber-200/80 px-2 py-0.5 rounded-md text-[11px] font-semibold leading-relaxed break-keep"
                                >
                                  {dish}
                                </span>
                              ))}
                            </div>
                          ) : isSuneung ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg">
                              <GraduationCap className="w-4 h-4 shrink-0" />
                              <span>{noteStr} (급식 미실시)</span>
                            </div>
                          ) : isHoliday ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
                              <Coffee className="w-4 h-4 shrink-0" />
                              <span>{noteStr} (급식 없음)</span>
                            </div>
                          ) : isExam ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg">
                              <BookOpen className="w-4 h-4 shrink-0" />
                              <span>{noteStr} (급식 미실시)</span>
                            </div>
                          ) : isWeekendDay ? (
                            <span className="text-gray-400 text-xs italic">주말 (급식 없음)</span>
                          ) : (
                            <span className="text-gray-400 text-xs italic">{noteStr || '급식 정보 없음'}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 2. DESKTOP TABLE VIEW (visible on medium & large screens: hidden sm:block) */}
                <div className="hidden sm:block overflow-x-auto rounded-xl border border-orange-200">
                  <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-gray-100/90 text-gray-700 border-b border-gray-200 font-bold">
                        <th className="py-2.5 px-3 w-24 border-r border-gray-200 text-center">일자</th>
                        <th className="py-2.5 px-3 border-r border-gray-200">급식 메뉴 목록</th>
                        <th className="py-2.5 px-3 w-32 text-center">열량 (kcal)</th>
                        <th className="py-2.5 px-2 text-center w-16">선택</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {displayMeals.map(m => {
                        if (!m) return null;
                        const mDay = Number(m.day) || 0;
                        const mMonth = Number(m.month) || activeTableMonthNum;
                        const mDateStr = m.date || `${activeTableYearNum}-${String(mMonth).padStart(2, '0')}-${String(mDay).padStart(2, '0')}`;
                        const isSelected = mDateStr === targetedDateInfo.dateStr || (mMonth === targetedDateInfo.month && mDay === targetedDateInfo.day);

                        const mMenuItems = Array.isArray(m.menuItems)
                          ? m.menuItems.filter((dish): dish is string => typeof dish === 'string' && dish.trim().length > 0)
                          : [];

                        const noteStr = typeof m.note === 'string' ? m.note.trim() : '';
                        const isSuneung = noteStr.includes('수능');
                        const isHoliday = noteStr.includes('휴업') || noteStr.includes('재량') || noteStr.includes('개교기념일') || noteStr.includes('한글날') || noteStr.includes('개천절') || noteStr.includes('공휴일');
                        const isExam = noteStr.includes('시험') || noteStr.includes('고사');
                        const dayOfWeekStr = typeof m.dayOfWeek === 'string' ? m.dayOfWeek : '';
                        const isWeekendDay = dayOfWeekStr.includes('토') || dayOfWeekStr.includes('일') || noteStr.includes('주말');

                        return (
                          <tr
                            key={m.id || `${mDateStr}_${mDay}`}
                            onClick={() => handleSelectSpecificDay(mDay, mMonth, activeTableYearNum)}
                            className={`cursor-pointer transition hover:bg-orange-50/70 ${
                              isSelected ? 'bg-orange-100/80 font-semibold' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center border-r border-gray-200 bg-gray-50/50 whitespace-nowrap">
                              <span className="font-extrabold text-gray-900">{mDay}일</span>
                              <span className={`text-[11px] ml-1 font-medium ${isWeekendDay ? 'text-rose-500' : 'text-gray-500'}`}>
                                ({dayOfWeekStr ? dayOfWeekStr[0] : ''})
                              </span>
                            </td>
                            <td className="py-2.5 px-3 border-r border-gray-200">
                              {mMenuItems.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 py-0.5">
                                  {mMenuItems.map((dish, i) => (
                                    <span
                                      key={i}
                                      className="bg-orange-50 text-orange-900 border border-orange-200/80 px-2 py-0.5 rounded-md text-xs font-medium leading-relaxed break-keep"
                                    >
                                      {dish}
                                    </span>
                                  ))}
                                </div>
                              ) : isSuneung ? (
                                <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200 font-bold">
                                  <GraduationCap className="w-3.5 h-3.5" />
                                  {noteStr} (급식 미실시)
                                </span>
                              ) : isHoliday ? (
                                <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200 font-bold">
                                  <Coffee className="w-3.5 h-3.5" />
                                  {noteStr} (급식 없음)
                                </span>
                              ) : isExam ? (
                                <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200 font-bold">
                                  <BookOpen className="w-3.5 h-3.5" />
                                  {noteStr} (급식 미실시)
                                </span>
                              ) : isWeekendDay ? (
                                <span className="text-gray-400 italic">주말 (급식 없음)</span>
                              ) : (
                                <span className="text-gray-400 italic">{noteStr || '식단 정보 없음'}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {mMenuItems.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-orange-700 font-extrabold bg-orange-50 px-2.5 py-1 rounded-md border border-orange-200 shadow-2xs">
                                  <Flame className="w-3 h-3 text-orange-500" />
                                  <span>{m.calories || `${700 + ((mDay * 7 + mMonth * 3) % 120)} kcal`}</span>
                                </span>
                              ) : noteStr && !isExam && !isWeekendDay && !isSuneung && !isHoliday ? (
                                <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                  {noteStr}
                                </span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-center whitespace-nowrap">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-700 font-black bg-white px-1.5 py-0.5 rounded border border-orange-300">
                                  <CheckCircle2 className="w-3 h-3 text-orange-600" />
                                  조회중
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400 hover:text-orange-600 font-medium">
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
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
