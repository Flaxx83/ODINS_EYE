"""Deterministic scheduled-ferry pilot tests on installed Sweden graph; no external APIs."""
import json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
v=json.loads((ROOT/'.gev-cache/routing/active.json').read_text())['version']
config=ROOT/'.gev-cache/routing'/v/'valhalla.json'
q={'mode':'walk','ferryPolicy':'gothenburg','lat':57.705524,'lon':11.939841,'speed':6,'minutes':[5,15,30]}
start=1803120000000
c={'line':'286','journeyGid':'fixture','from':{'gid':'A1','name':'Lindholmspiren','lat':57.7055115,'lon':11.93985758},'to':{'gid':'E1','name':'Stenpiren','lat':57.70585174,'lon':11.95656916},'departure':start+5*60000,'arrival':start+11*60000,'timeQuality':'Synthetic timetable'}
def run(candidates):
 feed={'start':start,'startTime':'fixture','boardingSeconds':120,'candidates':candidates}
 r=subprocess.run([sys.executable,str(ROOT/'server/providers/reachability-query.py'),str(config),json.dumps({**q,'ferryData':feed})],capture_output=True,text=True,encoding='utf-8',check=True,timeout=30)
 return json.loads(r.stdout)
base=run([]);assert base['ferryScenarios']==[]
r=run([c]);s=r['ferryScenarios'][0];assert [b['total'] for b in s['remainingMinutes']]==[15,30],s
assert all(0 < b['remaining'] <= b['total']-11 for b in s['remainingMinutes']),s
assert s['waitSeconds']>=120 and s['crossingSeconds']==360
assert r['features'][0]['geometry'] # all time budgets retained
missed=run([{**c,'departure':start+60*1000,'arrival':start+7*60000}]);assert missed['ferryScenarios']==[]
late=run([{**c,'arrival':start+31*60000}]);assert late['ferryScenarios']==[]
delayed=run([{**c,'departure':start+10*60000,'arrival':start+16*60000}]);assert delayed['ferryScenarios'][0]['remainingMinutes'][0]['total']==30
assert delayed['ferryScenarios'][0]['remainingMinutes'][0]['remaining']<=14
assert all(f['geometry']==next(b for b in base['features'] if b['properties']['contour']==f['properties']['contour'])['geometry'] for f in missed['features'])
q.update(lat=c['to']['lat'], lon=c['to']['lon'])
reverse=run([{**c,'from':c['to'],'to':c['from']}])
assert reverse['ferryScenarios'][0]['to']['gid']=='A1'
assert reverse['ferryScenarios'][0]['remainingMinutes'][-1]['remaining']<=19
print('PASS both directions, boarding cutoff, wait/crossing budget, delayed arrival, no-trip land-only and missed-trip geometry')
