import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';
import { ScheduleAlert } from '../types/notification';

let messagingInstance: Messaging | null = null;
let isMessagingChecked = false;
let isMessagingSupported = false;

// Play pleasant notification chime using Web Audio API
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;
    // Two-tone cheerful bell (E5 -> B5 -> G#5)
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(659.25, now, 0.4);       // E5
    playTone(830.61, now + 0.15, 0.5); // G#5
    playTone(987.77, now + 0.32, 0.7); // B5
  } catch (e) {
    console.debug('Audio chime could not play (user interaction may be required)', e);
  }
}

/**
 * Check if Firebase Messaging is supported in this browser
 */
export async function checkMessagingSupport(): Promise<boolean> {
  if (isMessagingChecked) return isMessagingSupported;
  try {
    isMessagingSupported = await isSupported();
    if (isMessagingSupported && !messagingInstance) {
      messagingInstance = getMessaging(app);
    }
  } catch (err) {
    console.warn('Firebase Messaging is not supported in this environment:', err);
    isMessagingSupported = false;
  }
  isMessagingChecked = true;
  return isMessagingSupported;
}

/**
 * Request notification permission and get Firebase Messaging Token
 */
export async function requestPushPermission(teacherName?: string): Promise<{
  granted: boolean;
  token?: string;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { granted: false, error: '브라우저 환경이 아닙니다.' };
  }

  if (!('Notification' in window)) {
    return { granted: false, error: '이 브라우저는 알림(Notification) 기능을 지원하지 않습니다.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { granted: false, error: '알림 권한이 허용되지 않았습니다.' };
    }

    const supported = await checkMessagingSupport();
    let token: string | undefined;

    if (supported && messagingInstance) {
      try {
        let swRegistration: ServiceWorkerRegistration | undefined;
        if ('serviceWorker' in navigator) {
          try {
            swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          } catch (swErr) {
            console.warn('SW registration fallback:', swErr);
          }
        }

        token = await getToken(messagingInstance, {
          serviceWorkerRegistration: swRegistration,
        }).catch((err) => {
          console.warn('Failed to get FCM token (normal in some sandboxed iframes):', err);
          return undefined;
        });

        if (token) {
          // Store token in Firestore for targeted push notifications
          try {
            const tokenRef = doc(db, 'fcmTokens', token.slice(0, 32));
            await setDoc(tokenRef, {
              token,
              teacherName: teacherName || '선생님',
              deviceType: navigator.userAgent,
              updatedAt: Date.now()
            }, { merge: true });
          } catch (fErr) {
            console.warn('Could not save token to Firestore:', fErr);
          }
        }
      } catch (tokenErr) {
        console.warn('FCM token acquisition:', tokenErr);
      }
    }

    // Save preference to localStorage
    try {
      localStorage.setItem('push_notifications_enabled', 'true');
      if (teacherName) {
        localStorage.setItem('subscribed_teacher_name', teacherName);
      }
    } catch {}

    return { granted: true, token };
  } catch (err: any) {
    return { granted: false, error: err?.message || '알림 권한 요청 중 오류가 발생했습니다.' };
  }
}

/**
 * Show a native browser notification (if permitted)
 */
export function showBrowserNotification(alert: ScheduleAlert) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const icon = '/logo.svg';
    const n = new Notification(alert.title, {
      body: alert.message,
      icon,
      badge: icon,
      tag: `alert-${alert.id}`,
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.warn('Browser notification display error:', err);
  }
}

/**
 * Setup foreground listener for Firebase Cloud Messaging
 */
export function listenToForegroundMessages(callback: (payload: any) => void): (() => void) | null {
  if (!messagingInstance) return null;
  try {
    return onMessage(messagingInstance, (payload) => {
      playNotificationChime();
      callback(payload);
    });
  } catch {
    return null;
  }
}
