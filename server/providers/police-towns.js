import towns from './sweden-towns.json' with {type:'json'};
const key=s=>s.normalize('NFC').trim().toLocaleLowerCase('sv');
const county=s=>key(s).replace(/\s+län$/,'').replace(/s$/,'');
const index=new Map();
for(const town of towns){const k=key(town.name);const group=index.get(k)||[];group.push(town);index.set(k,group);}
export function locatePoliceTown(event){
  const place=event.title.split(',').at(-1)?.trim()||'';
  const matches=(index.get(key(place))||[]).filter(t=>county(t.county)===county(event.area));
  if(matches.length!==1)return {...event,positionKind:'police-area',place:event.area};
  const town=matches[0];return {...event,originalLat:event.lat,originalLon:event.lon,lat:town.lat,lon:town.lon,place:town.name,positionKind:'approximate-town',geonamesId:town.id};
}
