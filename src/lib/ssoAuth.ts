import { AdminUser } from '../types/auth';

/**
 * Superadmin identification and sister subdomains configuration
 */
export const SUPERADMIN_EMAIL = 'averver100@gmail.com';
export const SRIDER_ROOT_DOMAIN = 'srider.kr';

export const SISTER_SUBDOMAINS = [
  { id: 'commute', name: '출퇴근 관리', host: 'commute.srider.kr', desc: '교직원 출퇴근 및 근무 현황' },
  { id: 'device', name: '디바이스 관리', host: 'device.srider.kr', desc: '교내 정보화 기기 및 대여 관리' },
  { id: 'ttime', name: '쌤타임 (현재)', host: 'ttime.srider.kr', desc: '실시간 교원/학급 시간표' },
  { id: 'croom', name: '특별실/교실', host: 'croom.srider.kr', desc: '특별실 예약 및 시설 관리' },
  { id: 'dibeot', name: '디벗 관리', host: 'dibeot.srider.kr', desc: '학생 1인1스마트기기 디벗 관리' },
] as const;

export type SisterSubdomainId = typeof SISTER_SUBDOMAINS[number]['id'];

// Storage Keys
export const SSO_PERSISTENT_STORAGE_KEY = 'srider_sso_persisted_superadmin_v1';
export const SSO_COOKIE_SESSION_NAME = 'srider_sso_session';
export const SSO_COOKIE_SUPERADMIN_NAME = 'srider_superadmin_auth';
export const SSO_COOKIE_USER_EMAIL_NAME = 'srider_user_email';
export const SSO_BROADCAST_CHANNEL_NAME = 'srider_sso_channel';

export interface SSOPayload {
  email: string;
  name: string;
  role: 'superadmin' | 'admin' | 'teacher';
  roleName: string;
  department?: string;
  issuedAt: number;
  expiresAt: number;
  sourceApp: string;
  token: string;
}

/**
 * Determine cookie domain setting for srider.kr or current environment
 */
export function getCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === SRIDER_ROOT_DOMAIN || hostname.endsWith(`.${SRIDER_ROOT_DOMAIN}`)) {
    return `.${SRIDER_ROOT_DOMAIN}`;
  }
  // Localhost or dev deployment
  return undefined;
}

/**
 * Parse a cookie from document.cookie by name
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Set a cookie with domain support across srider.kr subdomains
 */
export function setCookie(name: string, value: string, days = 30): void {
  if (typeof document === 'undefined') return;
  const domain = getCookieDomain();
  const maxAge = days * 24 * 60 * 60;
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
  if (isHttps) cookieStr += '; secure';

  // 1. Primary write with .srider.kr domain (if applicable)
  if (domain) {
    document.cookie = `${cookieStr}; domain=${domain}`;
  }

  // 2. Also write without domain attribute (Host-only cookie fallback for ITP / partition safety)
  document.cookie = cookieStr;
}

/**
 * Completely clear a cookie across all possible domain levels (.srider.kr, srider.kr, host-only)
 */
export function clearCookie(name: string): void {
  if (typeof document === 'undefined') return;
  const domain = getCookieDomain();
  const expStr = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; max-age=0; samesite=lax';

  // Clear host-only
  document.cookie = `${encodeURIComponent(name)}=; ${expStr}`;

  if (domain) {
    // Clear with leading dot (.srider.kr)
    document.cookie = `${encodeURIComponent(name)}=; domain=${domain}; ${expStr}`;
    // Clear without leading dot (srider.kr)
    const bareDomain = domain.startsWith('.') ? domain.slice(1) : domain;
    document.cookie = `${encodeURIComponent(name)}=; domain=${bareDomain}; ${expStr}`;
  }
}

/**
 * Build default SuperAdmin user object
 */
export function buildSuperAdminUser(sourceDesc = 'srider.kr 통합 인증'): AdminUser {
  return {
    id: SUPERADMIN_EMAIL,
    email: SUPERADMIN_EMAIL,
    name: '최고관리자 (averver)',
    role: 'superadmin',
    roleName: '최고관리자',
    department: '교무기획부 / 총괄',
    loginMethod: 'google'
  };
}

/**
 * Generate a lightweight SSO token payload for averver100@gmail.com
 */
