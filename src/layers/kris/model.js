export const COUNTIES = [
  ['01','Stockholm',18.07,59.33],['03','Uppsala',17.64,59.86],['04','Södermanland',16.99,58.75],['05','Östergötland',15.62,58.41],['06','Jönköping',14.16,57.78],['07','Kronoberg',14.81,56.88],['08','Kalmar',16.36,56.66],['09','Gotland',18.29,57.64],['10','Blekinge',15.59,56.16],['12','Skåne',13.4,55.9],['13','Halland',12.86,56.67],['14','Västra Götaland',13.0,58.3],['17','Värmland',13.51,59.38],['18','Örebro',15.21,59.27],['19','Västmanland',16.54,59.61],['20','Dalarna',15.63,60.61],['21','Gävleborg',17.14,60.67],['22','Västernorrland',17.94,62.63],['23','Jämtland',14.64,63.18],['24','Västerbotten',20.26,63.83],['25','Norrbotten',22.16,65.58],
];
export function activeVmas(feed, now=Date.now()) {
  if(!Array.isArray(feed?.alerts))throw new Error('Oväntat VMA-format');
  const superseded=new Set();
  for(const a of feed.alerts)if(a.status==='Actual'&&['Update','Cancel'].includes(a.msgType))for(const ref of (a.references || '').split(/\s+/))if(ref.split(',')[1])superseded.add(ref.split(',')[1]);
  return feed.alerts.flatMap(a=>{
    if(a.status!=='Actual'||a.scope!=='Public'||!['Alert','Update'].includes(a.msgType)||superseded.has(a.identifier))return [];
    const info=a.info?.find(i=>i.language?.toLowerCase().startsWith('sv'))||a.info?.[0];
    if(!info||!Number.isFinite(Date.parse(info.expires))||Date.parse(info.expires)<=now)return [];
    return [{id:a.identifier,title:info.event,text:info.description,instruction:info.instruction,sent:a.sent,expires:info.expires,web:info.web,areas:info.area || []}];
  });
}
export function belongsToCounty(item, code){
  if(!code)return true;
  const areas=item.Area||item.area||[];
  if(!areas.length)return true;
  const county=COUNTIES.find(c=>c[0]===code)?.[1]?.toLowerCase();
  return areas.some(a=>{
    const name=String(a.Name ?? a.name ?? a.Description ?? a.description ?? '').toLowerCase();
    if(name.includes('hela landet')||name==='sverige'||(county&&name.includes(county)))return true;
    const v=String(a.Code ?? a.code ?? a.Id ?? a.id ?? a.Value ?? a.value ?? '');
    if(/^\d{1,4}$/.test(v))return v==='00'||v==='0'||v.padStart(2,'0').slice(0,2)===code;
    // Untagged/unknown areas remain visible rather than disappearing silently.
    return !name;
  });
}
