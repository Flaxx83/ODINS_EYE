import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const urlIndex = process.argv.indexOf('--url');
const url =
  (urlIndex >= 0 ? process.argv[urlIndex + 1] : null) ||
  'http://127.0.0.1:4173';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (!r.url().endsWith('/api/local-ai')) return r.continue();
    const { message } = JSON.parse(r.postData());
    const multiple = message.includes('flera');
    const result = multiple
      ? {
          answer: 'Två träffar. Välj en avgång eller ankomst.',
          flightResults: [
            {
              label: 'SK7 · GOT → ARN · 08:00',
              text: 'Första avgången: Planerad 08:00',
              callsign: 'SAS7',
              mapEligible: true,
            },
            {
              label: 'SK7 · GOT → ARN · 18:00',
              text: 'Andra avgången: Inställt',
              callsign: 'SAS7',
              cancelled: true,
              mapEligible: false,
            },
          ],
        }
      : {
          answer: 'Swedavia: SK7 imorgon. Planerad: 08:00. Status: Planerad.',
          flightResults: [
            {
              label: 'SK7 imorgon',
              text: 'Planerad: 08:00',
              callsign: 'SAS7',
              mapEligible: false,
            },
          ],
        };
    return r.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...result,
        sources: [
          {
            name: 'Swedavia FlightInfo',
            url: 'https://www.swedavia.se/',
            time: new Date().toISOString(),
          },
        ],
      }),
    });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__godsEyeView?.dataManager, {
    timeout: 90000,
  });
  await page.evaluate(async () => {
    document.querySelector('#loading-screen')?.remove();
    document.querySelector('#first-run-launcher')?.remove();
    await window.__godsEyeView.dataManager.setEnabled('local-ai', true, {
      origin: 'user',
    });
  });
  const ask = (message) =>
    page.evaluate((message) => {
      const input = document.querySelector('#local-ai-popover textarea');
      input.value = message;
      input.closest('form').requestSubmit();
    }, message);
  await ask('Visa flera flight SK7 idag');
  await page.waitForFunction(
    () => document.querySelectorAll('#local-ai-popover details').length === 2,
  );
  assert.equal(
    await page.$$eval('#local-ai-popover details[open]', (rows) => rows.length),
    0,
  );
  await page.click('#local-ai-popover details:nth-of-type(2) summary');
  assert.match(
    await page.$eval(
      '#local-ai-popover details:nth-of-type(2)',
      (e) => e.textContent,
    ),
    /Inställt/,
  );
  assert.equal(
    await page.$$eval(
      '#local-ai-popover details:nth-of-type(2) button',
      (rows) => rows.length,
    ),
    0,
  );
  await ask('Visa flight SK7 imorgon');
  await page.waitForFunction(() =>
    document
      .querySelector('#local-ai-popover')
      ?.textContent.includes('SK7 imorgon'),
  );
  assert.equal(
    await page.$$eval('#local-ai-popover details', (rows) => rows.length),
    0,
  );
  assert.equal(
    await page.$$eval(
      '#local-ai-popover button',
      (rows) =>
        rows.filter((row) => row.textContent.includes('Sök planet')).length,
    ),
    0,
  );
  assert.match(
    await page.$eval('#local-ai-popover', (e) => e.textContent),
    /Swedavia FlightInfo/,
  );
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(
    () => {
      const r = document
        .querySelector('#local-ai-popover')
        .getBoundingClientRect();
      return r.left >= 0 && r.right <= 390;
    },
    { timeout: 5000 },
  );
  assert.equal(
    await page.$eval('#local-ai-popover', (e) => {
      const r = e.getBoundingClientRect();
      return r.left >= 0 && r.right <= 390;
    }),
    true,
  );
  console.log(
    'PASS multiple flight choices, cancellation, future-date map restriction, replacement, attribution and mobile fit',
  );
} finally {
  await browser.close();
}
