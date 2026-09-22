export interface MealDay {
  id: string;             // e.g. "2026-09-22"
  date: string;           // "YYYY-MM-DD" e.g. "2026-09-22"
  month: number;          // 9
  day: number;            // 22
  dayOfWeek?: string;     // "화요일" or "화"
  menuItems: string[];    // ["발아현미밥", "아욱된장국", "고추장닭조림", "참나물 생채", "감자채볶음"]
  calories?: string;      // optional e.g. "685 kcal"
  originInfo?: string;    // optional
  note?: string;          // e.g. "중간고사", "단축수업"
}

export interface MealMonthRecord {
  yearMonth: string;      // "2026-09"
  year: number;           // 2026
  month: number;          // 9
  title?: string;         // "2026년 9월 식단표"
  updatedAt?: string;     // ISO timestamp
  meals: MealDay[];
}
