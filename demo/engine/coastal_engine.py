"""Local causal scene projection, reusing graph search, scoring and SLV1 transport."""
from copy import deepcopy
import math
from adapters.mission_scenarios import PROFILES
from domain.models import EmergencyMessage
from engine.coastal_scene import layout, scene_fixture, network_at
from engine.candidate_generator import generate_candidates
from engine.simulation_engine import simulate_candidates
from engine.mission_engine import digest, evaluate_routes, deliver, DELIVERY_FLOOR, LIMITS

VERSION='coastal-mission-1.1'
TIMES=[0,3,5,8,10,14,17,20,23,26,29,32]
STAGES=['NORMAL','WARNING','IMPACT','DAMAGE','OBSERVE','DEPLOY','EVALUATE','DECIDE','REPLAN','WAIT','RECEIVE','ACK']
FAULTS=('none','no-egress','no-spare','ack-loss','arci-timeout','arci-schema','arci-stale')


def checked_decision(response, run_id, snapshot_id, candidates):
    if not isinstance(response,dict) or response.get('schema')!='local-decision-1':
        return None,'SCHEMA_REJECTED'
    if response.get('runId')!=run_id or response.get('snapshotId')!=snapshot_id:
        return None,'STALE_REJECTED'
    id=response.get('routeId')
    route=next((c for c in candidates if c['id']==id and c['eligible']),None)
    if not route:return None,'NO_ELIGIBLE_ROUTE'
    return route,'VALIDATED_SIMULATION_PROPOSAL'


