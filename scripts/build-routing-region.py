"""Build a reference-complete buffered regional Valhalla graph from a local PBF."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from datetime import datetime, timezone
import osmium
import valhalla

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('output')
parser.add_argument('--resume', action='store_true')
parser.add_argument('--bbox', default='13.55,58.24,14.18,58.55')
args = parser.parse_args()
source = Path(args.source).resolve(strict=True)
output = Path(args.output).resolve()
if output.exists() and not args.resume:
    raise RuntimeError('Build directory already exists; choose a new version directory.')
bbox = [float(v) for v in args.bbox.split(',')]
if len(bbox) != 4 or not (-180 <= bbox[0] < bbox[2] <= 180 and -90 <= bbox[1] < bbox[3] <= 90):
    raise ValueError('Invalid bbox')
output.mkdir(parents=True, exist_ok=args.resume)
extract = output / 'region.osm.pbf'
started = time.monotonic()
selected = set()
restriction_count = 0
if args.resume and not extract.is_file():
    raise RuntimeError('Resume requires a completed region.osm.pbf')
print('Extracting buffered road/footway network and complete references', flush=True)
if not args.resume:
    with osmium.BackReferenceWriter(str(extract), ref_src=str(source), remove_tags=False) as writer:
        processor = osmium.FileProcessor(str(source)).with_locations().with_filter(osmium.filter.KeyFilter('highway', 'route'))
        for obj in processor:
            if not obj.is_way() or not (obj.tags.get('highway') or obj.tags.get('route') == 'ferry'):
                continue
            if any(n.location.valid() and bbox[0] <= n.lon <= bbox[2] and bbox[1] <= n.lat <= bbox[3] for n in obj.nodes):
                writer.add_way(obj)
                selected.add(obj.id)
        print(f'Selected {len(selected)} ways; adding associated restrictions', flush=True)
        processor = osmium.FileProcessor(str(source), entities=osmium.osm.RELATION).with_filter(osmium.filter.TagFilter(('type', 'restriction')))
        for obj in processor:
            if any(m.type == 'w' and m.ref in selected for m in obj.members):
                writer.add_relation(obj)
                restriction_count += 1
print('Extract written; building native Valhalla tiles', flush=True)
tiles = output / 'tiles'
tiles.mkdir(exist_ok=args.resume)
config = valhalla.get_config(tile_dir=str(tiles), tile_extract='')
config['mjolnir']['tile_extract'] = ''
config['mjolnir']['concurrency'] = 4
config['logging']['type'] = 'std_err'
config['logging']['color'] = False
config['service_limits']['isochrone']['max_time_contour'] = 30
config['service_limits']['isochrone']['max_contours'] = 3
config['service_limits']['isochrone']['max_locations'] = 1
config_path = output / 'valhalla.json'
config_path.write_text(json.dumps(config), encoding='utf8')
package = Path(valhalla.__file__).parent
binary = package / 'bin' / ('valhalla_build_tiles.exe' if os.name == 'nt' else 'valhalla_build_tiles')
runtime_env = dict(os.environ)
if os.name == 'nt':
    runtime_env['PATH'] = str(package.parent / 'pyvalhalla.libs') + os.pathsep + str(package / 'bin') + os.pathsep + runtime_env.get('PATH', '')
with (output / 'build.log').open('w', encoding='utf8') as log:
    subprocess.run([str(binary), '-c', str(config_path), '-j', '4', str(extract)], env=runtime_env, stdout=log, stderr=log, check=True)
selected = set(obj.id for obj in osmium.FileProcessor(str(extract), entities=osmium.osm.WAY))
restriction_count = sum(1 for obj in osmium.FileProcessor(str(extract), entities=osmium.osm.RELATION) if obj.tags.get('type') == 'restriction')
digest = hashlib.sha256()
with source.open('rb') as reader:
    for chunk in iter(lambda: reader.read(1024 * 1024), b''):
        digest.update(chunk)
with osmium.io.Reader(str(source), osmium.osm.NOTHING) as reader:
    data_time = reader.header().get('osmosis_replication_timestamp')
manifest = {'version': 1, 'engine': 'pyvalhalla', 'engineVersion': valhalla.__version__, 'builtAt': datetime.now(timezone.utc).isoformat(), 'sourceFile': source.name, 'sourceSha256': digest.hexdigest(), 'sourceBytes': source.stat().st_size, 'extractBytes': extract.stat().st_size, 'bbox': bbox, 'waysSelected': len(selected), 'restrictionRelations': restriction_count, 'buildSeconds': round(time.monotonic()-started, 2), 'dataTime': data_time, 'attribution': '© OpenStreetMap contributors, ODbL', 'notes': 'Buffered complete ways/restrictions. No elevation, admin or timezone databases built. Coverage and contours require separate checks.'}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
print(json.dumps(manifest), flush=True)
