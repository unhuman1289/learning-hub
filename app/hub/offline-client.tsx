"use client";
import { useEffect, useState } from 'react';

export async function workerMessage(type: string, id?: string) {
  if (!('serviceWorker' in navigator)) return false;
  const registration = navigator.serviceWorker.controller ? null : await Promise.race([navigator.serviceWorker.ready, new Promise<null>(resolve => setTimeout(() => resolve(null), 1500))]);
  const worker = navigator.serviceWorker.controller ?? registration?.active;
  if (!worker) return false;
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => reject(new Error('Không xoá được cache.')), 5000);
    channel.port1.onmessage = () => { clearTimeout(timeout); resolve(); };
    worker.postMessage({ type, id }, [channel.port2]);
  });
  return true;
}
export async function changeOfflineProfile(id: string) {
  window.dispatchEvent(new Event("lh:profile-change"));
  const sent = await workerMessage('profile', id);
  if (!sent && 'caches' in window) { await caches.delete('lh-today-v1'); await caches.delete('lh-profile-v1'); }
  if (id) localStorage.setItem('lh-offline-profile', id); else localStorage.removeItem('lh-offline-profile');
  if ('BroadcastChannel' in window) { const channel = new BroadcastChannel('lh-profile'); channel.postMessage(id); channel.close(); }
}
export function OfflineClient() {
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let alive = true;
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('lh-profile') : null;
    if (channel) channel.onmessage = () => location.reload();
    void navigator.serviceWorker.register('/sw.js').then(registration => {
      if (!alive) return;
      const check = () => { if (registration.waiting && navigator.serviceWorker.controller) setUpdate(registration.waiting); };
      check();
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check));
    }).catch(() => {});
    return () => { alive = false; channel?.close(); };
  }, []);
  if (!update) return null;
  return <button type="button" className="fixed bottom-4 right-4 z-50 rounded bg-paper px-4 py-3 text-ink-paper shadow-page" onClick={() => {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    update.postMessage({ type: 'activate' });
  }}>Có bản mới — tải lại</button>;
}
