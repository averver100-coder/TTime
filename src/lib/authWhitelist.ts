import { 
  collection, 
  getDocs, 
  getDocsFromServer, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut, 
  User as FirebaseUser,
  onAuthStateChanged
} from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { AdminUser, WhitelistUser, AuditLog } from '../types/auth';
import defaultWhitelistData from '../data/defaultWhitelist.json';
import defaultAuditLogsData from '../data/auditLogs.json';
import { 
  saveSharedSSOSession, 
  clearSharedSSOSession, 
  restoreSharedSSOSession, 
  buildSuperAdminUser, 
  SSO_PERSISTENT_STORAGE_KEY,
  SUPERADMIN_EMAIL
} from './ssoAuth';

export const DEFAULT_SUPERADMIN_EMAIL = 'averver100@gmail.com';
export const SWR_WHITELIST_CACHE_KEY = 'ssamtime_swr_whitelist_v3';
export const DELETED_WHITELIST_KEY = 'ssamtime_deleted_whitelist_v3';
export const SWR_AUDIT_LOGS_CACHE_KEY = 'ssamtime_swr_audit_logs_v2';
export const CURRENT_ADMIN_STORAGE_KEY = 'ssamtime_current_auth_admin_v2';
export const MIGRATION_DONE_KEY = 'ssamtime_whitelist_migrated_to_firestore_v2';

/**
 * SuperAdmin verification helper
 */
export function isSuperAdminUser(email?: string): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === DEFAULT_SUPERADMIN_EMAIL.toLowerCase();
}

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
 * Operation types and error logging helper for Firestore
 */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

/**
 * Scan all potential local sources for whitelist candidates
 */
export function collectLocalWhitelistCandidates(): Map<string, WhitelistUser> {
  const localCandidates = new Map<string, WhitelistUser>();
  const deletedSet = getDeletedEmails();

  // 1. Candidate from default JSON seed
  if (Array.isArray(defaultWhitelistData)) {
    defaultWhitelistData.forEach((u: any) => {
      if (u && u.email && typeof u.email === 'string') {
        const clean = u.email.toLowerCase().trim();
        if (!deletedSet.has(clean)) {
          localCandidates.set(clean, { ...u, email: clean });
        }
      }
    });
  }

  // 2. Candidates from various client localStorage & sessionStorage keys (PC & mobile environments)
  if (typeof window !== 'undefined') {
    const keysToCheck = [
      SWR_WHITELIST_CACHE_KEY,
      'ssamtime_whitelist_v3',
      'ssamtime_whitelist_v2',
      'ssamtime_whitelist',
      'whitelist_users',
      'admin_whitelist',
      'adminWhitelist',
      'whitelist',
      'ssamtime_admin_whitelist'
    ];
    for (const k of keysToCheck) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((u: any) => {
              if (u && u.email && typeof u.email === 'string') {
                const clean = u.email.toLowerCase().trim();
                if (!deletedSet.has(clean)) {
                  localCandidates.set(clean, { ...u, email: clean });
                }
              }
            });
          }
        }
      } catch {}

      try {
        const rawSession = sessionStorage.getItem(k);
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          if (Array.isArray(parsed)) {
            parsed.forEach((u: any) => {
              if (u && u.email && typeof u.email === 'string') {
                const clean = u.email.toLowerCase().trim();
                if (!deletedSet.has(clean)) {
                  localCandidates.set(clean, { ...u, email: clean });
                }
              }
            });
          }
        }
      } catch {}
    }
  }

  // Always ensure SuperAdmin
  localCandidates.set(DEFAULT_SUPERADMIN_EMAIL.toLowerCase(), {
    email: DEFAULT_SUPERADMIN_EMAIL,
    name: '최고관리자 (SuperAdmin)',
    role: 'superadmin',
    roleName: '슈퍼어드민',
    department: '시스템 관리국',
    createdAt: '2026-09-01T00:00:00.000Z'
  });

  return localCandidates;
}

/**
 * Automatically migrate locally stored accounts from PC localStorage or default seed into Firestore DB
 */
