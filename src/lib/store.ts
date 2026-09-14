import { collection, getDocs, setDoc, getDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { Teacher } from './timetableUtils';
import defaultTeachersData from '../data/defaultTeachers.json';

export function getDefaultTeachers(): Teacher[] {
  const list = (defaultTeachersData as Teacher[]) || [];
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export type AdminRole = 'superadmin' | 'admin';

export interface AdminUser {
  id: string;
  role: AdminRole;
  roleName: string;
}

export interface BackupItem {
  filename: string;
  createdAt: string;
  size: number;
  teacherCount: number;
}

export async function verifyAdmin(id: string, pw: string): Promise<AdminUser | null> {
  const trimmedId = (id || '').trim();
  const trimmedPw = (pw || '').trim();

  // 1. Super Admin: averver / nyng5929!
  if (trimmedId === 'averver') {
    try {
      const superRef = doc(db, 'admin', 'superadmin');
      const snap = await getDoc(superRef);

      if (!snap.exists()) {
        if (trimmedPw === 'nyng5929!') {
          await setDoc(superRef, { password: 'nyng5929!', role: 'superadmin', id: 'averver' }).catch(() => {});
          return { id: 'averver', role: 'superadmin', roleName: '슈퍼어드민' };
        }
        return null;
      }

      const storedPw = snap.data()?.password;
      if (storedPw === trimmedPw || (!storedPw && trimmedPw === 'nyng5929!')) {
        return { id: 'averver', role: 'superadmin', roleName: '슈퍼어드민' };
      }
      return null;
    } catch (err) {
      console.warn('Super admin Firestore check fallback to hardcoded credential:', err);
      if (trimmedPw === 'nyng5929!') {
        return { id: 'averver', role: 'superadmin', roleName: '슈퍼어드민' };
      }
      return null;
    }
  }

  // 2. Regular Admin: sangsang / 07320733*
  if (trimmedId === 'sangsang') {
    try {
      const adminRef = doc(db, 'admin', 'settings');
      const snap = await getDoc(adminRef);

      if (!snap.exists()) {
        if (trimmedPw === '07320733*') {
          await setDoc(adminRef, { password: '07320733*', role: 'admin', id: 'sangsang' }).catch(() => {});
          return { id: 'sangsang', role: 'admin', roleName: '일반 관리자' };
        }
        return null;
      }

      const storedPw = snap.data()?.password;
      if (storedPw === trimmedPw || (!storedPw && trimmedPw === '07320733*')) {
        return { id: 'sangsang', role: 'admin', roleName: '일반 관리자' };
      }
      return null;
    } catch (err) {
      console.warn('Admin Firestore check fallback to hardcoded credential:', err);
      if (trimmedPw === '07320733*') {
        return { id: 'sangsang', role: 'admin', roleName: '일반 관리자' };
      }
      return null;
    }
  }

  return null;
}

export async function updateAdminPassword(newPw: string, targetId: string = 'sangsang'): Promise<void> {
  const docId = targetId === 'averver' ? 'superadmin' : 'settings';
  const targetRef = doc(db, 'admin', docId);
  await setDoc(targetRef, { password: newPw, role: targetId === 'averver' ? 'superadmin' : 'admin', id: targetId }, { merge: true });
}

/**
 * Robust Union/Merge Fetch:
 * Collects teachers from bundled defaults, local server cache, AND Firestore,
 * merging them by teacher name so that NO teacher is ever accidentally lost!
 */
export async function fetchTeachers(): Promise<Teacher[]> {
  const teacherMap = new Map<string, Teacher>();

  // 1. Seed with bundled data (contains all 67 baseline teachers)
  const bundled = (defaultTeachersData as Teacher[]) || [];
  bundled.forEach(t => {
    if (t && t.name) {
      teacherMap.set(t.name, {
        id: t.name,
        name: t.name,
        homeroom: t.homeroom || '',
        timetable: typeof t.timetable === 'string' ? JSON.parse(t.timetable) : (t.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} })
      });
    }
  });

  // 2. Overlay from local Express API
  let localApiCount = 0;
  try {
    const res = await fetch('/api/teachers').catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        localApiCount = data.length;
        data.forEach((t: any) => {
          if (t && t.name) {
            teacherMap.set(t.name, {
              id: t.name,
              name: t.name,
              homeroom: t.homeroom || '',
              timetable: typeof t.timetable === 'string' ? JSON.parse(t.timetable) : (t.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} })
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('Local API read warning:', err);
  }

  // 3. Overlay from Firestore (authoritative cloud state)
  try {
    const firestorePromise = (async () => {
      const snapshot = await getDocs(collection(db, 'teachers'));
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const name = data.name || docSnap.id;
        if (name) {
          teacherMap.set(name, {
            id: name,
            name: name,
            homeroom: data.homeroom || '',
            timetable: typeof data.timetable === 'string' ? JSON.parse(data.timetable) : (data.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} })
          });
        }
      });
    })();

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firestore timeout')), 3000)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
  } catch (err) {
    console.warn('Firestore fetch warning (using local/cached merged state):', err);
  }

  const mergedList = Array.from(teacherMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // If merged list has more records than local disk API had, sync back to local disk
  if (mergedList.length > localApiCount) {
    fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mergedList)
    }).catch(() => {});
  }

  return mergedList;
}

