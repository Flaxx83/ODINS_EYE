import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),cache=new URL('../../.gev-cache/air-quality.json',import.meta.url);
export function airQualityPlugin(){let pending;const install=server=>{server.middlewares.use('/api/air-quality',async(req,res)=>{try{
 let data;try{data=JSON.parse(await readFile(cache,'utf8'));}catch{}
 if(!data||Date.now()-Date.parse(data.fetchedAt)>3600000){if(!pending)pending=run(process.env.GEV_PYTHON||'C:/Users/disco/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[fileURLToPath(new URL('./air-quality/fetch.py',import.meta.url))],{timeout:180000,windowsHide:true}).finally(()=>pending=null);try{await pending;data=JSON.parse(await readFile(cache,'utf8'));}catch(e){if(!data)throw e;data={...data,refreshFailed:true};}}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
 }catch{res.statusCode=502;res.end(JSON.stringify({error:'Luftkvalitetsdata kunde inte hämtas'}));}});};return{name:'eea-air-quality',configureServer:install,configurePreviewServer:install};}
