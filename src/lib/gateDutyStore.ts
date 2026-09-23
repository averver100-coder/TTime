import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { GateDutyDay, GateDutyMonthRecord } from '../types/gateDuty';
import defaultDutyData from '../data/defaultGateDuties.json';
import * as XLSX from 'xlsx';

// Helper: Get Current KST Date
export function getKSTDate(): {
  dateObj: Date;
  dateStr: string;      // "YYYY-MM-DD"
  yearMonth: string;    // "YYYY-MM"
  year: number;
  month: number;
  day: number;
  dayOfWeekName: string; // "화요일"
  dayOfWeekShort: string; // "화"
  timeStr: string;      // "08:25"
  hour: number;
  minute: number;
} {
  const now = new Date();
  // Format in KST (UTC+9)
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  let dayOfWeekName = '화요일';
  let hour = now.getHours();
  let minute = now.getMinutes();

  parts.forEach(p => {
    if (p.type === 'year') year = parseInt(p.value, 10);
    if (p.type === 'month') month = parseInt(p.value, 10);
    if (p.type === 'day') day = parseInt(p.value, 10);
    if (p.type === 'weekday') dayOfWeekName = p.value;
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
  });

  const monthPad = String(month).padStart(2, '0');
  const dayPad = String(day).padStart(2, '0');
  const hourPad = String(hour).padStart(2, '0');
  const minutePad = String(minute).padStart(2, '0');
  const dateStr = `${year}-${monthPad}-${dayPad}`;
  const yearMonth = `${year}-${monthPad}`;
  const timeStr = `${hourPad}:${minutePad}`;
  const dayOfWeekShort = dayOfWeekName.replace('요일', '');

  return {
    dateObj: now,
    dateStr,
    yearMonth,
    year,
    month,
    day,
    dayOfWeekName,
    dayOfWeekShort,
    timeStr,
    hour,
    minute,
  };
}

export function getDefaultGateDuties(): GateDutyMonthRecord {
  return defaultDutyData as GateDutyMonthRecord;
}

/**
 * Fetch Gate Duties for a specific year-month (e.g. "2026-09")
 */
export async function fetchGateDutyMonth(targetYearMonth?: string): Promise<GateDutyMonthRecord> {
  const kst = getKSTDate();
  const yearMonth = targetYearMonth || kst.yearMonth;
  let record: GateDutyMonthRecord | null = null;
  const cacheKey = `ssamtime_swr_gate_${yearMonth}`;

  // 1. If matching default bundled data, start with it
  if (defaultDutyData && defaultDutyData.yearMonth === yearMonth) {
    record = JSON.parse(JSON.stringify(defaultDutyData));
  }

  // 2. Read from localStorage SWR cache for instant offline rendering in dead zones
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.duties)) {
          record = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed reading gate duty cache:', e);
    }
  }

  // 3. Check local API with abort timeout
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => controller?.abort(), 2000);
    const res = await fetch(`/api/gate-duties?month=${encodeURIComponent(yearMonth)}`, { signal: controller?.signal }).catch(() => null);
    clearTimeout(timeoutId);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.duties) && data.duties.length > 0) {
        record = data;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch gate duties from local API (offline / shadow zone):', err);
  }

  // 4. Check Firestore for authoritative cloud record with timeout
  try {
    const firestorePromise = (async () => {
      const docRef = doc(db, 'gateDuties', yearMonth);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cloudData = snap.data() as GateDutyMonthRecord;
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
    console.warn('Failed to fetch gate duties from Firestore (serving cached SWR state):', err);
  }

  // Fallback if nothing found
  if (!record) {
    if (defaultDutyData && defaultDutyData.yearMonth === yearMonth) {
      return defaultDutyData as GateDutyMonthRecord;
    }
    const [y, m] = yearMonth.split('-').map(Number);
    record = {
      yearMonth,
      year: y || kst.year,
      month: m || kst.month,
      title: `${y || kst.year}년 ${m || kst.month}월 교문지도`,
      updatedAt: new Date().toISOString(),
      duties: [],
    };
  }

  // Save to SWR localStorage cache
  if (typeof window !== 'undefined' && record) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(record));
    } catch (e) {
      console.warn('Failed writing gate duty SWR cache:', e);
    }
  }

  return record;
}

/**
 * Save / Update Gate Duties
 */
