"""Optional offline native regression: synthetic barriers, no real private locations."""
import json
from pathlib import Path
import subprocess
import tempfile
import sys
import osmium
import valhalla

with tempfile.TemporaryDirectory(prefix='odins-walking-') as directory:
    root = Path(directory)
    xml = ['<osm version="0.6" generator="ODINS synthetic QA">']
    cases = ['water-gap-bridge', 'railway-no-implicit-crossing', 'motorway-foot-no', 'gate-access-no']
    node_id, way_id = 0, 0
    for index, case in enumerate(cases):
        lon = 12 + index*.05
        ids = []
        for lat, x, tags in [(57.7,lon,''),(57.7,lon+.01,''),(57.71,lon,''),(57.71,lon+.01,''),
                              (57.7,lon+.005,'<tag k="barrier" v="gate"/><tag k="access" v="no"/>')]:
            node_id += 1; ids.append(node_id)
            xml.append(f'<node id="{node_id}" lat="{lat}" lon="{x}" version="1">{tags}</node>')
        # Only the northern connection provides the legal passage.
        for refs, tags in [([ids[0],ids[2]],''),([ids[2],ids[3]],'<tag k="bridge" v="yes"/>'),([ids[3],ids[1]],'')]:
            way_id += 1
            xml.append(f'<way id="{way_id}" version="1">'+''.join(f'<nd ref="{n}"/>' for n in refs)+'<tag k="highway" v="footway"/>'+tags+'</way>')
        if case in ['motorway-foot-no','gate-access-no']:
            way_id += 1
            refs = [ids[0],ids[1]] if case=='motorway-foot-no' else [ids[0],ids[4],ids[1]]
            tags = '<tag k="highway" v="motorway"/><tag k="foot" v="no"/>' if case=='motorway-foot-no' else '<tag k="highway" v="footway"/>'
            xml.append(f'<way id="{way_id}" version="1">'+''.join(f'<nd ref="{n}"/>' for n in refs)+tags+'</way>')
        if case=='railway-no-implicit-crossing':
            # Unconnected railway nodes do not create a road crossing.
            extra=[]
            for lat in [57.695,57.715]:
                node_id+=1;extra.append(node_id)
                xml.append(f'<node id="{node_id}" lat="{lat}" lon="{lon+.005}" version="1"/>')
            way_id+=1
            xml.append(f'<way id="{way_id}" version="1"><nd ref="{extra[0]}"/><nd ref="{extra[1]}"/><tag k="railway" v="rail"/></way>')
    xml.append('</osm>')
    (root/'test.osm').write_text(''.join(xml),encoding='utf8')
    with osmium.SimpleWriter(str(root/'test.osm.pbf')) as writer:
        for obj in osmium.FileProcessor(str(root/'test.osm')): writer.add(obj)
    builder = Path(__file__).resolve().parent/'build-routing-region.py'
    build_args = [sys.executable,str(builder),str(root/'test.osm.pbf'),str(root/'graph'),'--bbox','11.5,57.0,12.5,58.4','--coverage','11.7,57.2,12.3,58.2']
    with (root/'build-output.log').open('w') as log:
        subprocess.run(build_args,stdout=log,stderr=log,check=True)
        subprocess.run(build_args+['--resume'],stdout=log,stderr=log,check=True)
    mismatched = build_args.copy(); mismatched[mismatched.index('--bbox')+1]='11.4,57.0,12.5,58.4'
    rejected = subprocess.run(mismatched+['--resume'],capture_output=True,text=True)
    assert rejected.returncode != 0, 'Resume with different bbox must be refused'
    print('PASS build/update: complete extract resume succeeds; different bbox rejected',flush=True)
    config = json.loads((root/'graph'/'valhalla.json').read_text(encoding='utf8'))
    config['logging']['type']=''
    actor=valhalla.Actor(config)
    for index,case in enumerate(cases):
        lon=12+index*.05
        result=actor.route({'locations':[{'lat':57.7,'lon':lon,'radius':20,'search_cutoff':50},{'lat':57.7,'lon':lon+.01,'radius':20,'search_cutoff':50}],
            'costing':'pedestrian','costing_options':{'pedestrian':{'walking_speed':6}}})
        length=result['trip']['summary']['length']
        assert length>2, f'{case}: forbidden shortcut used ({length} km)'
        contour=actor.isochrone({'locations':[{'lat':57.7,'lon':lon}], 'costing':'pedestrian','contours':[{'time':5}], 'polygons':True})
        assert contour['features'], f'{case}: no isochrone'
        print(f'PASS {case}: detour {length:.3f} km; contour produced',flush=True)
    worker = Path(__file__).resolve().parent.parent/'server/providers/reachability-query.py'
    valid = subprocess.run([sys.executable, str(worker), str(root/'graph'/'valhalla.json'), json.dumps({'lat':57.7,'lon':12,'speed':6,'minutes':[5]})], capture_output=True, text=True, check=True)
    assert json.loads(valid.stdout)['networkOrigin']['distanceMeters'] <= 100
    invalid = subprocess.run([sys.executable, str(worker), str(root/'graph'/'valhalla.json'), json.dumps({'lat':58.8,'lon':13.26,'speed':6,'minutes':[5]})], capture_output=True, text=True)
    assert invalid.returncode != 0, 'No-road origin must fail before isochrone output'
    print('PASS API worker: connected start succeeds; no-road start rejected',flush=True)
    activator = Path(__file__).resolve().parent/'activate-routing-region.py'
    manifest_path = root/'graph'/'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    manifest['dataTime']='2026-10-12T20:21:35Z'
    manifest_path.write_text(json.dumps(manifest),encoding='utf8')
    old = root/'old';old.mkdir()
    old_manifest = dict(manifest, dataTime='2026-10-13T20:21:35Z')
    (old/'manifest.json').write_text(json.dumps(old_manifest),encoding='utf8')
    (root/'active.json').write_text(json.dumps({'version':'old'}),encoding='utf8')
    activate_args=[sys.executable,str(activator),'graph','--directory',str(root),'--sample','57.7,12']
    rejected=subprocess.run(activate_args,capture_output=True,text=True)
    assert rejected.returncode != 0
    assert json.loads((root/'active.json').read_text())['version']=='old'
    old_manifest['dataTime']='2026-10-11T20:21:35Z'
    (old/'manifest.json').write_text(json.dumps(old_manifest),encoding='utf8')
    subprocess.run(activate_args,capture_output=True,text=True,check=True)
    subprocess.run(activate_args,capture_output=True,text=True,check=True)
    assert json.loads((root/'active.json').read_text())['version']=='graph'
    assert json.loads((root/'active.previous.json').read_text())['version']=='old'
    print('PASS activation: older data rejected, valid version selected, rollback preserved on repeat',flush=True)
