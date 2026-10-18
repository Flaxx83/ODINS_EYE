"""Reproducible Göteborg probes against the active local graph, not live traffic.
Run with .venv/Scripts/python.exe scripts/qa-gothenburg-reachability.py.
"""
import json
import subprocess
import sys
from pathlib import Path
import valhalla

ROOT = Path(__file__).resolve().parents[1]
active = json.loads((ROOT / '.gev-cache/routing/active.json').read_text())['version']
config_path = ROOT / '.gev-cache/routing' / active / 'valhalla.json'
config = json.loads(config_path.read_text(encoding='utf-8'))
config['logging']['type'] = ''
actor = valhalla.Actor(config)
# Fixed test coordinates near the named areas; these are not verified street addresses.
cases = [
    ('Hisingsbron banks', (57.7120, 11.9680), (57.7200, 11.9600)),
    ('Alvsborgsbron banks', (57.6850, 11.9040), (57.6970, 11.9000)),
    ('Lindholmen to Stenpiren', (57.7070, 11.9370), (57.7050, 11.9570)),
]
profiles = {
    'walk': ('pedestrian', {'walking_speed': 6}, 6),
    'bicycle': ('bicycle', {'bicycle_type': 'city', 'cycling_speed': 18}, 18),
    'car': ('auto', {'top_speed': 120, 'speed_types': []}, 120),
    'scooter': ('bicycle', {'bicycle_type': 'city', 'cycling_speed': 20, 'avoid_bad_surfaces': 1}, 20),
}
def in_ring(lon, lat, ring):
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > lat) != (b[1] > lat) and lon < (b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside

def contains(feature, point):
    polygons = [feature['geometry']['coordinates']] if feature['geometry']['type'] == 'Polygon' else feature['geometry']['coordinates']
    return any(in_ring(point[1],point[0],p[0]) and not any(in_ring(point[1],point[0],h) for h in p[1:]) for p in polygons)

output = {'version': active, 'cases': []}
folder = ROOT / 'work/gothenburg-qa'
folder.mkdir(parents=True, exist_ok=True)
for name, origin, target in cases:
    for mode, (costing, options, speed) in profiles.items():
        query = {'lat': origin[0], 'lon': origin[1], 'mode': mode, 'speed': speed, 'minutes': [5, 10, 15]}
        process = subprocess.run([sys.executable, str(ROOT/'server/providers/reachability-query.py'), str(config_path), json.dumps(query)], capture_output=True, text=True, encoding='utf-8', timeout=45)
        assert process.returncode == 0, process.stderr
        geo = json.loads(process.stdout)
        assert sorted(f['properties']['contour'] for f in geo['features']) == [5,10,15]
        assert geo['networkOrigin']['distanceMeters'] <= 100
        for feature in geo['features']:
            assert feature['geometry']['type'] in ['Polygon','MultiPolygon']
        routes = []
        for reverse in [False, True]:
            points = [origin, target][:: -1 if reverse else 1]
            locations = [{'lat': p[0], 'lon': p[1], 'radius': 50, 'search_cutoff': 100} for p in points]
            route = actor.route({'locations': locations, 'costing': costing, 'costing_options': {costing: options}})['trip']
            assert route['summary']['length'] > 0
            maneuvers = [m for leg in route['legs'] for m in leg['maneuvers']]
            edges = [edge for leg in route['legs'] for edge in actor.trace_attributes({'encoded_polyline': leg['shape'], 'shape_match': 'edge_walk', 'costing': costing, 'costing_options': {costing: options}})['edges']]
            crossings = [{'wayId': e['way_id'], 'names': e.get('names', []), 'bridge': e.get('bridge', False), 'use': e.get('use'), 'km': e['length']} for e in edges if e.get('bridge') or e.get('use') == 'ferry']
            assert crossings, (name, mode, reverse, 'No bridge or ferry in river crossing')
            if mode == 'car':
                assert not any(e.get('use') == 'ferry' for e in edges), (name, mode, 'Unexpected ferry')
            routes.append({'crossings': crossings, 'reverse': reverse, 'km': route['summary']['length'], 'minutes': round(route['summary']['time']/60,2), 'streets': list(dict.fromkeys(n for m in maneuvers for n in m.get('street_names',[]))), 'instructions': [m.get('instruction') for m in maneuvers]})
        row = {'case':name,'mode':mode,'origin':origin,'target':target,'snapMeters':geo['networkOrigin']['distanceMeters'], 'targetInsideContours': [f['properties']['contour'] for f in geo['features'] if contains(f,target)], 'routes':routes}
        # Diagnostic consistency check at these fixed targets, not a proof of
        # accessibility for every point inside an interpolated polygon.
        for minutes in [5, 10, 15]:
            assert (minutes in row['targetInsideContours']) == (routes[0]['minutes'] <= minutes), (name, mode, minutes, row)
        output['cases'].append(row)
        (folder/(name.replace(' ','-')+'-'+mode+'.geojson')).write_text(json.dumps(geo),encoding='utf-8')
        print(json.dumps(row,ensure_ascii=True),flush=True)
(folder/'results.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS 12 production-worker contour sets and 24 directed routes; inspect named crossings separately.')
