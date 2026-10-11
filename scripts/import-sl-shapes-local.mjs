import {readFile,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {parse} from 'csv-parse/sync';
import {saveTransitShapes} from '../server/providers/transit-shapes.js';
const zip=await readFile(new URL('../../../work/sl-inspection/sl.zip',import.meta.url));
const files=unzipSync(zip,{filter:f=>['shapes.txt','trips.txt'].includes(f.name)});
const file=new URL('../.gev-cache/sl-metadata.json',import.meta.url);const meta=JSON.parse(await readFile(file,'utf8'));
for(const trip of parse(strFromU8(files['trips.txt']),{columns:true,bom:true,skip_empty_lines:true}))if(meta.trips[trip.trip_id])meta.trips[trip.trip_id].shapeId=trip.shape_id;
await saveTransitShapes('sl',files['shapes.txt']);await writeFile(file,JSON.stringify(meta));console.log('SL-färdvägar importerade från redan nedladdat arkiv.');
