self.addEventListener('push', (e) => {
  const { title, body, tag, url } = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(title ?? 'Reminder', { body, tag, data: { url: url ?? '/habits' } }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/habits';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
