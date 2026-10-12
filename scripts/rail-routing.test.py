"""Routing safety fixtures on small source graphs, without network or real cache."""
import importlib.util
import pathlib
import unittest
import copy
import math

FILE=pathlib.Path(__file__).resolve().parents[1]/'server/providers/rail-routing/route.py'
spec=importlib.util.spec_from_file_location('rail_route',FILE)
rail=importlib.util.module_from_spec(spec)
spec.loader.exec_module(rail)


def graph(*edges):
    result={}
    for a,b in edges:
        w=math.dist(a,b)
        result.setdefault(a,{})[b]=w
        result.setdefault(b,{})[a]=w
    return result


class RailRoutingTests(unittest.TestCase):
    def test_snap_to_edge_interior_with_no_near_vertex(self):
        source=graph(((0,0),(3000,0)))
        before=copy.deepcopy(source)
        router=rail.RailRouter(source)
        for _ in range(2):
            r=router.route([(1000,5),(2000,5)])
            self.assertEqual(r['status'],'ok')
            self.assertEqual(r['coordinates'],[[1000,0],[2000,0]])
            self.assertAlmostEqual(r['distanceMeters'],1000)
            self.assertEqual([s['distanceMeters'] for s in r['snaps']],[5,5])
        self.assertEqual(source,before,'Snapping must never rewrite the imported graph')

    def test_parallel_candidate_can_resolve_a_nearby_unroutable_branch(self):
        source=graph(((0,0),(1000,0)),((0,10),(5000,10)))
        r=rail.RailRouter(source).route([(100,1),(4000,10)])
        self.assertEqual(r['status'],'ok')
        self.assertEqual(r['coordinates'][0],[100,10])
        self.assertEqual(r['snaps'][0]['distanceMeters'],9)
        self.assertAlmostEqual(r['distanceMeters'],3900)

    def test_equal_xy_at_crossing_does_not_create_a_track_connection(self):
        source=graph(((0,0),(3000,0)),((1500,-2000),(1500,2000)))
        r=rail.RailRouter(source).route([(0,0),(1500,0),(1500,2000)])
        self.assertEqual(r['reason'],'disconnected_network')
        self.assertEqual(r['coordinates'],[])

    def test_off_network_station_is_not_pulled_in_from_beyond_500_meters(self):
        r=rail.RailRouter(graph(((0,0),(3000,0)))).route([(1000,501),(2000,0)])
        self.assertEqual(r['reason'],'station_off_network')
        self.assertEqual(r['stationIndex'],0)

    def test_long_detour_is_rejected_even_when_the_graph_is_connected(self):
        source=graph(((0,0),(0,5000)),((0,5000),(3000,5000)),((3000,5000),(3000,0)))
        r=rail.RailRouter(source).route([(0,0),(3000,0)])
        self.assertEqual(r['reason'],'detour_rejected')
        self.assertEqual(r['limitMeters'],9900)

    def test_unverified_long_retracing_is_not_painted_as_a_train_path(self):
        source=graph(((0,0),(3000,0)),((3000,0),(6000,0)))
        r=rail.RailRouter(source).route([(0,0),(6000,0),(3000,0)])
        self.assertEqual(r['reason'],'repeated_track')
        self.assertEqual(r['coordinates'],[])

    def test_invalid_points_and_empty_graph_are_explicit(self):
        router=rail.RailRouter(graph(((0,0),(3000,0))))
        for points in [None,[],[None,(1,2)],[(float('nan'),0),(1,2)],[(True,0),(1,2)],[(0,0)]*65]:
            self.assertEqual(router.route(points)['reason'],'invalid_points')
        with self.assertRaises(ValueError):
            rail.RailRouter({})


if __name__=='__main__':
    unittest.main()