let isMigrating = false;
export async function migrateLocalWhitelistToFirestore(): Promise<{ migratedCount: number; migratedEmails: string[] }> {
  if (isMigrating) return { migratedCount: 0, migratedEmails: [] };
  isMigrating = true;
  let migratedCount = 0;
  const migratedEmails: string[] = [];

  try {
    const localCandidates = collectLocalWhitelistCandidates();

    // Candidates from server API endpoint backup
    try {
      const res = await fetch('/api/whitelist').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (Array.isArray(data)) {
          const deletedSet = getDeletedEmails();
          data.forEach((u: any) => {
            if (u && u.email && typeof u.email === 'string') {
              const clean = u.email.toLowerCase().trim();
              if (!deletedSet.has(clean)) {
                localCandidates.set(clean, { ...u, email: clean });
              }
            }
          });
        }
      }
    } catch {}

    // Fetch existing Firestore accounts from Server directly
    const existingFirestoreEmails = new Set<string>();
    try {
      let snapshot;
      try {
        snapshot = await getDocsFromServer(collection(db, 'adminWhitelist'));
      } catch {
        snapshot = await getDocs(collection(db, 'adminWhitelist'));
      }
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const em = (data.email || docSnap.id || '').toLowerCase().trim();
        if (em) existingFirestoreEmails.add(em);
      });
    } catch (err) {
      console.warn('Checking Firestore whitelist during migration:', err);
    }

    // Upload missing candidates into Firestore adminWhitelist
    for (const [email, user] of localCandidates.entries()) {
      if (!existingFirestoreEmails.has(email)) {
        try {
          const docRef = doc(db, 'adminWhitelist', email);
          await setDoc(docRef, {
            ...user,
            email,
            migratedAt: new Date().toISOString()
          }, { merge: true });
          migratedCount++;
          migratedEmails.push(email);
        } catch (writeErr) {
          console.warn(`Failed migrating whitelist user ${email} to Firestore:`, writeErr);
        }
      }
    }

    if (migratedCount > 0) {
      console.log(`[Firestore Migration] Successfully migrated ${migratedCount} whitelist accounts into Firestore DB:`, migratedEmails);
      if (typeof window !== 'undefined') {
        localStorage.setItem(MIGRATION_DONE_KEY, 'true');
      }
    }
  } catch (err) {
    console.warn('Error during whitelist migration to Firestore:', err);
  } finally {
    isMigrating = false;
  }

  return { migratedCount, migratedEmails };
}

