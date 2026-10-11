import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const b=await puppeteer.launch({headless:true});
try{const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
const result=await p.evaluate(async()=>{
  const {createStopsLayer}=await import('/src/layers/sl/stops.js');const {createSlLayer}=await import('/src/layers/sl/index.js');
  const canvas=document.createElement('canvas');document.body.append(canvas);let ds;const lat=59.32*Math.PI/180,lon=18.07*Math.PI/180,n=6378137/Math.sqrt(1-0.00669437999*Math.sin(lat)**2);const pos={x:n*Math.cos(lat)*Math.cos(lon),y:n*Math.cos(lat)*Math.sin(lon),z:n*(1-0.00669437999)*Math.sin(lat)};
  const v={dataSources:{add(x){ds=x},remove(){}},scene:{canvas,globe:{ellipsoid:undefined},requestRender(){}},camera:{pickEllipsoid(){return pos},flyTo(){},moveEnd:{addEventListener(){},removeEventListener(){}}}};
  const l=createStopsLayer();l.init(v);l.enable(v);await l.update();const stops=l.getStats().count;
  const input=document.querySelector('[aria-label="Sök hållplats"]');input.value='Slussen';input.dispatchEvent(new Event('input'));
  const button=[...document.querySelectorAll('[aria-label="Sverige · Hållplatser"] button')].find(x=>x.textContent==='Slussen T-bana');button.click();
  for(let i=0;i<100&&!document.querySelector('[aria-label="Sverige · Hållplatser"] table');i++)await new Promise(r=>setTimeout(r,100));
  const departures=document.querySelectorAll('[aria-label="Sverige · Hållplatser"] tr').length;l.destroy(v);
  const region=createSlLayer({id:'qa-region',name:'QA Region',operator:'otraf',regions:[['otraf','Östgötatrafiken'],['ul','UL']]});region.init(v);region.enable(v);await region.update(v);const vehicles=region.getStats().count;const select=document.querySelector('[aria-label="QA Region"] select');select.value='ul';select.dispatchEvent(new Event('change'));
  for(let i=0;i<100&&!region.getStats().count;i++)await new Promise(r=>setTimeout(r,100));const ul=region.getStats().count;region.destroy(v);return {stops,departures,vehicles,ul};
});console.log(result,errors);assert.ok(result.stops>0);assert.ok(result.departures>1);assert.ok(result.vehicles>0);assert.ok(result.ul>0);assert.deepEqual(errors,[]);
}finally{await b.close();}

