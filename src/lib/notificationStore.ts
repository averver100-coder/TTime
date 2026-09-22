import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { db } from './firebase';
import { ScheduleAlert, NotificationType } from '../types/notification';
import { showBrowserNotification, playNotificationChime } from './firebaseMessaging';

const NOTIFICATIONS_COLLECTION = 'scheduleAlerts';

/**
 * Send an immediate push notification to teachers (stored in Firestore + broadcast)
 */
export async function sendScheduleAlert(alertData: {
  type: NotificationType;
  title: string;
  message: string;
  targetTeacher: string;
  targetDate?: string;
  dayOfWeek?: string;
  period?: number;
  originalClass?: string;
  newClass?: string;
  sender?: string;
}): Promise<ScheduleAlert> {
  const id = `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const alert: ScheduleAlert = {
    id,
    type: alertData.type,
    title: alertData.title,
    message: alertData.message,
    targetTeacher: alertData.targetTeacher,
    targetDate: alertData.targetDate,
    dayOfWeek: alertData.dayOfWeek,
    period: alertData.period,
    originalClass: alertData.originalClass,
    newClass: alertData.newClass,
    sender: alertData.sender || '교무기획부',
    createdAt: Date.now(),
    readBy: []
  };

  // 1. Save to Cloud Firestore
  try {
    const alertRef = doc(db, NOTIFICATIONS_COLLECTION, id);
    await setDoc(alertRef, alert);
  } catch (err) {
    console.warn('Failed to save notification to Firestore:', err);
  }

  // 2. Also save to server API / local storage fallback
  try {
    await fetch('/api/schedule-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert)
    }).catch(() => null);
  } catch {}

  // 3. Cache locally
  try {
    const existingStr = localStorage.getItem('recent_schedule_alerts');
    const existing: ScheduleAlert[] = existingStr ? JSON.parse(existingStr) : [];
    const updated = [alert, ...existing.filter(a => a.id !== id)].slice(0, 30);
    localStorage.setItem('recent_schedule_alerts', JSON.stringify(updated));
  } catch {}

  return alert;
}

/**
 * Fetch recent schedule alerts
 */
export async function fetchRecentAlerts(maxCount = 30): Promise<ScheduleAlert[]> {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const items: ScheduleAlert[] = [];
      snap.forEach(d => items.push(d.data() as ScheduleAlert));
      return items;
    }
  } catch (err) {
    console.warn('Failed to fetch alerts from Firestore, checking API:', err);
  }

  // Fallback to local API
  try {
    const res = await fetch('/api/schedule-alerts').catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch {}

  // Fallback to localStorage
  try {
    const local = localStorage.getItem('recent_schedule_alerts');
    if (local) return JSON.parse(local);
  } catch {}

  return [];
}

/**
 * Real-time listener for incoming schedule alerts
 */
export function subscribeToScheduleAlerts(
  targetTeacherName: string | null,
  onNewAlert: (alert: ScheduleAlert) => void,
  onAllAlertsUpdate?: (alerts: ScheduleAlert[]) => void
): () => void {
  let initialLoad = true;
  let seenAlertIds = new Set<string>();

  // Initialize with local cache
  try {
    const local = localStorage.getItem('recent_schedule_alerts');
    if (local) {
      const parsed: ScheduleAlert[] = JSON.parse(local);
      parsed.forEach(a => seenAlertIds.add(a.id));
      onAllAlertsUpdate?.(parsed);
    }
  } catch {}

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alerts: ScheduleAlert[] = [];
      snapshot.forEach(docSnap => {
        alerts.push(docSnap.data() as ScheduleAlert);
      });

      onAllAlertsUpdate?.(alerts);

      // Check for genuinely new incoming alerts (post-load)
      if (!initialLoad) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const alert = change.doc.data() as ScheduleAlert;
            if (!seenAlertIds.has(alert.id)) {
              seenAlertIds.add(alert.id);
              
              // Filter: applies if ALL or matching teacher
              const matchesTeacher = 
                !targetTeacherName || 
                alert.targetTeacher === 'ALL' || 
                alert.targetTeacher === targetTeacherName;

              if (matchesTeacher) {
                playNotificationChime();
                showBrowserNotification(alert);
                onNewAlert(alert);
              }
            }
          }
        });
      } else {
        alerts.forEach(a => seenAlertIds.add(a.id));
        initialLoad = false;
      }
    }, (err) => {
      console.warn('Real-time notification subscription warning:', err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Could not setup Firestore onSnapshot for alerts:', err);
    return () => {};
  }
}

/**
 * Mark alert as acknowledged/read by current user
 */
export async function markAlertAsRead(alertId: string, readerName: string): Promise<void> {
  try {
    const alertRef = doc(db, NOTIFICATIONS_COLLECTION, alertId);
    await updateDoc(alertRef, {
      readBy: arrayUnion(readerName)
    });
  } catch {}
}
