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

export interface ClassTimetable {
  classCode: string; // e.g. "101", "203", "311"
  grade: number;     // 1, 2, 3
  classNum: number;  // 1, 2, ..., 11
  timetable: {
    [day: string]: {
      [period: number]: string; // teacher name(s) e.g. "장미경", "최민진", "이선애, 김가영"
    };
  };
}

export const formatClassTitle = (classCode: string): string => {
  if (!classCode) return '';
  const trimmed = classCode.trim();
  if (/^\d{3}$/.test(trimmed)) {
    const grade = trimmed.charAt(0);
    const classNum = parseInt(trimmed.substring(1), 10);
    return `${grade}학년 ${classNum}반`;
  }
  return trimmed;
};

/**
 * Calculates a match score (lower is better, 999 = no match) for class searches.
 * Handles:
 * - Shorthand without zero: "11" -> 1학년 1반, "25" -> 2학년 5반, "311" -> 3학년 11반
 * - Shorthand with '반': "11반", "25반", "311반"
 * - Official class codes: "101", "205", "311"
 * - Hyphenated formats: "1-1", "2-5", "3-11", "1-01"
 * - Korean natural text: "1학년 1반", "1학년1반", "1학년 1", "2학년 5", "3학년 11"
 * - Prefix matching: "1", "2", "3", "10", "1-", etc.
 */
export const getClassMatchScore = (classItem: ClassTimetable, rawQuery: string): number => {
  if (!rawQuery) return 999;
  const q = rawQuery.trim().replace(/\s+/g, '');
  if (!q) return 999;

  const code = classItem.classCode;
  const grade = String(classItem.grade);
  const classNum = String(classItem.classNum);
  const shorthand = `${grade}${classNum}`; // e.g. "11", "25", "311"
  const koreanFull = `${grade}학년${classNum}반`;
  const koreanNoBan = `${grade}학년${classNum}`;
  const hyphenated = `${grade}-${classNum}`;
  const hyphenatedPad = `${grade}-${classNum.padStart(2, '0')}`;

  // 1. Exact shorthand match: "11" for 1-1, "25" for 2-5, "311" for 3-11, or with "반"
  if (q === shorthand || q === `${shorthand}반`) return 1;

  // 2. Exact code match: "101", "205", "311", or "101반"
  if (code.toLowerCase() === q.toLowerCase() || q === `${code}반`) return 2;

  // 3. Exact hyphen or Korean full match: "1-1", "1-1반", "1학년1반", "1학년1"
  if (
    q === hyphenated || 
    q === `${hyphenated}반` || 
    q === hyphenatedPad ||
    q === koreanFull || 
    q === koreanNoBan
  ) {
    return 3;
  }

  // 4. Korean grade exact match: "1학년", "2학년", "3학년"
  if (q === `${grade}학년`) return 4;

  // 5. Code prefix match: "10" matches "101", "102"
  if (code.startsWith(q)) return 5;

  // 6. Shorthand prefix match: e.g. "31" for "310", "311"
  if (shorthand.startsWith(q)) return 6;

  // 7. Hyphenated prefix match: "1-"
  if (hyphenated.startsWith(q)) return 7;

  // 8. Substring in Korean full title: e.g. "1학년 1"
  if (koreanFull.includes(q)) return 8;

  return 999;
};

/**
 * Checks if a class matches user query, including shorthand formats
 * like '11' (1학년 1반), '25' (2학년 5반), '311' (3학년 11반).
 */
export const matchClassCode = (classItem: ClassTimetable, rawQuery: string): boolean => {
  return getClassMatchScore(classItem, rawQuery) < 999;
};