// Auto-trigger migration on PC/mobile boot in background
if (typeof window !== 'undefined') {
  setTimeout(() => {
    migrateLocalWhitelistToFirestore().catch(() => {});
  }, 1200);
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
 * Fetch complete whitelist, prioritizing live server data from Firestore DB
 */
export async function fetchWhitelist(forceServer: boolean = true): Promise<WhitelistUser[]> {
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

  // 1. Fetch directly from authoritative Firestore DB Server (bypassing stale local cache)
  try {
    let snapshot;
    if (forceServer) {
      try {
        snapshot = await getDocsFromServer(collection(db, 'adminWhitelist'));
      } catch (serverErr) {
        console.warn('getDocsFromServer notice, falling back to getDocs:', serverErr);
        snapshot = await getDocs(collection(db, 'adminWhitelist'));
      }
    } else {
      snapshot = await getDocs(collection(db, 'adminWhitelist'));
    }

    if (snapshot && !snapshot.empty) {
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as WhitelistUser;
        const email = (data.email || docSnap.id || '').toLowerCase().trim();
        if (email) {
          map.set(email, {
            ...data,
            email
          });
        }
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'adminWhitelist');
    console.warn('Firestore live whitelist fetch notice:', err);
  }

  // 2. Check if local candidates exist that are missing in Firestore (PC migration check)
  const localCandidates = collectLocalWhitelistCandidates();
  let hasMissingCandidates = false;
  for (const [candidateEmail] of localCandidates.entries()) {
    if (!map.has(candidateEmail)) {
      hasMissingCandidates = true;
      break;
    }
  }

  if (hasMissingCandidates || map.size <= 1) {
    // Automatically upload missing PC accounts to Firestore DB
    await migrateLocalWhitelistToFirestore().catch(() => {});

    // Refresh map with local candidates so current session has full access
    for (const [candidateEmail, candidateUser] of localCandidates.entries()) {
      if (!map.has(candidateEmail)) {
        map.set(candidateEmail, candidateUser);
      }
    }

    // Try reading fresh Firestore state
    try {
      const snap = await getDocs(collection(db, 'adminWhitelist'));
      snap.forEach(docSnap => {
        const data = docSnap.data() as WhitelistUser;
        const email = (data.email || docSnap.id || '').toLowerCase().trim();
        if (email) {
          map.set(email, { ...data, email });
        }
      });
    } catch {}
  }

  const list = Array.from(map.values()).sort((a, b) => {
    if (a.role === 'superadmin' || a.email.toLowerCase() === DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) return -1;
    if (b.role === 'superadmin' || b.email.toLowerCase() === DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) return 1;
    return a.email.localeCompare(b.email);
  });

  if (typeof window !== 'undefined' && list.length > 0) {
    try {
      localStorage.setItem(SWR_WHITELIST_CACHE_KEY, JSON.stringify(list));
    } catch {}
  }

  return list;
}

/**
 * Real-time two-way synchronization listener for Firestore whitelist.
 * SuperAdmin accounts receive live pushes from Firestore server.
 */
export function subscribeWhitelist(
  callback: (whitelist: WhitelistUser[]) => void,
  operatorEmail?: string
): () => void {
  // Security guard: Only SuperAdmin is authorized to receive whitelist streams
  if (operatorEmail && !isSuperAdminUser(operatorEmail)) {
    console.warn('Unauthorized attempt to subscribe to whitelist stream');
    callback([]);
    return () => {};
  }

  // Trigger background migration check once
  migrateLocalWhitelistToFirestore().catch(() => {});

  const colRef = collection(db, 'adminWhitelist');
  const unsubscribe = onSnapshot(
    colRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      const map = new Map<string, WhitelistUser>();

      // Always ensure SuperAdmin
      map.set(DEFAULT_SUPERADMIN_EMAIL.toLowerCase(), {
        email: DEFAULT_SUPERADMIN_EMAIL,
        name: '최고관리자 (SuperAdmin)',
        role: 'superadmin',
        roleName: '슈퍼어드민',
        department: '시스템 관리국',
        createdAt: '2026-09-01T00:00:00.000Z'
      });

      snapshot.forEach(docSnap => {
        const data = docSnap.data() as WhitelistUser;
        const email = (data.email || docSnap.id || '').toLowerCase().trim();
        if (email) {
          map.set(email, {
            ...data,
            email
          });
        }
      });

      const list = Array.from(map.values()).sort((a, b) => {
        if (a.role === 'superadmin' || a.email.toLowerCase() === DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) return -1;
        if (b.role === 'superadmin' || b.email.toLowerCase() === DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) return 1;
        return a.email.localeCompare(b.email);
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(SWR_WHITELIST_CACHE_KEY, JSON.stringify(list));
        } catch {}
      }

      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'adminWhitelist');
      console.warn('Firestore onSnapshot whitelist subscription notice, fallback to live fetch:', error);
      fetchWhitelist(true).then(callback).catch(() => {});
    }
  );

  return unsubscribe;
}

/**
 * Detect if client is running on a mobile browser where popups are frequently blocked
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Core validation for an authenticated Firebase Google user against the admin whitelist.
 * If user is authorized, grants admin access session and returns AdminUser.
 * If unauthorized, immediately terminates the Firebase Auth session and returns the standard error message.
 */
