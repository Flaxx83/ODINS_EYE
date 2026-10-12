"""Calculated rail paths on source edges; never invent connections across gaps."""
import argparse
import heapq
import json
import math
import pathlib
import pickle
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree
from pyproj import Transformer

SNAP_RADIUS = 500
CANDIDATE_SLACK = 50
CANDIDATE_LIMIT = 8
SNAP_PENALTY = 10


def missing(reason, **details):
    return {"status": "missing", "reason": reason, "coordinates": [], **details}


class RailRouter:
    def __init__(self, graph):
        if not isinstance(graph, dict) or not graph:
            raise ValueError("graph_invalid")
        self.nodes = list(graph)
        ids = {p: i for i, p in enumerate(self.nodes)}
        self.adj = {ids[a]: {} for a in graph}
        for a, neighbours in graph.items():
            if len(a) != 2 or not all(math.isfinite(v) for v in a):
                raise ValueError("graph_invalid")
            for b, weight in neighbours.items():
                if b not in ids or not math.isfinite(weight) or weight <= 0 or abs(weight-math.dist(a,b)) > 0.01:
                    raise ValueError("graph_invalid")
                if graph.get(b, {}).get(a) != weight:
                    raise ValueError("graph_invalid")
                self.adj[ids[a]][ids[b]] = weight
        self.edges = [(a,b,w) for a in self.adj for b,w in self.adj[a].items() if a < b]
        if not self.edges:
            raise ValueError("graph_invalid")
        self.lines = [LineString([self.nodes[a],self.nodes[b]]) for a,b,_ in self.edges]
        self.tree = STRtree(self.lines)
        self.components = {}
        for n in self.adj:
            if n in self.components:
                continue
            cid = n
            queue = [n]
            self.components[n] = cid
            while queue:
                x = queue.pop()
                for y in self.adj[x]:
                    if y not in self.components:
                        self.components[y] = cid
                        queue.append(y)

    def candidates(self, xy):
        p = Point(xy)
        indices = self.tree.query(p.buffer(SNAP_RADIUS))
        rows = []
        for index in indices:
            index = int(index)
            line = self.lines[index]
            distance = p.distance(line)
            if distance <= SNAP_RADIUS:
                fraction = line.project(p, normalized=True)
                position = tuple(line.interpolate(fraction, normalized=True).coords[0])
                rows.append((distance,index,fraction,position))
        rows.sort(key=lambda x: (x[0],x[1]))
        if not rows:
            return []
        result = []
        seen = set()
        for row in rows:
            distance,edge,fraction,_ = row
            if distance > rows[0][0]+CANDIDATE_SLACK:
                break
            a,b,_ = self.edges[edge]
            identity = ('node',a) if fraction<=1e-9 else ('node',b) if fraction>=1-1e-9 else ('edge',edge,round(fraction,9))
            if identity not in seen:
                seen.add(identity)
                result.append(row)
            if len(result)==CANDIDATE_LIMIT:
                break
        return result

    def route(self, points):
        if not isinstance(points,(list,tuple)) or len(points) < 2 or len(points) > 64 or any(not isinstance(p,(list,tuple)) or len(p)!=2 or not all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) for v in p) for p in points):
            return missing("invalid_points")
        candidates = [self.candidates(p) for p in points]
        for i, rows in enumerate(candidates):
            if not rows:
                return missing("station_off_network", stationIndex=i, snapRadiusMeters=SNAP_RADIUS)
        # Preserve the previous nearest-vertex option within the unchanged 500 m bound.
        fallback=[]
        for point in points:
            n=min(range(len(self.nodes)),key=lambda n:math.dist(point,self.nodes[n]))
            d=math.dist(point,self.nodes[n])
            fallback.append((n,d) if d<=SNAP_RADIUS else None)
        # Split only the original edge. Equal XY on separate crossing edges must not join them.
        nodes = list(self.nodes)
        adj = {n: dict(neighbours) for n,neighbours in self.adj.items()}
        splits = {}
        for rows in candidates:
            for _, edge, fraction, position in rows:
                if 1e-9 < fraction < 1-1e-9:
                    splits.setdefault(edge,{})[round(fraction,9)] = position
        virtual = {}
        components = dict(self.components)
        for edge, fractions in splits.items():
            a,b,w = self.edges[edge]
            adj[a].pop(b)
            adj[b].pop(a)
            sequence = [(0,a)]
            for fraction,position in sorted(fractions.items()):
                n = len(nodes)
                nodes.append(position)
                adj[n] = {}
                components[n] = self.components[a]
                virtual[edge,fraction] = n
                sequence.append((fraction,n))
            sequence.append((1,b))
            for (fa,na),(fb,nb) in zip(sequence,sequence[1:]):
                weight = (fb-fa)*w
                adj[na][nb] = weight
                adj[nb][na] = weight
        layers=[]
        for station,rows in enumerate(candidates):
            layer={}
            for distance,edge,fraction,_ in rows:
                a,b,_ = self.edges[edge]
                node = a if fraction<=1e-9 else b if fraction>=1-1e-9 else virtual[edge,round(fraction,9)]
                layer[node]=min(distance,layer.get(node,float('inf')))
            if fallback[station] is not None:
                n,d=fallback[station]
                layer[n]=min(d,layer.get(n,float('inf')))
            layers.append(layer)
        states={n:(distance*SNAP_PENALTY,[],[n],[],[distance]) for n,distance in layers[0].items()}
        for index,(origin,destination) in enumerate(zip(points,points[1:])):
            limit = math.dist(origin,destination)*2.3+3000
            next_states={}
            for start,(score,path,chosen,lengths,snaps) in states.items():
                costs,parents = bounded_paths(adj,start,set(layers[index+1]),limit)
                for end,snap in layers[index+1].items():
                    if end not in costs:
                        continue
                    total = score+costs[end]+snap*SNAP_PENALTY
                    if end in next_states and next_states[end][0] <= total:
                        continue
                    segment=[end]
                    while segment[-1]!=start:
                        segment.append(parents[segment[-1]])
                    segment.reverse()
                    next_states[end]=(total,path+segment[bool(path):],chosen+[end],lengths+[costs[end]],snaps+[snap])
            if not next_states:
                connected=any(components[a]==components[b] for a in states for b in layers[index+1])
                return missing("detour_rejected" if connected else "disconnected_network", segmentIndex=index, limitMeters=round(limit,1), snapRadiusMeters=SNAP_RADIUS)
            states=next_states
        _,path,chosen,lengths,snaps=min(states.values(),key=lambda s:s[0])
        seen_edges=set()
        repeated=0
        for a,b in zip(path,path[1:]):
            edge=tuple(sorted((a,b)))
            if edge in seen_edges:
                repeated+=math.dist(nodes[a],nodes[b])
            seen_edges.add(edge)
        if repeated > max(500,sum(lengths)*0.005):
            return missing('repeated_track', repeatedMeters=round(repeated,1), distanceMeters=round(sum(lengths),1))
        coordinates=[list(nodes[n]) for n in path]
        if len(coordinates)<2 or sum(lengths)<0.01:
            return missing("zero_length")
        return {"status":"ok","coordinates":coordinates,"distanceMeters":round(sum(lengths),1),"snapRadiusMeters":SNAP_RADIUS,"candidateSlackMeters":CANDIDATE_SLACK,"snaps":[{"distanceMeters":round(d,1),"position":list(nodes[n])} for n,d in zip(chosen,snaps)],"segments":[{"distanceMeters":round(d,1),"limitMeters":round(math.dist(a,b)*2.3+3000,1)} for d,a,b in zip(lengths,points,points[1:])]}


