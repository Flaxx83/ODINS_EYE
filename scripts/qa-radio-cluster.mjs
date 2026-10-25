import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const urlIndex = process.argv.indexOf('--url');
const url =
  (urlIndex >= 0 ? process.argv[urlIndex + 1] : null) ||
  'http://127.0.0.1:4173';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setRequestInterception(true);
  page.on('request', (request) =>
    request.isNavigationRequest() && request.frame() === page.mainFrame()
      ? request.respond({
          status: 200,
          contentType: 'text/html',
          body: '<html><head><link rel="stylesheet" href="/src/layers/radio/cluster-list.css"></head><body><button id="open">Öppna</button></body></html>',
        })
      : request.continue(),
  );
  await page.goto(url);
  await page.evaluate(async () => {
    const { createClusterList } =
      await import('/src/layers/radio/cluster-list.js');
    const { createLabels } = await import('/src/layers/radio/labels.js');
    const stations = Array.from({ length: 38 }, (_, i) => ({
      id: String(i),
      name: i === 0 ? 'Radio <Nacka>' : 'Station ' + String(i).padStart(2, '0'),
      state: 'Stockholm',
      country: 'Sverige',
      tags: ['talk'],
    }));
    window.radioActions = [];
    const state = { _stationById: new Map(stations.map((s) => [s.id, s])) };
    const parts = {
      interaction: { radioPresentationAllowed: () => true },
      selection: {
        selectRadioStation: (id, options) => {
          window.radioActions.push({ id, ...options });
          return state._stationById.has(id);
        },
      },
    };
    const list = createClusterList({ state, parts });
    parts.clusterList = list;
    const labels = createLabels({ state, parts });
    const entry = labels.createRadioClusterOverlayEntry({
      id: 'test',
      position: {},
      text: '38 OTHER',
      stationCount: 38,
      stationIds: stations.map((s) => s.id),
    });
    window.radioList = list;
    window.radioState = state;
    document.querySelector('#open').onclick = entry.activate;
  });
  await page.click('#open');
  assert.equal(await page.$$eval('dialog section', (rows) => rows.length), 38);
  assert.equal(await page.evaluate(() => window.radioActions.length), 0);
  await page.click('button[aria-label="Favorit: Radio <Nacka>"]');
  assert.equal(
    await page.$eval('button[aria-label="Favorit: Radio <Nacka>"]', (e) =>
      e.getAttribute('aria-pressed'),
    ),
    'true',
  );
  assert.equal(await page.evaluate(() => window.radioActions.length), 0);
  await page.type('input[type=search]', 'Nacka');
  assert.equal(await page.$$eval('dialog section', (rows) => rows.length), 1);
  assert.equal(
    await page.$eval('dialog strong', (e) => e.textContent),
    'Radio <Nacka>',
  );
  await page.click('button[aria-label="Lyssna: Radio <Nacka>"]');
  assert.deepEqual(await page.evaluate(() => window.radioActions[0]), {
    id: '0',
    autoplay: true,
    focus: false,
    origin: 'user',
  });
  await page.click('button[aria-label="Visa på kartan: Radio <Nacka>"]');
  assert.equal(await page.$('dialog'), null);
  assert.equal(
    await page.evaluate(() => window.radioActions[1].autoplay),
    false,
  );
  assert.equal(await page.evaluate(() => window.radioActions[1].focus), true);
  await page.evaluate(() => window.radioList.openFavorites());
  assert.equal(await page.$$eval('dialog section', (rows) => rows.length), 1);
  await page.keyboard.press('Escape');
  await page.setViewport({ width: 390, height: 844 });
  await page.click('#open');
  assert.equal(
    await page.$eval('dialog', (e) => {
      const r = e.getBoundingClientRect();
      return r.left >= 0 && r.right <= 390;
    }),
    true,
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.$('dialog'), null);
  await page.click('#open');
  await mkdir('qa-artifacts/radio-cluster', { recursive: true });
  await page.screenshot({ path: 'qa-artifacts/radio-cluster/mobile.png' });
  await page.evaluate(() => window.radioState._stationById.delete('0'));
  await page.click('button[aria-label="Lyssna: Radio <Nacka>"]');
  assert.match(
    await page.$eval('dialog [role=status]', (e) => e.textContent),
    /inte längre/,
  );
  await page.evaluate(() => window.radioList.close());
  assert.equal(await page.$('dialog'), null);
  await page.evaluate(async () => {
    const { createInteraction } =
      await import('/src/layers/radio/interaction.js');
    const { createClusterList } =
      await import('/src/layers/radio/cluster-list.js');
    const { RADIO_OVERLAY_SOURCE_ID } =
      await import('/src/layers/radio/policy.js');
    const canvas = document.createElement('canvas');
    canvas.id = 'radio-map';
    canvas.width = 200;
    canvas.height = 100;
    document.body.append(canvas);
    const state = window.radioState;
    state._enabled = true;
    state._viewer = { scene: { canvas, pick: () => null } };
    state._clusterOverlayIdentities = [
      { id: 'test', stationIds: ['1', '2', '3'] },
    ];
    const parts = {
      rendering: { updateRenderVisibility: () => {} },
      selection: {},
    };
    const services = {
      picking: {
        resolvePickId: () => null,
        isOwnedByOtherLayer: () => false,
        registerPickOwner: () => {},
        unregisterPickOwner: () => {},
      },
      overlays: {
        setOverlaySourceVisible: () => {},
        hitTestWorldOverlay: () => ({
          sourceId: RADIO_OVERLAY_SOURCE_ID,
          entryId: 'cluster:test',
        }),
      },
    };
    parts.interaction = createInteraction({ state, parts, services });
    parts.clusterList = createClusterList({ state, parts });
    window.radioInteraction = parts.interaction;
    parts.interaction.installInteraction();
  });
  await page.click('#radio-map');
  assert.equal(await page.$$eval('dialog section', (rows) => rows.length), 3);
  await page.evaluate(() => window.radioInteraction.removeInteraction());
  assert.equal(await page.$('dialog'), null);
  await page.reload();
  assert.deepEqual(
    await page.evaluate(async () => {
      const { createRadioFavorites } =
        await import('/src/layers/radio/cluster-list.js');
      return createRadioFavorites()
        .list()
        .map((row) => row.id);
    }),
    ['0'],
  );
  console.log(
    'PASS cluster activation, all members, search, safe text, explicit playback, map selection, mobile fit, Escape, stale station, favorites after reload and cleanup',
  );
} finally {
  await browser.close();
}
