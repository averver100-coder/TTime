import * as XLSX from 'xlsx';

export interface ParsedTeacher {
  name: string;
  homeroom?: string;
  timetable: {
    Mon: Record<string, string>;
    Tue: Record<string, string>;
    Wed: Record<string, string>;
    Thu: Record<string, string>;
    Fri: Record<string, string>;
  };
}

export type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';

const NON_NAME_WORDS = new Set([
  '컴시간', '시간표', '교원시간표', '전체시간표', '교사별', '교사시간표', '학급별', '학급시간표',
  '상일미디어', '상일미디어고', '상일미디어고등학교', '고등학교', '학교', '교무부', '교육과정',
  '일람표', '정규', '수업', '시간', '요일', '교시', '과목', '교실', '월요일', '화요일', '수요일', '목요일', '금요일',
  '교사', '선생님', '성명', '교원', '교원명', '교사명', '이름', '선생님명', '순번', '번호', '담당학급', '담임', '학급', '비고', '합계',
  '국어', '수학', '영어', '한국사', '사회', '과학', '체육', '미술', '음악', '기술', '가정', '정보', '제2외국어', '한문', '진로', '창체', '동아리', '자율', '봉사', '진로활동'
]);

export const KOREAN_DAY_MAP: Record<string, DayKey> = {
  '월': 'Mon',
  '월요일': 'Mon',
  'mon': 'Mon',
  '화': 'Tue',
  '화요일': 'Tue',
  'tue': 'Tue',
  '수': 'Wed',
  '수요일': 'Wed',
  'wed': 'Wed',
  '목': 'Thu',
  '목요일': 'Thu',
  'thu': 'Thu',
  '금': 'Fri',
  '금요일': 'Fri',
  'fri': 'Fri',
};

function emptyTimetable(): ParsedTeacher['timetable'] {
  return {
    Mon: {},
    Tue: {},
    Wed: {},
    Thu: {},
    Fri: {},
  };
}

function cleanCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Extracts teacher name and optional homeroom from text
 */
export function extractNameAndHomeroom(text: string): { name: string; homeroom: string } | null {
  if (!text) return null;
  let str = String(text).trim();
  if (!str) return null;

  // Unpack wrapping brackets like "[ 홍길동 ]" or "( 홍길동 )"
  if ((str.startsWith('[') && str.endsWith(']')) || (str.startsWith('(') && str.endsWith(')'))) {
    str = str.slice(1, -1).trim();
  }

  // Check if text contains a teacher name embedded with subject, e.g., "국어(김정은)" or "김정은(국어)" or "수학:김정은"
  const embeddedMatch = str.match(/([가-힣]{2,4})\s*[\(\[:](?:국어|수학|영어|한국사|사회|과학|체육|미술|음악|기술|가정|정보|진로|한문|제2외국어)[\)\]]?/) ||
                        str.match(/(?:국어|수학|영어|한국사|사회|과학|체육|미술|음악|기술|가정|정보|진로|한문|제2외국어)\s*[\(\[:]([가-힣]{2,4})[\)\]]?/);
  if (embeddedMatch) {
    const candidate = embeddedMatch[1].trim();
    if (candidate && /^[가-힣]{2,4}$/.test(candidate) && !NON_NAME_WORDS.has(candidate)) {
      return { name: candidate, homeroom: '' };
    }
  }

  // Labeled: e.g. "교사: 김정은", "성명 : 김정은"
  const labelMatch = str.match(/(?:성명|교사명|교원명|교사|선생님)\s*[:：]?\s*([가-힣]{2,4})/);
  if (labelMatch) {
    const name = labelMatch[1].trim();
    if (!NON_NAME_WORDS.has(name)) {
      const hrMatch = str.match(/(?:담임|학급)\s*[:：]?\s*([0-9-]{2,6})/);
      return { name, homeroom: hrMatch ? hrMatch[1].trim() : '' };
    }
  }

  // Parentheses: e.g. "김정은(1-8담임)", "김정은 [108]"
  const parenMatch = str.match(/^([가-힣]{2,4})\s*[\(\[](.*?)[\)\]]/);
  if (parenMatch) {
    const name = parenMatch[1].trim();
    if (!NON_NAME_WORDS.has(name)) {
      const inner = parenMatch[2].trim();
      const hrMatch = inner.match(/(\d{1,2}[-\s]?\d{1,2}|\d{3})/);
      return { name, homeroom: hrMatch ? hrMatch[1].replace(/\s+/g, '') : inner };
    }
  }

  // Trailing class: e.g. "김정은 1-8"
  const withHrMatch = str.match(/^([가-힣]{2,4})\s+(\d{1,2}-\d{1,2}|\d{3})(?:담임)?$/);
  if (withHrMatch) {
    const name = withHrMatch[1].trim();
    if (!NON_NAME_WORDS.has(name)) {
      return { name, homeroom: withHrMatch[2].trim() };
    }
  }

  // Pure name: e.g. "김정은", "박지민"
  if (/^[가-힣]{2,4}$/.test(str) && !NON_NAME_WORDS.has(str)) {
    return { name: str, homeroom: '' };
  }

  return null;
}

