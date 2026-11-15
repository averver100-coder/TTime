/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { Home } from './pages/Home';
import { Admin } from './pages/Admin';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { db } from './lib/firebase';
import {
  checkServerVersionStrict,
  getAppReleaseVersion,
  isNewerReleaseVersion,
  showVersionToast,
} from './lib/version';
import { isBuildAcknowledged } from './lib/pwaUpdateManager';
import { getMasterSSOToken, buildMasterSSOMockUser } from './lib/ssoAuth';
import { CURRENT_ADMIN_STORAGE_KEY } from './lib/authWhitelist';
import { AdminUser } from './types/auth';

// ============================================================================
// 전역 fetch 가로채기(Interceptor): React 컴포넌트 바깥 최상단에서 window.fetch 오버라이딩
// ============================================================================
const originalFetch =
  typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : undefined;

const parseMasterSsoTokenFromCookie = (): string | null => {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const cookies = document.cookie.split(';');
  for (const rawCookie of cookies) {
    const eqIndex = rawCookie.indexOf('=');
    if (eqIndex === -1) continue;
    const key = rawCookie.slice(0, eqIndex).trim();
    if (key === 'master_sso_token') {
      const value = rawCookie.slice(eqIndex + 1).trim();
      if (!value) return null;
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
};

const shouldInjectSsoAuthorization = (input: RequestInfo | URL): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const resolved = new URL(rawUrl, window.location.origin);
    const hostname = resolved.hostname.toLowerCase();

    // Google/Firebase SDK 및 외부 정적 CDN 호출에는 커스텀 Bearer 헤더를 주입하지 않음
    if (
      hostname.endsWith('googleapis.com') ||
      hostname.endsWith('gstatic.com') ||
      hostname.endsWith('firebaseio.com') ||
      hostname.endsWith('firebaseapp.com') ||
      hostname.endsWith('google.com') ||
      hostname.endsWith('jsdelivr.net')
    ) {
      return false;
    }

    // 동일 오리진 API(/api/* 등) 및 srider.kr 패밀리 서브도메인 API 요청에 토큰 자동 주입
    return (
      resolved.origin === window.location.origin ||
      hostname === 'srider.kr' ||
      hostname.endsWith('.srider.kr')
    );
  } catch {
    return true;
  }
};

if (
  typeof window !== 'undefined' &&
  originalFetch &&
  !(window.fetch as unknown as { __isMasterSsoInterceptor?: boolean }).__isMasterSsoInterceptor
) {
  const interceptedFetch: typeof window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const masterToken = parseMasterSsoTokenFromCookie();

    if (!masterToken || !shouldInjectSsoAuthorization(input)) {
      return originalFetch(input, init);
    }

    // 기존 Request 헤더와 init.headers 옵션을 유실 없이 병합 처리
    const mergedHeaders = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        mergedHeaders.set(key, value);
      });
    }

    if (!mergedHeaders.has('Authorization')) {
      mergedHeaders.set('Authorization', `Bearer ${masterToken}`);
    }

    return originalFetch(input, {
      ...init,
      headers: mergedHeaders,
    });
  };

  (interceptedFetch as unknown as { __isMasterSsoInterceptor?: boolean }).__isMasterSsoInterceptor = true;
  try {
    const ownDescriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!ownDescriptor || ownDescriptor.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: interceptedFetch,
        writable: true,
        configurable: true,
        enumerable: ownDescriptor ? ownDescriptor.enumerable : true,
      });
    } else if (ownDescriptor.writable) {
      window.fetch = interceptedFetch;
    }
  } catch (err) {
    console.debug('[SSO] window.fetch override skipped:', err);
  }
}

export interface DetectedVersionUpdate {
  version: string;
  buildId: string;
}

