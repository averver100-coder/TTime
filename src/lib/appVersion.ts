/**
 * Application Build Date & Release Version Manager
 * Injected at build time via vite.config.ts (VITE_APP_BUILD_DATE)
 */

export const getBuildDate = (): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_BUILD_DATE) {
    return (import.meta as any).env.VITE_APP_BUILD_DATE;
  }
  if (typeof __APP_BUILD_DATE__ !== 'undefined' && __APP_BUILD_DATE__) {
    return __APP_BUILD_DATE__;
  }
  return '2026.10.28';
};

export const getAppReleaseVersion = (): string => {
  const dateStr = getBuildDate();
  return `V${dateStr}`;
};

export const APP_BUILD_DATE = getBuildDate();
export const APP_RELEASE_VERSION = getAppReleaseVersion();

export interface ServerVersionInfo {
  version: string;
  buildId: string;
  buildTime: string;
  releaseDate: string;
}

export interface StrictVersionCheckResult {
  hasNewRelease: boolean;
  currentVersion: string;
  remoteVersion: string;
  currentBuildId: string;
  remoteBuildId: string;
}

/**
 * Strict server version verification:
 * Compares deployed server version and build ID against the running app instance.
 */
export async function checkServerVersionStrict(): Promise<StrictVersionCheckResult> {
  const currentVersion = getAppReleaseVersion();
  const currentBuildId = `${getBuildDate()}-release`;

  if (typeof window === 'undefined') {
    return {
      hasNewRelease: false,
      currentVersion,
      remoteVersion: currentVersion,
      currentBuildId,
      remoteBuildId: currentBuildId,
    };
  }

  try {
    const response = await fetch('/api/version', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      return {
        hasNewRelease: false,
        currentVersion,
        remoteVersion: currentVersion,
        currentBuildId,
        remoteBuildId: currentBuildId,
      };
    }

    const data: ServerVersionInfo = await response.json();
    const remoteVersion = (data.version || '').trim();
    const remoteBuildId = (data.buildId || '').trim();

    if (!remoteVersion && !remoteBuildId) {
      return {
        hasNewRelease: false,
        currentVersion,
        remoteVersion: currentVersion,
        currentBuildId,
        remoteBuildId: currentBuildId,
      };
    }

    const hasNewRelease =
      (Boolean(remoteVersion) && remoteVersion !== currentVersion) ||
      (Boolean(remoteBuildId) && remoteBuildId !== currentBuildId);

    return {
      hasNewRelease,
      currentVersion,
      remoteVersion: remoteVersion || currentVersion,
      currentBuildId,
      remoteBuildId: remoteBuildId || currentBuildId,
    };
  } catch (err) {
    console.debug('[Version] Strict version check network bypass:', err);
    return {
      hasNewRelease: false,
      currentVersion,
      remoteVersion: currentVersion,
      currentBuildId,
      remoteBuildId: currentBuildId,
    };
  }
}

/**
 * Display a polished, floating toast when user checks for updates
 */
export function showVersionToast(
  version: string = getAppReleaseVersion(),
  hasUpdate: boolean = false
): void {
  if (typeof document === 'undefined') return;

  const existingToast = document.getElementById('ssamtime-version-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'ssamtime-version-toast';
  toast.className = 'fixed top-6 left-1/2 z-[9999] bg-slate-900/95 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-medium border border-slate-700 backdrop-blur-md pointer-events-auto transition-all duration-300 select-none';
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(-50%) translateY(-12px)';

  if (hasUpdate) {
    toast.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping shrink-0"></span>
      <span class="tracking-tight">새로운 업데이트가 있습니다. (<strong class="text-blue-300 font-bold">${version}</strong>)</span>
    `;
  } else {
    toast.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
      <span class="tracking-tight">최신 버전을 사용 중입니다.(<strong class="text-emerald-300 font-bold">${version}</strong>)</span>
    `;
  }

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-10px)';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3500);
}
