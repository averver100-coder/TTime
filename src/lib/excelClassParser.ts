import * as XLSX from 'xlsx';
import { ClassTimetable } from './timetableUtils';

export function parseClassTimetableExcel(fileBuffer: ArrayBuffer | Uint8Array): ClassTimetable[] {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) return [];

  const classMap = new Map<string, ClassTimetable>();

  const normalizeClassCode = (raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw).trim().replace(/\s+/g, '');
    // 3 digits: 101, 203, 311
    if (/^\d{3}$/.test(str)) return str;
    // 1-1, 1-01
    const hyphenMatch = str.match(/^(\d)-(\d{1,2})$/);
    if (hyphenMatch) {
      const g = hyphenMatch[1];
      const c = hyphenMatch[2].padStart(2, '0');
      return `${g}${c}`;
    }
    // 1학년 1반
    const koreanMatch = str.match(/^(\d)학년(\d{1,2})반?$/);
    if (koreanMatch) {
      const g = koreanMatch[1];
      const c = koreanMatch[2].padStart(2, '0');
      return `${g}${c}`;
    }
    return null;
  };

  const getOrCreateClass = (code: string): ClassTimetable => {
    if (!classMap.has(code)) {
      const grade = parseInt(code.charAt(0), 10) || 1;
      const classNum = parseInt(code.substring(1), 10) || 1;
      classMap.set(code, {
        classCode: code,
        grade,
        classNum,
        timetable: {
          Mon: {},
          Tue: {},
          Wed: {},
          Thu: {},
          Fri: {}
        }
      });
    }
    return classMap.get(code)!;
  };

  // Inspect sheets
  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows || rows.length < 2) continue;

    // 1. Check if this is the standard list format: [학급, 교시, 월, 화, 수, 목, 금]
    let headerRowIdx = -1;
    let colMap: { classCol: number; periodCol: number; monCol: number; tueCol: number; wedCol: number; thuCol: number; friCol: number } = {
      classCol: -1,
      periodCol: -1,
      monCol: -1,
      tueCol: -1,
      wedCol: -1,
      thuCol: -1,
      friCol: -1,
    };

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r] || [];
      let cIdx = -1, pIdx = -1, mIdx = -1, tIdx = -1, wIdx = -1, thIdx = -1, fIdx = -1;

      row.forEach((cellVal: any, colIdx: number) => {
        const text = String(cellVal).trim();
        if (text === '학급' || text === '반' || text === '학급코드') cIdx = colIdx;
        if (text === '교시' || text === '시간' || text === '교시구분') pIdx = colIdx;
        if (text === '월' || text === '월요일' || text.toLowerCase() === 'mon') mIdx = colIdx;
        if (text === '화' || text === '화요일' || text.toLowerCase() === 'tue') tIdx = colIdx;
        if (text === '수' || text === '수요일' || text.toLowerCase() === 'wed') wIdx = colIdx;
        if (text === '목' || text === '목요일' || text.toLowerCase() === 'thu') thIdx = colIdx;
        if (text === '금' || text === '금요일' || text.toLowerCase() === 'fri') fIdx = colIdx;
      });

      if (cIdx !== -1 && pIdx !== -1 && mIdx !== -1 && tIdx !== -1) {
        headerRowIdx = r;
        colMap = { classCol: cIdx, periodCol: pIdx, monCol: mIdx, tueCol: tIdx, wedCol: wIdx, thuCol: thIdx, friCol: fIdx };
        break;
      }
    }

    if (headerRowIdx !== -1) {
      let currentClassCode: string | null = null;

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const rawClass = row[colMap.classCol];
        const rawPeriod = row[colMap.periodCol];

        const parsedCode = normalizeClassCode(rawClass);
        if (parsedCode) {
          currentClassCode = parsedCode;
        }

        if (!currentClassCode) continue;

        // Parse period number 1..7
        const periodMatch = String(rawPeriod).match(/(\d)/);
        if (!periodMatch) continue;
        const periodNum = parseInt(periodMatch[1], 10);
        if (periodNum < 1 || periodNum > 7) continue;

        const classObj = getOrCreateClass(currentClassCode);

        const days: [number, 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'][] = [
          [colMap.monCol, 'Mon'],
          [colMap.tueCol, 'Tue'],
          [colMap.wedCol, 'Wed'],
          [colMap.thuCol, 'Thu'],
          [colMap.friCol, 'Fri'],
        ];

        days.forEach(([col, dayKey]) => {
          if (col !== -1 && row[col] !== undefined) {
            const teacher = String(row[col]).trim();
            if (teacher && teacher !== '-' && teacher !== 'null') {
              classObj.timetable[dayKey][periodNum] = teacher;
            }
          }
        });
      }
    }
  }

  return Array.from(classMap.values()).sort((a, b) => 
    a.classCode.localeCompare(b.classCode, 'ko', { numeric: true })
  );
}
