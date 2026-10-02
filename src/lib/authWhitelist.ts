import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { AdminUser, WhitelistUser, AuditLog } from '../types/auth';
import defaultWhitelistData from '../data/defaultWhitelist.json';
import defaultAuditLogsData from '../data/auditLogs.json';

export const DEFAULT_SUPERADMIN_EMAIL = 'averver100@gmail.com';
export const SWR_WHITELIST_CACHE_KEY = 'ssamtime_swr_whitelist_v3';
export const DELETED_WHITELIST_KEY = 'ssamtime_deleted_whitelist_v3';
export const SWR_AUDIT_LOGS_CACHE_KEY = 'ssamtime_swr_audit_logs_v2';
export const CURRENT_ADMIN_STORAGE_KEY = 'ssamtime_current_auth_admin_v2';

// Known legacy example accounts that were provided as initial samples
const LEGACY_SAMPLE_EMAILS = [
  'sangsang@sangil.hs.kr',
  'admin@sangil.hs.kr',
  'teacher@sangil.hs.kr'
];

/**
 * Retrieve set of permanently deleted emails
 */
export function getDeletedEmails(): Set<string> {
  const set = new Set<string>();
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(DELETED_WHITELIST_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach(e => {
            if (typeof e === 'string' && e.trim()) set.add(e.toLowerCase().trim());
          });
        }
      } else {
        // First run on new version: initialize deleted set with legacy sample emails
        LEGACY_SAMPLE_EMAILS.forEach(e => set.add(e));
        localStorage.setItem(DELETED_WHITELIST_KEY, JSON.stringify(Array.from(set)));
      }
    } catch {}
  }
  return set;
}

export function markEmailDeleted(email: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedEmails();
    set.add(email.toLowerCase().trim());
    localStorage.setItem(DELETED_WHITELIST_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export function unmarkEmailDeleted(email: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedEmails();
    set.delete(email.toLowerCase().trim());
    localStorage.setItem(DELETED_WHITELIST_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

/**
 * Get initial whitelist with local cache fallback
 */
export function getDefaultWhitelist(): WhitelistUser[] {
  const deletedSet = getDeletedEmails();
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(SWR_WHITELIST_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(u => u && u.email && !deletedSet.has(u.email.toLowerCase().trim()));
        }
      }
    } catch (e) {
      console.warn('Failed reading whitelist SWR cache:', e);
    }
  }
  return ((defaultWhitelistData as WhitelistUser[]) || [])
    .filter(u => u && u.email && !deletedSet.has(u.email.toLowerCase().trim()));
}

/**
 * Fetch complete whitelist from SWR, local API, and Firestore
 */
export async function fetchWhitelist(): Promise<WhitelistUser[]> {
  const deletedSet = getDeletedEmails();
  const map = new Map<string, WhitelistUser>();

  // Always ensure averver100@gmail.com exists as SuperAdmin
  map.set(DEFAULT_SUPERADMIN_EMAIL.toLowerCase(), {
    email: DEFAULT_SUPERADMIN_EMAIL,
    name: '최고관리자 (SuperAdmin)',
    role: 'superadmin',
    roleName: '슈퍼어드민',
    department: '시스템 관리국',
    createdAt: '2026-09-01T00:00:00.000Z'
  });

  // 1. Check local cache
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(SWR_WHITELIST_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          parsed.forEach((u: WhitelistUser) => {
            if (u && u.email) {
              const clean = u.email.toLowerCase().trim();
              if (!deletedSet.has(clean)) {
                map.set(clean, u);
              }
            }
          });
        }
      }
    } catch {}
  }

  // 2. Fetch from Local API
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => controller?.abort(), 1800);
    const res = await fetch('/api/whitelist', { signal: controller?.signal }).catch(() => null);
    clearTimeout(timeoutId);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data) && data.length > 0) {
        data.forEach((u: WhitelistUser) => {
          if (u && u.email) {
            const clean = u.email.toLowerCase().trim();
            if (!deletedSet.has(clean)) {
              map.set(clean, u);
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn('Local API whitelist fetch notice:', err);
  }

  // 3. Fetch from Firestore
  try {
    const firestorePromise = (async () => {
      const snapshot = await getDocs(collection(db, 'adminWhitelist'));
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as WhitelistUser;
        const email = data.email || docSnap.id;
        if (email) {
          const clean = email.toLowerCase().trim();
          if (!deletedSet.has(clean)) {
            map.set(clean, {
              ...data,
              email: clean
            });
          }
        }
      });
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore timeout')), 2500)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
  } catch (err) {
    console.warn('Firestore whitelist fetch notice:', err);
  }

  // Ensure any marked deleted email is purged
  for (const deleted of deletedSet) {
    if (deleted !== DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) {
      map.delete(deleted);
    }
  }

  const list = Array.from(map.values()).sort((a, b) => {
    if (a.role === 'superadmin') return -1;
    if (b.role === 'superadmin') return 1;
    return a.email.localeCompare(b.email);
  });

  if (typeof window !== 'undefined' && list.length > 0) {
    try {
      localStorage.setItem(SWR_WHITELIST_CACHE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed saving whitelist to SWR cache:', e);
    }
  }

  return list;
}

/**
 * Verify Google Account against Whitelist DB
 * - If inputEmail is blank/empty: auto-resolves to SuperAdmin (averver100@gmail.com)
 * - If matches whitelist: grants access and returns AdminUser
 * - If not whitelisted: denies access with a safe security notice
 */
export async function verifyGoogleWhitelist(inputEmail: string): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
  const trimmed = (inputEmail || '').trim().toLowerCase();

  // If blank, automatically resolve to SuperAdmin (averver100@gmail.com)
  const targetEmail = trimmed === '' ? DEFAULT_SUPERADMIN_EMAIL.toLowerCase() : trimmed;

  // Basic email syntax check if not empty
  if (trimmed !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return {
      success: false,
      error: '올바른 이메일 주소 형식(예: user@sangil.hs.kr)을 입력해 주세요.'
    };
  }

  const whitelist = await fetchWhitelist();
  const matched = whitelist.find(u => u.email.toLowerCase() === targetEmail);

  if (!matched) {
    // Record failed login audit log
    await logAuditEvent({
      operatorId: targetEmail,
      operatorName: '미승인 접근자',
      action: '로그인 차단',
      target: targetEmail,
      summary: `화이트리스트에 등록되지 않은 이메일(${targetEmail})의 관리자 접근이 안전하게 차단되었습니다.`,
      category: 'auth'
    }).catch(() => {});

    return {
      success: false,
      error: `승인되지 않은 계정입니다 (${targetEmail}). 관리자에게 권한 등록을 요청하세요.`
    };
  }

  // Update lastLoginAt
  const updatedUser: WhitelistUser = {
    ...matched,
    lastLoginAt: new Date().toISOString()
  };

  // Asynchronously update lastLoginAt in Firestore and Local API
  saveWhitelistUser(updatedUser, targetEmail, false).catch(() => {});

  const adminUser: AdminUser = {
    id: matched.email,
    email: matched.email,
    name: matched.name,
    role: matched.role,
    roleName: matched.roleName,
    department: matched.department,
    loginMethod: 'google'
  };

  // Record successful login audit log
  await logAuditEvent({
    operatorId: adminUser.email,
    operatorName: adminUser.name,
    action: '관리자 로그인',
    target: adminUser.email,
    summary: `${adminUser.name} (${adminUser.roleName}) 계정으로 Google 화이트리스트 보안 인증 로그인 성공`,
    category: 'auth'
  }).catch(() => {});

  // Save session
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(adminUser));
      localStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(adminUser));
    } catch {}
  }

  return {
    success: true,
    user: adminUser
  };
}

