import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, auth } from './firebase';
import { getAppReleaseVersion } from './appVersion';
import type { Teacher, ClassTimetable } from './timetableUtils';
import type { WhitelistUser } from '../types/auth';
import type { GateDutyMonthRecord } from '../types/gateDuty';
import type { LunchDutyMonthRecord } from '../types/lunchDuty';
import type { MealMonthRecord } from '../types/meal';
import defaultTeachersData from '../data/defaultTeachers.json';
import defaultClassTimetablesData from '../data/defaultClassTimetables.json';
import defaultWhitelistData from '../data/defaultWhitelist.json';
import defaultGateDutiesData from '../data/defaultGateDuties.json';
import defaultLunchDutiesData from '../data/defaultLunchDuties.json';
import defaultMealsData from '../data/defaultMeals.json';

export type BackupType = 'auto' | 'manual';

export const AUTO_BACKUP_MAX_COUNT = 10;
export const AUTO_BACKUP_DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour (3,600,000 ms)
export const LAST_AUTO_BACKUP_TS_KEY = 'ssamtime_last_auto_backup_ts_v1';
export const SYSTEM_BACKUPS_EVENT = 'ssamtime_system_backups_updated';

// Explicitly track included vs excluded collections (auditLogs MUST be excluded)
export const CORE_BACKUP_COLLECTIONS = [
  'teachers',
  'classes',
  'gateDuties',
  'lunchDuties',
  'meals',
  'adminWhitelist',
  'admin/pushConfig',
] as const;

export const EXCLUDED_BACKUP_COLLECTIONS = ['auditLogs'] as const;

export interface SystemBackupSummary {
  teacherCount: number;
  classCount: number;
  whitelistCount: number;
  gateDutyCount: number;
  lunchDutyCount: number;
  mealCount: number;
  dutyAndMealCount: number;
}

export interface SystemBackupPayload {
  teachers: Teacher[];
  classes: ClassTimetable[];
  whitelist: WhitelistUser[];
  gateDuties: GateDutyMonthRecord[];
  lunchDuties: LunchDutyMonthRecord[];
  meals: MealMonthRecord[];
  pushConfig?: {
    showPushPopup: boolean;
    updatedAt?: string;
    updatedBy?: string;
  } | null;
}

export interface SystemBackupRecord {
  id: string;
  backupType: BackupType;
  createdAt: number;
  createdAtIso: string;
  createdBy: string;
  version: string;
  reason?: string;
  label?: string;
  excludedCollections?: string[];
  summary: SystemBackupSummary;
  payload: SystemBackupPayload;
  savedToServerDisk?: boolean;
  savedToFirebase?: boolean;
  serverFilename?: string;
}

export interface BackupRunResult {
  created: boolean;
  skipped?: boolean;
  reason?: string;
  backup?: SystemBackupRecord;
  rotatedDeletedCount?: number;
  nextEligibleAt?: number;
}

export interface BackupDashboardMetrics {
  teacherCount: number;
  classCount: number;
  dutyAndMealAndWhitelistCount: number;
  gateDutyMonths: number;
  lunchDutyMonths: number;
  mealMonths: number;
  whitelistCount: number;
  excludedAuditLogCount: number;
}

// Guard flag to prevent CRUD restoration writes from triggering redundant auto-backups
let restoreLockCount = 0;
let autoBackupInFlight: Promise<BackupRunResult> | null = null;

export function isRestoreInProgress(): boolean {
  return restoreLockCount > 0;
}

function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function logFirestoreBackupError(error: unknown, operationType: string, path: string): void {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

function emitBackupsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYSTEM_BACKUPS_EVENT));
  }
}

function getCachedLastAutoBackupTs(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(LAST_AUTO_BACKUP_TS_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function setCachedLastAutoBackupTs(ts: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_AUTO_BACKUP_TS_KEY, String(ts));
  } catch {}
}

/**
 * Check most recent 'auto' backup timestamp from Firestore (with localStorage fallback)
 */
async function getLatestAutoBackupTimestamp(): Promise<number> {
  let latestTs = getCachedLastAutoBackupTs();

  try {
    const q = query(
      collection(db, 'systemBackups'),
      where('backupType', '==', 'auto'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data();
      if (data.backupType === 'auto') {
        const ts = Number(data.createdAt) || 0;
        if (ts > latestTs) latestTs = ts;
      }
    });
  } catch {
    // Fallback without orderBy in case composite index is still provisioning
    try {
      const qFallback = query(
        collection(db, 'systemBackups'),
        where('backupType', '==', 'auto')
      );
      const snap = await getDocs(qFallback);
      snap.forEach((d) => {
        const data = d.data();
        if (data.backupType === 'auto') {
          const ts = Number(data.createdAt) || 0;
          if (ts > latestTs) latestTs = ts;
        }
      });
    } catch {}
  }

  return latestTs;
}

