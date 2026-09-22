// Scripts for firebase messaging service worker
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize Firebase app in service worker
firebase.initializeApp({
  apiKey: "AIzaSyAi8SonlQxEKLeugcFgGXkKTfzt-fQ8yuQ",
  authDomain: "gen-lang-client-0441740129.firebaseapp.com",
  projectId: "gen-lang-client-0441740129",
  storageBucket: "gen-lang-client-0441740129.firebasestorage.app",
  messagingSenderId: "309309226127",
  appId: "1:309309226127:web:3c60a60b62b1f458bb04fa"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || '수업 변경 / 공강 알림';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.message || '새로운 시간표 변경 사항이 있습니다.',
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: 'schedule-alert',
    renotify: true,
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
