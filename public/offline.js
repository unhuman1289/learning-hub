if ('BroadcastChannel' in window) { const channel = new BroadcastChannel('lh-profile'); channel.onmessage = () => location.reload(); }
(async () => {
  const id = localStorage.getItem('lh-offline-profile');
  const worker = navigator.serviceWorker.controller;
  if (!id || !worker) { document.querySelector('#empty').textContent = 'Chưa có bàn học đã lưu.'; return; }
  const channel = new MessageChannel();
  const value = await new Promise(resolve => { channel.port1.onmessage = event => resolve(event.data.body); worker.postMessage({ type: 'today', id }, [channel.port2]); });
  if (!value) { document.querySelector('#empty').textContent = 'Chưa có bàn học đã lưu.'; return; }
  document.querySelector('#greeting').textContent = value.greeting?.hello ?? '';
  for (const item of value.items ?? []) { const li = document.createElement('li'); li.textContent = `${item.subjectTitle} — ${item.title}`; document.querySelector('#items').append(li); }
  if (!value.items?.length) document.querySelector('#empty').textContent = 'Không có bài cần làm trong bản đã lưu.';
})();