export async function verifyAuthenticatedGoogleUser(
  firebaseUser: FirebaseUser
): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
  if (!firebaseUser || !firebaseUser.email) {
    await signOut(auth).catch(() => {});
    return {
      success: false,
      error: 'Google 계정에서 이메일 정보를 확인할 수 없습니다. 다른 Google 계정으로 다시 시도해 주세요.'
    };
  }

  const cleanEmail = firebaseUser.email.toLowerCase().trim();

  // 1. Fast-path for Superadmin (averver100@gmail.com):
  // Skip whitelist lookup completely, immediately grant superadmin privileges and sync SSO across srider.kr subdomains
  if (isSuperAdminUser(cleanEmail)) {
    const superAdminUser: AdminUser = {
      id: cleanEmail,
      email: cleanEmail,
      name: firebaseUser.displayName || '최고관리자 (averver)',
      role: 'superadmin',
      roleName: '최고관리자',
      department: '교무기획부 / 총괄',
      photoURL: firebaseUser.photoURL || undefined,
      loginMethod: 'google'
    };

    // Save session to storage
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(superAdminUser));
        localStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(superAdminUser));
        sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
      } catch {}
    }

    // Save multi-layer SSO (shared .srider.kr cookie, PWA persistent backup, and BroadcastChannel)
    saveSharedSSOSession(superAdminUser);

    // Asynchronously record lastLoginAt in Firestore
    try {
      const userDocRef = doc(db, 'adminWhitelist', cleanEmail);
      setDoc(userDocRef, {
        lastLoginAt: new Date().toISOString(),
        email: cleanEmail,
        name: superAdminUser.name,
        role: 'superadmin',
        roleName: '최고관리자',
        department: '교무기획부 / 총괄'
      }, { merge: true }).catch(() => {});
    } catch {}

    // Asynchronously record login audit event
    logAuditEvent({
      operatorId: superAdminUser.email,
      operatorName: superAdminUser.name,
      action: '최고관리자 로그인',
      target: superAdminUser.email,
      summary: `최고관리자(${superAdminUser.email}) Google OAuth 2.0 자동 인증 완료 (srider.kr 서브도메인 SSO 동기화)`,
      category: 'auth'
    }).catch(() => {});

    return {
      success: true,
      user: superAdminUser
    };
  }

  // 2. Regular Whitelisted Teachers verification (intact, preserving all registered teachers)
  const whitelist = await fetchWhitelist();
  const matched = whitelist.find(u => u.email.toLowerCase() === cleanEmail);

  if (!matched) {
    // Immediately terminate unwhitelisted session from Firebase Auth
    await signOut(auth).catch(() => {});

    // Clear local stored session
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(CURRENT_ADMIN_STORAGE_KEY);
        localStorage.removeItem(CURRENT_ADMIN_STORAGE_KEY);
        sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
      } catch {}
    }

    // Record unauthorized access attempt in audit log
    await logAuditEvent({
      operatorId: cleanEmail,
      operatorName: firebaseUser.displayName || '미승인 접근자',
      action: '로그인 차단',
      target: cleanEmail,
      summary: `화이트리스트에 등록되지 않은 Google 계정(${cleanEmail})의 관리자 접근이 차단되었습니다.`,
      category: 'auth'
    }).catch(() => {});

    return {
      success: false,
      error: `승인되지 않은 계정입니다 (${cleanEmail}). 관리자에게 권한 등록을 요청하세요.`
    };
  }

  // Update lastLoginAt directly in Firestore DB
  try {
    const userDocRef = doc(db, 'adminWhitelist', cleanEmail);
    setDoc(userDocRef, {
      lastLoginAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});
  } catch {}

  const adminUser: AdminUser = {
    id: matched.email,
    email: matched.email,
    name: matched.name || firebaseUser.displayName || '관리자',
    role: matched.role,
    roleName: matched.roleName,
    department: matched.department,
    photoURL: firebaseUser.photoURL || undefined,
    loginMethod: 'google'
  };

  // Record successful login audit log
  await logAuditEvent({
    operatorId: adminUser.email,
    operatorName: adminUser.name,
    action: '관리자 로그인',
    target: adminUser.email,
    summary: `${adminUser.name} (${adminUser.roleName}) 계정으로 Google OAuth 2.0 공식 보안 인증 로그인 성공`,
    category: 'auth'
  }).catch(() => {});

  // Save session
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(adminUser));
      localStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(adminUser));
      sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
    } catch {}
  }

  return {
    success: true,
    user: adminUser
  };
}

