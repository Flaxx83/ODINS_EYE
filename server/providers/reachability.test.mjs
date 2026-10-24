import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReachabilityService, validateContours, validateReachability, reachabilityPlugin, CORE } from './reachability.js';

const query = {lat:58.3897,lon:13.8457,speed:6,minutes:[5,10]};
test('bicycle profile has independent bounds and cannot be confused with walking',()=>{
 assert.equal(validateReachability({...query,mode:'bicycle',speed:18}).mode,'bicycle');
 assert.equal(validateReachability(query).mode,'walk');
 for(const change of [{mode:'walk',speed:18},{mode:'bicycle',speed:4},{mode:'bicycle',speed:36},{mode:null},{mode:'motor_scooter'}])
   assert.throws(()=>validateReachability({...query,...change}));
});
test('Vite installation returns no post-hook and unrelated routes pass through', async()=>{
 let handler;
 assert.equal(reachabilityPlugin().configureServer({middlewares:{use(fn){handler=fn;return ()=>{throw Error('Not a post-hook');};}}}),undefined);
 let next=false;await handler({url:'/unrelated'}, {},()=>next=true);assert.equal(next,true);
});
const geometry = () => ({type:'FeatureCollection', features:[5,10].map(contour=>({type:'Feature', properties:{contour}, geometry:{type:'Polygon',coordinates:[[[13.84,58.38],[13.85,58.38],[13.85,58.39],[13.84,58.38]]]}}))});
test('walking requests reject unsupported profiles, outside coverage and invalid time budgets',()=>{
 for(const change of [{lat:59},{speed:9},{speed:'6'},{minutes:[0]},{minutes:[5,5]},{minutes:[1,2,3,4]},{minutes:[1.5]},{url:'https://example.com'},{mode:'auto'}]) assert.throws(()=>validateReachability({...query,...change}));
 assert.deepEqual(validateReachability({...query,minutes:[10,5]}).minutes,[5,10]);
});
test('contours must be complete, closed and within the buffered dataset',()=>{
 assert.equal(validateContours(geometry(),query.minutes,CORE).features.length,2);
 let g=geometry();g.features.pop();assert.throws(()=>validateContours(g,query.minutes,CORE));
 g=geometry();g.features[0].geometry.coordinates[0][0][0]=12;assert.throws(()=>validateContours(g,query.minutes,CORE));
 g=geometry();g.features[0].geometry.coordinates[0].pop();assert.throws(()=>validateContours(g,query.minutes,CORE));
 g=geometry();g.features[1].properties.contour=5;assert.throws(()=>validateContours(g,query.minutes,CORE));
});
test('configured regional coverage permits other towns but never overrides profile limits',()=>{
 const regional=[10.95,57.05,14.75,59.35];
 assert.equal(validateReachability({...query,lat:57.708,lon:11.97},regional).lon,11.97);
 assert.throws(()=>validateReachability({...query,lat:60},regional));
 assert.throws(()=>validateReachability({...query,speed:20},regional));
});
test('national coverage accepts northern Sweden and the islands while retaining the geographic bound',()=>{
 const sweden=[10.5,55,24.5,69.3];
 for(const [lat,lon] of [[68.3499,18.831],[65.8355,24.1322],[57.6348,18.2948],[55.337,13.36]])
   assert.equal(validateReachability({...query,lat,lon},sweden).lat,lat);
 assert.throws(()=>validateReachability({...query,lat:70},sweden));
 assert.throws(()=>validateReachability({...query,lon:25},sweden));
});
test('local service limits concurrency, caches only successful results and keeps configuration private',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'odins-range-'));
 try {
  const folder=join(directory,'test-v1');await mkdir(folder);
  await writeFile(join(directory,'active.json'),JSON.stringify({version:'test-v1'}));
  await writeFile(join(folder,'manifest.json'),JSON.stringify({bbox:CORE,engineVersion:'test',dataTime:'2026-10-12T20:21:35Z'}));
  let calls=0, finish;
  const service=createReachabilityService({directory,run:async()=>{calls++;await new Promise(r=>finish=r);return {stdout:JSON.stringify(geometry())};}});
  const pending=service.calculate(query);
  while(!finish)await new Promise(r=>setTimeout(r,5));
  await assert.rejects(service.calculate({...query,speed:5}),e=>e.status===429);
  finish();const result=await pending;
  assert.equal(result.dataTime,'2026-10-12T20:21:35Z');assert.equal(JSON.stringify(result).includes(directory),false);
  assert.deepEqual(await service.calculate(query),result);assert.equal(calls,1);
  const broken=createReachabilityService({directory,run:async()=>{calls++;throw Error('private-path');}});
  for(let i=0;i<2;i++)await assert.rejects(broken.calculate(query),e=>e.status===502&&!e.message.includes('private-path'));
  assert.equal(calls,3);
  await writeFile(join(directory,'active.json'),JSON.stringify({version:'../../outside'}));
  await assert.rejects(service.status(),e=>e.status===503);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('cache separates modes even with the same speed and forwards the selected profile',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'odins-cycle-cache-'));
 try {
  await mkdir(join(directory,'v1'));
  await writeFile(join(directory,'active.json'),JSON.stringify({version:'v1'}));
  await writeFile(join(directory,'v1/manifest.json'),JSON.stringify({bbox:CORE,engineVersion:'test',dataTime:'2026-10-12T20:21:35Z'}));
  const modes=[];
  const service=createReachabilityService({directory,run:async(args)=>{modes.push(JSON.parse(args[2]).mode);return {stdout:JSON.stringify(geometry())};}});
  assert.equal((await service.calculate(query)).mode,'walk');
  assert.equal((await service.calculate({...query,mode:'bicycle'})).mode,'bicycle');
  await service.calculate({...query,mode:'walk'});
  await service.calculate({...query,mode:'bicycle'});
  for(const mode of ['car','scooter']) {
   await service.calculate({...query,mode,speed:20});
   await service.calculate({...query,mode,speed:20});
  }
  assert.deepEqual(modes,['walk','bicycle','car','scooter']);
 } finally { await rm(directory,{recursive:true,force:true}); }
});

