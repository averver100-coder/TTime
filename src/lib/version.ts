/**
 * Application Release Version Manager
 * 
 * - The version is fixed at build/compile time in Korean Standard Time (KST, UTC+9)
 *   in the format "VYYYY.MM.DD".
 * - Merely clicking the update button does NOT generate today's date dynamically;
 *   it strictly reflects the actual deployed release version (e.g. V2026.10.28).
 * - Build timestamps and build IDs are strictly static strings, never dynamic Date.now()
 *   computed on the fly when the instance restarts or wakes from sleep.
 */

// Baseline static release version & build ID for this deployment
export const STATIC_RELEASE_VERSION = 'V2026.10.28';
export const STATIC_BUILD_ID = '2026.10.28-release';
export const STATIC_BUILD_TIME_KST = '2026-10-28T00:00:00+09:00';

/**
 * Get current application release version string
 */
export function getAppReleaseVersion(): string {
  if (typeof __APP_RELEASE_VERSION__ !== 'undefined' && __APP_RELEASE_VERSION__) {
    return __APP_RELEASE_VERSION__;
  }
  return STATIC_RELEASE_VERSION;
}

/**
 * Get current application build identifier
 */
export function getAppBuildId(): string {
  if (typeof __APP_BUILD_ID__ !== 'undefined' && __APP_BUILD_ID__) {
    return __APP_BUILD_ID__;
  }
  return STATIC_BUILD_ID;
}

/**
 * Get current application build time string
 */
export function getAppBuildTime(): string {
  if (typeof __APP_BUILD_TIME_KST__ !== 'undefined' && __APP_BUILD_TIME_KST__) {
    return __APP_BUILD_TIME_KST__;
  }
  return STATIC_BUILD_TIME_KST;
}

export const APP_RELEASE_VERSION = getAppReleaseVersion();
export const APP_BUILD_ID = getAppBuildId();

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
 * 
 * Strict rules:
 * 1. Only returns hasNewRelease: true if remote version/buildId is non-empty and explicitly NOT equal.
 * 2. Never uses simplistic '>' timestamp arithmetic which triggers false positives on restarts.
 * 3. Safely handles offline or network errors by returning hasNewRelease: false.
 */
export async function checkServerVersionStrict(): Promise<StrictVersionCheckResult> {
  const currentVersion = getAppReleaseVersion();
  const currentBuildId = getAppBuildId();

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

    // If server didn't provide valid version info, do not trigger false update
    if (!remoteVersion && !remoteBuildId) {
      return {
        hasNewRelease: false,
        currentVersion,
        remoteVersion: currentVersion,
        currentBuildId,
        remoteBuildId: currentBuildId,
      };
    }

    // Strict equality check: only mismatch flags a genuine new release
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
 * Matching the IT Desk (https://device.srider.kr/) notification pattern.
 */
export function showVersionToast(version: string = getAppReleaseVersion()): void {
  if (typeof document === 'undefined') return;

  // Remove existing toast if already on screen
  const existingToast = document.getElementById('ssamtime-version-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'ssamtime-version-toast';
  toast.className = 'fixed bottom-6 right-6 z-[9999] bg-slate-900/95 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-medium border border-slate-700 backdrop-blur-md pointer-events-auto transition-all duration-300 select-none';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(12px)';

  toast.innerHTML = `
    <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
    <span class="tracking-tight">최신 버전 (<strong class="text-emerald-300 font-bold">${version}</strong>)입니다. 이미 최종 버전을 사용 중입니다.</span>
  `;

  document.body.appendChild(toast);

  // Trigger smooth enter animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Automatically fade out and remove after 3.5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3500);
}