export async function saveGateDutyMonth(record: GateDutyMonthRecord): Promise<void> {
  record.updatedAt = new Date().toISOString();

  // 1. Save to local Express API
  try {
    await fetch('/api/gate-duties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
  } catch (err) {
    console.warn('Failed to save to local API:', err);
  }

  // 2. Save to Firestore
  try {
    const docRef = doc(db, 'gateDuties', record.yearMonth);
    await setDoc(docRef, record);
  } catch (err) {
    console.error('Failed to save gate duty to Firestore:', err);
  }

  // 3. Cache in LocalStorage
  try {
    localStorage.setItem(`gateDuty_${record.yearMonth}`, JSON.stringify(record));
  } catch {}
}

/**
 * Parse Excel file content into GateDutyMonthRecord
 */
export function parseGateDutyExcel(workbook: XLSX.WorkBook, defaultYear: number = 2026, defaultMonth: number = 9): GateDutyMonthRecord {
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
  let teacherCol1 = 1;
  let teacherCol2 = 2;
  let noteCol = 3;

  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r].map(c => String(c).trim());
    const dIdx = row.findIndex(c => c.includes('일자') || c.includes('날짜') || c.includes('일시'));
    const tIdx = row.findIndex(c => c.includes('지도교사') || c.includes('교사') || c.includes('선생님') || c.includes('당직'));
    if (dIdx !== -1) {
      headerIndex = r;
      dateCol = dIdx;
      if (tIdx !== -1) {
        teacherCol1 = tIdx;
        // Check if there is teacherCol2
        if (tIdx + 1 < row.length && (row[tIdx + 1] === '' || row[tIdx + 1].includes('지도') || row[tIdx + 1].includes('교사'))) {
          teacherCol2 = tIdx + 1;
        } else {
          teacherCol2 = -1;
        }
      }
      const nIdx = row.findIndex(c => c.includes('비고') || c.includes('메모') || c.includes('참고'));
      if (nIdx !== -1) noteCol = nIdx;
      break;
    }
  }

  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const duties: GateDutyDay[] = [];
  let detectedYear = defaultYear;
  let detectedMonth = defaultMonth;

  for (let r = startIndex; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawDate = String(row[dateCol] || '').trim();
    if (!rawDate) continue;

    // Extract month, day, dayOfWeek
    // Formats: "09/01(화요일)", "9/1(화)", "2026-09-01", "09월 01일 (화)"
    let m = detectedMonth;
    let d = 0;
    let dow = '';

    // Day of week in parenthesis
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
      m = parseInt(slashParts[0], 10);
      d = parseInt(slashParts[1], 10);
    } else if (slashParts.length === 1) {
      d = parseInt(slashParts[0], 10);
    }

    if (!d || isNaN(d)) continue;
    if (m && !isNaN(m)) detectedMonth = m;

    // Parse teachers
    const teachers: string[] = [];
    const tVal1 = String(row[teacherCol1] || '').trim();
    const tVal2 = teacherCol2 >= 0 ? String(row[teacherCol2] || '').trim() : '';

    [tVal1, tVal2].forEach(val => {
      if (!val) return;
      // Split by comma, slash, space
      const splitNames = val.split(/[,/&\n]/).map(s => s.trim()).filter(Boolean);
      splitNames.forEach(name => {
        // If has space inside like "김호림 박 건"
        const spaceSub = name.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
        if (spaceSub.length > 1) {
          spaceSub.forEach(sn => teachers.push(sn));
        } else {
          teachers.push(name);
        }
      });
    });

    const note = noteCol >= 0 ? String(row[noteCol] || '').trim() : '';
    const mPad = String(detectedMonth).padStart(2, '0');
    const dPad = String(d).padStart(2, '0');
    const id = `${detectedYear}-${mPad}-${dPad}`;

    duties.push({
      id,
      date: id,
      month: detectedMonth,
      day: d,
      dayOfWeek: dow || '평일',
      teachers: teachers.filter(Boolean),
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
    title: `${detectedYear}년 ${detectedMonth}월 교문지도`,
    updatedAt: new Date().toISOString(),
    duties,
  };
}

/**
 * Generate Excel Template for Gate Duty
 */
export function exportGateDutyToExcel(record: GateDutyMonthRecord, filename?: string) {
  const wb = XLSX.utils.book_new();

  const headers = ['일자(요일)', '지도교사 1', '지도교사 2', '비고'];
  const rows: (string | number)[][] = [headers];

  record.duties.forEach(d => {
    const mPad = String(d.month).padStart(2, '0');
    const dPad = String(d.day).padStart(2, '0');
    const dateLabel = `${mPad}/${dPad}(${d.dayOfWeek || ''})`;
    const t1 = d.teachers[0] || '';
    const t2 = d.teachers[1] || '';
    rows.push([dateLabel, t1, t2, d.note || '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, `${record.month}월_교문지도`);

  const downloadName = filename || `${record.year}년_${record.month}월_교문지도_명단.xlsx`;
  XLSX.writeFile(wb, downloadName);
}

/**
 * Download a blank/sample template Excel
 */
export function downloadGateDutyTemplateExcel(year: number = 2026, month: number = 10) {
  const wb = XLSX.utils.book_new();
  const headers = ['일자(요일)', '지도교사 1', '지도교사 2', '비고'];
  const sampleRows: (string | number)[][] = [headers];

  const daysInMonth = new Date(year, month, 0).getDate();
  const weekDayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dayOfWeek = dt.getDay();
    // Exclude weekends by default for school gate duties
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const mPad = String(month).padStart(2, '0');
    const dPad = String(d).padStart(2, '0');
    const dow = weekDayNames[dayOfWeek];
    sampleRows.push([`${mPad}/${dPad}(${dow})`, '', '', '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  ws['!cols'] = [{ wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, `${month}월_양식`);

  XLSX.writeFile(wb, `교문지도_업로드_양식_${year}년_${month}월.xlsx`);
}
