export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';

export interface Period {
  period: number;
  start: string; // HH:mm
  end: string;   // HH:mm
}

export const periods: Period[] = [
  { period: 1, start: '08:30', end: '09:20' },
  { period: 2, start: '09:30', end: '10:20' },
  { period: 3, start: '10:30', end: '11:20' },
  { period: 4, start: '11:30', end: '12:20' },
  { period: 5, start: '13:20', end: '14:10' },
  { period: 6, start: '14:20', end: '15:10' },
  { period: 7, start: '15:20', end: '16:10' },
];

export const dayNames: Record<DayOfWeek, string> = {
  Mon: '월요일',
  Tue: '화요일',
  Wed: '수요일',
  Thu: '목요일',
  Fri: '금요일',
};

export const dayNamesShort: Record<DayOfWeek, string> = {
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
};

// Map day index (0=Sun, 1=Mon, ..., 6=Sat) to DayOfWeek
export const getDayFromIndex = (index: number): DayOfWeek | null => {
  switch (index) {
    case 1: return 'Mon';
    case 2: return 'Tue';
    case 3: return 'Wed';
    case 4: return 'Thu';
    case 5: return 'Fri';
    default: return null; // Weekend
  }
};

export const getCurrentTimeMinutes = (date: Date = new Date()): number => {
  return date.getHours() * 60 + date.getMinutes();
};

export const parseTimeString = (timeStr: string): number => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

export interface TeacherTimetable {
  [day: string]: {
    [period: number]: string; // classroom e.g. "101" -> "1학년 1반"
  };
}

export interface Teacher {
  id: string;
  name: string;
  homeroom: string; // e.g. "101"
  timetable: TeacherTimetable;
}

export const formatClassroom = (classroomCode: string) => {
  if (!classroomCode || classroomCode.trim() === '') return '';
  if (/^\d{3}$/.test(classroomCode)) {
    const grade = classroomCode.charAt(0);
    const classNum = parseInt(classroomCode.substring(1), 10);
    return `${grade}학년 ${classNum}반`;
  }
  return classroomCode;
};

export const formatClassroomShort = (classroomCode: string) => {
  if (!classroomCode || classroomCode.trim() === '') return '';
  const trimmed = classroomCode.trim();
  if (/^\d{3}$/.test(trimmed)) {
    const grade = trimmed.charAt(0);
    const classNum = parseInt(trimmed.substring(1), 10);
    return `${grade}-${classNum}`;
  }
  const match = trimmed.match(/^(\d)학년\s*(\d+)반$/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return trimmed;
};

// Korean initial consonants (19 초성)
export const KOREAN_CONSONANTS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export const getInitialConsonant = (char: string): string => {
  if (!char) return '#';
  const code = char.charCodeAt(0) - 44032;
  if (code < 0 || code > 11171) return '#';
  const initialIndex = Math.floor(code / 588);
  return KOREAN_CONSONANTS[initialIndex] || '#';
};

export const getChosungChar = (ch: string): string => {
  if (!ch) return '';
  const code = ch.charCodeAt(0) - 44032;
  if (code >= 0 && code <= 11171) {
    return KOREAN_CONSONANTS[Math.floor(code / 588)];
  }
  return ch;
};

export const getChosung = (str: string): string => {
  if (!str) return '';
  return Array.from(str).map(getChosungChar).join('');
};

/**
 * Searches a target string with full Korean Hangul and Chosung support.
 * Supports:
 * - Direct substring (e.g. "김가", "김가영")
 * - Pure Chosung substring (e.g. "ㄱㄱㅇ", "ㄱㄱ")
 * - Mixed partial Chosung (e.g. "김ㄱ", "ㄱ가")
 */
export const matchKorean = (target: string, query: string): boolean => {
  const t = (target || '').toLowerCase().replace(/\s+/g, '');
  const q = (query || '').toLowerCase().replace(/\s+/g, '');
  if (!q) return false;
  if (t.includes(q)) return true;

  if (t.length < q.length) return false;

  for (let i = 0; i <= t.length - q.length; i++) {
    let matches = true;
    for (let j = 0; j < q.length; j++) {
      const qChar = q[j];
      const tChar = t[i + j];
      const isQChosung = KOREAN_CONSONANTS.includes(qChar);

      if (isQChosung) {
        if (getChosungChar(tChar) !== qChar) {
          matches = false;
          break;
        }
      } else {
        if (tChar !== qChar) {
          matches = false;
          break;
        }
      }
    }
    if (matches) return true;
  }
  return false;
};
