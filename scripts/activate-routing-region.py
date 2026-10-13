"""Smoke-test a completed local graph and atomically select its version."""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from datetime import datetime
import valhalla
import osmium

parser = argparse.ArgumentParser()
parser.add_argument('version')
parser.add_argument('--directory', default='.gev-cache/routing')
samples = parser.add_mutually_exclusive_group(required=True)
samples.add_argument('--sample', action='append', help='lat,lon; repeat for multiple towns')
samples.add_argument('--samples', help='JSON file of named public test locations')
args = parser.parse_args()
root = Path(args.directory).resolve()
folder = (root / args.version).resolve(strict=True)
if folder.parent != root:
    raise ValueError('Version must be a direct child of routing directory')
manifest = json.loads((folder/'manifest.json').read_text(encoding='utf8'))
bbox, coverage = manifest['bbox'], manifest['coverage']
if len(coverage) != 4 or not (bbox[0] < coverage[0] < coverage[2] < bbox[2] and bbox[1] < coverage[1] < coverage[3] < bbox[3]):
    raise ValueError('Invalid buffered coverage')
def date(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))
active = root/'active.json'
if active.exists():
    old = json.loads(active.read_text(encoding='utf8'))
    old_manifest = json.loads((root/old['version']/'manifest.json').read_text(encoding='utf8'))
    if date(manifest['dataTime']) < date(old_manifest['dataTime']):
        raise ValueError('New data is older than active data; activation refused')
config = json.loads((folder/'valhalla.json').read_text(encoding='utf8'))
print('Checking way references with the native node-location index', flush=True)
storage = osmium.index.create_map('flex_mem')
locations = osmium.NodeLocationsForWays(storage)
# Unlike FileProcessor.with_locations(), do not call ignore_errors().
# The C++ handler rejects missing way-node references without Python object loops.
try:
    with osmium.io.Reader(str(folder/'region.osm.pbf'), osmium.osm.NODE | osmium.osm.WAY) as reader:
        osmium.apply(reader, locations)
except (RuntimeError, KeyError, osmium.InvalidLocationError) as error:
    raise ValueError('Missing node references; activation refused') from error
del locations, storage
print('PASS complete node references', flush=True)
worker = Path(__file__).resolve().parent.parent/'server/providers/reachability-query.py'
named_samples = json.loads(Path(args.samples).read_text(encoding='utf8')) if args.samples else [{'name': sample, 'location': sample} for sample in args.sample]
for entry in named_samples:
    sample = entry['location']
    lat, lon = map(float, sample.split(','))
    if not (coverage[0] <= lon <= coverage[2] and coverage[1] <= lat <= coverage[3]):
        raise ValueError('Sample outside start coverage')
    response = subprocess.run([sys.executable, str(worker), str(folder/'valhalla.json'),
        json.dumps({'lat':lat,'lon':lon,'speed':6,'minutes':[5,15,30]})], capture_output=True, text=True, timeout=30, check=True)
    result = json.loads(response.stdout)
    if len(result['features']) != 3:
        raise ValueError('Missing smoke-test contours')
    for feature in result['features']:
        geometry = feature['geometry']
        polygons = [geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
        for polygon in polygons:
            for ring in polygon:
                if len(ring)<4 or ring[0]!=ring[-1] or any(not (bbox[0]<x<bbox[2] and bbox[1]<y<bbox[3]) for x,y in ring):
                    raise ValueError('Invalid or clipped contour')
    print('PASS local contours: '+entry['name']+' ('+sample+')', flush=True)
if active.exists() and json.loads(active.read_text(encoding='utf8'))['version'] != args.version:
    (root/'active.previous.json').write_bytes(active.read_bytes())
temporary = root/'active.pending.json'
temporary.write_text(json.dumps({'version':args.version}), encoding='utf8')
os.replace(temporary, active)
print('Activated '+args.version, flush=True)
