"""One bounded local isochrone query. Configuration is server-owned."""
import json
import sys
import math
import valhalla

config = json.loads(open(sys.argv[1], encoding='utf8').read())
config['logging']['type'] = ''
query = json.loads(sys.argv[2])
policy = query.get('ferryPolicy', 'network')
if policy not in ['network', 'exclude', 'gothenburg'] or (policy != 'network' and query.get('mode', 'walk') != 'walk'):
    raise ValueError('Unsupported ferry policy')
config['service_limits']['allow_hard_exclusions'] = True
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
if policy != 'network':
    options['exclude_ferries'] = True
search_filter = {'exclude_ferry': True} if policy != 'network' else {}
location = {'search_filter': search_filter, 'lat': query['lat'], 'lon': query['lon'], 'radius': 50, 'search_cutoff': 100}
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
    'locations': [{'search_filter': search_filter, 'lat': edge['correlated_lat'], 'lon': edge['correlated_lon'], 'radius': 10, 'search_cutoff': 30}],
    'costing': costing,
    'costing_options': {costing: options},
    'contours': [{'time': minutes} for minutes in query['minutes']],
    'polygons': True,
    'denoise': 0,
})
result['networkOrigin'] = {'lat': edge['correlated_lat'], 'lon': edge['correlated_lon'], 'distanceMeters': round(meters, 1)}
if policy == 'gothenburg':
    feed = query['ferryData']
    start = feed['start'] / 1000
    origin = {'lat': edge['correlated_lat'], 'lon': edge['correlated_lon'], 'radius': 10, 'search_cutoff': 30, 'search_filter': search_filter}
    def quay_location(point):
        location = {**point, 'radius': 10, 'search_cutoff': 30, 'search_filter': search_filter}
        found = actor.locate({'locations': [location], 'costing': costing, 'costing_options': {costing: options}})[0].get('edges', [])
        def gap(edge):
            lat_delta = math.radians(edge['correlated_lat'] - point['lat'])
            lon_delta = math.radians(edge['correlated_lon'] - point['lon'])
            a = math.sin(lat_delta/2)**2 + math.cos(math.radians(point['lat'])) * math.cos(math.radians(edge['correlated_lat'])) * math.sin(lon_delta/2)**2
            return 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        if not found:
            raise ValueError('No land connection at ferry quay')
        nearest = min(found, key=gap)
        meters = gap(nearest)
        if meters > 30:
            raise ValueError('Ferry quay too far from land network')
        return {**location, 'lat': nearest['correlated_lat'], 'lon': nearest['correlated_lon']}, meters / (query['speed']/3.6)
    access = {}
    best = {}
    for candidate in feed['candidates']:
        quay = candidate['from']
        if quay['gid'] not in access:
            try:
                quay_point, connector = quay_location(quay)
                route = actor.route({'locations': [origin, quay_point], 'costing': costing, 'costing_options': {costing: options}})['trip']
                if route['summary']['has_ferry']:
                    raise ValueError('Unexpected ferry in access route')
                access[quay['gid']] = route['summary']['time'] + connector + meters / (query['speed']/3.6)
            except RuntimeError as error:
                if 'No path' not in str(error) and 'No suitable edges' not in str(error):
                    raise
                access[quay['gid']] = None
        walking = access[quay['gid']]
        if walking is None or start + walking + feed['boardingSeconds'] > candidate['departure'] / 1000:
            continue
        key = candidate['to']['gid']
        if key not in best or candidate['arrival'] < best[key]['arrival']:
            best[key] = {**candidate, 'walkingSeconds': walking}
    result['ferryScenarios'] = []
    for candidate in best.values():
        target, connector = quay_location(candidate['to'])
        elapsed = candidate['arrival'] / 1000 - start + connector
        budgets = [(t, (t * 60 - elapsed) / 60) for t in query['minutes'] if t * 60 - elapsed >= 60]
        if not budgets:
            continue
        # Round DOWN to whole minutes: never give back spent seconds. The UI states this.
        remaining = sorted(set(math.floor(r) for _, r in budgets))
        onward = actor.isochrone({'locations': [target], 'costing': costing, 'costing_options': {costing: options}, 'contours': [{'time': r} for r in remaining], 'polygons': True, 'denoise': 0})
        for total, rem in budgets:
            extra = next(f for f in onward['features'] if f['properties']['contour'] == math.floor(rem))
            base = next(f for f in result['features'] if f['properties']['contour'] == total)
            def polygons(geometry):
                return [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
            base['geometry'] = {'type': 'MultiPolygon', 'coordinates': polygons(base['geometry']) + polygons(extra['geometry'])}
        result['ferryScenarios'].append({**candidate, 'waitSeconds': candidate['departure'] / 1000 - start - candidate['walkingSeconds'], 'crossingSeconds': (candidate['arrival'] - candidate['departure']) / 1000, 'remainingMinutes': [{'total': t, 'remaining': math.floor(r)} for t, r in budgets]})
print(json.dumps(result))