/**
 * Format Firebase Auth errors into clear, actionable Korean instructions
 */
export function formatFirebaseAuthError(err: any): string {
  if (!err) return 'Google 로그인 중 오류가 발생했습니다.';
  const code = String(err.code || '');
  const msg = String(err.message || '');

  if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'ttime-kappa.vercel.app';
    return `도메인 승인 오류 (auth/unauthorized-domain): 현재 도메인(${currentHost})이 Firebase 인증 승인 도메인에 등록되어 있지 않습니다. Firebase 콘솔(acquired-myth-1nzsc)의 [Authentication > Settings(설정) > 승인된 도메인(Authorized domains)]에 '${currentHost}'을 추가해 주세요.`;
  }
  if (code === 'auth/popup-blocked') {
    return '브라우저에서 로그인 팝업 창이 차단되었습니다. 주소창의 팝업 차단을 해제하시거나 아래 "모바일 / 팝업 차단 시 리다이렉트 로그인" 버튼을 눌러주세요.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google 로그인 창이 닫혔습니다. 다시 시도해 주세요.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return '이전 로그인 요청이 취소되었습니다. 다시 시도해 주세요.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Firebase 프로젝트에서 Google 로그인 제공업체가 활성화되지 않았습니다. Firebase 콘솔에서 Google 로그인을 사용 설정해 주세요.';
  }
  if (msg.includes('403') || code.includes('disallowed_useragent') || msg.includes('disallowed_useragent')) {
    return 'Google 보안 정책(403 오류): 카카오톡이나 인앱 브라우저에서는 소셜 로그인이 제한됩니다. 기본 브라우저(Safari / Chrome)로 열어주세요.';
  }
  return err.message || 'Google 로그인 중 오류가 발생했습니다.';
}

/**
 * Detect in-app browsers (KakaoTalk, Naver, Instagram, etc.) which block Google OAuth
 */
export function detectInAppBrowser(): { isInApp: boolean; name: string } {
  if (typeof navigator === 'undefined') return { isInApp: false, name: '' };
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('kakaotalk')) return { isInApp: true, name: '카카오톡' };
  if (ua.includes('naver')) return { isInApp: true, name: '네이버' };
  if (ua.includes('instagram')) return { isInApp: true, name: '인스타그램' };
  if (ua.includes('fb_iab') || ua.includes('fb4a') || ua.includes('fban')) return { isInApp: true, name: '페이스북' };
  if (ua.includes('line')) return { isInApp: true, name: '라인' };
  return { isInApp: false, name: '' };
}

/**
 * Open URL in default external browser (Safari on iOS, Chrome on Android)
 */
export function openExternalBrowser(targetUrl?: string): void {
  if (typeof window === 'undefined') return;
  const url = targetUrl || window.location.href;
  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('kakaotalk')) {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return;
  }
  if (/android/i.test(navigator.userAgent)) {
    const clean = url.replace(/^https?:\/\//i, '');
    window.location.href = `intent://${clean}#Intent;scheme=https;package=com.android.chrome;end`;
    return;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      window.alert('페이지 주소가 복사되었습니다.\n아이폰의 [Safari] 브라우저를 열고 주소창에 붙여넣어 주세요.');
    }).catch(() => {
      window.prompt('아래 주소를 복사하여 Safari 또는 Chrome 브라우저에 붙여넣어 접속하세요:', url);
    });
  } else {
    window.prompt('아래 주소를 복사하여 Safari 또는 Chrome 브라우저에 붙여넣어 접속하세요:', url);
  }
}

/**
 * Trigger Real Google Social Login
 * Uses direct popup (signInWithPopup) as default for BOTH PC and Mobile (just like dibeot & commute-gilt).
 * This eliminates ITP/cookie partition hangs on mobile browsers and logs in within 1~2 seconds.
 */
