import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  pythonCommand,
  runPython,
} from '../server/providers/python-runtime.js';
try {
  process.loadEnvFile?.();
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
let failures = 0;
const root = new URL('../', import.meta.url);
const report = (ok, label, hint) => {
  console.log(`${ok ? 'OK' : 'SAKNAS'} · ${label}${ok ? '' : ' — ' + hint}`);
  if (!ok) failures++;
};
console.log(
  'ODINS EYE: installation och lokala data. Inga nyckelvärden visas.',
);
const major = Number(process.versions.node.split('.')[0]);
report(
  [24, 26].includes(major),
  'Node.js ' + process.versions.node,
  'Använd Node enligt package.json engines.',
);
try {
  const command = await pythonCommand();
  const { stdout } = await runPython(
    ['-c', 'import sys;print(sys.version.split()[0])'],
    { timeout: 10000 },
  );
  report(true, 'Python ' + stdout.trim() + ' (' + command.file + ')', '');
  for (const [label, modules, file] of [
    ['Geodata', ['shapely', 'pyproj', 'pyarrow'], 'requirements-geo.txt'],
    [
      'Röst (valfritt)',
      ['faster_whisper', 'av', 'numpy'],
      'requirements-voice.txt',
    ],
  ]) {
    try {
      await runPython(['-c', modules.map((m) => 'import ' + m).join(';')], {
        timeout: 30000,
      });
      report(true, label + '-beroenden', '');
    } catch {
      report(
        false,
        label + '-beroenden',
        'Installera ' + file + ' i vald Pythonmiljö.',
      );
    }
  }
} catch (e) {
  report(false, 'Python', e.message);
}
for (const [label, path, hint] of [
  [
    'SJ-geometri',
    '.gev-cache/sj-geometry.json',
    'npm run import:gtfs -- --operator sj --zip <sj.zip>',
  ],
  [
    'SL-metadata',
    '.gev-cache/sl-metadata.json',
    'npm run import:gtfs -- --operator sl --zip <sl.zip>',
  ],
  [
    'Järnvägsgraf',
    '.gev-cache/rail-network.pkl',
    'npm run import:rail -- --gpkg <100-kommunikation.gpkg>',
  ],
  ['Whispermodell (valfritt)', '.gev-cache/whisper', 'npm run model:whisper'],
]) {
  try {
    await access(new URL(path, root));
    report(true, label, '');
  } catch {
    report(false, label, hint);
  }
}
try {
  const meta = JSON.parse(
    await readFile(new URL('.gev-cache/sl-metadata.json', root), 'utf8'),
  );
  const ids = [
    ...new Set(
      Object.values(meta.trips)
        .map((t) => t.shapeId)
        .filter(Boolean),
    ),
  ];
  if (!ids.length) throw Error();
  for (const id of ids)
    await access(
      new URL('.gev-cache/sl-shapes/' + encodeURIComponent(id) + '.json', root),
    );
  report(true, 'SL-linjeformer', '');
} catch {
  report(
    false,
    'SL-linjeformer',
    'Importera komplett SL GTFS inklusive shapes.txt.',
  );
}
for (const scale of ['1m', '250', '100'])
  for (const theme of [
    'administrativindelning',
    'kommunikation',
    'hydrografi',
  ]) {
    try {
      const names = await readdir(
        new URL(`.gev-cache/topography/${scale}/${theme}/`, root),
      );
      if (!names.some((n) => n.endsWith('.json') && n !== 'manifest.json'))
        throw Error();
      report(true, `Topografi ${scale}/${theme}`, '');
    } catch {
      report(
        false,
        `Topografi ${scale}/${theme}`,
        `npm run import:topography -- --scale ${scale} --theme ${theme} --zip <export.zip>`,
      );
    }
  }
for (const name of [
  'TRAFIKLAB_REALTIME_KEY',
  'TRAFIKLAB_STATIC_KEY',
  'TRAFIKLAB_TIMETABLE_KEY',
  'RESROBOT_API_KEY',
  'VASTTRAFIK_CLIENT_ID',
  'VASTTRAFIK_CLIENT_SECRET',
])
  report(
    Boolean(process.env[name]?.trim()),
    name,
    'Ange i .env om tjänsten ska användas.',
  );
console.log(
  'Bionic konfigureras separat på http://127.0.0.1:1235/v1. Ingen API-hämtning eller modellnedladdning utfördes.',
);
console.log(
  `${failures} saknade komponenter. Valfria källor får lämnas oinstallerade.`,
);
if (process.argv.includes('--strict') && failures) process.exitCode = 1;
