import unittest
from copy import deepcopy
from engine.mission_engine import run_mission, SimulationReceiver, validate_ack
from engine.coastal_scene import scene_fixture, network_at, height, position_at
from engine.coastal_engine import checked_decision


class CoastalSceneTests(unittest.TestCase):
    def run_scene(self, **kw):
        return run_mission({'sceneProfile':'coastal-v1', 'scenarioId':'disaster', **kw})

    def test_seed_and_input_replay(self):
        for s in ['disaster','conflict']:
            self.assertEqual(self.run_scene(scenarioId=s),self.run_scene(scenarioId=s))

    def test_normal_then_damage_persists_after_ack(self):
        for s,impact in [('disaster',5),('conflict',8)]:
            d=self.run_scene(scenarioId=s)
            for f in d['timeline']['frames']:
                if f['seconds']<impact:self.assertEqual(f['networkState']['damageAssets'],[])
                else:self.assertTrue(f['networkState']['damageAssets'])
            self.assertTrue(d['timeline']['frames'][-1]['networkState']['damageAssets'])
        f=self.run_scene()['timeline']['frames'][2]
        nodes={n['id']:n for n in f['networkState']['nodes']}
        self.assertEqual(nodes['ground-bs-01']['modelState'],'intact')
        self.assertEqual(nodes['ground-bs-01']['failureMode'],'power_loss')

    def test_no_path_uses_failed_or_deploying_node(self):
        for s in ['disaster','conflict']:
            for f in self.run_scene(scenarioId=s)['timeline']['frames']:
                nodes={n['id']:n for n in f['networkState']['nodes']}
                links={l['id']:l for l in f['networkState']['links']}
                for region in f['regions']:
                    for c in region['candidates']:
                        self.assertTrue(all(nodes[n]['operation']=='serving' for n in c['nodes']))
                        self.assertTrue(all(links[l]['qualification']=='QUALIFIED' for l in c['links']))

    def test_occluded_and_missing_parameters_never_qualified(self):
        d=self.run_scene()
        for f in d['timeline']['frames']:
            links={l['id']:l for l in f['networkState']['links']}
            self.assertEqual(links['ridge-los']['qualification'],'REJECTED')
            self.assertEqual(links['unknown-radio']['qualification'],'UNVERIFIED')
            self.assertLess(links['ridge-los']['calculation']['minTerrainClearanceM'],0)

    def test_secondary_failure_requires_arrival_and_new_route(self):
        d=self.run_scene();frames=d['timeline']['frames']
        old=frames[7]['routeId'];new=frames[10]['routeId']
        self.assertTrue(old and new);self.assertNotEqual(old,new)
        self.assertIsNone(frames[8]['routeId']);self.assertIsNone(frames[9]['routeId'])
        new_route=next(c for c in frames[10]['candidates'] if c['id']==new)
        self.assertIn('uav-spare-a',new_route['nodes']);self.assertNotIn('uav-relay-a',new_route['nodes'])
        self.assertFalse(self.run_scene(testFault='no-spare')['deliveryStatus']['confirmed'])

    def test_region_b_cannot_borrow_region_a_delivery(self):
        for s in ['disaster','conflict']:
            frame=self.run_scene(scenarioId=s)['timeline']['frames'][-1]
            a,b=frame['regions'];self.assertTrue(a['delivery']['confirmed']);self.assertFalse(b['delivery']['confirmed'])
            self.assertNotEqual(a['delivery']['messageId'],b['delivery']['messageId'])

    def test_no_egress_and_provider_faults_preserve_failure(self):
        for fault,status in [('no-egress','NO_ELIGIBLE_ROUTE'),('arci-timeout','PROVIDER_TIMEOUT'),('arci-schema','SCHEMA_REJECTED'),('arci-stale','STALE_REJECTED')]:
            d=self.run_scene(testFault=fault);self.assertFalse(d['deliveryStatus']['confirmed']);self.assertIsNone(d['recommendation']['routeId'])
            self.assertEqual(d['timeline']['frames'][-1]['decision']['status'],status)

    def test_ack_loss_and_duplicate_receiver_identity(self):
        d=self.run_scene(testFault='ack-loss');self.assertFalse(d['deliveryStatus']['confirmed']);self.assertEqual(d['deliveryStatus']['status'],'ACK_TIMEOUT')
        d=self.run_scene();delivery=d['deliveryStatus'];packet=bytes.fromhex(delivery['packetHex']);r=SimulationReceiver()
        self.assertEqual(r.receive(packet,delivery['messageId'],delivery['routeId'],1)['status'],'RECEIVED')
        self.assertEqual(r.receive(packet,delivery['messageId'],delivery['routeId'],1)['status'],'DUPLICATE_IGNORED')
        self.assertEqual(len(r.received),1)
        for key,value in [('messageId','other'),('routeId','other'),('sequence',2),('packetHash','wrong')]:
            ack=deepcopy(delivery['ack']);ack[key]=value
            self.assertFalse(validate_ack(packet,ack,delivery['messageId'],delivery['routeId']))
        self.assertTrue(all(not f['confirmed'] and not f['ack'] for f in d['timeline']['frames'][:-1]))

    def test_stale_run_snapshot_and_schema_rejected(self):
        d=self.run_scene();f=d['timeline']['frames'][-1]
        ok={'schema':'local-decision-1','runId':d['runId'],'snapshotId':f['snapshotId'],'routeId':f['routeId']}
        for key,value in [('runId','old'),('snapshotId','old'),('schema','wrong')]:
            bad={**ok,key:value};self.assertIsNone(checked_decision(bad,d['runId'],f['snapshotId'],f['candidates'])[0])

    def test_ack_reuses_receive_execution_instead_of_retransmitting(self):
        from unittest.mock import patch
        from engine.coastal_engine import deliver
        with patch('engine.coastal_engine.deliver',wraps=deliver) as transport:
            d=self.run_scene()
        receive,ack=d['timeline']['frames'][10:12]
        self.assertEqual(receive['snapshotId'],ack['snapshotId'])
        self.assertEqual(receive['regions'][0]['delivery'],ack['regions'][0]['delivery'])
        self.assertEqual(ack['delivery']['executedAtScenarioSeconds'],29)
        self.assertEqual(ack['ack']['executionId'],receive['regions'][0]['delivery']['executionId'])
        self.assertEqual(sum(c.args[1] is not None for c in transport.call_args_list),1)

    def test_deployment_counts_and_flight_clearance(self):
        baseline,_=scene_fixture('disaster');uavs=[n for n in baseline['nodes'] if n['layer']=='air'];self.assertEqual(len(uavs),5)
        for n in uavs:
            for i in range(129):
                t=i/4;p=position_at(n,t);self.assertGreaterEqual(p[1]-height(p[0],p[2]),2.99)
            self.assertEqual(position_at(n,32),n['anchorM'])
        for f in self.run_scene()['timeline']['frames']:
            self.assertEqual(sum(n['layer']=='air' for n in f['networkState']['nodes']),5)

    def test_duplicate_event_idempotent_and_backwards_pure(self):
        baseline,events=scene_fixture('disaster')
        normal=network_at(baseline,events,0)
        self.assertEqual(network_at(baseline,events,32),network_at(baseline,events+events,32))
        self.assertEqual(network_at(baseline,events,0),normal)

    def test_invalid_inputs_and_explicit_scope(self):
        for data in [{'runs':True},{'runs':19},{'seed':''},{'testFault':'fabricated'},{'controls':{'power':float('nan')}},{'dropAck':'yes'}]:
            with self.assertRaises(ValueError):self.run_scene(**data)
        d=self.run_scene();self.assertEqual(d['sceneContract']['arciProvider'],'fixture');self.assertEqual(d['sceneContract']['actuation'],'simulation')
        self.assertEqual(d['sceneContract']['arciMode'],'UNCONNECTED')


if __name__=='__main__':unittest.main()
