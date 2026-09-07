import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapters.mission_scenarios import PROFILES
from domain.models import EmergencyMessage
from engine.mission_engine import run_mission, validate_ack, SimulationReceiver


class MissionV2Tests(unittest.TestCase):
    def test_default_scenarios_have_reproducible_distinct_networks(self):
        a = run_mission({'scenarioId': 'disaster'})
        b = run_mission({'scenarioId': 'conflict'})
        self.assertEqual(a, run_mission({'scenarioId': 'disaster'}))
        self.assertEqual(b, run_mission({'scenarioId': 'conflict'}))
        self.assertNotEqual(a['inputHash'], b['inputHash'])
        self.assertNotEqual({l['id'] for l in a['networkState']['links']}, {l['id'] for l in b['networkState']['links']})
        self.assertGreaterEqual(len(a['candidates']), 4)
        self.assertGreaterEqual(len(b['candidates']), 4)

    def test_scores_use_all_seven_metrics_with_bounded_normalization(self):
        for kind in PROFILES:
            self.assertAlmostEqual(sum(PROFILES[kind].values()), 1)
            state = run_mission({'scenarioId': kind})
            for r in state['candidates']:
                self.assertEqual(set(r['metrics']), set(PROFILES[kind]))
                self.assertAlmostEqual(sum(r['weightedContributions'].values()), r['finalScore'], places=5)
                self.assertTrue(0 <= r['finalScore'] <= 100)
                for k, n in r['normalizedMetrics'].items():
                    self.assertTrue(0 <= n <= 1)
                    expected = 1-n if k in ('latency','energy','risk') else n
                    self.assertAlmostEqual(r['utilities'][k], expected)
                    self.assertAlmostEqual(r['weightedContributions'][k], expected*PROFILES[kind][k]*100, places=5)

    def test_candidate_topology_excludes_failed_assets(self):
        for kind in PROFILES:
            s = run_mission({'scenarioId':kind})
            failed_nodes={n['id'] for n in s['networkState']['nodes'] if n['status']=='failed'}
            failed_links={l['id'] for l in s['networkState']['links'] if l['status']=='failed'}
            for route in s['candidates']:
                self.assertFalse(failed_nodes.intersection(route['nodes']))
                self.assertFalse(failed_links.intersection(route['links']))
                self.assertEqual(route['nodes'][0], 'citizen-01')
                self.assertEqual(route['nodes'][-1], 'emergency-center')
                self.assertEqual(len(route['nodes']), len(set(route['nodes'])))

    def test_best_failure_recomputes_fallback_and_bound_evidence(self):
        for kind in PROFILES:
            before=run_mission({'scenarioId':kind})
            failed=before['recommendation']['routeId']
            after=run_mission({'scenarioId':kind,'excludedRouteIds':[failed]})
            self.assertEqual(after['recommendation']['routeId'],before['recommendation']['fallbackRouteId'])
            self.assertNotEqual(before['inputHash'],after['inputHash'])
            self.assertFalse(next(r for r in after['candidates'] if r['id']==failed)['eligible'])
            self.assertEqual(after['deliveryStatus']['routeId'],after['recommendation']['routeId'])

    def test_no_eligible_route_never_executes(self):
        before=run_mission()
        cases=[{'controls':{'power':0}}, {'excludedRouteIds':[r['id'] for r in before['candidates']]}]
        for case in cases:
            state=run_mission(case)
            self.assertIsNone(state['recommendation']['routeId'])
            self.assertEqual(state['recommendation']['status'],'BLOCKED_NO_ELIGIBLE_ROUTE')
            self.assertFalse(state['deliveryStatus']['confirmed'])
            self.assertEqual(state['deliveryStatus']['hopTrace'],[])
            self.assertIsNone(state['deliveryStatus']['ack'])

    def test_missing_ack_preserves_queue_and_no_confirmation(self):
        for kind in PROFILES:
            d=run_mission({'scenarioId':kind,'dropAck':True})['deliveryStatus']
            self.assertEqual(d['status'],'ACK_TIMEOUT')
            self.assertFalse(d['confirmed'])
            self.assertIsNone(d['ack'])
            self.assertEqual(d['queue'],1)
            self.assertEqual(d['dedupe'],'NOT_RUN')

    def test_packet_and_ack_identity_corruption_rejected(self):
        d=run_mission()['deliveryStatus'];packet=bytes.fromhex(d['packetHex'])
        self.assertTrue(validate_ack(packet,d['ack'],d['messageId'],d['routeId']))
        for field,bad in [('messageId','other'),('routeId','other'),('sequence',2),('packetHash','0'*64),('received',False)]:
            ack=copy.deepcopy(d['ack']);ack[field]=bad
            self.assertFalse(validate_ack(packet,ack,d['messageId'],d['routeId']))
        self.assertFalse(validate_ack(packet[:-1]+bytes([packet[-1]^1]),d['ack'],d['messageId'],d['routeId']))
        self.assertFalse(validate_ack(b'',d['ack'],d['messageId'],d['routeId']))

    def test_runtime_is_bounded_and_binary_length_is_actual(self):
        for kind in PROFILES:
            d=run_mission({'scenarioId':kind})['deliveryStatus']
            self.assertEqual(len(bytes.fromhex(d['packetHex'])),d['packetBytes'])
            self.assertEqual(d['packetBytes'],53)
            self.assertLessEqual(d['retry'],3)
            self.assertTrue(all(h['attempt']<=4 for h in d['hopTrace']))
            if d['confirmed']:
                self.assertEqual(d['queue'],0)
                self.assertEqual(d['dedupe'],'DUPLICATE_IGNORED')

    def test_receiver_rejects_corrupt_duplicate_and_identity_conflict(self):
        receiver = SimulationReceiver()
        message = EmergencyMessage('receiver-case','other',1788660000000,24.18,121.31,5,900)
        packet = message.serialize()
        first = receiver.receive(packet, message.id, 'route-1', 1)
        self.assertEqual(first['status'], 'RECEIVED')
        self.assertEqual(receiver.receive(packet, message.id, 'route-1', 1)['status'], 'DUPLICATE_IGNORED')
        self.assertEqual(receiver.receive(packet, 'wrong-message', 'route-1', 1)['status'], 'IDENTITY_MISMATCH')
        corrupt = packet[:-1] + bytes([packet[-1] ^ 1])
        self.assertEqual(receiver.receive(corrupt, message.id, 'route-1', 1)['status'], 'INVALID_PACKET')
        other = EmergencyMessage('receiver-case','other',1788660000000,24.18,121.31,4,900).serialize()
        self.assertEqual(receiver.receive(other, message.id, 'route-1', 1)['status'], 'IDENTITY_CONFLICT')
        self.assertEqual(len(receiver.received), 1)

    def test_invalid_or_nonfinite_input_is_rejected(self):
        cases=[[],{'scenarioId':'live'}, {'runs':0},{'runs':True},{'runs':1.5},{'seed':''},{'controls':{'power':float('nan')}},{'controls':{'power':-1}},{'controls':{'satellite':0}},{'controls':{'unrecognized':1}}, {'excludedRouteIds':['invented']},{'dropAck':'false'}]
        for case in cases:
            with self.subTest(case=case):
                with self.assertRaises(ValueError):run_mission(case)

    def test_arci_and_external_sources_do_not_self_admit(self):
        s=run_mission()
        self.assertEqual(s['mode'],'simulation')
        self.assertEqual(s['provenance']['liveSource'],'unavailable')
        self.assertIsNone(s['arciProjection']['confidence'])
        self.assertEqual(s['arciProjection']['integrationStatus'],'ARCI_UNCONNECTED_PENDING_QUALIFICATION')

if __name__ == '__main__': unittest.main()
