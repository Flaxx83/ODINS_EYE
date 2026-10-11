const endpoints={police:'/api/polisen/events',air:'/api/air-quality'};
export function distanceKm(a,b){const rad=Math.PI/180;const dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));}
export async function localDataContext(message,area,base){
 const selected=[];if(/polis|händels|brott|olyck|hänt/i.test(message))selected.push('police');if(/luft|partikl|pm2|pm10|kväve|ozon/i.test(message))selected.push('air');if(!selected.length)return null;
 if(!area||!Number.isFinite(area.lat)||!Number.isFinite(area.lon))throw Error('Kartans område saknas');
 const radiusKm=50,sources=[];const result={area:{...area,radiusKm},sources};
 for(const source of selected){try{const r=await fetch(new URL(endpoints[source],base),{signal:AbortSignal.timeout(150000)});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();
 if(source==='police'){const events=data.events.filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon)&&distanceKm(area,e)<=radiusKm);result.police={total:events.length,events:events.slice(0,20),note:'Urval av publicerade preliminära notiser, inte alla utryckningar. Positionerna är ort- eller områdespunkter, inte exakta händelseplatser.'};sources.push({name:'Polisen',url:'https://polisen.se/api/events',time:data.fetchedAt});}
 else{const rows=data.series.filter(e=>distanceKm(area,e)<=radiusKm);result.air={total:rows.length,measurements:rows.slice(0,30).map(e=>({name:e.name,pollutant:e.pollutant,unit:e.unit,aggregation:e.aggregation,...e.history.at(-1),stale:Date.now()-Date.parse(e.history.at(-1).time)>21600000})),note:'Preliminära E2a-mätningar. Värde vid stationen, inte områdets allmänna luftkvalitet. Ingen riskklassning.',refreshFailed:Boolean(data.refreshFailed)};sources.push({name:'EEA luftkvalitet',url:'https://eeadmz1-downloads-webapp.azurewebsites.net/',time:data.fetchedAt});}
 }catch(e){result[source]={error:'Källan kunde inte hämtas; läget är okänt',detail:e.message};}}
 return result;
}