export default function App() {
  const [detectedUpdate, setDetectedUpdate] = useState<DetectedVersionUpdate | null>(null);
  const [ssoMockUser, setSsoMockUser] = useState<AdminUser | null>(() => {
    const masterToken = getMasterSSOToken();
    return masterToken ? buildMasterSSOMockUser() : null;
  });
  const lastToastedVersionRef = useRef<string>('');

  // SSO 마스터 쿠키 자동 통과 및 Mock User 주입 상태 유지
  useEffect(() => {
    const masterToken = getMasterSSOToken();
    if (masterToken) {
      const mockUser = buildMasterSSOMockUser();
      setSsoMockUser(mockUser);
      try {
        sessionStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(mockUser));
        localStorage.setItem(CURRENT_ADMIN_STORAGE_KEY, JSON.stringify(mockUser));
        sessionStorage.removeItem('ssamtime_auth_redirect_in_progress');
      } catch {}
    } else if (ssoMockUser) {
      setSsoMockUser(null);
    }
  }, []);

  // Clean cache-busting query param (_upd) right after reload
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('_upd')) {
        url.searchParams.delete('_upd');
        const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
        window.history.replaceState({}, document.title, cleanUrl || '/');
      }
    } catch {}
  }, []);

  // Real-time Firestore onSnapshot listener + strict server version fallback check
  useEffect(() => {
    let isMounted = true;
    let lastCheckedAt = 0;
    const currentClientVersion = getAppReleaseVersion();

    const activateUpdateNotice = (remoteVersion: string, remoteBuildId: string, showToastImmediately: boolean) => {
      if (!isMounted) return;
      if (!isNewerReleaseVersion(remoteVersion, currentClientVersion)) {
        setDetectedUpdate(null);
        return;
      }
      if (remoteBuildId && isBuildAcknowledged(remoteBuildId)) {
        return;
      }
      setDetectedUpdate({
        version: remoteVersion,
        buildId: remoteBuildId,
      });
      if (showToastImmediately && lastToastedVersionRef.current !== remoteVersion) {
        lastToastedVersionRef.current = remoteVersion;
        showVersionToast(remoteVersion, true);
      }
    };

    const verifyAppVersion = async (forceCheck: boolean = false, showToast: boolean = false) => {
      const now = Date.now();
      if (!forceCheck && now - lastCheckedAt < 30 * 1000) return;
      lastCheckedAt = now;

      const result = await checkServerVersionStrict();
      if (!isMounted) return;

      if (result.hasNewRelease) {
        activateUpdateNotice(result.remoteVersion, result.remoteBuildId, showToast);
      } else {
        setDetectedUpdate(null);
      }
    };

    // 1. Firestore real-time onSnapshot subscription for instant push toast when new deployment boots
    const versionDocId = import.meta.env.DEV ? 'appVersionDev' : 'appVersion';
    const unsubscribeSnapshot = onSnapshot(
      doc(db, 'admin', versionDocId),
      async (snap) => {
        if (!isMounted || !snap.exists()) return;
        const data = snap.data() as { version?: string; buildId?: string } | undefined;
        const remoteVer = (data?.version || '').trim();
        const remoteBId = (data?.buildId || `${remoteVer}-release`).trim();

        if (!remoteVer || !isNewerReleaseVersion(remoteVer, currentClientVersion)) {
          return;
        }

        // Confirm live server endpoint is serving the upgraded build before prompting reload
        const serverCheck = await checkServerVersionStrict();
        if (!isMounted) return;

        if (serverCheck.hasNewRelease) {
          activateUpdateNotice(serverCheck.remoteVersion, serverCheck.remoteBuildId, true);
        } else {
          // If Firestore version was bumped explicitly ahead of HTTP cache, still notify cleanly
          activateUpdateNotice(remoteVer, remoteBId, true);
        }
      },
      (err) => {
        console.debug('[App] Version onSnapshot listener notice:', err);
      }
    );

    // 2. Immediate startup check + periodic background fallback + focus check
    void verifyAppVersion(true, false);

    const backgroundInterval = setInterval(() => {
      void verifyAppVersion(false, false);
    }, 3 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void verifyAppVersion(false, false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      unsubscribeSnapshot();
      clearInterval(backgroundInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <BrowserRouter>
      <PWAUpdatePrompt
        externalUpdate={detectedUpdate}
        onClearExternalUpdate={() => setDetectedUpdate(null)}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