/**
 * Collect ONLY core collections for backup.
 * Explicitly EXCLUDES `auditLogs` to optimize storage and Firestore read/write cost.
 */
async function collectCoreSystemPayload(): Promise<SystemBackupPayload> {
  // 1. Teachers (merge defaults -> localStorage -> API -> Firestore)
  const teacherMap = new Map<string, Teacher>();
  ((defaultTeachersData as Teacher[]) || []).forEach((t) => {
    if (t?.name) {
      teacherMap.set(t.name, {
        id: t.name,
        name: t.name,
        homeroom: t.homeroom || '',
        subject: t.subject || '',
        timetable:
          typeof t.timetable === 'string'
            ? JSON.parse(t.timetable)
            : t.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} },
      });
    }
  });

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('ssamtime_swr_teachers_v2');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          parsed.forEach((t: any) => {
            if (t?.name) {
              teacherMap.set(t.name, {
                id: t.name,
                name: t.name,
                homeroom: t.homeroom || '',
                subject: t.subject || '',
                timetable:
                  typeof t.timetable === 'string'
                    ? JSON.parse(t.timetable)
                    : t.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} },
              });
            }
          });
        }
      }
    } catch {}
  }

  try {
    const res = await fetch('/api/teachers').catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        data.forEach((t: any) => {
          if (t?.name) {
            teacherMap.set(t.name, {
              id: t.name,
              name: t.name,
              homeroom: t.homeroom || '',
              subject: t.subject || '',
              timetable:
                typeof t.timetable === 'string'
                  ? JSON.parse(t.timetable)
                  : t.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} },
            });
          }
        });
      }
    }
  } catch {}

  try {
    const teacherSnap = await getDocs(collection(db, 'teachers'));
    teacherSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const name = data.name || docSnap.id;
      if (name) {
        teacherMap.set(name, {
          id: name,
          name,
          homeroom: data.homeroom || '',
          subject: data.subject || '',
          timetable:
            typeof data.timetable === 'string'
              ? JSON.parse(data.timetable)
              : data.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} },
        });
      }
    });
  } catch (err) {
    logFirestoreBackupError(err, 'list', 'teachers');
  }

  const teachers = Array.from(teacherMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'ko')
  );

  // 2. Classes (merge defaults -> localStorage -> API -> Firestore)
  const classMap = new Map<string, ClassTimetable>();
  ((defaultClassTimetablesData as ClassTimetable[]) || []).forEach((c) => {
    if (c?.classCode) {
      classMap.set(c.classCode, {
        classCode: c.classCode,
        grade: c.grade || parseInt(c.classCode.charAt(0), 10) || 1,
        classNum: c.classNum || parseInt(c.classCode.substring(1), 10) || 1,
        timetable:
          typeof c.timetable === 'string'
            ? JSON.parse(c.timetable)
            : c.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} },
      });
    }
  });

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('ssamtime_swr_classes_v2');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          parsed.forEach((c: any) => {
            if (c?.classCode) {
              classMap.set(c.classCode, {
                classCode: c.classCode,
                grade: c.grade || parseInt(c.classCode.charAt(0), 10) || 1,
                classNum: c.classNum || parseInt(c.classCode.substring(1), 10) || 1,
                timetable:
                  typeof c.timetable === 'string'
                    ? JSON.parse(c.timetable)
                    : c.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} },
              });
            }
          });
        }
      }
    } catch {}
  }

  try {
    const res = await fetch('/api/classes').catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        data.forEach((c: any) => {
          if (c?.classCode) {
            classMap.set(c.classCode, {
              classCode: c.classCode,
              grade: c.grade || parseInt(c.classCode.charAt(0), 10) || 1,
              classNum: c.classNum || parseInt(c.classCode.substring(1), 10) || 1,
              timetable:
                typeof c.timetable === 'string'
                  ? JSON.parse(c.timetable)
                  : c.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} },
            });
          }
        });
      }
    }
  } catch {}

  try {
    const classSnap = await getDocs(collection(db, 'classes'));
    classSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const classCode = data.classCode || docSnap.id;
      if (classCode) {
        classMap.set(classCode, {
          classCode,
          grade: data.grade || parseInt(classCode.charAt(0), 10) || 1,
          classNum: data.classNum || parseInt(classCode.substring(1), 10) || 1,
          timetable:
            typeof data.timetable === 'string'
              ? JSON.parse(data.timetable)
              : data.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} },
        });
      }
    });
  } catch (err) {
    logFirestoreBackupError(err, 'list', 'classes');
  }

  const classes = Array.from(classMap.values()).sort((a, b) =>
    a.classCode.localeCompare(b.classCode, 'ko', { numeric: true })
  );

  // 3. Admin Whitelist
  const whitelistMap = new Map<string, WhitelistUser>();
  ((defaultWhitelistData as WhitelistUser[]) || []).forEach((u) => {
    if (u?.email) whitelistMap.set(u.email.toLowerCase().trim(), u);
  });

  try {
    const wlSnap = await getDocs(collection(db, 'adminWhitelist'));
    wlSnap.forEach((docSnap) => {
      const data = docSnap.data() as WhitelistUser;
      const email = (data.email || docSnap.id || '').toLowerCase().trim();
      if (email) whitelistMap.set(email, { ...data, email });
    });
  } catch (err) {
    logFirestoreBackupError(err, 'list', 'adminWhitelist');
  }

  const whitelist = Array.from(whitelistMap.values()).sort((a, b) =>
    a.email.localeCompare(b.email)
  );

  // 4. Gate Duties
  const gateMap = new Map<string, GateDutyMonthRecord>();
  if (defaultGateDutiesData && (defaultGateDutiesData as GateDutyMonthRecord).yearMonth) {
    const rec = defaultGateDutiesData as GateDutyMonthRecord;
    gateMap.set(rec.yearMonth, rec);
  }
  try {
    const gateSnap = await getDocs(collection(db, 'gateDuties'));
    gateSnap.forEach((docSnap) => {
      const data = docSnap.data() as GateDutyMonthRecord;
      const ym = data.yearMonth || docSnap.id;
      if (ym && Array.isArray(data.duties)) {
        gateMap.set(ym, data);
      }
    });
  } catch (err) {
    logFirestoreBackupError(err, 'list', 'gateDuties');
  }
  const gateDuties = Array.from(gateMap.values()).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth)
  );

  // 5. Lunch Duties
  const lunchMap = new Map<string, LunchDutyMonthRecord>();
  if (defaultLunchDutiesData && (defaultLunchDutiesData as LunchDutyMonthRecord).yearMonth) {
    const rec = defaultLunchDutiesData as LunchDutyMonthRecord;
    lunchMap.set(rec.yearMonth, rec);
  }
  try {
    const lunchSnap = await getDocs(collection(db, 'lunchDuties'));
    lunchSnap.forEach((docSnap) => {
      const data = docSnap.data() as LunchDutyMonthRecord;
      const ym = data.yearMonth || docSnap.id;
      if (ym && Array.isArray(data.duties)) {
        lunchMap.set(ym, data);
      }
    });
  } catch (err) {
    logFirestoreBackupError(err, 'list', 'lunchDuties');
  }
  const lunchDuties = Array.from(lunchMap.values()).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth)
  );

  // 6. School Meals
  const mealsMap = new Map<string, MealMonthRecord>();
  if (defaultMealsData && (defaultMealsData as MealMonthRecord).yearMonth) {
    const rec = defaultMealsData as MealMonthRecord;
    mealsMap.set(rec.yearMonth, rec);
  }
  try {
    const mealSnap = await getDocs(collection(db, 'meals'));
    mealSnap.forEach((docSnap) => {
      const data = docSnap.data() as MealMonthRecord;
      const ym = data.yearMonth || docSnap.id;
      if (ym && Array.isArray(data.meals)) {
        mealsMap.set(ym, data);
      }
    });
  } catch (err) {
    logFirestoreBackupError(err, 'list', 'meals');
  }
  const meals = Array.from(mealsMap.values()).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth)
  );

  // 7. Push Config (small config doc)
  let pushConfig: SystemBackupPayload['pushConfig'] = null;
  try {
    const pushSnap = await getDoc(doc(db, 'admin', 'pushConfig'));
    if (pushSnap.exists()) {
      const data = pushSnap.data();
      pushConfig = {
        showPushPopup: typeof data.showPushPopup === 'boolean' ? data.showPushPopup : true,
        updatedAt: data.updatedAt || '',
        updatedBy: data.updatedBy || '',
      };
    }
  } catch {}

  // NOTE: `auditLogs` is EXPLICITLY EXCLUDED from payload to prevent unbounded backup bloat.
  return stripUndefinedDeep({
    teachers,
    classes,
    whitelist,
    gateDuties,
    lunchDuties,
    meals,
    pushConfig,
  });
}

