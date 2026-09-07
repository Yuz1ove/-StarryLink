import unittest
from math import cos, radians, hypot
from collections import defaultdict
from engine.mission_engine import run_mission
from adapters.mission_scenarios import load_mission


def reachable(network, source, target, remove_layers=()):
    nodes={n['id']:n for n in network['nodes'] if n['status']!='failed' and n['layer'] not in remove_layers}
    adj=defaultdict(list)
    for l in network['links']:
        if l['status']=='failed' or l['source'] not in nodes or l['target'] not in nodes:continue
        adj[l['source']].append(l['target']);adj[l['target']].append(l['source'])
    seen=set();todo=[source]
    while todo:
        n=todo.pop()
        if n==target:return True
        if n in seen:continue
        seen.add(n);todo.extend(adj[n])
    return False

class CausalityTests(unittest.TestCase):
    def test_all_air_links_are_local_and_orbit_requires_terminals(self):
        for kind in ('disaster','conflict'):
            net=load_mission(kind)['network'];nodes={n['id']:n for n in net['nodes']}
            for l in net['links']:
                a,b=nodes[l['source']],nodes[l['target']]
                if 'air' in (a['layer'],b['layer']):
                    self.assertNotIn('space',(a['layer'],b['layer']))
                    self.assertEqual(a['region'],b['region'])
                    p,q=a['position'],b['position'];km=111*hypot(p['lat']-q['lat'],(p['lng']-q['lng'])*cos(radians(p['lat'])))
                    self.assertLess(km,15,'No long-distance UAV backbone')
                if 'space' in (a['layer'],b['layer']):
                    other=b if a['layer']=='space' else a
                    self.assertEqual(other['type'],'satellite_gateway')
                    self.assertEqual(other['layer'],'ground')
    def test_partition_requires_orbit_and_local_mesh(self):
        for kind in ('disaster','conflict'):
            s=run_mission({'scenarioId':kind})
            self.assertTrue(reachable(s['baselineNetwork'],'citizen-01','emergency-center',('air','space')))
            self.assertFalse(reachable(s['networkState'],'citizen-01','emergency-center',('space',)))
            self.assertFalse(reachable(s['networkState'],'citizen-01','emergency-center',('air',)))
            self.assertTrue(reachable(s['networkState'],'citizen-01','emergency-center'))
            for r in s['candidates']:
                self.assertIn('leo-sat-01',r['nodes'])
                self.assertGreaterEqual(sum(h['layer']=='air' for h in r['hops']),2)
    def test_three_independent_city_meshes_have_real_edges(self):
        s=run_mission({'scenarioId':'conflict'});net=s['networkState']
        regions={n['region'] for n in net['nodes'] if n['layer']=='air'}
        self.assertEqual(regions,{'taichung','tainan','kaohsiung'})
        for region in regions:
            fleet=[n for n in net['nodes'] if n['layer']=='air' and n['region']==region]
            self.assertTrue(4<=len(fleet)<=8)
            ids={n['id'] for n in fleet}
            edges=[l for l in net['links'] if l['source'] in ids and l['target'] in ids]
            self.assertGreaterEqual(len(edges),len(fleet)-1)
            user='citizen-01' if region=='taichung' else region+'-users'
            self.assertTrue(reachable(net,user,'emergency-center'))
    def test_cross_mountain_paths_lost_after_quake(self):
        s=run_mission();links=[l for l in s['networkState']['links'] if l.get('terrainCrossing')]
        self.assertGreaterEqual(len(links),3)
        self.assertTrue(all(l['status']=='failed' for l in links))
    def test_disabled_fleet_or_satellite_cannot_execute(self):
        for kind in ('disaster','conflict'):
            for controls in ({'uav':False},{'satellite':False},{'power':0}):
                s=run_mission({'scenarioId':kind,'controls':controls})
                self.assertIsNone(s['recommendation']['routeId'])
                self.assertFalse(s['deliveryStatus']['confirmed'])
