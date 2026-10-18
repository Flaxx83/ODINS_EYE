// Requires the local app on port 4173 and the Sweden routing dataset.
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
await mkdir('work', { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(
    'http://127.0.0.1:4173/#v=2&lat=58.3897&lon=13.8457&alt=15000&heading=360&pitch=-89&roll=0&map=esri-imagery',
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  );
  await p.waitForFunction(() => window.__godsEyeView?.dataManager, {
    timeout: 90000,
  });
  await p.evaluate(() => {
    document.querySelector('#loading-screen')?.remove();
    document.querySelector('#first-run-launcher')?.remove();
    return window.__godsEyeView.dataManager.setEnabled('reachability', true, {
      origin: 'user',
    });
  });
  await p.waitForSelector('[aria-label="Färdsätt"]');
  await new Promise((r) => setTimeout(r, 5000));
  await p.select('[aria-label="Färdsätt"]', 'compare');
  await p.click('[aria-label="Jämför bil"]');
  await p.click('[aria-label="Jämför elsparkcykel"]');
  await p.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Räckvidd"] button')]
      .find((b) => b.textContent === 'Beräkna räckvidd')
      .click(),
  );
  await p.waitForFunction(
    () => {
      const t = document.querySelector(
        '[aria-label="Räckvidd"] [aria-live]',
      ).textContent;
      return t.includes('Bil ·') && t.includes('Elsparkcykel ·');
    },
    { timeout: 120000 },
  );
  const names = await p.evaluate(() =>
    window.__godsEyeView.viewer.dataSources
      .getByName('reachability')[0]
      .entities.values.map((e) => e.name),
  );
  assert.ok(names.filter((n) => n.startsWith('Cykel ·')).length >= 3);
  assert.ok(names.filter((n) => n.startsWith('Gång ·')).length >= 3);
  await new Promise((r) => setTimeout(r, 4000));
  await p.screenshot({ path: 'work/four-mode-compare.png' });
  const legend = await p.$eval(
    '[aria-label="Färgförklaring för räckvidd"]',
    (e) => ({
      groups: e.querySelectorAll('section').length,
      items: [...e.querySelectorAll('li')].map((x) => x.textContent),
      hidden: e.hidden,
    }),
  );
  assert.equal(legend.groups, 4);
  assert.equal(legend.hidden, false);
  assert.deepEqual(
    legend.items,
    Array.from({ length: 4 }, () => [
      'Inom 5 min',
      'Inom 10 min',
      'Inom 15 min',
    ]).flat(),
  );
  console.log('PASS four real profiles and three time budgets');
  await p.click('[aria-label="Visa bil"]');
  assert.equal(
    await p.evaluate(() => {
      const es =
        window.__godsEyeView.viewer.dataSources.getByName('reachability')[0]
          .entities.values;
      return (
        es
          .filter((e) => e.name.startsWith('Bil ·'))
          .every((e) => !e.isShowing) &&
        es
          .filter((e) => e.name.startsWith('Cykel ·'))
          .every((e) => e.isShowing) &&
        es.find((e) => e.name === 'Start').isShowing
      );
    }),
    true,
  );
  await p.click('[aria-label="Visa bil"]');
  assert.equal(
    await p.evaluate(() =>
      window.__godsEyeView.viewer.dataSources
        .getByName('reachability')[0]
        .entities.values.filter((e) => e.name.startsWith('Bil ·'))
        .every((e) => e.isShowing),
    ),
    true,
  );
  console.log(
    'PASS hide/show includes fill and boundaries, preserves other modes and origin',
  );
  let scenario = 'versions';
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (r.url().endsWith('/api/reachability') && r.method() === 'POST') {
      const mode = JSON.parse(r.postData()).mode;
      if (scenario === 'failure' && mode === 'bicycle')
        return void r.respond({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'QA unavailable' }),
        });
      return void r.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version:
            scenario === 'versions' && mode === 'bicycle'
              ? 'changed'
              : 'original',
        }),
      });
    }
    void r.continue();
  });
  await p.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Räckvidd"] button')]
      .find((b) => b.textContent === 'Beräkna räckvidd')
      .click(),
  );
  await p.waitForFunction(() =>
    document
      .querySelector('[aria-label="Räckvidd"] [aria-live]')
      .textContent.includes('ändrades'),
  );
  assert.equal(
    await p.evaluate(
      () =>
        window.__godsEyeView.viewer.dataSources.getByName('reachability')[0]
          .entities.values.length,
    ),
    0,
  );
  assert.equal(
    await p.$eval(
      '[aria-label="Färgförklaring för räckvidd"]',
      (e) => e.hidden,
    ),
    true,
  );
  scenario = 'failure';
  await p.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Räckvidd"] button')]
      .find((b) => b.textContent === 'Beräkna räckvidd')
      .click(),
  );
  await p.waitForFunction(() =>
    document
      .querySelector('[aria-label="Räckvidd"] [aria-live]')
      .textContent.includes('QA unavailable'),
  );
  assert.equal(
    await p.evaluate(
      () =>
        window.__godsEyeView.viewer.dataSources.getByName('reachability')[0]
          .entities.values.length,
    ),
    0,
  );
  console.log(
    'PASS no partial comparison on changed version or failed bicycle result',
  );

  await p.click('[aria-label="Jämför gång"]');
  await p.click('[aria-label="Jämför cykel"]');
  await p.click('[aria-label="Jämför bil"]');
  await p.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Räckvidd"] button')]
      .find((b) => b.textContent === 'Beräkna räckvidd')
      .click(),
  );
  await p.waitForFunction(() =>
    document
      .querySelector('[aria-label="Räckvidd"] [aria-live]')
      .textContent.includes('minst två'),
  );
  console.log('PASS fewer than two modes rejected');
  await p.select('[aria-label="Färdsätt"]', 'bicycle');
  assert.equal(
    await p.evaluate(
      () =>
        window.__godsEyeView.viewer.dataSources.getByName('reachability')[0]
          .entities.values.length,
    ),
    0,
  );
  await p.setViewport({ width: 390, height: 844 });
  assert.equal(
    await p.$eval('[aria-label="Räckvidd"]', (e) => {
      let r = e.getBoundingClientRect();
      return r.left >= 0 && r.right <= 390;
    }),
    true,
  );
  await p.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('reachability', false),
  );
  assert.equal(await p.$('[aria-label="Räckvidd"]'), null);
  console.log(
    'PASS comparison: walking and cycling polygons, mode change clears, mobile fit, layer off',
  );
} finally {
  await browser.close();
}
