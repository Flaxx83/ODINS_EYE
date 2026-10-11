import {token} from './vasttrafik.js';
import {resolveVasttrafikGeometry} from './trip-geometry.js';
import {vasttrafikMapTrips} from './trip-map.js';
const cache=new Map();
const distance=(a,b)=>Math.hypot((a[0]-b[0])*Math.cos(a[1]*Math.PI/180),a[1]-b[1]);
async function get(path){const r=await fetch('https://ext-api.vasttrafik.se/pr/v4/'+path,{headers:{Authorization:'Bearer '+await token()},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Geometri ej tillgänglig');return r.json();}
async function stop(name,point,train=false){const q=name.replace(/\s*\(([^)]+) kn\)/,', $1');const data=await get('locations/by-text?'+new URLSearchParams({q,types:'stoparea',limit:'15'}));const rows=data.results.filter(s=>s.gid&&s.locationType==='stoparea'&&distance(point,[s.longitude,s.latitude])<0.002);const preferred=rows.filter(s=>train?/tåg/i.test(s.name):!/tåg/i.test(s.name));return preferred.length===1?preferred[0]:null;}
export async function resolveNationalVasttrafik(trips,mapped){for(const [i,trip]of trips.entries()){for(const [j,leg]of (trip.LegList?.Leg||[]).entries()){
 const target=mapped[i]?.legs[j];if(!target||target.from!==leg.Origin?.name||!target.approximate||!leg.Product?.some(p=>/Västtrafik/i.test(p.operatorInfo?.name||'')))continue;
 const key=[leg.Origin.extId,leg.Destination.extId,leg.Origin.date,leg.Origin.time,leg.Product[0].num].join(':');
 try{let geometry=cache.get(key);if(!geometry){const [o,d]=await Promise.all([stop(leg.Origin.name,target.coordinates[0],/tåg/i.test(leg.Product[0].name)),stop(leg.Destination.name,target.coordinates.at(-1),/tåg/i.test(leg.Product[0].name))]);if(!o||!d)continue;
 const dateTime=leg.Origin.date+'T'+leg.Origin.time;const result=await get('journeys?'+new URLSearchParams({originGid:o.gid,destinationGid:d.gid,dateTime:dateTime+new Intl.DateTimeFormat('en',{timeZone:'Europe/Stockholm',timeZoneName:'longOffset'}).formatToParts(new Date(leg.Origin.date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value.replace('GMT',''),limit:'5'}));const candidates=[];
 for(const journey of result.results||[]){const matching=(journey.tripLegs||[]).filter(l=>String(l.serviceJourney?.line?.designation)===String(leg.Product[0].num)&&l.plannedDepartureTime?.slice(0,19)===dateTime&&distance(target.coordinates[0],[l.origin?.stopPoint?.longitude,l.origin?.stopPoint?.latitude])<0.002&&distance(target.coordinates.at(-1),[l.destination?.stopPoint?.longitude,l.destination?.stopPoint?.latitude])<0.002);if(matching.length===1)candidates.push({journey,leg:matching[0]});}
 const unique=new Map(candidates.map(c=>[c.leg.serviceJourney?.gid,c]));if(unique.size!==1)continue;const native=[...unique.values()][0];const nativeMap=await resolveVasttrafikGeometry([native.journey],vasttrafikMapTrips([native.journey]));geometry=nativeMap[0].legs.find(l=>l.from===native.leg.origin.stopPoint.name&&l.to===native.leg.destination.stopPoint.name&&!l.approximate);if(!geometry)continue;cache.set(key,geometry);if(cache.size>100)cache.delete(cache.keys().next().value);}
 target.coordinates=geometry.coordinates;target.approximate=false;target.geometrySource='Västtrafik tur, matchad linje, tid och hållplatser';}catch{}
 }}return mapped;}


