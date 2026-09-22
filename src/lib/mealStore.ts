import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { MealDay, MealMonthRecord } from '../types/meal';
import defaultMealData from '../data/defaultMeals.json';
import { getKSTDate } from './gateDutyStore';
import * as XLSX from 'xlsx';

export function getDefaultMeals(): MealMonthRecord {
  return defaultMealData as MealMonthRecord;
}

/**
 * Fetch School Meals for a specific year-month (e.g. "2026-09")
 */
export async function fetchMealMonth(targetYearMonth?: string): Promise<MealMonthRecord> {
  const kst = getKSTDate();
  const yearMonth = targetYearMonth || kst.yearMonth;
  let record: MealMonthRecord | null = null;

  // 1. If matching default bundled data, start with it
  if (defaultMealData && defaultMealData.yearMonth === yearMonth) {
    record = JSON.parse(JSON.stringify(defaultMealData));
  }

  // 2. Check local Express API
  try {
    const res = await fetch(`/api/meals?month=${encodeURIComponent(yearMonth)}`).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.meals) && data.meals.length > 0) {
        record = data;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch meals from local API:', err);
  }

  // 3. Check Firestore for authoritative cloud record
  try {
    const docRef = doc(db, 'meals', yearMonth);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const cloudData = snap.data() as MealMonthRecord;
      if (cloudData && Array.isArray(cloudData.meals)) {
        record = cloudData;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch meals from Firestore:', err);
  }

  // 4. LocalStorage cache fallback
  if (!record) {
    try {
      const cached = localStorage.getItem(`meal_${yearMonth}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.meals)) {
          record = parsed;
        }
      }
    } catch {}
  }

  // Fallback if nothing found
  if (!record) {
    if (defaultMealData && defaultMealData.yearMonth === yearMonth) {
      return defaultMealData as MealMonthRecord;
    }
    const [y, m] = yearMonth.split('-').map(Number);
    return {
      yearMonth,
      year: y || 2026,
      month: m || 9,
      title: `${y || 2026}년 ${m || 9}월 식단표`,
      updatedAt: new Date().toISOString(),
      meals: []
    };
  }

  return record;
}

/**
 * Save School Meals to Firestore, local API, and localStorage
 */
export async function saveMealMonth(record: MealMonthRecord): Promise<boolean> {
  let success = false;
  record.updatedAt = new Date().toISOString();

  // 1. Save to Firestore
  try {
    const docRef = doc(db, 'meals', record.yearMonth);
    await setDoc(docRef, record);
    success = true;
  } catch (err) {
    console.warn('Failed to save meals to Firestore:', err);
  }

  // 2. Save to Express server API
  try {
    const res = await fetch('/api/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (res.ok) {
      success = true;
    }
  } catch (err) {
    console.warn('Failed to save meals to local API:', err);
  }

  // 3. Cache in LocalStorage
  try {
    localStorage.setItem(`meal_${record.yearMonth}`, JSON.stringify(record));
    success = true;
  } catch {}

  return success;
}

/**
 * Clean allergy codes and special annotations from dish names
 * e.g., "발아현미밥(5.6)" -> "발아현미밥"
 *       "돈코츠라멘 1.2.5.6." -> "돈코츠라멘"
 *       "[초] 아욱된장국(5.6.9)" -> "아욱된장국"
 */
export function cleanDishName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\s*\(.*?\)\s*/g, '') // remove parentheses and contents like (5.6.13) or (주)
    .replace(/\s*\[.*?\]\s*/g, '') // remove brackets [완제품]
    .replace(/\s*\{.*?\}\s*/g, '') // remove braces
    .replace(/[\d\.,\s]+$/g, '')   // remove trailing numbers like 1.2.5.
    .replace(/^[*•\-·\s]+/g, '')   // remove leading bullets
    .trim();
}

/**
 * Extract calories string e.g. "685 kcal"
 */
function extractCalories(text: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:kcal|cal|칼로리)/i);
  if (match) {
    return `${match[1]} kcal`;
  }
  return undefined;
}

/**
 * Parse an Excel workbook to extract monthly school meal records.
 * Supports:
 * 1. Standard table with headers (일자/날짜, 요일, 메뉴/식단/요리명, 열량/칼로리, 비고/일정)
 * 2. Multi-column format (날짜, 요일, 메뉴1, 메뉴2, 메뉴3...)
 * 3. Calendar Grid layout (월~금 columns, each box has day + menu)
 * 4. NEIS format (급식일자, 요리명 with allergy codes stripped)
 */
export function parseMealExcel(
  workbook: XLSX.WorkBook, 
  defaultYear: number, 
  defaultMonth: number
): MealMonthRecord {
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('엑셀 파일에 시트가 존재하지 않습니다.');
  }

  // Find the most appropriate sheet (matching month or first sheet)
  let sheet = workbook.Sheets[workbook.SheetNames[0]];
  for (const name of workbook.SheetNames) {
    if (name.includes(`${defaultMonth}월`) || name.includes('식단') || name.includes('급식')) {
      sheet = workbook.Sheets[name];
      break;
    }
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rawRows.length === 0) {
    throw new Error('시트에 데이터가 비어 있습니다.');
  }

  let detectedYear = defaultYear;
  let detectedMonth = defaultMonth;

  // 1. Check title/top rows or sheet name for Year and Month
  for (let r = 0; r < Math.min(rawRows.length, 6); r++) {
    const rowStr = rawRows[r].join(' ');
    const ymMatch = rowStr.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
    if (ymMatch) {
      detectedYear = parseInt(ymMatch[1], 10);
      detectedMonth = parseInt(ymMatch[2], 10);
      break;
    }
    const isoMatch = rowStr.match(/(\d{4})[-./](\d{1,2})/);
    if (isoMatch && parseInt(isoMatch[1], 10) >= 2020) {
      detectedYear = parseInt(isoMatch[1], 10);
      detectedMonth = parseInt(isoMatch[2], 10);
      break;
    }
  }

  const mealsMap = new Map<string, MealDay>();

  // 2. Check if this is a Calendar Grid Format (columns matching 월, 화, 수, 목, 금)
  let calendarHeaderRow = -1;
  const dayColIndices: { col: number; dayOfWeek: string }[] = [];

  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r].map(c => String(c).trim());
    const foundDays: { col: number; dayOfWeek: string }[] = [];
    
    row.forEach((cell, colIdx) => {
      if (cell.includes('월요일') || cell === '월') foundDays.push({ col: colIdx, dayOfWeek: '월요일' });
      else if (cell.includes('화요일') || cell === '화') foundDays.push({ col: colIdx, dayOfWeek: '화요일' });
      else if (cell.includes('수요일') || cell === '수') foundDays.push({ col: colIdx, dayOfWeek: '수요일' });
      else if (cell.includes('목요일') || cell === '목') foundDays.push({ col: colIdx, dayOfWeek: '목요일' });
      else if (cell.includes('금요일') || cell === '금') foundDays.push({ col: colIdx, dayOfWeek: '금요일' });
    });

    if (foundDays.length >= 3) {
      calendarHeaderRow = r;
      dayColIndices.push(...foundDays);
      break;
    }
  }

  // Parse Calendar Grid Format
  if (calendarHeaderRow !== -1 && dayColIndices.length > 0) {
    for (let r = calendarHeaderRow + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row) continue;

      dayColIndices.forEach(({ col, dayOfWeek }) => {
        const rawCell = String(row[col] || '').trim();
        if (!rawCell) return;

        // Cell might look like: "1일\n발아현미밥\n아욱된장국..." or "1\n발아현미밥..."
        const lines = rawCell.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return;

        // Check if first line or cell contains day number
        const firstLine = lines[0];
        const dayMatch = firstLine.match(/^(\d{1,2})\s*일?/) || firstLine.match(/(\d{1,2})/);
        if (!dayMatch) return;

        const dayNum = parseInt(dayMatch[1], 10);
        if (dayNum < 1 || dayNum > 31) return;

        // Remaining lines are food items, notes, or calories
        const menuLines = lines.slice(1);
        const menuItems: string[] = [];
        let note = '';
        let calories: string | undefined = undefined;

        menuLines.forEach(line => {
          const cal = extractCalories(line);
          if (cal) {
            calories = cal;
            return;
          }
          if (
            line.includes('고사') || 
            line.includes('시험') || 
            line.includes('휴업') || 
            line.includes('방학') || 
            line.includes('체험') ||
            line.includes('개학') ||
            line.includes('급식 없음')
          ) {
            note = line;
            return;
          }

          const cleaned = cleanDishName(line);
          if (cleaned && cleaned.length >= 2 && !cleaned.includes('kcal')) {
            menuItems.push(cleaned);
          }
        });

        const padM = String(detectedMonth).padStart(2, '0');
        const padD = String(dayNum).padStart(2, '0');
        const dateStr = `${detectedYear}-${padM}-${padD}`;

        mealsMap.set(dateStr, {
          id: dateStr,
          date: dateStr,
          month: detectedMonth,
          day: dayNum,
          dayOfWeek,
          menuItems,
          calories,
          note
        });
      });
    }
  }

  // 3. If not calendar grid or calendar grid yielded no results, try Standard Tabular / Row Format
  if (mealsMap.size === 0) {
    let headerRowIdx = -1;
    let dateCol = -1;
    let dowCol = -1;
    let menuCols: number[] = [];
    let noteCol = -1;
    let calCol = -1;

    for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
      const row = rawRows[r].map(c => String(c).trim());
      const dIdx = row.findIndex(c => 
        c.includes('일자') || c.includes('날짜') || c.includes('일시') || c.includes('급식일') || c === '일'
      );
      if (dIdx !== -1) {
        headerRowIdx = r;
        dateCol = dIdx;

        dowCol = row.findIndex(c => c.includes('요일'));
        noteCol = row.findIndex(c => c.includes('비고') || c.includes('메모') || c.includes('특이') || c.includes('행사'));
        calCol = row.findIndex(c => c.includes('칼로리') || c.includes('열량') || c.includes('에너지'));

        // Look for menu columns
        row.forEach((c, idx) => {
          if (idx === dateCol || idx === dowCol || idx === noteCol || idx === calCol) return;
          if (
            c.includes('메뉴') || 
            c.includes('식단') || 
            c.includes('요리명') || 
            c.includes('급식') || 
            c.includes('반찬') ||
            /^메뉴\s*\d+/.test(c)
          ) {
            menuCols.push(idx);
          }
        });

        // If no menu columns explicitly labeled, look for columns containing food items
        if (menuCols.length === 0) {
          row.forEach((c, idx) => {
            if (idx !== dateCol && idx !== dowCol && idx !== noteCol && idx !== calCol) {
              menuCols.push(idx);
            }
          });
        }
        break;
      }
    }

    const startR = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

    for (let r = startR; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const rawDate = String(row[dateCol >= 0 ? dateCol : 0] || '').trim();
      if (!rawDate) continue;

      // Extract Year, Month, Day, DayOfWeek
      let y = detectedYear;
      let m = detectedMonth;
      let d = 0;
      let dow = dowCol >= 0 ? String(row[dowCol] || '').trim() : '';

      // Check day of week in parentheses like "09/01(화)"
      const dowMatch = rawDate.match(/\((.*?)\)/);
      if (dowMatch) {
        const dStr = dowMatch[1].trim();
        dow = dStr.endsWith('요일') ? dStr : `${dStr}요일`;
      }

      const cleanDateStr = rawDate.replace(/\(.*?\)/g, '').trim();
      const parts = cleanDateStr.split(/[\/\-\.\s년월일]/).filter(Boolean).map(s => s.trim());

      if (parts.length >= 3) {
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        const p2 = parseInt(parts[2], 10);
        if (p0 >= 2000) {
          y = p0;
          m = p1;
          d = p2;
        } else {
          m = p0;
          d = p1;
        }
      } else if (parts.length === 2) {
        m = parseInt(parts[0], 10);
        d = parseInt(parts[1], 10);
      } else if (parts.length === 1) {
        d = parseInt(parts[0], 10);
      }

      if (!d || isNaN(d) || d < 1 || d > 31) continue;
      if (m && !isNaN(m) && m >= 1 && m <= 12) detectedMonth = m;
      if (y && !isNaN(y) && y >= 2020) detectedYear = y;

      // Auto-detect day of week if missing
      if (!dow) {
        const dayNamesKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        try {
          const testDate = new Date(detectedYear, detectedMonth - 1, d);
          dow = dayNamesKo[testDate.getDay()];
        } catch {}
      }

      // Collect menu items
      const menuItems: string[] = [];
      let calories: string | undefined = calCol >= 0 ? String(row[calCol] || '').trim() : undefined;
      let note = noteCol >= 0 ? String(row[noteCol] || '').trim() : '';

      const targetCols = menuCols.length > 0 ? menuCols : [1, 2, 3, 4, 5, 6].filter(c => c !== dateCol);

      targetCols.forEach(colIdx => {
        const val = String(row[colIdx] || '').trim();
        if (!val) return;

        // If cell has multiple dishes separated by newline, comma, slash, or bullet
        const subItems = val.split(/[\r\n,•/]+/).map(s => s.trim()).filter(Boolean);
        subItems.forEach(sub => {
          const cal = extractCalories(sub);
          if (cal && !calories) {
            calories = cal;
            return;
          }
          if (
            sub.includes('중간고사') || 
            sub.includes('기말고사') || 
            sub.includes('학사일정') || 
            sub.includes('재량휴업') ||
            sub.includes('주말')
          ) {
            if (!note) note = sub;
            return;
          }

          const cleaned = cleanDishName(sub);
          if (cleaned && cleaned.length >= 2 && !cleaned.includes('kcal')) {
            if (!menuItems.includes(cleaned)) {
              menuItems.push(cleaned);
            }
          }
        });
      });

      const padM = String(detectedMonth).padStart(2, '0');
      const padD = String(d).padStart(2, '0');
      const dateStr = `${detectedYear}-${padM}-${padD}`;

      mealsMap.set(dateStr, {
        id: dateStr,
        date: dateStr,
        month: detectedMonth,
        day: d,
        dayOfWeek: dow || '평일',
        menuItems,
        calories: calories || undefined,
        note: note || undefined
      });
    }
  }

  // Convert map to sorted array
  const meals = Array.from(mealsMap.values()).sort((a, b) => a.day - b.day);

  if (meals.length === 0) {
    throw new Error('엑셀 파일에서 유효한 식단 또는 날짜 정보를 찾을 수 없습니다.');
  }

  const yearMonth = `${detectedYear}-${String(detectedMonth).padStart(2, '0')}`;
  return {
    yearMonth,
    year: detectedYear,
    month: detectedMonth,
    title: `${detectedYear}년 ${detectedMonth}월 식단표`,
    updatedAt: new Date().toISOString(),
    meals
  };
}

/**
 * Generate Excel Template for School Meal Management
 */
export function downloadMealTemplateExcel(year: number, month: number) {
  const wb = XLSX.utils.book_new();
  const dayNamesKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const daysInMonth = new Date(year, month, 0).getDate();

  const rows: any[][] = [];
  rows.push(['날짜', '일자(일)', '요일', '메뉴 1', '메뉴 2', '메뉴 3', '메뉴 4', '메뉴 5', '열량(kcal)', '비고(행사/시험)']);

  for (let d = 1; d <= daysInMonth; d++) {
    const padM = String(month).padStart(2, '0');
    const padD = String(d).padStart(2, '0');
    const dateStr = `${year}-${padM}-${padD}`;
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dayNamesKo[dateObj.getDay()];
    const isWeekend = dayOfWeek === '토요일' || dayOfWeek === '일요일';

    // Sample data for initial days
    if (d === 1 && !isWeekend) {
      rows.push([dateStr, d, dayOfWeek, '발아현미밥', '아욱된장국', '고추장닭조림', '참나물생채', '감자채볶음', '685 kcal', '']);
    } else if (d === 2 && !isWeekend) {
      rows.push([dateStr, d, dayOfWeek, '돈코츠라멘', '타코야끼', '포기김치', '생과일', '소세지떡꼬치', '820 kcal', '']);
    } else if (isWeekend) {
      rows.push([dateStr, d, dayOfWeek, '', '', '', '', '', '', '주말']);
    } else {
      rows.push([dateStr, d, dayOfWeek, '', '', '', '', '', '', '']);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set friendly column widths
  ws['!cols'] = [
    { wch: 13 }, // 날짜
    { wch: 8 },  // 일자
    { wch: 8 },  // 요일
    { wch: 15 }, // 메뉴1
    { wch: 15 }, // 메뉴2
    { wch: 15 }, // 메뉴3
    { wch: 15 }, // 메뉴4
    { wch: 15 }, // 메뉴5
    { wch: 12 }, // 열량
    { wch: 20 }, // 비고
  ];

  XLSX.utils.book_append_sheet(wb, ws, `${month}월 식단표 서식`);
  XLSX.writeFile(wb, `${year}년_${month}월_급식식단표_서식.xlsx`);
}

/**
 * Export meal data to Excel
 */
export function exportMealsToExcel(record: MealMonthRecord) {
  const rows: any[] = [];
  rows.push(['날짜', '일자(일)', '요일', '식단 전체 메뉴', '메뉴 1', '메뉴 2', '메뉴 3', '메뉴 4', '메뉴 5', '열량(kcal)', '비고']);

  record.meals.forEach(m => {
    rows.push([
      m.date,
      m.day,
      m.dayOfWeek || '',
      m.menuItems.join(', '),
      m.menuItems[0] || '',
      m.menuItems[1] || '',
      m.menuItems[2] || '',
      m.menuItems[3] || '',
      m.menuItems[4] || '',
      m.calories || '',
      m.note || ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 13 }, // 날짜
    { wch: 8 },  // 일자
    { wch: 8 },  // 요일
    { wch: 35 }, // 식단 전체
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${record.month}월 식단표`);
  XLSX.writeFile(wb, `${record.yearMonth}_식단표.xlsx`);
}