/**
 * Rotate ONLY `backupType === 'auto'` snapshots in Firestore (keep newest 10).
 * `backupType === 'manual'` snapshots are NEVER queried or deleted here.
 */
async function rotateAutoBackupsInFirestore(): Promise<number> {
  const autoDocs: Array<{ id: string; createdAt: number }> = [];

  try {
    const q = query(
      collection(db, 'systemBackups'),
      where('backupType', '==', 'auto'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data();
      if (data.backupType === 'auto') {
        autoDocs.push({ id: d.id, createdAt: Number(data.createdAt) || 0 });
      }
    });
  } catch {
    // Index-free fallback query
    try {
      const qFallback = query(
        collection(db, 'systemBackups'),
        where('backupType', '==', 'auto')
      );
      const snap = await getDocs(qFallback);
      snap.forEach((d) => {
        const data = d.data();
        if (data.backupType === 'auto') {
          autoDocs.push({ id: d.id, createdAt: Number(data.createdAt) || 0 });
        }
      });
      autoDocs.sort((a, b) => b.createdAt - a.createdAt);
    } catch (innerErr) {
      logFirestoreBackupError(innerErr, 'list', 'systemBackups');
      return 0;
    }
  }

  if (autoDocs.length <= AUTO_BACKUP_MAX_COUNT) {
    return 0;
  }

  const toDelete = autoDocs.slice(AUTO_BACKUP_MAX_COUNT);
  let deletedCount = 0;

  for (const item of toDelete) {
    try {
      await deleteDoc(doc(db, 'systemBackups', item.id));
      await fetch(`/api/system-backups/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      }).catch(() => {});
      deletedCount++;
    } catch (delErr) {
      logFirestoreBackupError(delErr, 'delete', `systemBackups/${item.id}`);
    }
  }

  return deletedCount;
}

/**
 * Core Backup Function (`backupData`)
 * - Supports `backupType: 'auto' | 'manual'`
 * - For 'auto': enforces 1-hour debounce + 10-slot auto-rotation (manual snapshots untouched)
 * - Explicitly excludes `auditLogs`
 */
export async function backupData(
  backupType: BackupType,
  options?: {
    reason?: string;
    label?: string;
    createdBy?: string;
    bypassDebounce?: boolean;
  }
): Promise<BackupRunResult> {
  if (backupType === 'auto' && isRestoreInProgress()) {
    return { created: false, skipped: true, reason: 'restore_in_progress' };
  }

  const execute = async (): Promise<BackupRunResult> => {
    const now = Date.now();

    // 1. 1-Hour Debounce guard for event-driven auto backups
    if (backupType === 'auto' && !options?.bypassDebounce) {
      const lastAutoTs = await getLatestAutoBackupTimestamp();
      if (lastAutoTs > 0 && now - lastAutoTs < AUTO_BACKUP_DEBOUNCE_MS) {
        return {
          created: false,
          skipped: true,
          reason: 'debounced_within_1h',
          nextEligibleAt: lastAutoTs + AUTO_BACKUP_DEBOUNCE_MS,
        };
      }
    }

    // 2. Gather ONLY core data (explicitly excluding `auditLogs`)
    const payload = await collectCoreSystemPayload();

    const gateDayCount = payload.gateDuties.reduce(
      (acc, m) => acc + (Array.isArray(m.duties) ? m.duties.length : 0),
      0
    );
    const lunchDayCount = payload.lunchDuties.reduce(
      (acc, m) => acc + (Array.isArray(m.duties) ? m.duties.length : 0),
      0
    );
    const mealDayCount = payload.meals.reduce(
      (acc, m) => acc + (Array.isArray(m.meals) ? m.meals.length : 0),
      0
    );

    const summary: SystemBackupSummary = {
      teacherCount: payload.teachers.length,
      classCount: payload.classes.length,
      whitelistCount: payload.whitelist.length,
      gateDutyCount: gateDayCount,
      lunchDutyCount: lunchDayCount,
      mealCount: mealDayCount,
      dutyAndMealCount: gateDayCount + lunchDayCount + mealDayCount,
    };

    const id = `bkp_${backupType}_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const operatorEmail =
      options?.createdBy ||
      auth.currentUser?.email ||
      (backupType === 'auto' ? 'auto-system' : 'admin');

    const record: SystemBackupRecord = stripUndefinedDeep({
      id,
      backupType,
      createdAt: now,
      createdAtIso: new Date(now).toISOString(),
      createdBy: operatorEmail,
      version: getAppReleaseVersion(),
      reason:
        options?.reason ||
        (backupType === 'manual' ? '관리자 확정 스냅샷 생성' : '데이터 변경 감지 자동 순환 백업'),
      label:
        options?.label ||
        (backupType === 'manual' ? '수동 영구 스냅샷' : '자동 순환 백업'),
      excludedCollections: [...EXCLUDED_BACKUP_COLLECTIONS],
      summary,
      payload,
      savedToServerDisk: false,
    });

    // 3. Persist to Express server disk (dual redundancy alongside Firestore)
    try {
      const diskRes = await fetch('/api/system-backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: record }),
      }).catch(() => null);
      if (diskRes && diskRes.ok) {
        const diskData = await diskRes.json().catch(() => null);
        record.savedToServerDisk = true;
        if (diskData?.serverFilename) {
          record.serverFilename = diskData.serverFilename;
        }
      }
    } catch {}

    // 4. Persist to Firestore `systemBackups`
    let savedToFirebase = false;
    try {
      const docRef = doc(db, 'systemBackups', record.id);
      await setDoc(docRef, stripUndefinedDeep({ ...record }));
      savedToFirebase = true;
    } catch (err) {
      logFirestoreBackupError(err, 'create', `systemBackups/${record.id}`);
      if (!record.savedToServerDisk) {
        throw err;
      }
    }

    if (backupType === 'auto') {
      setCachedLastAutoBackupTs(now);
    }

    // 5. Auto-rotation: ONLY when `backupType === 'auto'`
    let rotatedDeletedCount = 0;
    if (backupType === 'auto' && savedToFirebase) {
      rotatedDeletedCount = await rotateAutoBackupsInFirestore();
    }

    record.savedToFirebase = savedToFirebase;
    emitBackupsUpdated();

    return {
      created: true,
      backup: record,
      rotatedDeletedCount,
    };
  };

  if (backupType === 'auto') {
    if (autoBackupInFlight) {
      return autoBackupInFlight;
    }
    autoBackupInFlight = execute().finally(() => {
      autoBackupInFlight = null;
    });
    return autoBackupInFlight;
  }

  return execute();
}

/**
 * Non-blocking event-driven auto-backup trigger for CRUD mutations
 */
export function triggerAutoBackup(reason: string, createdBy?: string): void {
  if (isRestoreInProgress()) return;
  backupData('auto', { reason, createdBy }).catch((err) => {
    console.warn(`[AutoBackup] Non-fatal notice (${reason}):`, err);
  });
}

/**
 * Fetch all system backups merged from Firestore and Express disk, split cleanly by `backupType`
 */
export async function fetchSystemBackups(): Promise<{
  manualBackups: SystemBackupRecord[];
  autoBackups: SystemBackupRecord[];
  allBackups: SystemBackupRecord[];
}> {
  const merged = new Map<string, SystemBackupRecord>();

  // 1. Read from Express disk API
  try {
    const res = await fetch('/api/system-backups').catch(() => null);
    if (res && res.ok) {
      const diskList = await res.json().catch(() => null);
      if (Array.isArray(diskList)) {
        diskList.forEach((b: SystemBackupRecord) => {
          if (b?.id && (b.backupType === 'auto' || b.backupType === 'manual')) {
            merged.set(b.id, {
              ...b,
              savedToServerDisk: true,
              savedToFirebase: false,
            });
          }
        });
      }
    }
  } catch {}

  // 2. Read from Firestore `systemBackups`
  try {
    const snap = await getDocs(collection(db, 'systemBackups'));
    snap.forEach((docSnap) => {
      const data = docSnap.data() as SystemBackupRecord;
      const id = data.id || docSnap.id;
      if (id && (data.backupType === 'auto' || data.backupType === 'manual')) {
        const prev = merged.get(id);
        merged.set(id, {
          ...data,
          id,
          savedToFirebase: true,
          savedToServerDisk: Boolean(prev?.savedToServerDisk || data.savedToServerDisk),
          serverFilename: prev?.serverFilename || data.serverFilename,
        });
      }
    });
  } catch (err) {
    logFirestoreBackupError(err, 'list', 'systemBackups');
  }

  const allBackups = Array.from(merged.values()).sort(
    (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
  );

  // Strict partition into manual vs auto arrays
  const manualBackups = allBackups.filter((b) => b.backupType === 'manual');
  const autoBackups = allBackups.filter((b) => b.backupType === 'auto');

  return { manualBackups, autoBackups, allBackups };
}

/**
 * Fetch live KPI metrics for the Backup Dashboard Hero Panel
 * Reads auditLogs count ONLY for the "(백업 제외)" KPI counter without copying auditLogs into backups.
 */
export async function fetchBackupDashboardMetrics(): Promise<BackupDashboardMetrics> {
  const payload = await collectCoreSystemPayload();

  let excludedAuditLogCount = 0;
  try {
    const auditSnap = await getDocs(collection(db, 'auditLogs'));
    excludedAuditLogCount = auditSnap.size;
  } catch {
    try {
      const res = await fetch('/api/audit-logs').catch(() => null);
      if (res && res.ok) {
        const list = await res.json().catch(() => null);
        if (Array.isArray(list)) excludedAuditLogCount = list.length;
      }
    } catch {}
  }

  // Fallback to localStorage audit cache if Firestore/API returned 0
  if (excludedAuditLogCount === 0 && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('ssamtime_swr_audit_logs_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) excludedAuditLogCount = parsed.length;
      }
    } catch {}
  }

  return {
    teacherCount: payload.teachers.length,
    classCount: payload.classes.length,
    whitelistCount: payload.whitelist.length,
    gateDutyMonths: payload.gateDuties.length,
    lunchDutyMonths: payload.lunchDuties.length,
    mealMonths: payload.meals.length,
    dutyAndMealAndWhitelistCount:
      payload.gateDuties.length +
      payload.lunchDuties.length +
      payload.meals.length +
      payload.whitelist.length,
    excludedAuditLogCount,
  };
}

/**
 * Delete a single backup snapshot (both Firestore & Server Disk)
 */
export async function deleteSystemBackup(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'systemBackups', id));
  } catch (err) {
    logFirestoreBackupError(err, 'delete', `systemBackups/${id}`);
  }

  await fetch(`/api/system-backups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).catch(() => {});

  emitBackupsUpdated();
}

/**
 * Restore all core collections from a chosen backup snapshot
 * Guards against triggering redundant auto-backups during restore mutations.
 */
export async function restoreSystemBackup(
  backup: SystemBackupRecord
): Promise<{
  teachers: Teacher[];
  classes: ClassTimetable[];
  whitelistCount: number;
  gateDutyMonths: number;
  lunchDutyMonths: number;
  mealMonths: number;
}> {
  restoreLockCount++;
  try {
    const payload = backup.payload;
    if (!payload) {
      throw new Error('복원할 백업 데이터가 손상되었거나 비어 있습니다.');
    }

    const cleanTeachers = (Array.isArray(payload.teachers) ? payload.teachers : []).sort((a, b) =>
      a.name.localeCompare(b.name, 'ko')
    );
    const cleanClasses = (Array.isArray(payload.classes) ? payload.classes : []).sort((a, b) =>
      String(a.classCode).localeCompare(String(b.classCode), 'ko', { numeric: true })
    );
    const cleanWhitelist = Array.isArray(payload.whitelist) ? payload.whitelist : [];
    const cleanGateDuties = Array.isArray(payload.gateDuties) ? payload.gateDuties : [];
    const cleanLunchDuties = Array.isArray(payload.lunchDuties) ? payload.lunchDuties : [];
    const cleanMeals = Array.isArray(payload.meals) ? payload.meals : [];

    // 1. Express Server Disk Atomic Restore
    await fetch('/api/system-backups/restore-disk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    }).catch(() => {});

    // 2. Restore `teachers` in Firestore
    if (cleanTeachers.length > 0) {
      const existingTeachers = await getDocs(collection(db, 'teachers'));
      const newNames = new Set(cleanTeachers.map((t) => t.name));
      const ops: Array<{ type: 'delete' | 'set'; ref: any; data?: any }> = [];

      existingTeachers.forEach((docSnap) => {
        if (!newNames.has(docSnap.id)) {
          ops.push({ type: 'delete', ref: docSnap.ref });
        }
      });

      cleanTeachers.forEach((t) => {
        ops.push({
          type: 'set',
          ref: doc(db, 'teachers', t.name),
          data: {
            name: t.name,
            homeroom: t.homeroom || '',
            subject: t.subject || '',
            timetable:
              typeof t.timetable === 'string'
                ? t.timetable
                : JSON.stringify(t.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} }),
            updatedAt: Date.now(),
          },
        });
      });

      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach((op) => {
          if (op.type === 'delete') batch.delete(op.ref);
          else batch.set(op.ref, op.data);
        });
        await batch.commit();
      }
    }

    // 3. Restore `classes` in Firestore
    if (cleanClasses.length > 0) {
      const existingClasses = await getDocs(collection(db, 'classes'));
      const batch = writeBatch(db);
      existingClasses.forEach((docSnap) => batch.delete(docSnap.ref));
      cleanClasses.forEach((c) => {
        batch.set(doc(db, 'classes', c.classCode), {
          classCode: c.classCode,
          grade: c.grade || parseInt(c.classCode.charAt(0), 10) || 1,
          classNum: c.classNum || parseInt(c.classCode.substring(1), 10) || 1,
          timetable:
            typeof c.timetable === 'string'
              ? c.timetable
              : JSON.stringify(c.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} }),
          updatedAt: Date.now(),
        });
      });
      await batch.commit();
    }

    // 4. Restore `adminWhitelist` in Firestore
    if (cleanWhitelist.length > 0) {
      const existingWl = await getDocs(collection(db, 'adminWhitelist'));
      const newEmails = new Set(cleanWhitelist.map((u) => u.email.toLowerCase().trim()));
      const batch = writeBatch(db);
      existingWl.forEach((docSnap) => {
        if (!newEmails.has(docSnap.id.toLowerCase().trim())) {
          batch.delete(docSnap.ref);
        }
      });
      cleanWhitelist.forEach((u) => {
        const cleanEmail = u.email.toLowerCase().trim();
        batch.set(
          doc(db, 'adminWhitelist', cleanEmail),
          stripUndefinedDeep({
            ...u,
            email: cleanEmail,
            updatedAt: new Date().toISOString(),
          })
        );
      });
      await batch.commit();
    }

    // 5. Restore Gate Duties, Lunch Duties, Meals, PushConfig in Firestore
    for (const rec of cleanGateDuties) {
      if (rec?.yearMonth) {
        await setDoc(doc(db, 'gateDuties', rec.yearMonth), stripUndefinedDeep(rec));
      }
    }
    for (const rec of cleanLunchDuties) {
      if (rec?.yearMonth) {
        await setDoc(doc(db, 'lunchDuties', rec.yearMonth), stripUndefinedDeep(rec));
      }
    }
    for (const rec of cleanMeals) {
      if (rec?.yearMonth) {
        await setDoc(doc(db, 'meals', rec.yearMonth), stripUndefinedDeep(rec));
      }
    }
    if (payload.pushConfig) {
      await setDoc(
        doc(db, 'admin', 'pushConfig'),
        stripUndefinedDeep({
          ...payload.pushConfig,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    }

    // 6. Refresh Client localStorage SWR caches immediately
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ssamtime_swr_teachers_v2', JSON.stringify(cleanTeachers));
        localStorage.setItem('ssamtime_swr_classes_v2', JSON.stringify(cleanClasses));
        if (cleanWhitelist.length > 0) {
          localStorage.setItem('ssamtime_swr_whitelist_v3', JSON.stringify(cleanWhitelist));
        }
        cleanGateDuties.forEach((rec) => {
          localStorage.setItem(`ssamtime_swr_gate_${rec.yearMonth}`, JSON.stringify(rec));
          localStorage.setItem(`gateDuty_${rec.yearMonth}`, JSON.stringify(rec));
        });
        cleanLunchDuties.forEach((rec) => {
          localStorage.setItem(`ssamtime_swr_lunch_${rec.yearMonth}`, JSON.stringify(rec));
          localStorage.setItem(`lunchDuty_${rec.yearMonth}`, JSON.stringify(rec));
        });
        cleanMeals.forEach((rec) => {
          localStorage.setItem(`meal_${rec.yearMonth}`, JSON.stringify(rec));
        });
        if (payload.pushConfig) {
          localStorage.setItem(
            'ssamtime_push_popup_enabled_v1',
            String(payload.pushConfig.showPushPopup)
          );
          window.dispatchEvent(
            new CustomEvent('push_popup_config_changed', {
              detail: { showPushPopup: payload.pushConfig.showPushPopup },
            })
          );
        }
      } catch {}
    }

    return {
      teachers: cleanTeachers,
      classes: cleanClasses,
      whitelistCount: cleanWhitelist.length,
      gateDutyMonths: cleanGateDuties.length,
      lunchDutyMonths: cleanLunchDuties.length,
      mealMonths: cleanMeals.length,
    };
  } finally {
    restoreLockCount = Math.max(0, restoreLockCount - 1);
  }
}

/**
 * Export either a specific snapshot OR the current live system state to a multi-sheet Excel file
 */
export async function exportSystemBackupToExcel(backup?: SystemBackupRecord): Promise<string> {
  const payload = backup ? backup.payload : await collectCoreSystemPayload();
  const wb = XLSX.utils.book_new();

  // Sheet 1: 메타 정보
  const dateLabel = backup
    ? new Date(backup.createdAt).toLocaleString('ko-KR')
    : new Date().toLocaleString('ko-KR');
  const metaRows = [
    ['항목', '내용'],
    ['백업 구분', backup ? (backup.backupType === 'manual' ? '수동 영구 스냅샷 (manual)' : '자동 순환 백업 (auto)') : '현재 실시간 전체 데이터'],
    ['생성 일시', dateLabel],
    ['생성자', backup?.createdBy || auth.currentUser?.email || 'admin'],
    ['앱 버전', backup?.version || getAppReleaseVersion()],
    ['교원 시간표 수', `${payload.teachers.length}명`],
    ['학급 시간표 수', `${payload.classes.length}개반`],
    ['승인 계정 수', `${payload.whitelist.length}명`],
    ['제외 컬렉션 (최적화)', 'auditLogs (보안 감사 로그 백업 제외)'],
  ];
  const wsMeta = XLSX.utils.aoa_to_sheet(metaRows);
  wsMeta['!cols'] = [{ wch: 24 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, '백업_메타정보');

  // Sheet 2: 교원 시간표
  const days: Array<{ key: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'; name: string; maxPeriod: number }> = [
    { key: 'Mon', name: '월', maxPeriod: 7 },
    { key: 'Tue', name: '화', maxPeriod: 7 },
    { key: 'Wed', name: '수', maxPeriod: 6 },
    { key: 'Thu', name: '목', maxPeriod: 6 },
    { key: 'Fri', name: '금', maxPeriod: 6 },
  ];
  const tHeaders = ['연번', '성함', '담당 과목', '담임 학급'];
  days.forEach((d) => {
    for (let p = 1; p <= d.maxPeriod; p++) tHeaders.push(`${d.name}${p}`);
  });
  const tRows: (string | number)[][] = [tHeaders];
  payload.teachers.forEach((t, idx) => {
    const vals: string[] = [];
    days.forEach((d) => {
      const ds = t.timetable?.[d.key] || {};
      for (let p = 1; p <= d.maxPeriod; p++) {
        vals.push(ds[p] ? String(ds[p]) : '');
      }
    });
    tRows.push([idx + 1, t.name, t.subject || '', t.homeroom || '', ...vals]);
  });
  const wsTeachers = XLSX.utils.aoa_to_sheet(tRows);
  XLSX.utils.book_append_sheet(wb, wsTeachers, '교원_시간표');

  // Sheet 3: 학급 시간표
  const cRows: (string | number)[][] = [['학급', '교시', '월', '화', '수', '목', '금']];
  payload.classes.forEach((c) => {
    const tt = c.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} };
    for (let p = 1; p <= 7; p++) {
      cRows.push([
        c.classCode,
        `${p}교시`,
        tt.Mon?.[p] || '',
        tt.Tue?.[p] || '',
        tt.Wed?.[p] || '',
        tt.Thu?.[p] || '',
        tt.Fri?.[p] || '',
      ]);
    }
  });
  const wsClasses = XLSX.utils.aoa_to_sheet(cRows);
  XLSX.utils.book_append_sheet(wb, wsClasses, '학급_시간표');

  // Sheet 4: 당직 · 식단
  const dRows: (string | number)[][] = [['구분', '월', '일자', '요일', '배정/메뉴', '비고']];
  payload.gateDuties.forEach((m) => {
    (m.duties || []).forEach((d) => {
      dRows.push(['교문지도', m.yearMonth, d.date, d.dayOfWeek, (d.teachers || []).join(', '), d.note || '']);
    });
  });
  payload.lunchDuties.forEach((m) => {
    (m.duties || []).forEach((d) => {
      const list = [d.generalTeacher, d.grade3Teacher, d.grade2Teacher, d.grade1Teacher]
        .filter(Boolean)
        .join(', ');
      dRows.push(['급식감독', m.yearMonth, d.date, d.dayOfWeek, list, d.note || '']);
    });
  });
  payload.meals.forEach((m) => {
    (m.meals || []).forEach((d) => {
      dRows.push(['식단표', m.yearMonth, d.date, d.dayOfWeek, (d.menuItems || []).join(', '), d.calories || '']);
    });
  });
  const wsDuties = XLSX.utils.aoa_to_sheet(dRows);
  XLSX.utils.book_append_sheet(wb, wsDuties, '당직_급식_식단');

  // Sheet 5: 화이트리스트 승인 계정
  const wRows: (string | number)[][] = [['이메일', '이름', '권한', '권한명', '소속']];
  payload.whitelist.forEach((u) => {
    wRows.push([u.email, u.name || '', u.role, u.roleName || '', u.department || '']);
  });
  const wsWhitelist = XLSX.utils.aoa_to_sheet(wRows);
  XLSX.utils.book_append_sheet(wb, wsWhitelist, '승인_계정');

  const stamp = backup
    ? new Date(backup.createdAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const typeTag = backup ? (backup.backupType === 'manual' ? '수동영구스냅샷' : '자동백업') : '전체백업';
  const filename = `쌤타임_${typeTag}_${stamp}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
