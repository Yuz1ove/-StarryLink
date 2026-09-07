import copy
import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.mission_engine import run_mission

class CinematicTimelineTests(unittest.TestCase):
    def test_event_precedes_degradation_and_failure(self):
        for kind in ('disaster','conflict'):
            s=run_mission({'scenarioId':kind});f=s['timeline']['frames'];impact=3 if kind=='conflict' else 2
            self.assertEqual([x['seconds'] for x in f[:4]],[0,4,6,8] if kind=='conflict' else [0,3,5,8])
            for frame in f[:impact]:
                self.assertEqual(frame['networkState'],s['baselineNetwork'])
                self.assertEqual(frame['failures'],[])
            self.assertTrue(f[impact]['failures'])
            self.assertTrue(any(n['status']=='failed' for n in f[impact]['networkState']['nodes']))
            self.assertEqual(f[11]['networkState'],s['networkState'])

    def test_effects_and_network_have_identical_cause_and_status(self):
        for kind in ('disaster','conflict'):
            for frame in run_mission({'scenarioId':kind})['timeline']['frames']:
                nodes={n['id']:n for n in frame['networkState']['nodes']}
                for effect in frame['failures']:
                    node=nodes[effect['nodeId']]
                    self.assertEqual(effect['status'],node['status'])
                    self.assertEqual(effect['position'],node['position'])
                    if 'failureMode' in node:self.assertEqual(effect['mode'],node['failureMode'])

    def test_hostile_targets_are_actual_failed_towers(self):
        s=run_mission({'scenarioId':'conflict'});frames=s['timeline']['frames']
        targets=set(frames[2]['hazard']['targets'])
        self.assertEqual(len(targets),3)
        self.assertEqual(targets,{f['nodeId'] for f in frames[3]['failures'] if f['mode']=='direct_impact'})
        self.assertEqual(frames[2]['hazard']['stage'],'launch')
        self.assertEqual(frames[3]['events'],['HOSTILE IMPACT DETECTED','WESTERN INFRASTRUCTURE LOSS','BACKHAUL DEGRADED'])
        self.assertEqual(frames[4]['events'],['COVERAGE HOLE DETECTED','CAPACITY REDUCED','ROUTE RECOMPUTATION REQUIRED'])
        for l in frames[3]['networkState']['links']:
            if {l['source'],l['target']}&targets:self.assertEqual(l['status'],'failed')
        self.assertLess(frames[3]['layerState']['groundCapacityKbps'],frames[0]['layerState']['groundCapacityKbps'])
        self.assertFalse(frames[4]['layerState']['airDeployed'])
        self.assertTrue(frames[5]['layerState']['airDeployed'])

    def test_early_frames_do_not_leak_winners_or_ack(self):
        for options in ({},{'dropAck':True},{'controls':{'power':0}}):
            s=run_mission(options)
            for f in s['timeline']['frames']:
                if f['phase']<5:self.assertEqual(f['candidates'],[])
                if f['phase']<7:self.assertIsNone(f['routeId'])
                if f['phase']<11:
                    self.assertFalse(f['confirmed']);self.assertIsNone(f['ack'])
                if not s['deliveryStatus']['confirmed']:self.assertNotEqual(f['routeStatus'],'LOCKED')
            self.assertEqual(s['timeline']['frames'][11]['confirmed'],s['deliveryStatus']['confirmed'])

    def test_snapshots_are_independent_and_replay_is_deterministic(self):
        a=run_mission();b=run_mission();self.assertEqual(a,b)
        before=copy.deepcopy(a['timeline']['frames'][3]);a['timeline']['frames'][2]['networkState']['nodes'][0]['status']='forged'
        self.assertEqual(before,a['timeline']['frames'][3])

if __name__=='__main__':unittest.main()
