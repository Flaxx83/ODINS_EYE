const cache=new Map();
async function load(key,url,ttl){let e=cache.get(key);if(!e||Date.now()-e.at>ttl){e={at:Date.now(),promise:(async()=>{const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Provider unavailable');const raw=await r.text();if(raw.length>4000000)throw new Error('Response too large');return JSON.parse(raw);})()};cache.set(key,e);e.promise.catch(()=>cache.delete(key));}return e.promise;}
export function krisPlugin(){return {name:'local-krisinformation',configureServer(server){server.middlewares.use('/api/kris',async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  const reply=(code,p)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(p));};
  if(req.method!=='GET')return reply(405,{error:'GET required'});
  try{
    if(route==='/vma'){const p=await load('vma','https://vmaapi.sr.se/api/v3/alerts',60000);if(!Array.isArray(p.alerts))throw new Error('Invalid VMA feed');return reply(200,{...p,fetchedAt:new Date().toISOString()});}
    if(route==='/news'){const results=await Promise.allSettled(['news','notices'].map(name=>load(name,`https://api.krisinformation.se/v3/${name}?format=json&allcounties=true&days=30`,300000)));
      const data={},errors=[];results.forEach((r,i)=>{const name=['news','notices'][i];if(r.status==='fulfilled'&&Array.isArray(r.value))data[name]=r.value;else errors.push(name);});
      if(errors.length===2)throw new Error('News unavailable');return reply(200,{...data,errors,fetchedAt:new Date().toISOString()});}
    reply(404,{error:'Unknown route'});
  }catch{reply(502,{error:'Källan kunde inte kontrolleras. Aktuellt läge är okänt. Kontrollera Krisinformation.se eller Sveriges Radio.'});}
});}};}
