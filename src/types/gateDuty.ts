export interface GateDutyDay {
  id: string;             // e.g. "2026-09-15"
  date: string;           // "YYYY-MM-DD" e.g. "2026-09-15"
  month: number;          // 9
  day: number;            // 15
  dayOfWeek?: string;     // "화요일" or "화"
  teachers: string[];     // ["김영석", "위혜선"]
  note?: string;          // e.g. "중간고사"
}

export interface GateDutyMonthRecord {
  yearMonth: string;      // "2026-09"
  year: number;           // 2026
  month: number;          // 9
  title?: string;         // "2026년 9월 교문지도"
  updatedAt?: string;     // ISO timestamp
  duties: GateDutyDay[];
}