/**
 * Surgical single-teacher update:
 * Saves ONLY this teacher in Firestore and Express API.
 * Guarantees zero risk to any other teacher's schedule.
 */
export async function saveSingleTeacher(teacher: Teacher): Promise<void> {
  const cleanTeacher: Teacher = {
    id: teacher.name,
    name: teacher.name,
    homeroom: teacher.homeroom || '',
    timetable: teacher.timetable || { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} }
  };

  // 1. Update local Express server API
  try {
    await fetch('/api/teachers/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher: cleanTeacher })
    });
  } catch (apiErr) {
    console.warn('Local single teacher save warning:', apiErr);
  }

  // 2. Update Firestore document surgically
  try {
    const firestorePromise = (async () => {
      const ref = doc(db, 'teachers', cleanTeacher.name);
      await setDoc(ref, {
        name: cleanTeacher.name,
        homeroom: cleanTeacher.homeroom || '',
        timetable: typeof cleanTeacher.timetable === 'string' 
          ? cleanTeacher.timetable 
          : JSON.stringify(cleanTeacher.timetable),
        updatedAt: Date.now()
      }, { merge: true });
    })();

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firestore timeout')), 3500)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
  } catch (firestoreErr) {
    console.warn('Firestore single teacher save warning:', firestoreErr);
  }
}

/**
 * Surgical single-teacher delete:
 * Deletes ONLY this teacher from Firestore and Express API.
 */
export async function deleteSingleTeacher(teacherName: string): Promise<void> {
  // 1. Delete from local Express API
  try {
    await fetch(`/api/teachers/${encodeURIComponent(teacherName)}`, {
      method: 'DELETE'
    });
  } catch (apiErr) {
    console.warn('Local teacher delete warning:', apiErr);
  }

  // 2. Delete from Firestore
  try {
    const firestorePromise = (async () => {
      const ref = doc(db, 'teachers', teacherName);
      await deleteDoc(ref);
    })();

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firestore timeout')), 3500)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
  } catch (firestoreErr) {
    console.warn('Firestore teacher delete warning:', firestoreErr);
  }
}

/**
 * Bulk teachers upload (used when importing Excel/PDF or full sync).
 * Automatically creates a snapshot backup on the server before modifying.
 */
export async function resetAndUploadTeachers(teachers: Teacher[]): Promise<void> {
  const sorted = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 1. Always update local Express server API (triggers automated server backup)
  try {
    await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sorted)
    });
  } catch (apiErr) {
    console.warn('Failed to update local API teachers:', apiErr);
  }

  // 2. Update Firestore safely
  try {
    const firestorePromise = (async () => {
      const snapshot = await getDocs(collection(db, 'teachers'));
      const newNamesSet = new Set(sorted.map(t => t.name));
      const operations: Array<{ type: 'delete', ref: any } | { type: 'set', ref: any, data: any }> = [];
      
      // Only delete documents that are not in the new upload
      snapshot.forEach(docSnap => {
        if (!newNamesSet.has(docSnap.id)) {
          operations.push({ type: 'delete', ref: docSnap.ref });
        }
      });

      sorted.forEach(teacher => {
        const ref = doc(collection(db, 'teachers'), teacher.name);
        operations.push({
          type: 'set',
          ref,
          data: {
            name: teacher.name,
            homeroom: teacher.homeroom || '',
            timetable: typeof teacher.timetable === 'string' ? teacher.timetable : JSON.stringify(teacher.timetable),
            updatedAt: Date.now()
          }
        });
      });

      const BATCH_SIZE = 400;
      for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const chunk = operations.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const op of chunk) {
          if (op.type === 'delete') {
            batch.delete(op.ref);
          } else {
            batch.set(op.ref, op.data);
          }
        }
        await batch.commit();
      }
    })();

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firestore timeout')), 4000)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
  } catch (firestoreErr) {
    console.warn('Firestore bulk sync warning:', firestoreErr);
  }
}

/**
 * Fetch list of automated backups
 */
export async function fetchBackups(): Promise<BackupItem[]> {
  try {
    const res = await fetch('/api/backups');
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch backups:', err);
    return [];
  }
}

/**
 * Create a manual backup snapshot on demand
 */
export async function createManualBackup(): Promise<{ success: boolean; filename?: string; teacherCount?: number }> {
  try {
    const res = await fetch('/api/backups/create', { method: 'POST' });
    if (!res.ok) throw new Error('Backup creation failed');
    return await res.json();
  } catch (err) {
    console.error('Failed to create manual backup:', err);
    throw err;
  }
}

/**
 * Restore teachers from a specific backup file
 */
export async function restoreBackup(filename: string): Promise<Teacher[]> {
  const res = await fetch('/api/backups/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename })
  });

  if (!res.ok) {
    throw new Error('백업 파일 복원에 실패했습니다.');
  }

  const { teachers } = await res.json();
  if (Array.isArray(teachers) && teachers.length > 0) {
    // Also sync restored teachers to Firestore
    try {
      await resetAndUploadTeachers(teachers);
    } catch (err) {
      console.warn('Firestore sync during restore warning:', err);
    }
    return teachers;
  }
  throw new Error('복원된 데이터가 비어있습니다.');
}
