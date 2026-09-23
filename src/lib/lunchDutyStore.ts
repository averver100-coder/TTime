import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { LunchDutyDay, LunchDutyMonthRecord } from '../types/lunchDuty';
import defaultLunchData from '../data/defaultLunchDuties.json';
import { getKSTDate } from './gateDutyStore';
import * as XLSX from 'xlsx';

export function getDefaultLunchDuties(): LunchDutyMonthRecord {
  return defaultLunchData as LunchDutyMonthRecord;
}

/**
 * Fetch Lunch Duties for a specific year-month (e.g. "2026-09")
 */
export async function fetchLunchDutyMonth(targetYearMonth?: string): Promise<LunchDutyMonthRecord> {
  const kst = getKSTDate();
  const yearMonth = targetYearMonth || kst.yearMonth;
  let record: LunchDutyMonthRecord | null = null;
  const cacheKey = `ssamtime_swr_lunch_${yearMonth}`;

  // 1. If matching default bundled data, start with it
  if (defaultLunchData && defaultLunchData.yearMonth === yearMonth) {
    record = JSON.parse(JSON.stringify(defaultLunchData));
  }

  // 2. Read from localStorage SWR cache for instant offline rendering
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(cacheKey) || localStorage.getItem(`lunchDuty_${yearMonth}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.duties)) {
          record = parsed;
        }
      }
    } catch {}
  }

  // 3. Check local Express API with abort timeout
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => controller?.abort(), 2000);
    const res = await fetch(`/api/lunch-duties?month=${encodeURIComponent(yearMonth)}`, { signal: controller?.signal }).catch(() => null);
    clearTimeout(timeoutId);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.duties) && data.duties.length > 0) {
        record = data;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch lunch duties from local API (offline / shadow zone):', err);
  }

  // 4. Check Firestore for authoritative cloud record with timeout
  try {
    const firestorePromise = (async () => {
      const docRef = doc(db, 'lunchDuties', yearMonth);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cloudData = snap.data() as LunchDutyMonthRecord;
        if (cloudData && Array.isArray(cloudData.duties)) {
          record = cloudData;
        }
      }
    })();

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firestore timeout')), 2500)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
  } catch (err) {
    console.warn('Failed to fetch lunch duties from Firestore (serving cached SWR state):', err);
  }

  // Fallback if nothing found
  if (!record) {
    if (defaultLunchData && defaultLunchData.yearMonth === yearMonth) {
      return defaultLunchData as LunchDutyMonthRecord;
    }
    const [y, m] = yearMonth.split('-').map(Number);
    record = {
      yearMonth,
      year: y || kst.year,
      month: m || kst.month,
      title: `${y || kst.year}년 ${m || kst.month}월 급식감독`,
      updatedAt: new Date().toISOString(),
      duties: [],
    };
  }

  // Save to SWR localStorage cache
  if (typeof window !== 'undefined' && record) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(record));
    } catch {}
  }

  return record;
}

/**
 * Save / Update Lunch Duties
 */
export async function saveLunchDutyMonth(record: LunchDutyMonthRecord): Promise<void> {
  record.updatedAt = new Date().toISOString();

  // 1. Save to local Express API
  try {
    await fetch('/api/lunch-duties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
  } catch (err) {
    console.warn('Failed to save lunch duties to local API:', err);
  }

  // 2. Save to Firestore
  try {
    const docRef = doc(db, 'lunchDuties', record.yearMonth);
    await setDoc(docRef, record);
  } catch (err) {
    console.error('Failed to save lunch duty to Firestore:', err);
  }

  // 3. Cache in LocalStorage
  try {
    localStorage.setItem(`lunchDuty_${record.yearMonth}`, JSON.stringify(record));
  } catch {}
}

/**
 * Parse Excel file content into LunchDutyMonthRecord
 */
export function parseLunchDutyExcel(workbook: XLSX.WorkBook, defaultYear: number = 2026, defaultMonth: number = 9): LunchDutyMonthRecord {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('시트를 읽을 수 없습니다.');
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('데이터가 비어 있습니다.');
  }

  // Find header row
  let headerIndex = -1;
  let dateCol = 0;
  let generalCol = -1;
  let grade3Col = -1;
  let grade2Col = -1;
  let grade1Col = -1;
  let noteCol = -1;
  const genericTeacherCols: number[] = [];

  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r].map(c => String(c).trim());
    const dIdx = row.findIndex(c => c.includes('일자') || c.includes('날짜') || c.includes('일시'));
    if (dIdx !== -1) {
      headerIndex = r;
      dateCol = dIdx;

      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (c === dIdx) continue;
        if (val.includes('총괄')) {
          generalCol = c;
        } else if (val.includes('3학년') || val === '3' || val.includes('3학')) {
          grade3Col = c;
        } else if (val.includes('2학년') || val === '2' || val.includes('2학')) {
          grade2Col = c;
        } else if (val.includes('1학년') || val === '1' || val.includes('1학')) {
          grade1Col = c;
        } else if (val.includes('비고') || val.includes('메모') || val.includes('참고')) {
          noteCol = c;
        } else if (val.includes('교사') || val.includes('선생님') || val.includes('지도') || val.includes('감독')) {
          genericTeacherCols.push(c);
        }
      }
      break;
    }
  }

  // Fallbacks if specific columns were not found by text
  if (generalCol === -1 && genericTeacherCols.length > 0) generalCol = genericTeacherCols[0];
  if (grade3Col === -1 && genericTeacherCols.length > 1) grade3Col = genericTeacherCols[1];
  if (grade2Col === -1 && genericTeacherCols.length > 2) grade2Col = genericTeacherCols[2];
  if (grade1Col === -1 && genericTeacherCols.length > 3) grade1Col = genericTeacherCols[3];

  // If still not identified, fallback to standard column indices: 0=일자, 1=총괄, 2=3학년, 3=2학년, 4=1학년, 5=비고
  if (generalCol === -1 && dateCol !== 1) generalCol = 1;
  if (grade3Col === -1 && dateCol !== 2) grade3Col = 2;
  if (grade2Col === -1 && dateCol !== 3) grade2Col = 3;
  if (grade1Col === -1 && dateCol !== 4) grade1Col = 4;
  if (noteCol === -1 && dateCol !== 5) noteCol = 5;

  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const duties: LunchDutyDay[] = [];
  let detectedYear = defaultYear;
  let detectedMonth = defaultMonth;

  for (let r = startIndex; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawDate = String(row[dateCol] || '').trim();
    if (!rawDate) continue;

    let m = detectedMonth;
    let d = 0;
    let dow = '';

    // Day of week in parenthesis e.g. "(화요일)" or "(화)"
    const dowMatch = rawDate.match(/\((.*?)\)/);
    if (dowMatch) {
      dow = dowMatch[1].trim();
      if (!dow.endsWith('요일')) dow = `${dow}요일`;
    }

    // Clean date string
    const cleanDateStr = rawDate.replace(/\(.*?\)/g, '').trim();
    const slashParts = cleanDateStr.split(/[\/\-\.\s년월일]/).filter(Boolean).map(s => s.trim());

    if (slashParts.length >= 3) {
      const p0 = parseInt(slashParts[0], 10);
      const p1 = parseInt(slashParts[1], 10);
      const p2 = parseInt(slashParts[2], 10);
      if (p0 > 2000) {
        detectedYear = p0;
        m = p1;
        d = p2;
      } else {
        m = p0;
        d = p1;
      }
    } else if (slashParts.length === 2) {
      m = parseInt(slashParts[0], 10) || detectedMonth;
      d = parseInt(slashParts[1], 10) || 0;
    } else if (slashParts.length === 1) {
      const num = parseInt(slashParts[0], 10);
      if (num > 0 && num <= 31) d = num;
    }

    if (d <= 0 || d > 31) continue;

    detectedMonth = m;

    // Calculate dayOfWeek if missing
    if (!dow) {
      const weekDays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
      const dt = new Date(detectedYear, m - 1, d);
      dow = weekDays[dt.getDay()];
    }

    const mPad = String(m).padStart(2, '0');
    const dPad = String(d).padStart(2, '0');
    const isoDate = `${detectedYear}-${mPad}-${dPad}`;

    const generalTeacher = generalCol >= 0 ? String(row[generalCol] || '').trim() : '';
    const grade3Teacher = grade3Col >= 0 ? String(row[grade3Col] || '').trim() : '';
    const grade2Teacher = grade2Col >= 0 ? String(row[grade2Col] || '').trim() : '';
    const grade1Teacher = grade1Col >= 0 ? String(row[grade1Col] || '').trim() : '';
    const note = noteCol >= 0 ? String(row[noteCol] || '').trim() : '';

    const teachersList = [generalTeacher, grade3Teacher, grade2Teacher, grade1Teacher].filter(Boolean);

    duties.push({
      id: isoDate,
      date: isoDate,
      month: m,
      day: d,
      dayOfWeek: dow,
      generalTeacher,
      grade3Teacher,
      grade2Teacher,
      grade1Teacher,
      teachers: teachersList,
      note,
    });
  }

  // Sort by date
  duties.sort((a, b) => a.date.localeCompare(b.date));

  const yearMonth = `${detectedYear}-${String(detectedMonth).padStart(2, '0')}`;
  return {
    yearMonth,
    year: detectedYear,
    month: detectedMonth,
    title: `${detectedYear}년 ${detectedMonth}월 급식감독`,
    updatedAt: new Date().toISOString(),
    duties,
  };
}

/**
 * Generate Excel Template for Lunch Duty
 */
export function exportLunchDutyToExcel(record: LunchDutyMonthRecord, filename?: string) {
  const wb = XLSX.utils.book_new();

  const headers = ['일자 및 요일', '총괄지도', '3학년', '2학년', '1학년', '비고'];
  const rows: (string | number)[][] = [headers];

  record.duties.forEach(d => {
    const mPad = String(d.month).padStart(2, '0');
    const dPad = String(d.day).padStart(2, '0');
    const dateLabel = `${d.month}월 ${dPad}일(${d.dayOfWeek || ''})`;
    const g = d.generalTeacher || (d.teachers && d.teachers[0]) || '';
    const g3 = d.grade3Teacher || (d.teachers && d.teachers[1]) || '';
    const g2 = d.grade2Teacher || (d.teachers && d.teachers[2]) || '';
    const g1 = d.grade1Teacher || (d.teachers && d.teachers[3]) || '';
    rows.push([dateLabel, g, g3, g2, g1, d.note || '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, `${record.month}월_급식감독`);

  const downloadName = filename || `상일미디어고등학교_${record.year}년_${record.month}월_급식감독.xlsx`;
  XLSX.writeFile(wb, downloadName);
}

/**
 * Download blank template Excel for Lunch Duty
 */
export function downloadLunchDutyTemplateExcel(year: number = 2026, month: number = 9) {
  const wb = XLSX.utils.book_new();
  const headers = ['일자 및 요일', '총괄지도', '3학년', '2학년', '1학년', '비고'];
  const sampleRows: (string | number)[][] = [headers];

  const daysInMonth = new Date(year, month, 0).getDate();
  const weekDayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dayOfWeek = dt.getDay();
    // Exclude weekends by default for school lunch duties
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const dPad = String(d).padStart(2, '0');
    const dow = weekDayNames[dayOfWeek];
    sampleRows.push([`${month}월 ${dPad}일(${dow})`, '', '', '', '', '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, `${month}월_급식감독_양식`);

  XLSX.writeFile(wb, `급식감독_업로드_양식_${year}년_${month}월.xlsx`);
}
