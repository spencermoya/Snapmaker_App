const CACHE_NAME = 'snapmaker-control-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});

self.addEventListener('push', function(event) {
  if (!event.data) {
    console.log('[SW] Push event but no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[SW] Failed to parse push data:', e);
    return;
  }

  let title = 'Snapmaker Control';
  let options = {
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'print-notification',
    renotify: true,
    requireInteraction: false,
  };

  switch (data.type) {
    case 'print_started':
      title = 'Print Started';
      options.body = data.filename 
        ? 'Now printing: ' + data.filename
        : 'A print job has started';
      options.tag = 'print-started';
      break;
    case 'print_completed':
      title = 'Print Completed!';
      options.body = data.filename
        ? 'Finished: ' + data.filename
        : 'Your print has completed';
      if (data.durationMinutes) {
        options.body += ' (' + data.durationMinutes + ' min)';
      }
      options.tag = 'print-completed';
      options.requireInteraction = true;
      break;
    case 'print_stopped':
      title = 'Print Stopped';
      options.body = data.filename
        ? 'Stopped: ' + data.filename
        : 'The print job was stopped';
      options.tag = 'print-stopped';
      break;
    default:
      console.log('[SW] Unknown notification type:', data.type);
      return;
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
