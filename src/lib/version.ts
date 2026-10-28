/**
 * Application Release Version Manager
 * 
 * - In accordance with production requirements, the version is stamped at build/deployment
 *   time in Korean Standard Time (KST, UTC+9) in the format "VYYYY.MM.DD".
 * - Merely clicking the update button does NOT forge today's date dynamically;
 *   it reflects the actual deployed release version (e.g. V2026.10.28).
 * - Future builds/deployments automatically update this release date string.
 */

// Baseline release version for this deployment
export const STATIC_RELEASE_VERSION = 'V2026.10.28';

/**
 * Get current application release version string
 */
export function getAppReleaseVersion(): string {
  if (typeof __APP_RELEASE_VERSION__ !== 'undefined' && __APP_RELEASE_VERSION__) {
    return __APP_RELEASE_VERSION__;
  }
  return STATIC_RELEASE_VERSION;
}

export const APP_RELEASE_VERSION = getAppReleaseVersion();

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
