import { useEffect, useState, useCallback, useRef } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __pwaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    typeof window !== 'undefined' && window.__pwaInstallPrompt ? window.__pwaInstallPrompt : null
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  const [isWhale, setIsWhale] = useState<boolean>(false);
  const [isSamsung, setIsSamsung] = useState<boolean>(false);
  const [isChrome, setIsChrome] = useState<boolean>(false);
  const [isWindows, setIsWindows] = useState<boolean>(false);
  const [isMac, setIsMac] = useState<boolean>(false);

  const promptRef = useRef<BeforeInstallPromptEvent | null>(deferredPrompt);
  promptRef.current = deferredPrompt;

  useEffect(() => {
    // 1. Detect if already installed / running in standalone mode
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isFullscreenMedia = window.matchMedia('(display-mode: fullscreen)').matches;
      const isNavigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      return isStandaloneMedia || isFullscreenMedia || isNavigatorStandalone;
    };

    setIsInstalled(checkStandalone());

    // 2. Detect browser and platform environment
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    const isMobileDevice = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/.test(userAgent);
    const isDesktopDevice = !isMobileDevice;
    const isWindowsOS = /windows|win32|win64/.test(userAgent);
    const isMacOS = /macintosh|mac os x/.test(userAgent);
    const isWhaleBrowser = /whale/.test(userAgent);
    const isSamsungBrowser = /samsungbrowser/.test(userAgent);
    const isChromeBrowser = /chrome/.test(userAgent) && !isWhaleBrowser && !isSamsungBrowser;

    setIsIOS(isIOSDevice);
    setIsMobile(isMobileDevice);
    setIsDesktop(isDesktopDevice);
    setIsWindows(isWindowsOS);
    setIsMac(isMacOS);
    setIsWhale(isWhaleBrowser);
    setIsSamsung(isSamsungBrowser);
    setIsChrome(isChromeBrowser);

    // Check early captured prompt
    if (window.__pwaInstallPrompt && !promptRef.current) {
      setDeferredPrompt(window.__pwaInstallPrompt);
    }

    // 3. Capture beforeinstallprompt for Android / Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__pwaInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleCustomPromptReady = (e: Event) => {
      const customEvent = e as CustomEvent<BeforeInstallPromptEvent>;
      if (customEvent.detail) {
        setDeferredPrompt(customEvent.detail);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.__pwaInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-ready', handleCustomPromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-installed', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-ready', handleCustomPromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-installed', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    let currentPrompt = promptRef.current || window.__pwaInstallPrompt;

    // If prompt is not yet ready, give it up to 600ms to arrive
    if (!currentPrompt) {
      currentPrompt = await new Promise<BeforeInstallPromptEvent | null>((resolve) => {
        let timer: ReturnType<typeof setTimeout>;
        const onPrompt = (e: Event) => {
          clearTimeout(timer);
          window.removeEventListener('beforeinstallprompt', onPrompt);
          window.removeEventListener('pwa-prompt-ready', onPrompt);
          resolve((e as CustomEvent<BeforeInstallPromptEvent>).detail || (e as BeforeInstallPromptEvent));
        };
        window.addEventListener('beforeinstallprompt', onPrompt, { once: true });
        window.addEventListener('pwa-prompt-ready', onPrompt, { once: true });
        timer = setTimeout(() => {
          window.removeEventListener('beforeinstallprompt', onPrompt);
          window.removeEventListener('pwa-prompt-ready', onPrompt);
          resolve(window.__pwaInstallPrompt || null);
        }, 600);
      });
    }

    if (!currentPrompt) {
      return 'unsupported';
    }

    try {
      await currentPrompt.prompt();
      const choice = await currentPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        window.__pwaInstallPrompt = null;
      }
      return choice.outcome;
    } catch (err) {
      console.error('Error during PWA installation:', err);
      return 'unsupported';
    }
  }, []);

  const downloadDesktopShortcut = useCallback((): boolean => {
    try {
      const currentUrl = typeof window !== 'undefined' ? (window.location.origin || window.location.href) : '';
      const fileContent = `[InternetShortcut]\r\nURL=${currentUrl}/\r\nIconIndex=0\r\nIconFile=${currentUrl}/pwa-192x192.png\r\nHotKey=0\r\n`;
      const blob = new Blob([fileContent], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '쌤타임 (상일미디어고 시간표).url';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (e) {
      console.error('Failed to download desktop shortcut:', e);
      return false;
    }
  }, []);

  return {
    deferredPrompt,
    isInstallable: !!deferredPrompt || !!(typeof window !== 'undefined' && window.__pwaInstallPrompt),
    isInstalled,
    isIOS,
    isMobile,
    isDesktop,
    isWindows,
    isMac,
    isWhale,
    isSamsung,
    isChrome,
    install,
    downloadDesktopShortcut,
  };
}