def run_coastal(body):
    allowed={'sceneProfile','scenarioId','seed','runs','controls','excludedRouteIds','dropAck','testFault'}
    if set(body)-allowed:raise ValueError('Unknown coastal input')
    scenario=body.get('scenarioId','disaster')
    if scenario not in ('disaster','conflict'):raise ValueError('Unknown scenarioId')
    seed=body.get('seed','STARRYLINK_COASTAL_01')
    if not isinstance(seed,str) or not 1<=len(seed)<=128:raise ValueError('Invalid seed')
    runs=body.get('runs',240)
    if isinstance(runs,bool) or not isinstance(runs,int) or not 20<=runs<=2000:raise ValueError('Invalid runs')
    fault=body.get('testFault','none')
    if fault not in FAULTS:raise ValueError('Unknown testFault')
    drop=body.get('dropAck',False)
    if not isinstance(drop,bool):raise ValueError('dropAck must be boolean')
    controls=body.get('controls',{})
    if not isinstance(controls,dict) or set(controls)-{'power','uav','satellite','demandMultiplier','packetLoss'}:raise ValueError('Invalid controls')
    for k,v in controls.items():
        if k in ('uav','satellite'):
            if not isinstance(v,bool):raise ValueError('Invalid boolean control')
        elif isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=100:raise ValueError('Invalid numeric control')
    excluded=body.get('excludedRouteIds',[])
    if not isinstance(excluded,list) or len(excluded)>24 or any(not isinstance(v,str) for v in excluded):raise ValueError('Invalid exclusions')
    baseline,events=scene_fixture(scenario)
    input_hash=digest({'body':body,'seed':seed,'runs':runs,'engine':VERSION,'layout':layout(),'baseline':baseline,'events':events})
    run_id='coast-'+input_hash[:20]
    fixture={'weights':PROFILES[scenario],'uncertainty':.12 if scenario=='disaster' else .22}
    frames=[]
    executions={}
    for phase,seconds in enumerate(TIMES):
        network=network_at(baseline,events,seconds,fault,controls)
        # Clock progression alone is not a new world-state version. RECEIVE and
        # ACK share the same network snapshot and the same execution receipt.
        snapshot_id=digest({'network':network,'run':run_id})
        region_results=[]
        for region,source in [('A','citizen-01'),('B','users-b')]:
            raw=generate_candidates(network,source,'emergency-center')
            for c in raw:c['id']='route-'+digest(c['links'])[:10]
            sim=simulate_candidates(raw,network,seed,runs)
            candidates=evaluate_routes(raw,sim,network,fixture,excluded)
            proposal=next((c for c in candidates if c['eligible']),None)
            envelope={'schema':'local-decision-1','runId':run_id,'snapshotId':snapshot_id,'routeId':proposal['id'] if proposal else None}
            if fault=='arci-schema':envelope={'text':'simulated malformed proposal'}
            if fault=='arci-stale':envelope['runId']='previous-run'
            route,status=checked_decision(envelope,run_id,snapshot_id,candidates)
            if fault=='arci-timeout':route,status=None,'PROVIDER_TIMEOUT'
            # Decisions before the incident are background service only. New SOS
            # transmission is admitted after deployment and current-snapshot policy.
            if phase not in (0,7,8,9,10,11):route=None
            message=EmergencyMessage(id=f'{run_id}:{region}:sos-1',category='trapped',timestamp=1788758400000,
                                     lat=0,lng=0,priority=5,ttl=900,accuracy=0)
            execution_key=(region,snapshot_id,route['id'] if route else None)
            cached=executions.get(execution_key) if phase>=10 else None
            delivery=deepcopy(cached) if cached is not None else deliver(message,route if phase>=10 else None,network,seed,drop or fault=='ack-loss')
            delivery.update(runId=run_id,scenarioId=scenario,decisionId=f'{run_id}:{snapshot_id[:12]}:{region}',
                            coordinateSource='packet coordinates 0,0 are fictional placeholders, not user location')
            if cached is None:
                delivery.update(executionId='exec-'+digest(execution_key)[:18] if phase>=10 and route else None,
                                executionSnapshotId=snapshot_id if phase>=10 and route else None,
                                executedAtScenarioSeconds=seconds if phase>=10 and route else None)
            if delivery['ack']:
                delivery['ack'].update(runId=run_id,scenarioId=scenario,receiverNodeId='emergency-center',
                                       executionId=delivery['executionId'],decisionId=delivery['decisionId'],
                                       executionSnapshotId=delivery['executionSnapshotId'])
            if phase>=10 and cached is None:executions[execution_key]=deepcopy(delivery)
            # Receiver evidence may exist at RECEIVE; the public receipt appears at ACK.
            region_results.append({'region':region,'sourceNodeId':source,'candidates':candidates,'routeId':route['id'] if route else None,
                                   'decisionStatus':status,'delivery':delivery,
                                   'service':'critical-messages-only' if route else 'waiting-for-connection',
                                   'source':'simulation; not coverage or population estimate'})
        result=region_results[0]
        route=result['routeId'] if phase>=7 else None
        confirmed=phase==11 and result['delivery']['confirmed']
        occurred=[e for e in events if e['seconds']<=seconds]
        frames.append({'phase':phase,'seconds':seconds,'nextSeconds':TIMES[min(phase+1,11)],'stage':STAGES[phase],
                       'snapshotId':snapshot_id,'runId':run_id,'scenarioId':scenario,'networkState':network,
                       'candidates':result['candidates'],'routeId':route,'confirmed':confirmed,
                       'ack':deepcopy(result['delivery']['ack']) if confirmed else None,
                       'routeStatus':'LOCKED' if confirmed else result['delivery']['status'] if phase==11 else 'SELECTED' if route else 'WAITING',
                       'failures':[{'nodeId':n['id'],'status':n['status'],'reason':n.get('failureMode'), 'causeEventId':n.get('causeEventId')} for n in network['nodes'] if n['status']=='failed'],
                       'events':deepcopy(occurred),'regions':region_results,
                       'decision':{'id':result['delivery']['decisionId'],'provider':'fixture','mode':'unconnected','actuation':'simulation',
                                   'inputSnapshotId':snapshot_id,'runId':run_id,'status':result['decisionStatus'],
                                   'faultInjection':fault if fault.startswith('arci-') else None},
                       'delivery':deepcopy(result['delivery']) if phase==11 else {'confirmed':False,'ack':None,'messageId':result['delivery']['messageId'],'status':'RECEIVER_VALIDATED' if phase==10 and result['delivery']['confirmed'] else 'QUEUED'},
                       'model':'local-coastal-causality-1'})
    last=frames[-1];a=last['regions'][0];routes=a['candidates'];eligible=[c for c in routes if c['eligible']]
    state={'contractVersion':'2.0','engineVersion':VERSION,'scenarioId':scenario,'sceneProfile':'coastal-v1',
           'scenarioType':'natural-disaster' if scenario=='disaster' else 'fictional-infrastructure-disruption',
           'title':'震後山谷 · 接回求救訊息' if scenario=='disaster' else '海岸設施受損 · 分區接續',
           'description':'虛構星灣局部通訊演練；所有位置、事件與參數為示意。',
           'timestamp':'2026-09-07T08:00:00Z','mode':'simulation','source':'versioned fixture + Python engine',
           'seed':seed,'runs':runs,'runId':run_id,'inputHash':input_hash,'testFault':fault,
           'sceneContract':{'version':'coastal-scene-1','layout':deepcopy(layout()),'events':events,
                            'coordinateFrame':'local simulation metres; X east, Y up, Z south; not WGS84',
                            'terrain':'analytic fictional heightfield; no DEM','displayScale':[.02,.025,.02],
                            'heightExaggeration':1.25,'uavModelScale':3,'clock':'narrative seconds; not measured latency',
                            'topologyModel':'sampled geometric LOS + configured range; no diffraction/reflection/Fresnel/ITU qualification',
                            'arciProvider':'fixture','arciMode':'UNCONNECTED','actuation':'simulation'},
           'timeline':{'version':'coastal-timeline-1','durationSeconds':32,'source':'deterministic simulation snapshots','frames':frames},
           'baselineNetwork':frames[0]['networkState'],'networkState':last['networkState'],'candidates':routes,
           'recommendation':{'routeId':a['routeId'],'fallbackRouteId':next((c['id'] for c in eligible if c['id']!=a['routeId']),None),
                             'status':a['decisionStatus'],'reason':'目前快照的資格检查與模擬效用排序','deliveryFloor':DELIVERY_FLOOR},
           'deliveryStatus':a['delivery'],'regionStatus':[r['service'] for r in last['regions']],
           'availableAssets':[n['id'] for n in last['networkState']['nodes'] if n['operation']=='serving'],
           'weightProfile':{'id':scenario+'-coastal','weights':fixture['weights'],'reason':'沿用展示權重；未經現場校準'},
           'provenance':{'network':'fixture','metrics':'simulation','delivery':'simulated emergency-center receiver','arci':'unconnected','liveSource':'unavailable'},
           'normalization':{'latency':'clamp(p95Latency / 5000)','capacity':'clamp(bottleneckKbps / 64)','energy':'clamp(fixtureEnergyUnits / 60)'},
           'calculationTrace':['以節點與鏈路 ID 搜尋','拒絕未抵達、失效、缺参数與遮蔽鏈路','固定 seed 模擬送達','七項效用加權','验证同一 run / snapshot 提案','模擬逐跳傳送與接收端 ACK'],
           'assumptions':{'source':'fixture; not measured','limits':LIMITS,'deliveryFloor':DELIVERY_FLOOR,'maxAttempts':4,'positionConfidence':'unavailable'},
           'arciProjection':{'integrationStatus':'ARCI_UNCONNECTED_PENDING_QUALIFICATION','authority':'local deterministic fixture only',
                             'observation':'coastal fixture','worldState':last['snapshotId'],'memorySummary':'unavailable','candidateSummary':len(routes),
                             'policyStatus':a['decisionStatus'],'selectedAction':a['routeId'],'evidenceStatus':a['delivery']['status'],'confidence':None}}
    return state
