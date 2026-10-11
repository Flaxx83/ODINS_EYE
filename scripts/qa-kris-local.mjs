import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {activeVmas,belongsToCounty} from '../src/layers/kris/model.js';
const actual={identifier:'fixture',status:'Actual',scope:'Public',msgType:'Alert',info:[{language:'sv-SE',event:'Testfixture',description:'Endast QA',expires:'2099-01-01T00:00:00Z',area:[{areaDesc:'Norrbotten',geocode:[{value:'2580',valueName:'Kommun'}]}]}]};
assert.equal(activeVmas({alerts:[actual]}).length,1);
for(const status of ['Test','Exercise','Draft'])assert.equal(activeVmas({alerts:[{...actual,status}]}).length,0);
assert.equal(activeVmas({alerts:[actual,{identifier:'cancel',status:'Actual',msgType:'Cancel',references:'sender,fixture,date'}]}).length,0);
assert.equal(activeVmas({alerts:[actual]},Date.parse('2100-01-01')).length,0);
assert.ok(belongsToCounty({Area:[{Name:'Norrbottens län'}]},'25'));
assert.equal(belongsToCounty({Area:[{Code:'14'}]},'25'),false);
const browser=await puppeteer.launch({headless:true});
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
  console.log(await page.evaluate(async()=>{
    const {createKrisNews,createVmaLayer}=await import('/src/layers/kris/index.js');
    const canvas=document.createElement('canvas');document.body.append(canvas);const viewer={dataSources:{add(){},remove(){}},scene:{canvas,requestRender(){}}};
    const news=createKrisNews();news.init();news.enable();await news.update();
    const newsText=document.querySelector('[aria-label="Krisinformation · Nyheter"]').innerText;
    const filterOptions=document.querySelector('[aria-label="Krisinformation · Nyheter"] select').options.length;
    news.destroy();const vma=createVmaLayer();vma.init(viewer);vma.enable(viewer);await vma.update(viewer);
    const text=document.querySelector('[aria-label="Sverige · Aktiva VMA"]').innerText;const stats=vma.getStats();vma.destroy(viewer);
    return {newsText,filterOptions,vmaText:text,stats};
  }));
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
console.log('VMA status, expiry, cancellation, county filters and UI checks passed');
