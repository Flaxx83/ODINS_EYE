import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({headless:true});
try {
  const page=await browser.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const {createSmhiObservations,createSmhiForecast,createSmhiRadar}=await import('/src/layers/smhi/weather.js');
    const canvas=document.createElement('canvas');document.body.append(canvas);let ds;
    const lat=58.39*Math.PI/180,lon=13.87*Math.PI/180;
    const n=6378137/Math.sqrt(1-0.00669437999*Math.sin(lat)**2);
    const pos={x:n*Math.cos(lat)*Math.cos(lon),y:n*Math.cos(lat)*Math.sin(lon),z:n*(1-0.00669437999)*Math.sin(lat)};
    const viewer={dataSources:{add(x){ds=x},remove(){}},scene:{canvas,globe:{ellipsoid:undefined},pick(){return {id:ds.entities.values[0]}},requestRender(){}},camera:{pickEllipsoid(){return pos}},imageryLayers:{addImageryProvider(p){return {provider:p}},remove(){}}};
    const observations=createSmhiObservations();observations.init(viewer);observations.enable(viewer);await observations.update(viewer);
    for(const type of ['pointerdown','pointerup'])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,clientX:1,clientY:1,pointerId:1,pointerType:'mouse'}));
    const observationShown=document.body.innerText.includes('Kvalitetskod');const stationCount=observations.getStats().count;observations.destroy(viewer);
    const forecast=createSmhiForecast();forecast.init(viewer);forecast.enable(viewer);
    [...document.querySelectorAll('button')].find(b=>b.textContent==='Prognos för kartans mitt').click();
    for(let i=0;i<100&&!document.querySelector('[aria-label="SMHI · Platsprognos"] table');i++)await new Promise(r=>setTimeout(r,100));
    const forecastRows=document.querySelectorAll('[aria-label="SMHI · Platsprognos"] tr').length;forecast.destroy();
    const radar=createSmhiRadar();radar.init(viewer);radar.enable(viewer);const radarOk=await radar.update(viewer);const radarError=radar.getStats().error;radar.destroy(viewer);
    return {stationCount,observationShown,forecastRows,radarOk,radarError};
  });
  console.log(result,errors);
  assert.ok(result.stationCount>0);assert.ok(result.observationShown);assert.ok(result.forecastRows>1);assert.ok(result.radarOk);assert.deepEqual(errors,[]);
} finally {await browser.close();}