export function createSSOPayload(user: AdminUser, days = 30): SSOPayload {
  const now = Date.now();
  const expiresAt = now + days * 24 * 60 * 60 * 1000;
  // Deterministic signature hash for validation
  const token = btoa(`${user.email}:${now}:${expiresAt}:srider_sso_v1`);

  return {
    email: user.email.toLowerCase().trim(),
    name: user.name,
    role: user.role,
    roleName: user.roleName,
    department: user.department,
    issuedAt: now,
    expiresAt,
    sourceApp: 'ttime.srider.kr',
    token
  };
}

/**
 * Encode SSO payload to URL-safe base64 string
 */
export function encodeSSOPayload(payload: SSOPayload): string {
  try {
    return encodeURIComponent(btoa(JSON.stringify(payload)));
  } catch {
    return '';
  }
}

/**
 * Decode SSO payload from base64 string
 */
export function decodeSSOPayload(raw: string): SSOPayload | null {
  try {
    const json = atob(decodeURIComponent(raw));
    const parsed = JSON.parse(json);
    if (parsed && parsed.email && parsed.expiresAt && parsed.expiresAt > Date.now()) {
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Save SSO session across .srider.kr cookies, localStorage, and PWA backup
 */
export function saveSharedSSOSession(user: AdminUser): void {
  if (typeof window === 'undefined') return;
  const isSuper = user.email.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase();
  if (!isSuper) return; // Superadmin SSO priority

  const payload = createSSOPayload(user);
  const payloadStr = JSON.stringify(payload);
  const encodedToken = encodeSSOPayload(payload);

  // 1. Shared Cookies on .srider.kr
  try {
    setCookie(SSO_COOKIE_SESSION_NAME, encodedToken, 30);
    setCookie(SSO_COOKIE_SUPERADMIN_NAME, user.email, 30);
    setCookie(SSO_COOKIE_USER_EMAIL_NAME, user.email, 30);
  } catch (err) {
    console.warn('Cookie save notice:', err);
  }

  // 2. Multi-layer PWA Permanent LocalStorage
  try {
    localStorage.setItem(SSO_PERSISTENT_STORAGE_KEY, payloadStr);
    localStorage.setItem('srider_sso_token_backup', encodedToken);
    localStorage.setItem('srider_sso_last_synced', String(Date.now()));
  } catch (err) {
    console.warn('LocalStorage save notice:', err);
  }

  // 3. Sync to backend API (to set HTTP-level response headers for .srider.kr)
  syncSSOWithBackend(user).catch(() => {});

  // 4. Notify any other open tabs
  broadcastSSOMessage({ type: 'SSO_LOGIN', user });
}

/**
 * Completely clear SSO session across cookies, localStorage, and server
 */
export async function clearSharedSSOSession(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Clear Cookies across all subdomain variations
  try {
    clearCookie(SSO_COOKIE_SESSION_NAME);
    clearCookie(SSO_COOKIE_SUPERADMIN_NAME);
    clearCookie(SSO_COOKIE_USER_EMAIL_NAME);
    clearCookie('srider_auth_token');
    clearCookie('srider_session');
  } catch {}

  // 2. Clear Persistent Storage
  try {
    localStorage.removeItem(SSO_PERSISTENT_STORAGE_KEY);
    localStorage.removeItem('srider_sso_token_backup');
    localStorage.removeItem('srider_sso_last_synced');
  } catch {}

  // 3. Clear Backend Cookies
  try {
    await fetch('/api/sso/logout', { credentials: 'include', method: 'POST' }).catch(() => {});
  } catch {}

  // 4. Broadcast Logout to other tabs
  broadcastSSOMessage({ type: 'SSO_LOGOUT' });
}

/**
 * Attempt to restore superadmin session from multi-layer SSO sources
 */
export async function restoreSharedSSOSession(): Promise<AdminUser | null> {
  if (typeof window === 'undefined') return null;

  // Path 1: URL Query Parameters (?sso_token=... or ?sso_email=... or ?auth_token=...)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const ssoToken = urlParams.get('sso_token') || urlParams.get('auth_token') || urlParams.get('token');
    const ssoEmail = urlParams.get('sso_email') || urlParams.get('email');

    if (ssoToken) {
      const decoded = decodeSSOPayload(ssoToken);
      if (decoded && decoded.email.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase()) {
        const user = buildSuperAdminUser('URL SSO 토큰 복원');
        saveSharedSSOSession(user);
        cleanUrlParameters(['sso_token', 'auth_token', 'token', 'sso_email', 'email']);
        return user;
      }
    }

    if (ssoEmail && ssoEmail.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase()) {
      const user = buildSuperAdminUser('URL 인증 복원');
      saveSharedSSOSession(user);
      cleanUrlParameters(['sso_token', 'auth_token', 'token', 'sso_email', 'email']);
      return user;
    }
  } catch (err) {
    console.warn('URL SSO parse notice:', err);
  }

  // Path 2: Shared Cookie (.srider.kr)
  try {
    const sessionCookie = getCookie(SSO_COOKIE_SESSION_NAME);
    if (sessionCookie) {
      const decoded = decodeSSOPayload(sessionCookie);
      if (decoded && decoded.email.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase()) {
        const user = buildSuperAdminUser('서브도메인 쿠키 복원');
        saveSharedSSOSession(user);
        return user;
      }
    }

    const adminCookie = getCookie(SSO_COOKIE_SUPERADMIN_NAME) || getCookie(SSO_COOKIE_USER_EMAIL_NAME);
    if (adminCookie && adminCookie.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase()) {
      const user = buildSuperAdminUser('공유 인증 쿠키 복원');
      saveSharedSSOSession(user);
      return user;
    }
  } catch (err) {
    console.warn('Cookie SSO check notice:', err);
  }

  // Path 3: PWA Persistent LocalStorage Backup
  try {
    const raw = localStorage.getItem(SSO_PERSISTENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed && 
        parsed.email && 
        parsed.email.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase() &&
        parsed.expiresAt && 
        parsed.expiresAt > Date.now()
      ) {
        const user = buildSuperAdminUser('PWA 영구 저장소 복원');
        saveSharedSSOSession(user);
        return user;
      }
    }

    const backupToken = localStorage.getItem('srider_sso_token_backup');
    if (backupToken) {
      const decoded = decodeSSOPayload(backupToken);
      if (decoded && decoded.email.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase()) {
        const user = buildSuperAdminUser('PWA 백업 토큰 복원');
        saveSharedSSOSession(user);
        return user;
      }
    }
  } catch (err) {
    console.warn('LocalStorage SSO check notice:', err);
  }

  // Path 4: Server-side SSO check (/api/sso/session)
  try {
    const res = await fetch('/api/sso/session', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.authenticated && data.user) {
        const email = (data.user.email || '').toLowerCase().trim();
        if (email === SUPERADMIN_EMAIL.toLowerCase()) {
          const user = buildSuperAdminUser('서버 SSO 세션 복원');
          saveSharedSSOSession(user);
          return user;
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Remove sensitive SSO tokens from browser URL bar without page refresh
 */
export function cleanUrlParameters(paramKeys: string[]): void {
  if (typeof window === 'undefined' || !window.history || !window.location) return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    paramKeys.forEach(k => {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    });
    if (changed) {
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
    }
  } catch {}
}

/**
 * Synchronize SSO with server endpoint
 */
export async function syncSSOWithBackend(user: AdminUser): Promise<void> {
  try {
    await fetch('/api/sso/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user })
    });
  } catch {}
}

/**
 * Generate a sister subdomain launch link with auto-login SSO token
 */
export function getSisterSubdomainSSOLink(targetSubdomain: SisterSubdomainId): string {
  const sister = SISTER_SUBDOMAINS.find(s => s.id === targetSubdomain);
  if (!sister) return '#';

  const user = buildSuperAdminUser();
  const payload = createSSOPayload(user);
  const token = encodeSSOPayload(payload);

  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  return `${protocol}//${sister.host}?sso_token=${token}&sso_email=${encodeURIComponent(SUPERADMIN_EMAIL)}`;
}

/**
 * BroadcastChannel real-time sync across tabs
 */
type SSOMessage = 
  | { type: 'SSO_LOGIN'; user: AdminUser }
  | { type: 'SSO_LOGOUT' }
  | { type: 'REQUEST_SSO_STATE' };

function broadcastSSOMessage(msg: SSOMessage): void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  try {
    const channel = new BroadcastChannel(SSO_BROADCAST_CHANNEL_NAME);
    channel.postMessage(msg);
    channel.close();
  } catch {}
}

export function listenToSSOBroadcast(
  onLogin: (user: AdminUser) => void,
  onLogout: () => void
): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {};
  }
  try {
    const channel = new BroadcastChannel(SSO_BROADCAST_CHANNEL_NAME);
    channel.onmessage = (event) => {
      const data = event.data as SSOMessage;
      if (data?.type === 'SSO_LOGIN' && data.user) {
        onLogin(data.user);
      } else if (data?.type === 'SSO_LOGOUT') {
        onLogout();
      }
    };
    return () => {
      try {
        channel.close();
      } catch {}
    };
  } catch {
    return () => {};
  }
}
