"""One bounded local isochrone query. Configuration is server-owned."""
import json
import sys
import math
import valhalla

config = json.loads(open(sys.argv[1], encoding='utf8').read())
config['logging']['type'] = ''
query = json.loads(sys.argv[2])
actor = valhalla.Actor(config)
mode = query.get('mode', 'walk')
if mode not in ['walk', 'bicycle', 'car', 'scooter']:
    raise ValueError('Unsupported mode')
if mode == 'car':
    costing = 'auto'
    options = {'top_speed': query['speed'], 'speed_types': []}
elif mode in ['bicycle', 'scooter']:
    costing = 'bicycle'
    options = {'bicycle_type': 'city', 'cycling_speed': query['speed']}
    if mode == 'scooter':
        options['avoid_bad_surfaces'] = 1
else:
    costing = 'pedestrian'
    options = {'walking_speed': query['speed']}
location = {'lat': query['lat'], 'lon': query['lon'], 'radius': 50, 'search_cutoff': 100}
located = actor.locate({'locations': [location], 'costing': costing, 'costing_options': {costing: options}})
edges = located[0].get('edges', [])
def distance(edge):
    lat, lon = edge['correlated_lat'], edge['correlated_lon']
    dlat = math.radians(lat-query['lat'])
    dlon = math.radians(lon-query['lon'])
    a = math.sin(dlat/2)**2+math.cos(math.radians(lat))*math.cos(math.radians(query['lat']))*math.sin(dlon/2)**2
    return 6371000*2*math.atan2(math.sqrt(a),math.sqrt(1-a))
if not edges:
    raise ValueError('No eligible edge within search cutoff')
edge = min(edges, key=distance)
meters = distance(edge)
if meters > 100:
    raise ValueError('Eligible edge beyond 100m')
result = actor.isochrone({
    'locations': [{'lat': edge['correlated_lat'], 'lon': edge['correlated_lon'], 'radius': 10, 'search_cutoff': 30}],
    'costing': costing,
    'costing_options': {costing: options},
    'contours': [{'time': minutes} for minutes in query['minutes']],
    'polygons': True,
    'denoise': 0,
})
result['networkOrigin'] = {'lat': edge['correlated_lat'], 'lon': edge['correlated_lon'], 'distanceMeters': round(meters, 1)}
print(json.dumps(result))