/**
 * Get currently authenticated admin user from storage
 */
export function getSavedAdminUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const sessionData = sessionStorage.getItem(CURRENT_ADMIN_STORAGE_KEY);
    if (sessionData) return JSON.parse(sessionData);

    const localData = localStorage.getItem(CURRENT_ADMIN_STORAGE_KEY);
    if (localData) return JSON.parse(localData);
  } catch {}
  return null;
}

/**
 * Clear authenticated session
 */
export function clearAdminSession(): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CURRENT_ADMIN_STORAGE_KEY);
      localStorage.removeItem(CURRENT_ADMIN_STORAGE_KEY);
    } catch {}
  }
}

/**
 * Save / Update Whitelist User
 */
export async function saveWhitelistUser(
  user: WhitelistUser, 
  operatorId: string,
  logAudit: boolean = true
): Promise<void> {
  const cleanEmail = user.email.trim().toLowerCase();

  // If this email was previously marked deleted, unmark it
  unmarkEmailDeleted(cleanEmail);

  // 1. Update SWR cache
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(SWR_WHITELIST_CACHE_KEY);
      let list: WhitelistUser[] = cached ? JSON.parse(cached) : [];
      const idx = list.findIndex(u => u.email.toLowerCase() === cleanEmail);
      if (idx !== -1) {
        list[idx] = { ...user, email: cleanEmail };
      } else {
        list.push({ ...user, email: cleanEmail });
      }
      localStorage.setItem(SWR_WHITELIST_CACHE_KEY, JSON.stringify(list));
    } catch {}
  }

  // 2. Local API
  try {
    await fetch('/api/whitelist/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: { ...user, email: cleanEmail } })
    });
  } catch (err) {
    console.warn('Local API whitelist save error:', err);
  }

  // 3. Firestore
  try {
    const ref = doc(db, 'adminWhitelist', cleanEmail);
    await setDoc(ref, { ...user, email: cleanEmail }, { merge: true });
  } catch (err) {
    console.warn('Firestore whitelist save error:', err);
  }

  // 4. Audit Log
  if (logAudit) {
    await logAuditEvent({
      operatorId,
      action: '화이트리스트 계정 등록/수정',
      target: cleanEmail,
      summary: `Google 계정 [${cleanEmail}] 권한을 [${user.roleName}] (부서: ${user.department || '미지정'})(으)로 등록/수정하였습니다.`,
      category: 'whitelist'
    }).catch(() => {});
  }
}