export async function signInWithGoogle(
  forceRedirect: boolean = false
): Promise<{ success: boolean; user?: AdminUser; error?: string; redirecting?: boolean }> {
  // If explicitly requested redirect (e.g. from popup-blocked option)
  if (forceRedirect) {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('ssamtime_auth_redirect_in_progress', 'true');
      }
      await signInWithRedirect(auth, googleProvider);
      return { success: false, redirecting: true };
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
      }
      console.error('Google signInWithRedirect error:', err);
      return {
        success: false,
        error: formatFirebaseAuthError(err)
      };
    }
  }

  // Direct popup flow for BOTH PC and Mobile (fast 1~2s response, no page reload, no ITP cookie drop)
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    if (!cred || !cred.user) {
      return {
        success: false,
        error: 'Google 인증 결과를 수신하지 못했습니다.'
      };
    }
    return await verifyAuthenticatedGoogleUser(cred.user);
  } catch (err: any) {
    console.warn('Google signInWithPopup notice/error:', err);
    // User voluntarily closed the popup
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
      return {
        success: false,
        error: 'Google 로그인 창이 닫혔습니다. 다시 시도해 주세요.'
      };
    }
    // If popup is blocked by browser configuration, seamlessly fallback to redirect
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('ssamtime_auth_redirect_in_progress', 'true');
        }
        await signInWithRedirect(auth, googleProvider);
        return { success: false, redirecting: true };
      } catch (redirErr: any) {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
        }
        return {
          success: false,
          error: formatFirebaseAuthError(redirErr)
        };
      }
    }

    return {
      success: false,
      error: formatFirebaseAuthError(err)
    };
  }
}

/**
 * Handle redirect result when user returns from Google OAuth page
 */
export async function checkGoogleRedirectResult(): Promise<{ success: boolean; user?: AdminUser; error?: string } | null> {
  try {
    const result = await getRedirectResult(auth);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
    }
    if (result && result.user) {
      return await verifyAuthenticatedGoogleUser(result.user);
    }
  } catch (err: any) {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
    }
    console.error('getRedirectResult error:', err);
    return {
      success: false,
      error: formatFirebaseAuthError(err)
    };
  }
  return null;
}

/**
 * Legacy whitelist checker (kept for backward compatibility, now requiring exact match)
 */
export async function verifyGoogleWhitelist(inputEmail: string): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
  const trimmed = (inputEmail || '').trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return {
      success: false,
      error: '올바른 이메일 주소 형식을 입력해 주세요.'
    };
  }

  const whitelist = await fetchWhitelist();
  const matched = whitelist.find(u => u.email.toLowerCase() === trimmed);

  if (!matched) {
    await logAuditEvent({
      operatorId: trimmed,
      operatorName: '미승인 접근자',
      action: '로그인 차단',
      target: trimmed,
      summary: `화이트리스트에 등록되지 않은 이메일(${trimmed})의 관리자 접근이 안전하게 차단되었습니다.`,
      category: 'auth'
    }).catch(() => {});

    return {
      success: false,
      error: `승인되지 않은 계정입니다 (${trimmed}). 관리자에게 권한 등록을 요청하세요.`
    };
  }

  const adminUser: AdminUser = {
    id: matched.email,
    email: matched.email,
    name: matched.name,
    role: matched.role,
    roleName: matched.roleName,
    department: matched.department,
    loginMethod: 'google'
  };

  return {
    success: true,
    user: adminUser
  };
}

/**
 * Get currently authenticated admin user from storage (multi-layer fallback)
 */
export function getSavedAdminUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const sessionData = sessionStorage.getItem(CURRENT_ADMIN_STORAGE_KEY);
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      if (parsed && parsed.email) return parsed;
    }

    const localData = localStorage.getItem(CURRENT_ADMIN_STORAGE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData);
      if (parsed && parsed.email) return parsed;
    }

    // Synchronous PWA persistent storage backup check
    const pwaData = localStorage.getItem(SSO_PERSISTENT_STORAGE_KEY);
    if (pwaData) {
      const parsed = JSON.parse(pwaData);
      if (
        parsed && 
        parsed.email && 
        parsed.email.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase() &&
        parsed.expiresAt && 
        parsed.expiresAt > Date.now()
      ) {
        const superUser = buildSuperAdminUser('PWA 영구 저장소 자동 복원');
        try {
          sessionStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(superUser));
          localStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(superUser));
        } catch {}
        return superUser;
      }
    }
  } catch {}
  return null;
}