def bounded_paths(adj,start,targets,limit):
    heap=[(0,start)]
    cost={start:0}
    parent={}
    found={}
    while heap:
        distance,n=heapq.heappop(heap)
        if distance!=cost[n]:
            continue
        if distance>limit:
            break
        if n in targets:
            found[n]=distance
            if len(found)==len(targets):
                break
        for b,w in adj[n].items():
            new=distance+w
            if new<=limit and new<cost.get(b,float('inf')):
                cost[b]=new
                parent[b]=n
                heapq.heappush(heap,(new,b))
    return found,parent


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('points')
    parser.add_argument('--graph',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[3]/'.gev-cache/rail-network.pkl')
    args=parser.parse_args()
    try:
        points=json.loads(args.points)
        if not isinstance(points,list) or not 2<=len(points)<=64 or any(not isinstance(p,list) or len(p)!=2 or any(not isinstance(v,(int,float)) or isinstance(v,bool) or not math.isfinite(v) for v in p) or abs(p[0])>180 or abs(p[1])>90 for p in points):
            result=missing('invalid_points')
        else:
            to=Transformer.from_crs(4326,3006,always_xy=True)
            back=Transformer.from_crs(3006,4326,always_xy=True)
            projected=[to.transform(*p) for p in points]
            with args.graph.open('rb') as source:
                router=RailRouter(pickle.load(source))
            result=router.route(projected)
            if result['status']=='ok':
                result['coordinates']=[list(back.transform(*p)) for p in result['coordinates']]
                for snap in result['snaps']:
                    snap['position']=list(back.transform(*snap['position']))
    except (FileNotFoundError,OSError):
        result=missing('graph_unavailable')
    except (ValueError,TypeError,KeyError,AttributeError,EOFError,pickle.UnpicklingError):
        result=missing('graph_invalid')
    print(json.dumps(result,allow_nan=False))


if __name__=='__main__':
    main()