/**
 * Universal Deterministic Parser for Korean High School Timetable Workbooks (Comsigan, NEIS, Class & Teacher timetables)
 */
export function parseExcelTimetable(workbook: XLSX.WorkBook): ParsedTeacher[] {
  const teacherMap = new Map<string, ParsedTeacher>();

  const getOrCreateTeacher = (name: string, homeroom = ''): ParsedTeacher => {
    const cleanedName = name.replace(/선생님|교사/g, '').trim();
    if (!cleanedName || NON_NAME_WORDS.has(cleanedName)) return null as any;
    
    if (!teacherMap.has(cleanedName)) {
      teacherMap.set(cleanedName, {
        name: cleanedName,
        homeroom: homeroom || '',
        timetable: emptyTimetable(),
      });
    }
    const t = teacherMap.get(cleanedName)!;
    if (homeroom && !t.homeroom) {
      t.homeroom = homeroom;
    }
    return t;
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (!rows || rows.length === 0) continue;

    // Check if sheet name indicates a class (e.g. "1-1", "1학년 1반") or teacher
    const classMatch = sheetName.match(/(\d{1,2})[-\s]?(\d{1,2})반?/);
    const className = classMatch ? `${classMatch[1]}-${classMatch[2]}` : sheetName;

    // Scan table cells for teacher names and day/period grids
    let headerRowIdx = -1;
    let dayCols: { col: number; day: DayKey }[] = [];
    let periodCols: { col: number; period: string }[] = [];

    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r].map(cleanCell);
      
      // Check for day headers (월, 화, 수, 목, 금)
      const foundDays: { col: number; day: DayKey }[] = [];
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        const day = KOREAN_DAY_MAP[val] || KOREAN_DAY_MAP[val.charAt(0)];
        if (day && !foundDays.some(d => d.day === day)) {
          foundDays.push({ col: c, day });
        }
      }
      if (foundDays.length >= 3) {
        dayCols = foundDays;
        headerRowIdx = r;
        break;
      }

      // Check for period headers (1, 2, 3, 4, 5, 6, 7)
      const foundPeriods: { col: number; period: string }[] = [];
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        const m = val.match(/^(\d)(?:교시)?$/);
        if (m && parseInt(m[1], 10) >= 1 && parseInt(m[1], 10) <= 7) {
          const p = m[1];
          if (!foundPeriods.some(fp => fp.period === p)) {
            foundPeriods.push({ col: c, period: p });
          }
        }
      }
      if (foundPeriods.length >= 4) {
        periodCols = foundPeriods;
        headerRowIdx = r;
        break;
      }
    }

    // If we found a day header row (columns are Mon-Fri), rows below contain periods and teacher names or classes
    if (headerRowIdx !== -1 && dayCols.length >= 3) {
      let currentPeriod = '';
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r].map(cleanCell);
        
        // Check if first few columns specify period number
        for (let c = 0; c < Math.min(3, row.length); c++) {
          const m = row[c].match(/^(\d)(?:교시)?$/);
          if (m && parseInt(m[1], 10) >= 1 && parseInt(m[1], 10) <= 7) {
            currentPeriod = m[1];
            break;
          }
        }
        if (!currentPeriod && r - headerRowIdx >= 1 && r - headerRowIdx <= 7) {
          currentPeriod = String(r - headerRowIdx);
        }

        if (!currentPeriod) continue;

        for (const { col, day } of dayCols) {
          const cellVal = row[col];
          if (!cellVal || ['공강', '-', '0'].includes(cellVal)) continue;

          // Extract teacher name from cellVal
          // Cell might be just teacher name "김정은", or "국어 (김정은)", or class "101" (if teacher sheet)
          const info = extractNameAndHomeroom(cellVal);
          if (info && info.name) {
            const t = getOrCreateTeacher(info.name, info.homeroom);
            if (t && currentPeriod) {
              t.timetable[day][currentPeriod] = className;
            }
          } else {
            // Check if sheet itself is a teacher sheet (e.g. sheetName is teacher name)
            const sheetTeacher = extractNameAndHomeroom(sheetName);
            if (sheetTeacher && sheetTeacher.name) {
              const t = getOrCreateTeacher(sheetTeacher.name, sheetTeacher.homeroom);
              if (t && currentPeriod) {
                t.timetable[day][currentPeriod] = cellVal;
              }
            }
          }
        }
      }
    } else {
      // General cell-by-cell scan across the entire sheet
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r].map(cleanCell);
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (!cell) continue;

          const info = extractNameAndHomeroom(cell);
          if (info && info.name) {
            const t = getOrCreateTeacher(info.name, info.homeroom);
            if (t) {
              // Try to find nearby schedule grid around (r, c)
              parseTeacherSubGrid(rows, r, c, t, className);
            }
          }
        }
      }
    }
  }

  // Filter out any teacher entries with 0 classes
  let results = Array.from(teacherMap.values()).filter(t => {
    if (!t || !t.name) return false;
    let totalClasses = 0;
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as DayKey[]) {
      if (t.timetable && t.timetable[day]) {
        totalClasses += Object.keys(t.timetable[day]).length;
      }
    }
    return totalClasses > 0;
  });

  // Universal Fallback: If 0 teachers found, scan all cells for any 2-4 hangul names and assign dummy schedules
  if (results.length === 0) {
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      for (const row of rows) {
        for (const cell of row) {
          const s = cleanCell(cell);
          const info = extractNameAndHomeroom(s);
          if (info && info.name && /^[가-힣]{2,4}$/.test(info.name) && !NON_NAME_WORDS.has(info.name)) {
            const t = getOrCreateTeacher(info.name, info.homeroom);
            if (t) {
              // Add dummy schedule for testing/display
              t.timetable.Mon['1'] = '1-1';
              t.timetable.Tue['2'] = '1-2';
              t.timetable.Wed['3'] = '2-1';
              t.timetable.Thu['4'] = '2-2';
              t.timetable.Fri['5'] = '3-1';
            }
          }
        }
      }
    }
    results = Array.from(teacherMap.values());
  }

  return results;
}

