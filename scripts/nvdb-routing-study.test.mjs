import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOsmNetwork } from './nvdb-routing-study.mjs';
const point=(id,lat,lon)=>({type:'node',id,lat,lon});
const way=(id,nodes,tags)=>({type:'way',id,nodes,tags:{highway:'residential',...tags}});
test('crossing geometry never connects without a shared OSM node ID',()=>{
  const result=analyzeOsmNetwork({elements:[point(1,58,13),point(2,58,13.01),point(3,57.995,13.005),point(4,58.005,13.005),way(10,[1,2],{oneway:'yes',maxspeed:'40'}),way(11,[3,4],{bridge:'yes',layer:'1'}),{type:'relation',id:12,tags:{type:'restriction'}}]});
  assert.equal(result.undirectedComponents,2); assert.equal(result.graphNodes,4); assert.equal(result.onewayExplicitWays,1); assert.equal(result.restrictionRelations,1); assert.equal(result.waysWithNumericMaxspeed,1); assert.match(result.limitations,/Not a reachability/);
});
test('shared node connectivity, missing references and area exclusion are explicit',()=>{
  const result=analyzeOsmNetwork({elements:[point(1,58,13),point(2,58,13.01),point(3,58.01,13.01),way(10,[1,2],{}),way(11,[2,3,99],{highway:'footway',foot:'yes',bicycle:'no'}),way(12,[1,3],{area:'yes'})]});
  assert.equal(result.undirectedComponents,1);assert.equal(result.highwayWays,2);assert.equal(result.missingNodeReferences,1);assert.equal(result.largestComponentFraction,1);assert.equal(result.waysWithFootTags,1);assert.equal(result.waysWithBicycleTags,1);
  assert.equal(analyzeOsmNetwork({elements:[]}).largestComponentFraction,0);
  assert.throws(()=>analyzeOsmNetwork({elements:null}));
});
