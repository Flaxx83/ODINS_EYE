"""Smoke-test a completed local graph and atomically select its version."""
import argparse
import json
import os
from pathlib import Path
from datetime import datetime
import valhalla
import osmium

parser = argparse.ArgumentParser()
parser.add_argument('version')
parser.add_argument('--directory', default='.gev-cache/routing')
parser.add_argument('--sample', action='append', required=True, help='lat,lon; repeat for multiple towns')
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
nodes = set(obj.id for obj in osmium.FileProcessor(str(folder/'region.osm.pbf'), entities=osmium.osm.NODE))
missing = sum(1 for way in osmium.FileProcessor(str(folder/'region.osm.pbf'), entities=osmium.osm.WAY) for node in way.nodes if node.ref not in nodes)
if missing:
    raise ValueError('Missing node references; activation refused')
del nodes
print('PASS complete node references', flush=True)
config['logging']['type'] = ''
actor = valhalla.Actor(config)
for sample in args.sample:
    lat, lon = map(float, sample.split(','))
    if not (coverage[0] <= lon <= coverage[2] and coverage[1] <= lat <= coverage[3]):
        raise ValueError('Sample outside start coverage')
    result = actor.isochrone({'locations':[{'lat':lat,'lon':lon}], 'costing':'pedestrian',
        'costing_options':{'pedestrian':{'walking_speed':6}}, 'contours':[{'time':5},{'time':15},{'time':30}], 'polygons':True, 'denoise':0})
    if len(result['features']) != 3:
        raise ValueError('Missing smoke-test contours')
    for feature in result['features']:
        geometry = feature['geometry']
        polygons = [geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
        for polygon in polygons:
            for ring in polygon:
                if len(ring)<4 or ring[0]!=ring[-1] or any(not (bbox[0]<x<bbox[2] and bbox[1]<y<bbox[3]) for x,y in ring):
                    raise ValueError('Invalid or clipped contour')
    print('PASS local contours: '+sample, flush=True)
if active.exists() and json.loads(active.read_text(encoding='utf8'))['version'] != args.version:
    (root/'active.previous.json').write_bytes(active.read_bytes())
temporary = root/'active.pending.json'
temporary.write_text(json.dumps({'version':args.version}), encoding='utf8')
os.replace(temporary, active)
print('Activated '+args.version, flush=True)
