import sqlite3,pickle,pathlib,math
from shapely import wkb
root=pathlib.Path(__file__).resolve().parents[3];db=sqlite3.connect(root/'work/topography/100-kommunikation.gpkg');graph={}
for blob,kind,construction in db.execute('select geom,objekttyp,under_byggnad from ralstrafik'):
 if kind!='Järnväg' or construction=='Ja':continue
 offset=8+{0:0,1:32,2:48,3:48,4:64}[(blob[3]>>1)&7];g=wkb.loads(blob[offset:])
 for line in g.geoms:
  coords=list(line.coords)
  for a,b in zip(coords,coords[1:]):
   a=(round(a[0]/5)*5,round(a[1]/5)*5);b=(round(b[0]/5)*5,round(b[1]/5)*5)
   if a==b:continue
   weight=math.dist(a,b);graph.setdefault(a,{})[b]=weight;graph.setdefault(b,{})[a]=weight
# Join small cartographic gaps; this is a calculated network, not operational track assignment.
bins={}
for n in graph:bins.setdefault((int(n[0]//15),int(n[1]//15)),[]).append(n)
for n in list(graph):
 cell=(int(n[0]//15),int(n[1]//15))
 for dx in [-1,0,1]:
  for dy in [-1,0,1]:
   for other in bins.get((cell[0]+dx,cell[1]+dy),[]):
    length=math.dist(n,other)
    if 0<length<=15:graph[n][other]=length;graph[other][n]=length
with (root/'.gev-cache/rail-network.pkl').open('wb') as f:pickle.dump(graph,f)
print(len(graph),'rail nodes')

