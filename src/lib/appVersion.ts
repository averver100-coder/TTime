/**
 * Application Build Date & Incremental Patch Release Version Manager
 * Unified with vite.config.ts, public/version.json, and server.ts (VYYYY.MM.DD.XX)
 */

declare const __APP_BUILD_DATE__: string | undefined;
declare const __APP_RELEASE_VERSION__: string | undefined;
declare const __APP_BUILD_ID__: string | undefined;
declare const __APP_BUILD_TIME_KST__: string | undefined;
declare const __APP_PATCH_NUMBER__: number | undefined;

export interface ParsedReleaseVersion {
  year: number;
  month: number;
  day: number;
  patch: number;
  formatted: string;
}

/**
 * Parse strings like "V2026.11.14.02" or "V2026.11.14" into numeric tuple parts
 */
export function parseReleaseVersion(rawVersion?: string | null): ParsedReleaseVersion | null {
  if (!rawVersion) return null;
  const match = String(rawVersion)
    .trim()
    .match(/^V?(\d{4})\.(\d{2})\.(\d{2})(?:\.(\d+))?$/i);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const patch = match[4] ? parseInt(match[4], 10) : 0;

  if (![year, month, day, patch].every((n) => Number.isFinite(n))) {
    return null;
  }

  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  const paddedPatch = String(patch > 0 ? patch : 1).padStart(2, '0');

  return {
    year,
    month,
    day,
    patch,
    formatted: `V${year}.${paddedMonth}.${paddedDay}.${paddedPatch}`,
  };
}

/**
 * Compare two release versions semantically:
 *  > 0 if versionA > versionB
 *  < 0 if versionA < versionB
 *  = 0 if equal
 */
export function compareReleaseVersions(versionA?: string | null, versionB?: string | null): number {
  const a = parseReleaseVersion(versionA);
  const b = parseReleaseVersion(versionB);

  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;

  const tupleA = [a!.year, a!.month, a!.day, a!.patch];
  const tupleB = [b!.year, b!.month, b!.day, b!.patch];

  for (let i = 0; i < 4; i++) {
    if (tupleA[i] !== tupleB[i]) {
      return tupleA[i] > tupleB[i] ? 1 : -1;
    }
  }
  return 0;
}

/**
 * Strict upgrade check: returns true ONLY when remoteVersion is strictly newer than currentVersion
 */
export function isNewerReleaseVersion(remoteVersion?: string | null, currentVersion?: string | null): boolean {
  return compareReleaseVersions(remoteVersion, currentVersion) > 0;
}

export function normalizeReleaseVersion(rawVersion?: string | null, fallbackDate?: string): string {
  const parsed = parseReleaseVersion(rawVersion);
  if (parsed) {
    return parsed.formatted;
  }
  const datePart = fallbackDate && /^\d{4}\.\d{2}\.\d{2}$/.test(fallbackDate) ? fallbackDate : '2026.11.14';
  return `V${datePart}.01`;
}

export const getBuildDate = (): string => {
  if (typeof __APP_BUILD_DATE__ !== 'undefined' && __APP_BUILD_DATE__) {
    return __APP_BUILD_DATE__;
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_BUILD_DATE) {
    return (import.meta as any).env.VITE_APP_BUILD_DATE;
  }
  return '2026.11.14';
};

export const getAppReleaseVersion = (): string => {
  if (typeof __APP_RELEASE_VERSION__ !== 'undefined' && __APP_RELEASE_VERSION__) {
    return normalizeReleaseVersion(__APP_RELEASE_VERSION__, getBuildDate());
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_RELEASE_VERSION) {
    return normalizeReleaseVersion((import.meta as any).env.VITE_APP_RELEASE_VERSION, getBuildDate());
  }
  const patchNum = typeof __APP_PATCH_NUMBER__ !== 'undefined' && __APP_PATCH_NUMBER__ ? __APP_PATCH_NUMBER__ : 1;
  return `V${getBuildDate()}.${String(patchNum).padStart(2, '0')}`;
};

export const getBuildId = (): string => {
  if (typeof __APP_BUILD_ID__ !== 'undefined' && __APP_BUILD_ID__) {
    return __APP_BUILD_ID__;
  }
  return `${getAppReleaseVersion()}-release`;
};

export const APP_BUILD_DATE = getBuildDate();
export const APP_RELEASE_VERSION = getAppReleaseVersion();
export const APP_BUILD_ID = getBuildId();

export interface ServerVersionInfo {
  version: string;
  buildId: string;
  buildTime: string;
  releaseDate: string;
  patch?: number;
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
 * Fetches live server version (/api/version & /version.json) bypassing cache and returns
 * `hasNewRelease: true` ONLY when server version is strictly higher than the running client version.
 */
export async function checkServerVersionStrict(): Promise<StrictVersionCheckResult> {
  const currentVersion = getAppReleaseVersion();
  const currentBuildId = getBuildId();

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
    let data: ServerVersionInfo | null = null;
    const cacheBuster = Date.now();

    const response = await fetch(`/api/version?_t=${cacheBuster}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    }).catch(() => null);

    if (response && response.ok) {
      data = await response.json().catch(() => null);
    }

    if (!data || !data.version) {
      const jsonRes = await fetch(`/version.json?_t=${cacheBuster}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      }).catch(() => null);
      if (jsonRes && jsonRes.ok) {
        data = await jsonRes.json().catch(() => null);
      }
    }

    if (!data || !data.version) {
      return {
        hasNewRelease: false,
        currentVersion,
        remoteVersion: currentVersion,
        currentBuildId,
        remoteBuildId: currentBuildId,
      };
    }

    const remoteVersion = normalizeReleaseVersion(data.version, data.releaseDate);
    const remoteBuildId = String(data.buildId || `${remoteVersion}-release`).trim();
    const hasNewRelease = isNewerReleaseVersion(remoteVersion, currentVersion);

    return {
      hasNewRelease,
      currentVersion,
      remoteVersion,
      currentBuildId,
      remoteBuildId,
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
      <span class="tracking-tight">최신 버전을 사용 중입니다. (<strong class="text-emerald-300 font-bold">${version}</strong>)</span>
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
