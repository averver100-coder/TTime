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

export interface DetectedVersionUpdate {
  version: string;
  buildId: string;
}

export default function App() {
  const [detectedUpdate, setDetectedUpdate] = useState<DetectedVersionUpdate | null>(null);
  const lastToastedVersionRef = useRef<string>('');

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
