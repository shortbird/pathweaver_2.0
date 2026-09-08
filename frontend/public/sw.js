/**
 * Service Worker for Optio Education Platform
 *
 * Handles Web Push notifications for messaging and other real-time updates.
 * This service worker runs in the background and can show notifications
 * even when the app is closed.
 */

// Cache version - update when service worker changes
const SW_VERSION = '1.0.0';

/**
 * Handle push events from the push service
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let data = {
    title: 'Optio',
    body: 'You have a new notification',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-192x192.png',
    tag: 'optio-notification',
    renotify: true,
    requireInteraction: false,
    data: {}
  };

  // Parse the push payload if available
  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        ...data,
        ...payload,
        data: {
          ...data.data,
          ...payload.data
        }
      };
    } catch (e) {
      console.warn('[SW] Failed to parse push data:', e);
      // Use text as body if JSON parsing fails
      data.body = event.data.text() || data.body;
    }
  }

  // Show the notification
  const promiseChain = self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    renotify: data.renotify,
    requireInteraction: data.requireInteraction,
    data: data.data,
    actions: [
      {
        action: 'open',
        title: 'Open'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  });

  event.waitUntil(promiseChain);
});

/**
 * Handle notification click events
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  // Close the notification
  event.notification.close();

  // Handle dismiss action
  if (event.action === 'dismiss') {
    return;
  }

  // Get the URL to open (default to /communication for messages)
  const urlToOpen = event.notification.data?.url || '/communication';

  // Open the app or focus existing window
  const promiseChain = clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((windowClients) => {
    // Check if there's already a window/tab open
    for (const client of windowClients) {
      // If we found a window with our origin, focus it
      if (client.url.includes(self.location.origin)) {
        // Navigate to the specific URL if different
        if (!client.url.includes(urlToOpen)) {
          client.navigate(urlToOpen);
        }
        return client.focus();
      }
    }
    // No window open, open a new one
    return clients.openWindow(urlToOpen);
  });

  event.waitUntil(promiseChain);
});

/**
 * Handle notification close events (dismissed without clicking)
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed');
});

/**
 * Handle service worker installation
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed, version:', SW_VERSION);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

/**
 * Handle service worker activation
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated, version:', SW_VERSION);
  // Claim all clients so the SW is in control immediately
  event.waitUntil(clients.claim());
});

/**
 * Handle push subscription change events
 * This fires when the subscription is invalidated by the push service
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed, need to re-subscribe');

  // Attempt to re-subscribe with the same options
  const promiseChain = self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: event.oldSubscription?.options?.applicationServerKey
  }).then((newSubscription) => {
    // Send the new subscription to the server
    // This requires the server endpoint to be available
    console.log('[SW] Re-subscribed successfully');

    // We can't easily update the server here without auth tokens
    // The frontend will handle re-subscription on next load
    return newSubscription;
  }).catch((error) => {
    console.error('[SW] Failed to re-subscribe:', error);
  });

  event.waitUntil(promiseChain);
});
