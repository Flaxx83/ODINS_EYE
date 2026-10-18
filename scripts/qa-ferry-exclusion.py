"""Verify strict pedestrian ferry exclusion on an isolated fixture and Göteborg.
Requires local pyvalhalla/osmium and the active Sweden graph. Does not modify production config.
"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import osmium
import valhalla

ROOT=Path(__file__).resolve().parents[1]
REPORT={'cases':[]}

def actor_for(path, enabled=True):
    config=json.loads(path.read_text(encoding='utf-8'))
    config['logging']['type']=''
    config['service_limits']['allow_hard_exclusions']=enabled
    return valhalla.Actor(config)

def location(lat,lon,exclude=True):
    return {'lat':lat,'lon':lon,'radius':10,'search_cutoff':30, 'search_filter':{'exclude_ferry':exclude}}

def query(points, options):
    return {'locations':points,'costing':'pedestrian','costing_options':{'pedestrian':{'walking_speed':6,**options}}}

def inside(point, geo):
    def ring_contains(ring):
        x,y=point
        hit=False
        for a,b in zip(ring,ring[1:]):
            if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
        return hit
    return any(ring_contains(poly[0]) and not any(ring_contains(hole) for hole in poly[1:]) for f in geo['features'] for poly in ([f['geometry']['coordinates']] if f['geometry']['type']=='Polygon' else f['geometry']['coordinates']))

def contour(actor, points, options, minutes=30):
    return actor.isochrone({**query(points[:1],options),'contours':[{'time':minutes}],'polygons':True,'denoise':0})

with tempfile.TemporaryDirectory(prefix='odins-ferry-') as directory:
    root=Path(directory)
    # Two disconnected shore roads, joined ONLY by a ferry. No land alternative.
    coords=[(1,57.7,12.0),(2,57.7,12.003),(3,57.7,12.02),(4,57.7,12.023)]
    xml=['<osm version="0.6" generator="ODINS ferry exclusion QA">']
    for n,lat,lon in coords:xml.append(f'<node id="{n}" version="1" lat="{lat}" lon="{lon}"/>')
    for n,refs,tags in [(1,[1,2],{'highway':'residential'}),(2,[2,3],{'route':'ferry','foot':'yes','duration':'00:05'}),(3,[3,4],{'highway':'residential'})]:
        xml.append(f'<way id="{n}" version="1">'+''.join(f'<nd ref="{r}"/>' for r in refs)+''.join(f'<tag k="{k}" v="{v}"/>' for k,v in tags.items())+'</way>')
    (root/'test.osm').write_text(''.join(xml)+'</osm>',encoding='utf-8')
    with osmium.SimpleWriter(str(root/'test.osm.pbf')) as w:
        for obj in osmium.FileProcessor(str(root/'test.osm')):w.add(obj)
    with (root/'build.log').open('w') as log:
        built=subprocess.run([sys.executable,str(ROOT/'scripts/build-routing-region.py'),str(root/'test.osm.pbf'),str(root/'graph'),'--whole-source','--bbox','11.5,57,12.5,58.4','--coverage','11.7,57.2,12.3,58.2'],stdout=log,stderr=log,timeout=120)
    assert built.returncode==0,(root/'build.log').read_text(encoding='utf-8')
    path=root/'graph/valhalla.json'
    actor=actor_for(path)
    # Permit the small synthetic components during correlation.
    points=[{**location(57.7,12.001),'minimum_reachability':1},{**location(57.7,12.022),'minimum_reachability':1}]
    for label,options in [('default',{}),('preference',{'use_ferry':0}),('strict',{'exclude_ferries':True})]:
        try:
            r=actor.route(query(points,options))
            route_ferry=r['trip']['summary']['has_ferry']
            assert label!='strict','Strict exclusion still found a cross-island route'
            assert route_ferry
            route_status='ferry'
        except RuntimeError as e:
            assert label=='strict',str(e)
            assert 'No path' in str(e) or '442' in str(e),str(e)
            route_status='no_path'
        geo=contour(actor,points,options)
        reached=inside((12.022,57.7),geo)
        assert reached==(label!='strict'),(label,reached)
        REPORT['cases'].append({'fixture':'islands','option':label,'route':route_status,'oppositeShoreIn30min':reached})
    # Starting on a ferry is a documented exception to the costing exclusion.
    # The location filter must prevent that endpoint from being correlated.
    ferry_midpoint={**location(57.7,12.0115,False),'minimum_reachability':1}
    found=actor.locate(query([ferry_midpoint],{}))[0].get('edges',[])
    assert found, 'Fixture must correlate unfiltered midpoint to ferry'
    ferry_midpoint['search_filter']['exclude_ferry']=True
    filtered=actor.locate(query([ferry_midpoint],{'exclude_ferries':True}))[0].get('edges',[])
    assert not filtered, 'Ferry-only midpoint should have no eligible land edge within 30m'
    REPORT['ferryMidpoint']={'unfilteredEdges':len(found),'filteredEdges':len(filtered)}
    # Record installed-version behavior rather than assume a config gate works.
    disabled=actor_for(path,False)
    try:
        result=disabled.route(query(points,{'exclude_ferries':True}))
        REPORT['disabledHardExclusions']={'hasFerry':result['trip']['summary']['has_ferry'],'warnings':result.get('warnings')}
    except RuntimeError as e:
        REPORT['disabledHardExclusions']={'error':str(e)}

version=json.loads((ROOT/'.gev-cache/routing/active.json').read_text())['version']
actor=actor_for(ROOT/'.gev-cache/routing'/version/'valhalla.json')
points=[location(57.705524,11.939841),location(57.705947,11.957514)]
for reverse in [False,True]:
    pair=points[::-1] if reverse else points
    for label,options in [('default',{}),('strict',{'exclude_ferries':True})]:
        route=actor.route(query(pair,options))['trip']
        edges=actor.trace_attributes({'encoded_polyline':route['legs'][0]['shape'],'shape_match':'edge_walk','costing':'pedestrian'})['edges']
        ferries=[e['way_id'] for e in edges if e['use']=='ferry']
        assert bool(ferries)==(label=='default'),(reverse,label,ferries)
        target=(pair[1]['lon'],pair[1]['lat'])
        geo=contour(actor,pair,options,15)
        reached=inside(target,geo)
        assert reached==(label=='default'),(reverse,label,reached)
        REPORT['cases'].append({'fixture':'Gothenburg','reverse':reverse,'option':label,'km':route['summary']['length'],'minutes':round(route['summary']['time']/60,2),'ferryWayIds':ferries,'targetIn15min':reached})
REPORT['graphVersion']=version
out=ROOT/'work/ferry-exclusion-results.json'
out.write_text(json.dumps(REPORT,indent=2),encoding='utf-8')
print(json.dumps(REPORT,indent=2))
print('PASS strict ferry exclusion: isolated island fixture, route and isochrone, both Gothenburg directions')
