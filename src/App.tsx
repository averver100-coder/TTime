/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Admin } from './pages/Admin';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { checkServerVersionStrict } from './lib/version';
import { isBuildAcknowledged, isRecentlyUpdated } from './lib/pwaUpdateManager';

export interface DetectedVersionUpdate {
  version: string;
  buildId: string;
}

export default function App() {
  const [detectedUpdate, setDetectedUpdate] = useState<DetectedVersionUpdate | null>(null);

  useEffect(() => {
    let isMounted = true;
    let lastCheckedAt = 0;

    const verifyAppVersion = async (forceCheck: boolean = false) => {
      if (!forceCheck && isRecentlyUpdated()) return;
      const now = Date.now();
      if (!forceCheck && now - lastCheckedAt < 30 * 1000) return;
      lastCheckedAt = now;

      const result = await checkServerVersionStrict();
      if (!isMounted) return;

      if (result.hasNewRelease) {
        if (!isBuildAcknowledged(result.remoteBuildId)) {
          setDetectedUpdate({
            version: result.remoteVersion,
            buildId: result.remoteBuildId,
          });
        }
      } else {
        setDetectedUpdate(null);
      }
    };

    // Initial check shortly after startup
    const startupTimer = setTimeout(() => {
      void verifyAppVersion(true);
    }, 1200);

    // Periodic background check every 3 minutes
    const backgroundInterval = setInterval(() => {
      void verifyAppVersion(false);
    }, 3 * 60 * 1000);

    // Re-check when returning to the app/tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void verifyAppVersion(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearTimeout(startupTimer);
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
