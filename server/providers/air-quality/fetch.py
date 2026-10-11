import json,pathlib,urllib.request,io,datetime,concurrent.futures,re,pyarrow.parquet as pq,pyarrow.compute as pc,pyarrow as pa
root=pathlib.Path(__file__).resolve().parents[3];cache=root/'.gev-cache/air-quality.json';now=datetime.datetime.now(datetime.timezone.utc);start=now-datetime.timedelta(days=3)
def get(url,body=None):
 req=urllib.request.Request(url,data=json.dumps(body).encode() if body else None,headers={'Content-Type':'application/json'})
 return urllib.request.urlopen(req,timeout=45).read()
meta=json.loads((pathlib.Path(__file__).parent/'stations.json').read_text(encoding='utf8'))
request={'countries':['SE'],'cities':[],'pollutants':['http://dd.eionet.europa.eu/vocabulary/aq/pollutant/'+str(n) for n in [5,6001,8,7]],'dataset':1,'dateTimeStart':start.isoformat(),'dateTimeEnd':now.isoformat()}
urls=get('https://eeadmz1-downloads-api-appservice.azurewebsites.net/ParquetFile/urls',request).decode().splitlines()[1:]
def read(url):
 if not url.startswith('https://eeadmz1batchservice02.blob.core.windows.net/airquality-p/SE/'):return None
 t=pq.read_table(io.BytesIO(get(url)),columns=['Samplingpoint','Pollutant','End','Value','Unit','AggType','Validity'])
 mask=pc.and_(pc.greater_equal(t['End'],pa.scalar(start.replace(tzinfo=None))),pc.equal(t['Validity'],1));t=t.filter(mask)
 rows=[r for r in t.to_pylist() if r['Value'] is not None and r['End']<=now.replace(tzinfo=None)]
 if not rows:return None
 rows.sort(key=lambda r:r['End']);last=rows[-1];stationId=re.sub(r'^SE/SPO-|_\d+_\d+$','',last['Samplingpoint']);station=meta.get(stationId)
 if not station:return {'unmatched':stationId}
 return {**station,'id':last['Samplingpoint'],'pollutant':last['Pollutant'],'unit':last['Unit'],'aggregation':last['AggType'],'history':[{'time':r['End'].isoformat()+'Z','value':float(r['Value'])} for r in rows]}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:rows=list(pool.map(read,urls))
result={'fetchedAt':now.isoformat(),'series':[r for r in rows if r and 'history' in r],'unmatched':len([r for r in rows if r and 'unmatched' in r])}
cache.parent.mkdir(exist_ok=True);temp=cache.with_suffix('.tmp');temp.write_text(json.dumps(result),encoding='utf8');temp.replace(cache);print(len(result['series']))

