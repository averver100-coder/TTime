import { collection, getDocs, setDoc, getDoc, doc, writeBatch } from 'firebase/firestore';
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

export async function fetchTeachers(): Promise<Teacher[]> {
  try {
    // 1. Try fast local Express API
    const res = await fetch('/api/teachers').catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        return (data as Teacher[]).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      }
    }

    // 2. Try Firestore with a 3-second timeout
    const firestorePromise = (async () => {
      const snapshot = await getDocs(collection(db, 'teachers'));
      const list: Teacher[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          name: data.name,
          homeroom: data.homeroom || '',
          timetable: typeof data.timetable === 'string' ? JSON.parse(data.timetable) : data.timetable,
        });
      });
      return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    })();

    const timeoutPromise = new Promise<Teacher[]>((_, reject) => 
      setTimeout(() => reject(new Error('Firestore timeout')), 2500)
    );

    const teachers = await Promise.race([firestorePromise, timeoutPromise]);
    if (teachers && teachers.length > 0) {
      return teachers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }
  } catch (err) {
    console.warn('Network fetch error, falling back to default teacher data:', err);
  }

  // 3. Fallback immediately to bundled default teachers
  const fallback = (defaultTeachersData as Teacher[]) || [];
  return [...fallback].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function resetAndUploadTeachers(teachers: Teacher[]) {
  const sorted = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  // 1. Always update local Express server API (defaultTeachers.json)
  try {
    await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sorted)
    });
  } catch (apiErr) {
    console.warn('Failed to update local API teachers:', apiErr);
  }

  // 2. Try updating Firestore with timeout
  try {
    const firestorePromise = (async () => {
      const snapshot = await getDocs(collection(db, 'teachers'));
      const operations: Array<{ type: 'delete', ref: any } | { type: 'set', ref: any, data: any }> = [];
      
      snapshot.forEach(docSnap => {
        operations.push({ type: 'delete', ref: docSnap.ref });
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
      setTimeout(() => reject(new Error('Firestore timeout')), 3000)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
  } catch (firestoreErr) {
    console.warn('Firestore sync skipped or timed out, relying on local storage:', firestoreErr);
  }
}
