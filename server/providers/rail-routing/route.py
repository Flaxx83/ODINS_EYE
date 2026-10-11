import pathlib,pickle,sys,json,heapq,math
from pyproj import Transformer
root=pathlib.Path(__file__).resolve().parents[3];graph=pickle.load(open(root/'.gev-cache/rail-network.pkl','rb'));to=Transformer.from_crs(4326,3006,always_xy=True);back=Transformer.from_crs(3006,4326,always_xy=True)
points=json.loads(sys.argv[1]);nodes=[]
for p in points:
 xy=to.transform(*p);n=min(graph,key=lambda n:math.dist(n,xy))
 if math.dist(n,xy)>500:print('null');sys.exit()
 if not nodes or nodes[-1]!=n:nodes.append(n)
path=[]
for start,end in zip(nodes,nodes[1:]):
 heap=[(0,start)];cost={start:0};parent={}
 while heap:
  distance,n=heapq.heappop(heap)
  if n==end:break
  if distance>cost[n]:continue
  for b,w in graph[n].items():
   new=distance+w
   if new<cost.get(b,float('inf')):cost[b]=new;parent[b]=n;heapq.heappush(heap,(new,b))
 if end not in cost or cost[end]>math.dist(start,end)*2.3+3000:print('null');sys.exit()
 segment=[end]
 while segment[-1]!=start:segment.append(parent[segment[-1]])
 path.extend(reversed(segment))
print(json.dumps([back.transform(*p) for p in path]))