/**
 * Clear authenticated session, purge all subdomain cookies (.srider.kr), and sign out from Firebase Auth
 */
export async function clearAdminSession(): Promise<void> {
  try {
    await signOut(auth).catch(() => {});
  } catch {}
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CURRENT_ADMIN_STORAGE_KEY);
      localStorage.removeItem(CURRENT_ADMIN_STORAGE_KEY);
      sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
    } catch {}
    // Purge .srider.kr root & host cookies, PWA persistent tokens, and backend sessions
    await clearSharedSSOSession().catch(() => {});
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
  const cleanOperator = (operatorId || '').trim().toLowerCase();

  // Strict SuperAdmin permission check (averver100@gmail.com)
  if (cleanOperator !== DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error(`화이트리스트 수정 권한이 없습니다. 최고관리자(${DEFAULT_SUPERADMIN_EMAIL}) 계정으로 로그인한 상태에서만 등록·수정할 수 있습니다.`);
  }

  // If this email was previously marked deleted, unmark it
  unmarkEmailDeleted(cleanEmail);

  // 1. Direct Firestore DB Write (Single source of truth)
  try {
    const ref = doc(db, 'adminWhitelist', cleanEmail);
    await setDoc(ref, { 
      ...user, 
      email: cleanEmail,
      updatedAt: new Date().toISOString(),
      updatedBy: cleanOperator
    }, { merge: true });
  } catch (err: any) {
    console.error('Firestore whitelist save error:', err);
    throw new Error(`Firestore DB 저장 실패: ${err?.message || '네트워크 오류'}`);
  }

  // 2. Update SWR cache
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

  // 3. Local API backup
  fetch('/api/whitelist/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: { ...user, email: cleanEmail } })
  }).catch(() => {});

  // 4. Audit Log
  if (logAudit) {
    await logAuditEvent({
      operatorId: cleanOperator,
      action: '화이트리스트 계정 등록/수정',
      target: cleanEmail,
      summary: `Google 계정 [${cleanEmail}] 권한을 [${user.roleName}] (부서: ${user.department || '미지정'})(으)로 Firestore DB에 실시간 등록/수정하였습니다.`,
      category: 'whitelist'
    }).catch(() => {});
  }
}

/**
 * Delete Whitelist User
 */
export async function deleteWhitelistUser(email: string, operatorId: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanOperator = (operatorId || '').trim().toLowerCase();

  // Strict SuperAdmin permission check (averver100@gmail.com)
  if (cleanOperator !== DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error(`화이트리스트 삭제 권한이 없습니다. 최고관리자(${DEFAULT_SUPERADMIN_EMAIL}) 계정으로 로그인한 상태에서만 삭제할 수 있습니다.`);
  }

  if (cleanEmail === DEFAULT_SUPERADMIN_EMAIL.toLowerCase()) {
    throw new Error('최고관리자(averver100@gmail.com) 계정은 보안상 삭제할 수 없습니다.');
  }

  // Permanently mark as deleted to prevent resurrection from stale caches
  markEmailDeleted(cleanEmail);

  // 1. Direct Firestore DB Delete (Single source of truth)
  try {
    const ref = doc(db, 'adminWhitelist', cleanEmail);
    await deleteDoc(ref);
  } catch (err: any) {
    console.error('Firestore whitelist delete error:', err);
    throw new Error(`Firestore DB 삭제 실패: ${err?.message || '네트워크 오류'}`);
  }

  // 2. Update SWR cache
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

  // 3. Local API backup
  fetch(`/api/whitelist/${encodeURIComponent(cleanEmail)}`, { method: 'DELETE' }).catch(() => {});

  // 4. Audit Log
  await logAuditEvent({
    operatorId: cleanOperator,
    action: '화이트리스트 계정 삭제',
    target: cleanEmail,
    summary: `Google 계정 [${cleanEmail}]의 관리자 화이트리스트 접근 권한을 Firestore DB에서 실시간 삭제 회수하였습니다.`,
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
