export type NotificationType = 
  | 'FREE_PERIOD'      // 공강 발생
  | 'PERIOD_CHANGE'    // 수업 시간/교실 변경
  | 'SUBSTITUTION'     // 보강/대강 배정
  | 'NOTICE';          // 일반 긴급 시간표 공지

export interface ScheduleAlert {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  targetTeacher: string;    // Teacher name, or "ALL"
  targetDate?: string;      // "YYYY-MM-DD" e.g. "2026-09-22"
  dayOfWeek?: string;       // "화요일"
  period?: number;          // 1~7
  originalClass?: string;   // e.g. "2-3"
  newClass?: string;        // e.g. "공강"
  sender: string;           // "교무기획부"
  createdAt: number;        // timestamp ms
  readBy?: string[];        // list of reader IDs or teacher names
}

export interface TeacherFcmToken {
  token: string;
  teacherName?: string;
  deviceType?: string;
  updatedAt: number;
}
