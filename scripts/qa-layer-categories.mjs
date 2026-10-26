import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const at = process.argv.indexOf('--url');
const url = (at >= 0 ? process.argv[at + 1] : null) || 'http://127.0.0.1:4173';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setRequestInterception(true);
  page.on('request', (r) =>
    r.isNavigationRequest() && r.frame() === page.mainFrame()
      ? r.respond({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<html><head><link rel="stylesheet" href="/style.css"></head><body style="background:#102524"><div id="data-panel" class="active" style="left:16px;top:16px;width:300px;visibility:visible;opacity:1;transform:none"><div class="data-panel-inner"><h2>DATA LAYERS</h2><div id="data-toggles" class="data-toggle-list"></div></div></div></body></html>',
        })
      : r.continue(),
  );
  await page.goto(url);
  await page.evaluate(async () => {
    localStorage.removeItem('odins-eye.layer-groups.v1');
    const { LayerPanel } = await import('/src/ui/layerPanel.js');
    window.layers = [
      ['traffic', 'Vägtrafik', false],
      ['transit', 'Kollektivtrafik', true],
      ['flights', 'Flygplan', false],
      ['wind', 'Vind', false],
      ['satellites', 'Satelliter', false],
      ['new-layer', 'Framtida lager', false],
    ].map(([id, name, enabled]) => ({
      id,
      name,
      enabled,
      showInTogglePanel: true,
      source: 'Fixture',
      icon: '•',
      stats: {},
    }));
    window.mountPanel = () => {
      window.panel?.destroy();
      window.panel = new LayerPanel({
        getLayers: () => window.layers,
        isEnabled: (id) => window.layers.find((row) => row.id === id).enabled,
        setEnabled: async (id, value) => {
          window.layers.find((row) => row.id === id).enabled = value;
          window.panel._refreshTogglePanel();
        },
        setLayerParams: () => {},
        getRowControls: () => null,
        hasRowControls: () => false,
        subscribeRowControls: () => () => {},
      });
      window.panel.mount(document.querySelector('#data-toggles'));
    };
    window.mountPanel();
  });
  const groupState = (label) =>
    page.evaluate((label) => {
      const e = [...document.querySelectorAll('.data-layer-group')].find(
        (e) => e.querySelector('summary span').textContent === label,
      );
      return {
        open: e.open,
        hidden: e.hidden,
        count: e.querySelector('.data-layer-group-count').textContent,
      };
    }, label);
  assert.equal(
    await page.$$eval(
      '[data-layer-id]',
      (rows) => new Set(rows.map((row) => row.dataset.layerId)).size,
    ),
    6,
  );
  assert.equal((await groupState('Flyg och sjöfart')).open, false);
  await page.evaluate(() =>
    [...document.querySelectorAll('summary')]
      .find((e) => e.textContent.includes('Flyg och sjöfart'))
      .click(),
  );
  assert.equal((await groupState('Flyg och sjöfart')).open, true);
  await page.type('[aria-label="Sök datalager"]', 'vind');
  assert.equal((await groupState('Väder, miljö och risker')).open, true);
  assert.equal(
    await page.$$eval(
      '[data-layer-id]',
      (rows) => rows.filter((row) => !row.hidden).length,
    ),
    1,
  );
  await page.evaluate(() => window.panel._refreshTogglePanel());
  assert.equal(
    await page.$eval(
      '[aria-label="Sök datalager"]',
      (e) => e === document.activeElement,
    ),
    true,
  );
  await page.$eval('[aria-label="Sök datalager"]', (e) => {
    e.value = '';
    e.dispatchEvent(new Event('input'));
  });
  assert.equal((await groupState('Väder, miljö och risker')).open, false);
  await page.click('.data-layer-toolbar input[type=checkbox]');
  assert.equal(
    await page.$$eval(
      '[data-layer-id]',
      (rows) => rows.filter((row) => !row.hidden).length,
    ),
    1,
  );
  await page.click('[data-layer-id="transit"] .data-toggle-btn');
  await page.waitForFunction(
    () => !document.querySelector('.data-layer-empty').hidden,
  );
  await page.evaluate(() => {
    window.layers.find((row) => row.id === 'flights').enabled = true;
    window.panel._refreshTogglePanel();
  });
  assert.equal((await groupState('Flyg och sjöfart')).count, '1 aktiva');
  await page.click('.data-layer-toolbar input[type=checkbox]');
  await page.evaluate(() => window.mountPanel());
  assert.equal((await groupState('Flyg och sjöfart')).open, true);
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(
    await page.$eval('#data-panel', (e) => e.scrollWidth <= e.clientWidth),
    true,
  );
  await mkdir('qa-artifacts/layer-categories', { recursive: true });
  await page.screenshot({ path: 'qa-artifacts/layer-categories/mobile.png' });
  await page.evaluate(() => window.panel.destroy());
  console.log(
    'PASS category coverage, search through closed groups, focus retention, active filter, external state updates, saved expansion and mobile width',
  );
} finally {
  await browser.close();
}
