import { api } from '../api/client';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function enablePush(vapidPublicKey: string) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any });
  const j = sub.toJSON();
  await api('/push/subscribe', { method: 'POST', json: { endpoint: j.endpoint, keys: j.keys } });
  return true;
}
