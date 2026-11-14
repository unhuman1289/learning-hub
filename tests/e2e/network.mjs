import { setTimeout as delay } from 'node:timers/promises';

export async function shapeNetwork(page, browserName) {
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    const throttle = () => cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 300,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
      connectionType: 'cellular4g',
    });
    await throttle();
    return throttle;
  }

  // WebKit routing adds request latency. It does not shape transfer rates.
  await page.route('**/*', async route => {
    await delay(300);
    await route.continue();
  });
  return async () => {};
}

export async function timeFromTap(control, ready) {
  const page = control.page();
  await control.evaluate(el => el.addEventListener('click', () => {
    performance.mark('phone-check-start');
  }, { once: true, capture: true }));
  await control.tap();
  await ready.waitFor({ state: 'visible' });
  return page.evaluate(() => {
    performance.mark('phone-check-visible');
    return performance.measure('phone-check', 'phone-check-start', 'phone-check-visible').duration;
  });
}
