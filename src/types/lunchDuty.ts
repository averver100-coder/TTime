export interface LunchDutyDay {
  id: string;             // e.g. "2026-09-01"
  date: string;           // "YYYY-MM-DD" e.g. "2026-09-01"
  month: number;          // 9
  day: number;            // 1
  dayOfWeek?: string;     // "화요일" or "화"
  generalTeacher?: string; // 총괄지도
  grade3Teacher?: string;  // 3학년
  grade2Teacher?: string;  // 2학년
  grade1Teacher?: string;  // 1학년
  teachers: string[];     // ["윤춘삼", "조원경", "임수경", "위혜선"]
  note?: string;          // e.g. "단축수업", "시험"
}

export interface LunchDutyMonthRecord {
  yearMonth: string;      // "2026-09"
  year: number;           // 2026
  month: number;          // 9
  title?: string;         // "2026년 9월 급식감독"
  updatedAt?: string;     // ISO timestamp
  duties: LunchDutyDay[];
}