/**
 * Delete Whitelist User
 */
export async function deleteWhitelistUser(email: string, operatorId: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error('최고관리자(averver100@gmail.com) 계정은 삭제할 수 없습니다.');
  }

  // Permanently mark as deleted to prevent resurrection from stale caches
  markEmailDeleted(cleanEmail);

  // 1. Update SWR cache
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(SWR_WHITELIST_CACHE_KEY);
      if (cached) {
        const list: WhitelistUser[] = JSON.parse(cached);
        const filtered = list.filter(u => u.email.toLowerCase() !== cleanEmail);
        localStorage.setItem(SWR_WHITELIST_CACHE_KEY, JSON.stringify(filtered));
      }
    } catch {}
  }

  // 2. Local API
  try {
    await fetch(`/api/whitelist/${encodeURIComponent(cleanEmail)}`, { method: 'DELETE' });
  } catch (err) {
    console.warn('Local API whitelist delete error:', err);
  }

  // 3. Firestore
  try {
    const ref = doc(db, 'adminWhitelist', cleanEmail);
    await deleteDoc(ref);
  } catch (err) {
    console.warn('Firestore whitelist delete error:', err);
  }

  // 4. Audit Log
  await logAuditEvent({
    operatorId,
    action: '화이트리스트 계정 삭제',
    target: cleanEmail,
    summary: `Google 계정 [${cleanEmail}]의 관리자 화이트리스트 접근 권한을 삭제 회수하였습니다.`,
    category: 'whitelist'
  }).catch(() => {});
}

// ==========================================
// AUDIT LOG MANAGEMENT
// ==========================================

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const logsMap = new Map<string, AuditLog>();

  // 1. SWR Cache
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(SWR_AUDIT_LOGS_CACHE_KEY);
      if (cached) {
        const parsed: AuditLog[] = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          parsed.forEach(l => logsMap.set(l.id, l));
        }
      }
    } catch {}
  }

  // 2. Default Seed
  if (logsMap.size === 0) {
    (defaultAuditLogsData as AuditLog[] || []).forEach(l => logsMap.set(l.id, l));
  }

  // 3. Local API Fetch
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => controller?.abort(), 1800);
    const res = await fetch('/api/audit-logs', { signal: controller?.signal }).catch(() => null);
    clearTimeout(timeoutId);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        data.forEach((l: AuditLog) => logsMap.set(l.id, l));
      }
    }
  } catch (err) {
    console.warn('Local API audit logs fetch error:', err);
  }

  // 4. Firestore Fetch
  try {
    const firestorePromise = (async () => {
      const snapshot = await getDocs(collection(db, 'auditLogs'));
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as AuditLog;
        const id = data.id || docSnap.id;
        logsMap.set(id, { ...data, id });
      });
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore timeout')), 2500)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
  } catch (err) {
    console.warn('Firestore audit logs fetch error:', err);
  }

  // Sort descending by timestamp (newest first)
  const list = Array.from(logsMap.values()).sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (typeof window !== 'undefined' && list.length > 0) {
    try {
      localStorage.setItem(SWR_AUDIT_LOGS_CACHE_KEY, JSON.stringify(list));
    } catch {}
  }

  return list;
}

/**
 * Record an audit log event
 */
export async function logAuditEvent(params: {
  operatorId: string;
  operatorName?: string;
  action: string;
  target?: string;
  summary: string;
  category?: AuditLog['category'];
}): Promise<AuditLog> {
  const newLog: AuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    operatorId: params.operatorId || 'system',
    operatorName: params.operatorName || (params.operatorId.includes('averver') ? '최고관리자' : params.operatorId),
    timestamp: new Date().toISOString(),
    action: params.action,
    target: params.target || '',
    summary: params.summary,
    category: params.category || 'system'
  };

  // 1. Update SWR cache
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(SWR_AUDIT_LOGS_CACHE_KEY);
      const list: AuditLog[] = cached ? JSON.parse(cached) : [];
      list.unshift(newLog);
      localStorage.setItem(SWR_AUDIT_LOGS_CACHE_KEY, JSON.stringify(list.slice(0, 500)));
    } catch {}
  }

  // 2. Save to Local API
  fetch('/api/audit-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ log: newLog })
  }).catch(() => {});

  // 3. Save to Firestore
  try {
    const ref = doc(db, 'auditLogs', newLog.id);
    await setDoc(ref, newLog);
  } catch (err) {
    console.warn('Firestore audit log save error:', err);
  }

  return newLog;
}
