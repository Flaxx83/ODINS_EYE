"""One bounded local walking isochrone query. Configuration is server-owned."""
import json
import sys
import valhalla

config = json.loads(open(sys.argv[1], encoding='utf8').read())
config['logging']['type'] = ''
query = json.loads(sys.argv[2])
actor = valhalla.Actor(config)
result = actor.isochrone({
    'locations': [{'lat': query['lat'], 'lon': query['lon']}],
    'costing': 'pedestrian',
    'costing_options': {'pedestrian': {'walking_speed': query['speed']}},
    'contours': [{'time': minutes} for minutes in query['minutes']],
    'polygons': True,
    'denoise': 0,
})
print(json.dumps(result))
