/* eslint-disable no-restricted-globals */
/// <reference lib="webworker" />

// Skip the "waiting" phase immediately when a new version is installed.
// This means the new service worker takes over as soon as it installs, without
// waiting for all existing tabs to close.
self.addEventListener("install", () => {
  self.skipWaiting();
});

// After taking over, claim all open clients so they receive the new version
// without needing a full manual restart.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Household Manager", body: event.data.text() };
  }

  const title = payload.title || "Household Manager";
  const options = {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || "household-manager",
    data: { url: payload.url || "/" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
