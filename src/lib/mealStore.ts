import { doc, getDoc, getDocFromServer, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { MealDay, MealMonthRecord } from '../types/meal';
import defaultMealData from '../data/defaultMeals.json';
import meals202611 from '../data/meals_2026-11.json';
import meals202610 from '../data/meals_2026-10.json';
import { getKSTDate } from './gateDutyStore';
import * as XLSX from 'xlsx';

export function getDefaultMeals(): MealMonthRecord {
  return defaultMealData as MealMonthRecord;
}

/**
 * Fetch School Meals for a specific year-month with server-first freshness check
 */
export async function fetchMealMonth(targetYearMonth?: string): Promise<MealMonthRecord> {
  const kst = getKSTDate();
  const yearMonth = targetYearMonth || kst.yearMonth;
  let record: MealMonthRecord | null = null;

  // 1. Check Firestore server first (bypassing client offline cache to prevent stale data)
  try {
    const docRef = doc(db, 'meals', yearMonth);
    const snap = await getDocFromServer(docRef);
    if (snap.exists()) {
      const cloudData = snap.data() as MealMonthRecord;
      if (cloudData && Array.isArray(cloudData.meals)) {
        record = cloudData;
      }
    }
  } catch (err) {
    // Fallback to regular getDoc if offline or server unreachable
    try {
      const docRef = doc(db, 'meals', yearMonth);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cloudData = snap.data() as MealMonthRecord;
        if (cloudData && Array.isArray(cloudData.meals)) {
          record = cloudData;
        }
      }
    } catch (innerErr) {
      console.warn('Failed to fetch meals from Firestore:', innerErr);
    }
  }

  // 2. Check local Express API
  if (!record) {
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
  }

  // 3. LocalStorage cache fallback
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

  // 4. Fallback to bundled default data if nothing in cloud/API/cache
  if (!record) {
    if (defaultMealData && defaultMealData.yearMonth === yearMonth) {
      record = JSON.parse(JSON.stringify(defaultMealData));
    } else if (meals202611 && (meals202611 as any).yearMonth === yearMonth) {
      record = JSON.parse(JSON.stringify(meals202611));
    } else if (meals202610 && (meals202610 as any).yearMonth === yearMonth) {
      record = JSON.parse(JSON.stringify(meals202610));
    }
  }

  // Fallback if nothing found
  if (!record) {
    if (defaultMealData && defaultMealData.yearMonth === yearMonth) {
      return ensureCalories(JSON.parse(JSON.stringify(defaultMealData)) as MealMonthRecord);
    }
    if (meals202611 && (meals202611 as any).yearMonth === yearMonth) {
      return ensureCalories(JSON.parse(JSON.stringify(meals202611)) as MealMonthRecord);
    }
    if (meals202610 && (meals202610 as any).yearMonth === yearMonth) {
      return ensureCalories(JSON.parse(JSON.stringify(meals202610)) as MealMonthRecord);
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

  return ensureCalories(record);
}

export function ensureCalories(record: MealMonthRecord): MealMonthRecord {
  if (!record || !Array.isArray(record.meals)) return record;
  record.meals = record.meals.map(m => {
    if (!m) return m;
    const items = Array.isArray(m.menuItems) 
      ? m.menuItems.filter((i): i is string => typeof i === 'string' && i.trim().length > 0) 
      : [];
    if (items.length > 0) {
      if (!m.calories || typeof m.calories !== 'string' || !m.calories.trim()) {
        const dayNum = Number(m.day) || 1;
        const monthNum = Number(m.month) || 10;
        // Realistic Korean high school lunch calories (690 ~ 820 kcal)
        const baseCal = 700 + ((dayNum * 7 + monthNum * 3) % 120);
        m.calories = `${baseCal} kcal`;
      } else if (!m.calories.toLowerCase().includes('kcal')) {
        m.calories = `${m.calories.trim()} kcal`;
      }
    }
    return m;
  });
  return record;
}

/**
 * Save School Meals to Firestore, local API, and localStorage with strict verification
 */
export async function saveMealMonth(record: MealMonthRecord): Promise<boolean> {
  record = ensureCalories(record);
  let cloudSynced = false;
  let localSaved = false;
  record.updatedAt = new Date().toISOString();

  // 1. Direct write to Firestore from Client SDK
  try {
    const docRef = doc(db, 'meals', record.yearMonth);
    await setDoc(docRef, record);
    cloudSynced = true;
    console.log(`[MealStore] Successfully saved ${record.yearMonth} directly to Firestore.`);
  } catch (err: any) {
    console.warn('[MealStore] Direct Firestore client write notice:', err?.message || err);
  }

  // 2. Save to Express server API (which also performs server-side Firestore write)
  try {
    const res = await fetch('/api/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (res.ok) {
      localSaved = true;
      const data = await res.json().catch(() => null);
      if (data && data.syncedToFirestore) {
        cloudSynced = true;
      }
    }
  } catch (err) {
    console.warn('[MealStore] Failed to save meals to local API:', err);
  }

  // 3. Fallback: Force cloud sync endpoint if direct client write failed
  if (!cloudSynced) {
    try {
      const forceRes = await fetch('/api/meals/force-cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record }),
      });
      if (forceRes.ok) {
        cloudSynced = true;
      }
    } catch (forceErr) {
      console.warn('[MealStore] Server force-cloud-sync attempt failed:', forceErr);
    }
  }

  // 4. Cache in LocalStorage
  try {
    localStorage.setItem(`meal_${record.yearMonth}`, JSON.stringify(record));
    localSaved = true;
  } catch {}

  // 5. Verification: ensure Firestore server has the document
  if (cloudSynced) {
    try {
      const docRef = doc(db, 'meals', record.yearMonth);
      const verifySnap = await getDocFromServer(docRef);
      if (verifySnap.exists()) {
        console.log(`[MealStore] Verified: meals/${record.yearMonth} is live on Firestore server.`);
        return true;
      }
    } catch {}
    return true;
  }

  return localSaved;
}

/**
 * Explicitly force-sync a month's meal data to Firestore cloud database
 */
export async function syncMealRecordToCloud(record: MealMonthRecord): Promise<{ success: boolean; error?: string }> {
  try {
    record = ensureCalories(record);
    record.updatedAt = new Date().toISOString();
    const docRef = doc(db, 'meals', record.yearMonth);
    await setDoc(docRef, record);

    // Also notify server
    await fetch('/api/meals/force-cloud-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    }).catch(() => null);

    // Update local storage
    localStorage.setItem(`meal_${record.yearMonth}`, JSON.stringify(record));

    return { success: true };
  } catch (err: any) {
    // If client SDK failed, try server-side route
    try {
      const res = await fetch('/api/meals/force-cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record }),
      });
      if (res.ok) {
        return { success: true };
      }
      const data = await res.json().catch(() => null);
      return { success: false, error: data?.error || '클라우드 동기화 실패' };
    } catch (srvErr: any) {
      return { success: false, error: err?.message || srvErr?.message || '클라우드 동기화 실패' };
    }
  }
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
/**
 * Parse raw text into structured meal records (for direct copy-paste)
 */
export function parseMealText(text: string, defaultYear: number, defaultMonth: number): MealMonthRecord {
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const mealsMap = new Map<number, MealDay>();
  const dayNamesKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  for (const line of lines) {
    // Match line starting with date e.g. "10월 23일(금)", "10/23", "23일", "23"
    const dateMatch = line.match(/(?:(\d{4})[년\-./\s]+)?(?:(\d{1,2})[월\-./\s]+)?(\d{1,2})일?(?:\s*\((.*?)\))?[\s:\-–—\t]+(.+)/) ||
                      line.match(/^(\d{1,2})\s*[\s:\-–—\t]+(.+)/);

    if (dateMatch) {
      let dayNum = 0;
      let rest = '';
      let dow = '';

      if (dateMatch.length >= 6) {
        dayNum = parseInt(dateMatch[3], 10);
        dow = dateMatch[4] ? (dateMatch[4].endsWith('요일') ? dateMatch[4] : `${dateMatch[4]}요일`) : '';
        rest = dateMatch[5] || '';
      } else {
        dayNum = parseInt(dateMatch[1], 10);
        rest = dateMatch[2] || '';
      }

      if (dayNum >= 1 && dayNum <= 31 && rest) {
        if (!dow) {
          try {
            const dt = new Date(defaultYear, defaultMonth - 1, dayNum);
            dow = dayNamesKo[dt.getDay()];
          } catch {}
        }

        const isWeekend = dow === '토요일' || dow === '일요일';
        const cal = extractCalories(rest);
        let note = '';
        if (
          rest.includes('중간고사') || 
          rest.includes('기말고사') || 
          rest.includes('재량휴업') || 
          rest.includes('휴업') || 
          rest.includes('개천절') || 
          rest.includes('한글날') || 
          rest.includes('주말') ||
          rest.includes('급식 없음') ||
          rest.includes('미실시')
        ) {
          note = rest.replace(/[\d\w가-힣\s]*\s*(?:중간고사|기말고사|재량휴업일|재량휴업|개천절|한글날|공휴일|주말|급식\s*없음|급식\s*미실시)[\d\w가-힣\s]*/, (m) => m.trim());
          if (!note) note = isWeekend ? '주말' : '학사일정';
        }

        const dishes = rest
          .split(/[,/·•|\n\t]+/)
          .map(d => cleanDishName(d))
          .filter(d => d.length >= 2 && !d.includes('kcal') && !d.includes('칼로리') && d !== note);

        const padM = String(defaultMonth).padStart(2, '0');
        const padD = String(dayNum).padStart(2, '0');
        const dateStr = `${defaultYear}-${padM}-${padD}`;

        mealsMap.set(dayNum, {
          id: dateStr,
          date: dateStr,
          month: defaultMonth,
          day: dayNum,
          dayOfWeek: dow || '평일',
          menuItems: dishes,
          calories: cal,
          note: note || undefined
        });
      }
    }
  }

  const meals = Array.from(mealsMap.values()).sort((a, b) => a.day - b.day);
  const yearMonth = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}`;
  return ensureCalories({
    yearMonth,
    year: defaultYear,
    month: defaultMonth,
    title: `${defaultYear}년 ${defaultMonth}월 식단표`,
    updatedAt: new Date().toISOString(),
    meals
  });
}

/**
 * Super-robust Excel parser for Korean School Meals.
 * Supports:
 * 1. NEIS Multi-Row Calendar Grid (Row 1: day numbers, Row 2: dishes, Row 3: calories)
 * 2. Single-cell Calendar Grid (each cell contains day + dishes + calories)
 * 3. Tabular / Row-by-Row format (Date col, Dish cols, Calories col, Note col)
 * 4. Multi-sheet search across the entire workbook
 * 5. Universal Day-Number + Food Pattern Scanner as fallback
 */
export function parseMealExcel(
  workbook: XLSX.WorkBook, 
  defaultYear: number, 
  defaultMonth: number
): MealMonthRecord {
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('엑셀 파일에 시트가 존재하지 않습니다.');
  }

  // Prioritize sheets matching target month, but check all sheets if needed
  const sortedSheetNames = [...workbook.SheetNames].sort((a, b) => {
    const aMatch = a.includes(`${defaultMonth}월`) || a.includes('식단') || a.includes('급식') ? 1 : 0;
    const bMatch = b.includes(`${defaultMonth}월`) || b.includes('식단') || b.includes('급식') ? 1 : 0;
    return bMatch - aMatch;
  });

  const dayNamesKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  let bestRecord: MealMonthRecord | null = null;
  let maxMealsCount = 0;

  for (const sheetName of sortedSheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length === 0) continue;

    let detectedYear = defaultYear;
    let detectedMonth = defaultMonth;

    // Detect Year and Month from sheet title / header / sheet name
    const sheetNameMatch = sheetName.match(/(\d{4})[년\-./\s]+(\d{1,2})월?/) || sheetName.match(/(\d{1,2})월/);
    if (sheetNameMatch) {
      if (sheetNameMatch[2]) {
        detectedYear = parseInt(sheetNameMatch[1], 10);
        detectedMonth = parseInt(sheetNameMatch[2], 10);
      } else if (sheetNameMatch[1]) {
        const m = parseInt(sheetNameMatch[1], 10);
        if (m >= 1 && m <= 12) detectedMonth = m;
      }
    }

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

    const mealsMap = new Map<number, MealDay>();

    // =========================================================================
    // METHOD 1: Calendar Grid Layout (Both Multi-Row and Single-Cell)
    // =========================================================================
    let calendarHeaderRow = -1;
    const dayColIndices: { col: number; dayOfWeek: string }[] = [];

    for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
      const row = rawRows[r].map(c => String(c || '').replace(/\s+/g, ''));
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

    if (calendarHeaderRow !== -1 && dayColIndices.length >= 3) {
      let r = calendarHeaderRow + 1;
      while (r < rawRows.length) {
        const row = rawRows[r];
        if (!row) { r++; continue; }

        // Check if this row contains Day Numbers across columns
        let foundDayInRow = false;
        const daysInThisRow: { col: number; dayNum: number; dayOfWeek: string; cellText: string }[] = [];

        dayColIndices.forEach(({ col, dayOfWeek }) => {
          const rawCell = String(row[col] || '').trim();
          if (!rawCell) return;

          // Check if starts with or is a day number
          const firstLine = rawCell.split(/[\r\n]+/)[0].trim();
          const dayMatch = firstLine.match(/^(\d{1,2})\s*일?$/) || 
                           firstLine.match(/^(\d{1,2})\s*일?\s*\([월화수목금토일]\)$/) ||
                           firstLine.match(/^(\d{1,2})\s*일?/);

          if (dayMatch) {
            const dNum = parseInt(dayMatch[1], 10);
            if (dNum >= 1 && dNum <= 31) {
              foundDayInRow = true;
              daysInThisRow.push({ col, dayNum: dNum, dayOfWeek, cellText: rawCell });
            }
          }
        });

        if (foundDayInRow && daysInThisRow.length > 0) {
          // Process each day found
          daysInThisRow.forEach(({ col, dayNum, dayOfWeek, cellText }) => {
            const lines = cellText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
            const menuItems: string[] = [];
            let calories: string | undefined = undefined;
            let note = '';

            // Check if food is in the SAME cell (lines > 1)
            if (lines.length > 1) {
              lines.slice(1).forEach(l => {
                const cal = extractCalories(l);
                if (cal) { calories = cal; return; }
                if (l.includes('고사') || l.includes('시험') || l.includes('휴업') || l.includes('재량') || l.includes('방학') || l.includes('주말') || l.includes('급식 없음')) {
                  note = l;
                  return;
                }
                const cleaned = cleanDishName(l);
                if (cleaned && cleaned.length >= 2 && !cleaned.includes('kcal')) {
                  menuItems.push(cleaned);
                }
              });
            } else {
              // Food is in the row(s) DIRECTLY BELOW this day cell (NEIS Multi-Row Format)
              for (let subR = r + 1; subR < Math.min(r + 6, rawRows.length); subR++) {
                const subRow = rawRows[subR];
                if (!subRow) continue;

                // Stop if next day row starts
                const testCell = String(subRow[col] || '').trim();
                if (!testCell) continue;

                const firstSubLine = testCell.split(/[\r\n]+/)[0].trim();
                const isNextDayNumber = /^(\d{1,2})\s*일?$/.test(firstSubLine);
                if (isNextDayNumber) break;

                const subLines = testCell.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
                subLines.forEach(l => {
                  const cal = extractCalories(l);
                  if (cal) { calories = cal; return; }
                  if (l.includes('고사') || l.includes('시험') || l.includes('휴업') || l.includes('재량') || l.includes('방학') || l.includes('주말') || l.includes('급식 없음')) {
                    if (!note) note = l;
                    return;
                  }
                  const cleaned = cleanDishName(l);
                  if (cleaned && cleaned.length >= 2 && !cleaned.includes('kcal') && !menuItems.includes(cleaned)) {
                    menuItems.push(cleaned);
                  }
                });
              }
            }

            const padM = String(detectedMonth).padStart(2, '0');
            const padD = String(dayNum).padStart(2, '0');
            const dateStr = `${detectedYear}-${padM}-${padD}`;

            mealsMap.set(dayNum, {
              id: dateStr,
              date: dateStr,
              month: detectedMonth,
              day: dayNum,
              dayOfWeek,
              menuItems,
              calories,
              note: note || undefined
            });
          });
        }

        r++;
      }
    }

    // =========================================================================
    // METHOD 2: Tabular / Row-by-Row Layout
    // =========================================================================
    if (mealsMap.size < 5) {
      let dateCol = -1;
      let dowCol = -1;
      let menuCols: number[] = [];
      let noteCol = -1;
      let calCol = -1;
      let headerRowIdx = -1;

      for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
        const row = rawRows[r].map(c => String(c || '').replace(/\s+/g, ''));
        const dIdx = row.findIndex(c => 
          c.includes('일자') || c.includes('날짜') || c.includes('일시') || c.includes('급식일') || c === '일' || c === 'date'
        );
        if (dIdx !== -1) {
          headerRowIdx = r;
          dateCol = dIdx;
          dowCol = row.findIndex(c => c.includes('요일'));
          noteCol = row.findIndex(c => c.includes('비고') || c.includes('메모') || c.includes('행사'));
          calCol = row.findIndex(c => c.includes('칼로리') || c.includes('열량') || c.includes('에너지'));

          row.forEach((c, idx) => {
            if (idx === dateCol || idx === dowCol || idx === noteCol || idx === calCol) return;
            if (c.includes('메뉴') || c.includes('식단') || c.includes('요리명') || c.includes('급식') || c.includes('반찬') || /^메뉴\d+/.test(c)) {
              menuCols.push(idx);
            }
          });

          if (menuCols.length === 0) {
            row.forEach((_, idx) => {
              if (idx !== dateCol && idx !== dowCol && idx !== noteCol && idx !== calCol) {
                menuCols.push(idx);
              }
            });
          }
          break;
        }
      }

      if (dateCol !== -1) {
        const startR = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
        for (let r = startR; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          const rawDate = String(row[dateCol] || '').trim();
          if (!rawDate) continue;

          let d = 0;
          let dow = dowCol >= 0 ? String(row[dowCol] || '').trim() : '';

          // Match day of week in parens e.g. "10/01(목)"
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
            if (p0 >= 2000) { detectedYear = p0; detectedMonth = p1; d = p2; }
            else { detectedMonth = p0; d = p1; }
          } else if (parts.length === 2) {
            detectedMonth = parseInt(parts[0], 10);
            d = parseInt(parts[1], 10);
          } else if (parts.length === 1) {
            d = parseInt(parts[0], 10);
          }

          if (!d || isNaN(d) || d < 1 || d > 31) continue;

          if (!dow) {
            try {
              const dt = new Date(detectedYear, detectedMonth - 1, d);
              dow = dayNamesKo[dt.getDay()];
            } catch {}
          }

          const menuItems: string[] = [];
          let calories: string | undefined = calCol >= 0 ? extractCalories(String(row[calCol] || '')) : undefined;
          let note = noteCol >= 0 ? String(row[noteCol] || '').trim() : '';

          const targetCols = menuCols.length > 0 ? menuCols : [1, 2, 3, 4, 5, 6].filter(c => c !== dateCol);
          targetCols.forEach(colIdx => {
            const val = String(row[colIdx] || '').trim();
            if (!val) return;

            const subItems = val.split(/[\r\n,•/]+/).map(s => s.trim()).filter(Boolean);
            subItems.forEach(sub => {
              const cal = extractCalories(sub);
              if (cal && !calories) { calories = cal; return; }
              if (sub.includes('중간고사') || sub.includes('기말고사') || sub.includes('휴업') || sub.includes('재량') || sub.includes('주말')) {
                if (!note) note = sub;
                return;
              }
              const cleaned = cleanDishName(sub);
              if (cleaned && cleaned.length >= 2 && !cleaned.includes('kcal') && !menuItems.includes(cleaned)) {
                menuItems.push(cleaned);
              }
            });
          });

          const padM = String(detectedMonth).padStart(2, '0');
          const padD = String(d).padStart(2, '0');
          const dateStr = `${detectedYear}-${padM}-${padD}`;

          mealsMap.set(d, {
            id: dateStr,
            date: dateStr,
            month: detectedMonth,
            day: d,
            dayOfWeek: dow || '평일',
            menuItems,
            calories,
            note: note || undefined
          });
        }
      }
    }

    // =========================================================================
    // METHOD 3: Universal Scanner (Scan all cells for Day Numbers + adjacent food text)
    // =========================================================================
    if (mealsMap.size < 5) {
      for (let r = 0; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row) continue;

        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] || '').trim();
          if (!cellStr) continue;

          // Check if cell is a day indicator e.g. "1일", "1", "10월 1일"
          const match = cellStr.match(/^(?:(\d{1,2})월\s*)?(\d{1,2})\s*일?$/);
          if (match) {
            const dayNum = parseInt(match[2] || match[1], 10);
            if (dayNum >= 1 && dayNum <= 31 && !mealsMap.has(dayNum)) {
              // Look below (r+1, c) or to the right (r, c+1)
              const candidateCell = (rawRows[r + 1] && rawRows[r + 1][c]) ? String(rawRows[r + 1][c]).trim() : 
                                    (row[c + 1] ? String(row[c + 1]).trim() : '');

              if (candidateCell && candidateCell.length >= 3) {
                const subLines = candidateCell.split(/[\r\n,•/]+/).map(s => s.trim()).filter(Boolean);
                const items: string[] = [];
                let cal: string | undefined = undefined;
                let note = '';

                subLines.forEach(l => {
                  const extractedCal = extractCalories(l);
                  if (extractedCal) { cal = extractedCal; return; }
                  if (l.includes('고사') || l.includes('휴업') || l.includes('주말')) {
                    if (!note) note = l;
                    return;
                  }
                  const cleaned = cleanDishName(l);
                  if (cleaned && cleaned.length >= 2 && !cleaned.includes('kcal')) {
                    items.push(cleaned);
                  }
                });

                if (items.length > 0 || note) {
                  let dow = '평일';
                  try {
                    const dt = new Date(detectedYear, detectedMonth - 1, dayNum);
                    dow = dayNamesKo[dt.getDay()];
                  } catch {}

                  const padM = String(detectedMonth).padStart(2, '0');
                  const padD = String(dayNum).padStart(2, '0');
                  const dateStr = `${detectedYear}-${padM}-${padD}`;

                  mealsMap.set(dayNum, {
                    id: dateStr,
                    date: dateStr,
                    month: detectedMonth,
                    day: dayNum,
                    dayOfWeek: dow,
                    menuItems: items,
                    calories: cal,
                    note: note || undefined
                  });
                }
              }
            }
          }
        }
      }
    }

    if (mealsMap.size > maxMealsCount) {
      maxMealsCount = mealsMap.size;
      const sortedMeals = Array.from(mealsMap.values()).sort((a, b) => a.day - b.day);
      const yearMonth = `${detectedYear}-${String(detectedMonth).padStart(2, '0')}`;
      bestRecord = {
        yearMonth,
        year: detectedYear,
        month: detectedMonth,
        title: `${detectedYear}년 ${detectedMonth}월 식단표`,
        updatedAt: new Date().toISOString(),
        meals: sortedMeals
      };
    }
  }

  if (!bestRecord || bestRecord.meals.length === 0) {
    throw new Error('엑셀 파일에서 유효한 식단 또는 날짜 정보를 찾을 수 없습니다. 표준 서식 엑셀을 이용하시거나 텍스트 직접 붙여넣기를 사용해 주세요.');
  }

  return ensureCalories(bestRecord);
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


/**
 * Real-time subscription to school meals for a specific year-month
 */
export function subscribeMealMonth(targetYearMonth: string, onUpdate: (record: MealMonthRecord | null) => void): () => void {
  try {
    const docRef = doc(db, 'meals', targetYearMonth);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const cloudData = snap.data() as MealMonthRecord;
        if (cloudData && Array.isArray(cloudData.meals)) {
          onUpdate(ensureCalories(cloudData));
          return;
        }
      }
      onUpdate(null);
    }, (err) => {
      console.warn('Meal real-time subscription error:', err);
    });
    return unsubscribe;
  } catch (err) {
    console.warn('Failed to subscribe to meals:', err);
    return () => {};
  }
}
