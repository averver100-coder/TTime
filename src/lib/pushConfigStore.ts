import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useState, useEffect } from 'react';

export const PUSH_CONFIG_DOC = 'pushConfig';
export const LOCAL_STORAGE_KEY = 'ssamtime_push_popup_enabled_v1';

export interface PushPopupConfig {
  showPushPopup: boolean; // true = 켜기, false = 끄기
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Read the cached configuration from localStorage synchronously for fast startup
 */
export function getInitialPushPopupSetting(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached !== null) {
      return cached === 'true';
    }
  } catch (err) {
    console.warn('Failed to read push popup cache from localStorage:', err);
  }
  return true; // Default to true if not set
}

/**
 * Fetch push popup configuration from Firestore
 */
export async function fetchPushPopupConfig(): Promise<PushPopupConfig> {
  try {
    const configRef = doc(db, 'admin', PUSH_CONFIG_DOC);
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      const data = snap.data();
      const showPushPopup = typeof data.showPushPopup === 'boolean' ? data.showPushPopup : true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_KEY, String(showPushPopup));
      }
      return {
        showPushPopup,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (err) {
    console.warn('Failed to fetch push popup config from Firestore:', err);
  }
  
  const fallbackSetting = getInitialPushPopupSetting();
  return { showPushPopup: fallbackSetting };
}

/**
 * Update push popup configuration in Firestore
 */
export async function updatePushPopupConfig(
  showPushPopup: boolean, 
  updatedBy: string = 'admin'
): Promise<void> {
  // Update local storage immediately for responsive UI
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, String(showPushPopup));
      // Dispatch custom event for cross-component immediate update within same tab
      window.dispatchEvent(new CustomEvent('push_popup_config_changed', { detail: { showPushPopup } }));
    } catch (err) {
      console.warn('Failed to save to localStorage:', err);
    }
  }

  const configRef = doc(db, 'admin', PUSH_CONFIG_DOC);
  await setDoc(configRef, {
    showPushPopup,
    updatedAt: new Date().toISOString(),
    updatedBy
  }, { merge: true });
}

/**
 * React Hook for subscribing to push popup configuration in real-time
 */
export function usePushPopupConfig() {
  const [showPushPopup, setShowPushPopup] = useState<boolean>(getInitialPushPopupSetting);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string | undefined>(undefined);
  const [updatedBy, setUpdatedBy] = useState<string | undefined>(undefined);

  useEffect(() => {
    // 1. Initial cached value is already set
    // 2. Listen to custom event for same-window updates
    const handleLocalChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ showPushPopup: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.showPushPopup === 'boolean') {
        setShowPushPopup(customEvent.detail.showPushPopup);
      }
    };
    window.addEventListener('push_popup_config_changed', handleLocalChange);

    // 3. Realtime Firestore subscription
    let unsubscribe = () => {};
    try {
      const configRef = doc(db, 'admin', PUSH_CONFIG_DOC);
      unsubscribe = onSnapshot(configRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const val = typeof data.showPushPopup === 'boolean' ? data.showPushPopup : true;
          setShowPushPopup(val);
          setLastUpdated(data.updatedAt);
          setUpdatedBy(data.updatedBy);
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, String(val));
          } catch {}
        } else {
          // If doc doesn't exist yet, fallback to default (true)
          setShowPushPopup(true);
        }
        setLoading(false);
      }, (err) => {
        console.warn('Push popup config subscription error:', err);
        setLoading(false);
      });
    } catch (err) {
      console.warn('Failed to set up push popup onSnapshot:', err);
      setLoading(false);
    }

    return () => {
      window.removeEventListener('push_popup_config_changed', handleLocalChange);
      unsubscribe();
    };
  }, []);

  return { showPushPopup, loading, lastUpdated, updatedBy };
}
