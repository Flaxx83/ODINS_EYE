"""Offline native tests for bicycle access, direction and mode-specific isochrones."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import osmium
import valhalla

with tempfile.TemporaryDirectory(prefix='odins-cycle-') as directory:
    root = Path(directory)
    cases = [
        ('cycleway', {'highway':'cycleway'}),
        ('bicycle-no', {'highway':'residential','bicycle':'no'}),
        ('oneway', {'highway':'residential','oneway':'yes'}),
        ('contraflow', {'highway':'residential','oneway':'yes','oneway:bicycle':'no'}),
    ]
    xml = ['<osm version="0.6" generator="ODINS synthetic bicycle QA">']
    for index, (name, shortcut) in enumerate(cases):
        lon = 12 + index*.05
        base = index*10
        for offset, lat, x in [(1,57.7,lon),(2,57.7,lon+.01),(3,57.71,lon),(4,57.71,lon+.01)]:
            xml.append(f'<node id="{base+offset}" version="1" lat="{lat}" lon="{x}"/>')
        for offset, refs, tags in [(1,[1,3],{'highway':'residential'}),(2,[3,4],{'highway':'residential'}),
                                  (3,[4,2],{'highway':'residential'}),(4,[1,2],shortcut)]:
            xml.append(f'<way id="{base+offset}" version="1">'+''.join(f'<nd ref="{base+n}"/>' for n in refs)+''.join(f'<tag k="{k}" v="{v}"/>' for k,v in tags.items())+'</way>')
    xml.append('</osm>')
    (root/'test.osm').write_text(''.join(xml),encoding='utf8')
    with osmium.SimpleWriter(str(root/'test.osm.pbf')) as writer:
        for obj in osmium.FileProcessor(str(root/'test.osm')): writer.add(obj)
    script_root = Path(__file__).resolve().parent
    args = [sys.executable,str(script_root/'build-routing-region.py'),str(root/'test.osm.pbf'),str(root/'graph'),
            '--whole-source','--bbox','11.5,57,12.5,58.4','--coverage','11.7,57.2,12.3,58.2']
    with (root/'build.log').open('w') as log:
        subprocess.run(args,stdout=log,stderr=log,check=True)
    config_path = root/'graph'/'valhalla.json'
    config = json.loads(config_path.read_text());config['logging']['type']=''
    actor=valhalla.Actor(config)
    for index,(name,_) in enumerate(cases):
        lon=12+index*.05
        points=[{'lat':57.7,'lon':lon,'radius':10,'search_cutoff':30}, {'lat':57.7,'lon':lon+.01,'radius':10,'search_cutoff':30}]
        def distance(reverse=False, costing='bicycle'):
            return actor.route({'locations':list(reversed(points)) if reverse else points,'costing':costing,
                'costing_options':{'bicycle':{'bicycle_type':'city','cycling_speed':18}}})['trip']['summary']['length']
        forward, backward = distance(), distance(True)
        if name=='bicycle-no':
            assert forward>2 and backward>2, (name,forward,backward)
            assert distance(costing='pedestrian')<1
        elif name=='oneway':
            assert forward<1 and backward>2, (name,forward,backward)
            assert distance(True,'pedestrian')<1
        else:
            assert forward<1 and backward<1, (name,forward,backward)
        print(f'PASS {name}: bicycle forward={forward:.3f} reverse={backward:.3f} km',flush=True)
    worker=script_root.parent/'server/providers/reachability-query.py'
    for mode,speed in [('walk',6),('bicycle',18)]:
        response=subprocess.run([sys.executable,str(worker),str(config_path),json.dumps({'mode':mode,'lat':57.7,'lon':12,'speed':speed,'minutes':[5,10]})],capture_output=True,text=True,check=True)
        result=json.loads(response.stdout)
        assert len(result['features'])==2 and result['networkOrigin']['distanceMeters']<=100
        print('PASS isochrone worker '+mode,flush=True)