test('car cap and scooter approximation have separate numeric limits',()=>{
 for(const [mode,min,max] of [['car',10,120],['scooter',5,20]]) {
  for(const speed of [min,max]) assert.equal(validateReachability({...query,mode,speed}).speed,speed);
  for(const speed of [min-1,max+1,null,'20',Infinity]) assert.throws(()=>validateReachability({...query,mode,speed}));
 }
});

test('cache separates land policy and pilot refreshes its departure time',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'odins-ferry-cache-'));
 try {
  await mkdir(join(directory,'v1'));await writeFile(join(directory,'active.json'),JSON.stringify({version:'v1'}));
  await writeFile(join(directory,'v1/manifest.json'),JSON.stringify({bbox:[10,55,25,70],coverage:[10,55,25,70]}));
  const queries=[];let feeds=0;let clock=1000;
  const service=createReachabilityService({directory,now:()=>clock++,ferries:async({start})=>{feeds++;return {start,startTime:new Date(start).toISOString(),candidates:[],boardingSeconds:120};},run:async(args)=>{queries.push(JSON.parse(args[2]));return {stdout:JSON.stringify(geometry())};}});
  await service.calculate(query);await service.calculate({...query,ferryPolicy:'exclude'});await service.calculate({...query,ferryPolicy:'exclude'});assert.equal(queries.length,2);assert.equal(queries[1].ferryPolicy,'exclude');
  const pilot={...query,lat:57.7055,lon:11.94,ferryPolicy:'gothenburg'};
  await service.calculate(pilot);await service.calculate(pilot);assert.equal(feeds,2);assert.notEqual(queries[2].ferryData.start,queries[3].ferryData.start);
  const broken=createReachabilityService({directory,ferries:async()=>{throw Error('offline');},run:async()=>{throw Error('Worker must not run without timetable');}});
  await assert.rejects(broken.calculate(pilot),/offline/);
 } finally {await rm(directory,{recursive:true,force:true});}
});
