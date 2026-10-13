import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Offline structural analysis. Deliberately not a legal/access routing graph. */
export function analyzeOsmNetwork(payload) {
  if (!Array.isArray(payload?.elements) || payload.elements.length > 100000) throw Error('Expected a bounded OSM JSON extract.');
  const nodes = new Map(payload.elements.filter(e => e.type === 'node' && Number.isFinite(e.lat) && Number.isFinite(e.lon) && Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180).map(e => [e.id, e]));
  const ways = payload.elements.filter(e => e.type === 'way' && typeof e.tags?.highway === 'string' && Array.isArray(e.nodes) && e.tags.area !== 'yes');
  const graph = new Map(), types = Object.create(null);
  let segments = 0, missing = 0, km = 0;
  const distance = (a,b) => { const rad = Math.PI / 180; const h = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lon-a.lon)*rad/2)**2; return 12742 * Math.asin(Math.sqrt(Math.min(1,h))); };
  for (const way of ways) {
    types[way.tags.highway] = (types[way.tags.highway] || 0) + 1;
    for (let i=1; i<way.nodes.length; i++) {
      const a=way.nodes[i-1], b=way.nodes[i];
      if (!nodes.has(a) || !nodes.has(b)) { missing++; continue; }
      if (!graph.has(a)) graph.set(a,new Set()); if (!graph.has(b)) graph.set(b,new Set());
      graph.get(a).add(b); graph.get(b).add(a); segments++; km+=distance(nodes.get(a),nodes.get(b));
    }
  }
  const unseen=new Set(graph.keys()), components=[];
  while (unseen.size) {
    const todo=[unseen.values().next().value]; unseen.delete(todo[0]); let count=0;
    while (todo.length) { const id=todo.pop(); count++; for (const next of graph.get(id)) if (unseen.delete(next)) todo.push(next); }
    components.push(count);
  }
  components.sort((a,b)=>b-a);
  return { highwayWays: ways.length, highwayTypes: types, graphNodes: graph.size, segmentOccurrences: segments, missingNodeReferences: missing, totalSegmentKm: +km.toFixed(3), undirectedComponents: components.length, largestComponentNodes: components[0] || 0, largestComponentFraction: graph.size ? +(components[0]/graph.size).toFixed(3) : 0, onewayExplicitWays: ways.filter(w=>w.tags.oneway).length, roundabouts: ways.filter(w=>w.tags.junction==='roundabout').length, waysWithNumericMaxspeed: ways.filter(w=>/^\d+$/.test(w.tags.maxspeed || '')).length, maxspeedValues: [...new Set(ways.map(w=>w.tags.maxspeed).filter(Boolean))].sort(), waysWithFootTags: ways.filter(w=>w.tags.foot).length, waysWithBicycleTags: ways.filter(w=>w.tags.bicycle).length, waysWithSurface: ways.filter(w=>w.tags.surface).length, restrictionRelations: payload.elements.filter(e=>e.type==='relation' && e.tags?.type==='restriction').length, limitations: 'Undirected structural graph only. Access, barriers, direction and turn restrictions are counted or left unmodeled. Full ways may extend outside the source bbox. Not a reachability result.' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, ,input, output] = process.argv;
  if (!input) throw Error('Usage: node scripts/nvdb-routing-study.mjs INPUT_OSM_JSON [OUTPUT_SUMMARY_JSON]');
  const raw=readFileSync(input); if (raw.length > 15000000) throw Error('Extract exceeds 15 MB.');
  const summary=analyzeOsmNetwork(JSON.parse(raw.toString('utf8')));
  if (output) writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
  else console.log(JSON.stringify(summary,null,2));
}
