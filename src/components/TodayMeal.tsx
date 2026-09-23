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
  Loader2
} from 'lucide-react';
import { MealDay, MealMonthRecord } from '../types/meal';
import { fetchMealMonth } from '../lib/mealStore';
import { getKSTDate } from '../lib/gateDutyStore';
import { exportElementAsPng } from '../lib/exportImage';

interface TodayMealProps {
  onDateChange?: (dateStr: string) => void;
}

export const TodayMeal: React.FC<TodayMealProps> = () => {
  const [mealRecord, setMealRecord] = useState<MealMonthRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [showFullSchedule, setShowFullSchedule] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState(false);
  const mealCardRef = useRef<HTMLElement>(null);

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
    const yearMonth = `${year}-${mPad}`;

    return {
      dateStr,
      yearMonth,
      year,
      month,
      day,
      dayOfWeek,
      isToday: dayOffset === 0,
      isWeekend: baseDate.getDay() === 0 || baseDate.getDay() === 6,
    };
  }, [dayOffset]);

  // Load meal schedule when yearMonth of targeted date changes
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

  // Find meal for targeted date
  const targetedMeal: MealDay | null = useMemo(() => {
    if (!mealRecord || !mealRecord.meals) return null;
    return mealRecord.meals.find(m => {
      return m.date === targetedDateInfo.dateStr || (m.month === targetedDateInfo.month && m.day === targetedDateInfo.day);
    }) || null;
  }, [mealRecord, targetedDateInfo]);

  // Helper to categorize menu item
  const getDishCategory = (dishName: string, index: number) => {
    const name = dishName.trim();
    if (name.includes('밥') || name.includes('덮밥') || name.includes('볶음밥') || name.includes('라멘') || name.includes('국수') || name.includes('우동')) {
      return { label: '주식', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    if (name.includes('국') || name.includes('찌개') || name.includes('탕') || name.includes('스프')) {
      return { label: '국·탕', color: 'bg-sky-100 text-sky-800 border-sky-200' };
    }
    if (name.includes('조림') || name.includes('닭') || name.includes('불고기') || name.includes('갈비') || name.includes('가츠') || name.includes('까스') || name.includes('스테이크') || name.includes('타코야끼')) {
      return { label: '메인요리', color: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    if (name.includes('생채') || name.includes('나물') || name.includes('샐러드') || name.includes('무침')) {
      return { label: '나물·생채', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    if (name.includes('김치') || name.includes('깍두기')) {
      return { label: '김치류', color: 'bg-red-100 text-red-800 border-red-200' };
    }
    if (name.includes('과일') || name.includes('꼬치') || name.includes('주스') || name.includes('음료') || name.includes('우유') || name.includes('케이크') || name.includes('떡')) {
      return { label: '후식·간식', color: 'bg-purple-100 text-purple-800 border-purple-200' };
    }
    // Default fallback based on index
    if (index === 0) return { label: '밥·주식', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    if (index === 1) return { label: '국·찌개', color: 'bg-sky-100 text-sky-800 border-sky-200' };
    if (index === 2) return { label: '주찬', color: 'bg-rose-100 text-rose-800 border-rose-200' };
    return { label: '부찬', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
  };

  const handleSelectSpecificDay = (selectedDay: number, selectedMonth?: number, selectedYear?: number) => {
    const kst = getKSTDate();
    const targetY = selectedYear || targetedDateInfo.year;
    const targetM = (selectedMonth || targetedDateInfo.month) - 1; // 0-indexed for Date
    const targetDate = new Date(targetY, targetM, selectedDay);
    const todayDate = new Date(kst.year, kst.month - 1, kst.day);
    
    // Calculate difference in days
    const diffTime = targetDate.getTime() - todayDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    setDayOffset(diffDays);
  };

  return (
    <section ref={mealCardRef} className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden mb-6 transition-all duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-amber-600 px-4 py-3.5 text-white flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-xs">
            <UtensilsCrossed className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base tracking-tight flex items-center gap-1.5">
              <span>오늘의 급식</span>
              <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {targetedDateInfo.month}월 식단표
              </span>
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
              onClick={() => setDayOffset(prev => prev - 1)}
              className="p-1.5 rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition cursor-pointer"
              title="이전 날"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setDayOffset(0)}
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
              onClick={() => setDayOffset(prev => prev + 1)}
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
        ) : targetedMeal && targetedMeal.menuItems && targetedMeal.menuItems.length > 0 ? (
          /* When Menu Items are Available */
          <div className="space-y-4">
            {/* Status & Calorie Bar */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-gray-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-gray-800 flex items-center gap-1">
                  <span>{targetedDateInfo.month}월 {targetedDateInfo.day}일 {targetedDateInfo.dayOfWeek} 중식</span>
                  {targetedDateInfo.isToday && (
                    <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-full font-bold border border-orange-200">
                      오늘의 메뉴
                    </span>
                  )}
                </span>
              </div>

              {targetedMeal.calories && (
                <div className="flex items-center gap-1 text-[11px] text-gray-500 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100 font-medium">
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  <span>열량: <strong className="text-orange-700">{targetedMeal.calories}</strong></span>
                </div>
              )}
            </div>

            {/* Menu Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {targetedMeal.menuItems.map((item, idx) => {
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

            {/* Nutrition / Allergen Tip */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-[11px] text-gray-500 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <span>학교 사정 및 식재료 수급에 따라 식단이 일부 변경될 수 있습니다. 특정 식품 알레르기가 있는 학생은 섭취 전 식단을 미리 확인해 주세요.</span>
              </div>
            </div>
          </div>
        ) : targetedMeal && targetedMeal.note === '중간고사' ? (
          /* Midterm Exam Period Banner */
          <div className="py-6 px-4 text-center bg-blue-50/70 rounded-2xl border border-blue-200 space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-extrabold text-blue-950">
              {targetedDateInfo.month}월 {targetedDateInfo.day}일 ({targetedDateInfo.dayOfWeek}) — 중간고사 기간
            </h4>
            <p className="text-xs text-blue-800/80 max-w-md mx-auto leading-relaxed">
              2학기 중간고사 시험 기간으로 정규 급식이 제공되지 않거나 조기 귀가 일정이 진행됩니다.
            </p>
          </div>
        ) : targetedDateInfo.isWeekend ? (
          /* Weekend */
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
          /* No Meal Recorded */
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

        {/* Toggle Full Monthly Menu Table */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span>
              {mealRecord && mealRecord.meals && mealRecord.meals.length > 0 ? (
                <>
                  {targetedDateInfo.month}월 총 <strong>{mealRecord.meals.filter(m => m.menuItems && m.menuItems.length > 0).length}일치</strong> 급식 식단 등록됨
                </>
              ) : (
                '등록된 식단 확인'
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowFullSchedule(prev => !prev)}
            className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200 transition cursor-pointer"
          >
            <span>{showFullSchedule ? '식단표 접기' : `${targetedDateInfo.month}월 전체 식단표 보기`}</span>
            {showFullSchedule ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Monthly Table View (Matching Uploaded Document / Firestore) */}
        {showFullSchedule && (
          <div className="mt-3.5 overflow-hidden rounded-xl border border-orange-200 shadow-2xs">
            <div className="bg-orange-50 px-3 py-2 border-b border-orange-200 flex items-center justify-between text-xs font-bold text-orange-950">
              <span>{targetedDateInfo.month}월 전체 급식 식단표</span>
              <span className="text-[11px] text-orange-700 font-medium">행을 클릭하면 해당 일자로 이동합니다</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-gray-100/90 text-gray-700 border-b border-gray-200 font-bold">
                    <th className="py-2.5 px-3 w-20 border-r border-gray-200 text-center">일자</th>
                    <th className="py-2.5 px-3 border-r border-gray-200">급식 메뉴 목록</th>
                    <th className="py-2.5 px-3 w-28 text-center">열량 / 비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {mealRecord && mealRecord.meals && mealRecord.meals.length > 0 ? (
                    mealRecord.meals.map(m => {
                      const isSelected = targetedDateInfo.day === m.day;
                      const isExam = m.note && m.note.includes('시험') || m.note === '중간고사' || m.note === '기말고사';
                      const isWeekendDay = m.dayOfWeek === '토요일' || m.dayOfWeek === '일요일' || m.note === '주말';

                      return (
                        <tr
                          key={m.id}
                          onClick={() => handleSelectSpecificDay(m.day, m.month || targetedDateInfo.month, targetedDateInfo.year)}
                          className={`cursor-pointer transition hover:bg-orange-50/70 ${
                            isSelected ? 'bg-orange-100/70 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center border-r border-gray-200 bg-gray-50/50 whitespace-nowrap">
                            <span className="font-extrabold text-gray-900">{m.day}일</span>
                            <span className="text-[11px] text-gray-500 ml-1">({(m.dayOfWeek || '')[0]})</span>
                          </td>
                          <td className="py-2.5 px-3 border-r border-gray-200">
                            {m.menuItems && m.menuItems.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 py-0.5">
                                {m.menuItems.map((dish, i) => (
                                  <span
                                    key={i}
                                    className="bg-orange-50 text-orange-900 border border-orange-200/80 px-2 py-0.5 rounded-md text-xs font-medium leading-relaxed break-keep"
                                  >
                                    {dish}
                                  </span>
                                ))}
                              </div>
                            ) : isExam ? (
                              <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 font-bold">
                                {m.note} (급식 미실시)
                              </span>
                            ) : isWeekendDay ? (
                              <span className="text-gray-400 italic">주말 (급식 없음)</span>
                            ) : (
                              <span className="text-gray-400 italic">{m.note || '식단 정보 없음'}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {m.calories && (
                              <span className="text-orange-700 font-bold block">{m.calories}</span>
                            )}
                            {m.note && !isExam && !isWeekendDay && (
                              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {m.note}
                              </span>
                            )}
                            {!m.calories && !m.note && (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-gray-400">
                        등록된 월간 식단 정보가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