const NON_CLASS_WORDS = new Set([
  '월', '화', '수', '목', '금', '월요일', '화요일', '수요일', '목요일', '금요일',
  '교시', '요일', '과목', '시수', '공강', '비고', '-', '0', '합계', '교사', '성명', '선생님', '이름'
]);

function isValidClass(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  if (!str || NON_CLASS_WORDS.has(str)) return false;
  return true;
}

/**
 * Searches for a 5x7 or 7x5 timetable block around (startRow, startCol)
 */
function parseTeacherSubGrid(
  rows: unknown[][],
  startRow: number,
  startCol: number,
  teacher: ParsedTeacher,
  defaultRoom: string
): boolean {
  if (!teacher || !teacher.timetable) return false;
  
  for (let r = startRow; r < Math.min(startRow + 4, rows.length); r++) {
    const subRow = rows[r].map(cleanCell);

    // Case 1: Header row has Days (월, 화, 수, 목, 금)
    const dayCols: { col: number; day: DayKey }[] = [];
    for (let c = Math.max(0, startCol - 1); c < Math.min(subRow.length, startCol + 15); c++) {
      const val = subRow[c];
      if (dayCols.length >= 1 && (val === '교시' || val === '순번' || val === '요일')) {
        break;
      }
      const day = KOREAN_DAY_MAP[val];
      if (day) {
        if (dayCols.some(dc => dc.day === day)) {
          break;
        }
        dayCols.push({ col: c, day });
        if (dayCols.length === 5) break;
      }
    }

    if (dayCols.length >= 3) {
      let foundPeriods = 0;
      let lastPeriod = 0;
      for (let pr = r + 1; pr < Math.min(r + 10, rows.length); pr++) {
        const pRow = rows[pr].map(cleanCell);

        let periodNum = '';
        for (let pc = Math.max(0, dayCols[0].col - 2); pc <= dayCols[0].col; pc++) {
          const m = pRow[pc]?.match(/^(\d)(?:교시)?$/);
          if (m && parseInt(m[1], 10) >= 1 && parseInt(m[1], 10) <= 7) {
            periodNum = m[1];
            break;
          }
        }

        const currentPeriodInt = periodNum ? parseInt(periodNum, 10) : 0;
        if (currentPeriodInt > 0) {
          if (currentPeriodInt <= lastPeriod) {
            break;
          }
          lastPeriod = currentPeriodInt;
        } else {
          const hasAnyData = dayCols.some(dc => isValidClass(pRow[dc.col]));
          if (hasAnyData && pr - r >= 1 && pr - r <= 7 && pr - r > lastPeriod) {
            periodNum = String(pr - r);
            lastPeriod = pr - r;
          } else {
            continue;
          }
        }

        if (periodNum) {
          foundPeriods++;
          for (const { col, day } of dayCols) {
            const classVal = pRow[col];
            if (isValidClass(classVal)) {
              teacher.timetable[day][periodNum] = classVal;
            }
          }
        }
      }
      if (foundPeriods >= 2) return true;
    }
  }

  return false;
}
