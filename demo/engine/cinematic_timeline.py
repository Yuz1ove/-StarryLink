"""Deterministic visual narrative bound to graph failures; no impact/RF calibration."""
from copy import deepcopy

SECONDS = {'disaster':(0,3,5,8,11,14,17,20,23,26,29,32),
           'conflict':(0,4,6,8,10,14,17,20,23,26,29,32)}
STAGES = ('NORMAL','WARNING','IMPACT','FAILURE','OBSERVE','PROBE','EVALUATE','DECIDE','ATTEMPT','TRANSMIT','RECEIVE','ACK')
FAILURES = {
 'disaster': {'ground-bs-01':('tower_backhaul','Earthquake / local tower collapsed','TAICHUNG'),
              'ridge-fiber':('fiber_severed','Landslide / cross-mountain fiber severed','RIDGE'),
              'ridge-microwave':('terrain_obstruction','TERRAIN OBSTRUCTION / LOS UNAVAILABLE','RIDGE')},
 'conflict': {'ground-bs-01':('direct_impact','Hostile impact / communication tower offline','TAICHUNG'),
              'tainan-tower':('direct_impact','Hostile impact / communication tower offline','TAINAN'),
              'kaohsiung-tower':('direct_impact','Hostile impact / communication tower offline','KAOHSIUNG')}
}

def apply_failure_modes(network, scenario_id):
    for n in network['nodes']:
        if n['id'] in FAILURES[scenario_id]:
            mode,reason,city=FAILURES[scenario_id][n['id']]
            n.update(failureMode=mode,failureReason=reason,city=city)
    for l in network['links']:
        if l.get('terrainCrossing') and l['status']=='failed':
            l.update(failureMode='terrain_obstruction',failureReason='TERRESTRIAL CROSS-ISLAND PATH LOST')
    return network


def build_timeline(baseline, final, scenario_id, candidates, recommendation, delivery):
    frames=[]
    conflict=scenario_id=='conflict'
    impact_phase=3 if conflict else 2
    for phase,seconds in enumerate(SECONDS[scenario_id]):
        network=deepcopy(baseline if phase<impact_phase else final)
        failures=[{'nodeId':n['id'],'position':n['position'],'mode':n.get('failureMode','power_loss'),
                   'reason':n.get('failureReason','Power reserve reduced'),'status':n['status'],
                   'city':n.get('city'),'power':n.get('powerRemaining')}
                  for n in network['nodes'] if n['status'] in ('failed','degraded') and phase>=impact_phase]
        route=recommendation['routeId'] if phase>=7 else None
        status=(('LOCKED' if delivery['confirmed'] else delivery['status']) if phase==11 else
                'RECEIVE' if phase==10 and route else 'TRANSMIT' if phase==9 and route else
                'ATTEMPT' if phase==8 and route else 'SELECTED' if route else 'BLOCKED' if phase>=7 else
                'EVALUATING' if phase==6 else 'PROBING' if phase==5 else 'IDLE')
        hazard={'type':'infrastructure-disruption' if conflict else 'earthquake',
                'stage':'quiet' if phase==0 else 'warning' if phase==1 else 'launch' if conflict and phase==2 else 'impact' if phase==impact_phase else 'aftermath',
                'impactSeconds':8 if conflict else 5,'launchSeconds':6 if conflict else None,
                'pgaG':None if conflict else (0,.32,.48,.12)[min(phase,3)],'thresholdG':None if conflict else .30,
                'epicenter':{'lng':121.18,'lat':24.10},'threatTracks':conflict and phase in (1,2,3),
                'platform':{'lng':119.55,'lat':23.65} if conflict else None,
                'targets':[n['id'] for n in final['nodes'] if n.get('failureMode')=='direct_impact'] if conflict else [],
                'source':'synthetic exhibition choreography; no firing solution or measured damage model'}
        events=(['GROUND DOMINANT / NETWORK ONLINE'] if phase==0 else
                ['HOSTILE PLATFORM DETECTED'] if conflict and phase==1 else
                ['HOSTILE LAUNCH / MULTIPLE TRAJECTORIES','COMMUNICATION NETWORK STILL ONLINE'] if conflict and phase==2 else
                ['HOSTILE IMPACT DETECTED','WESTERN INFRASTRUCTURE LOSS','BACKHAUL DEGRADED'] if conflict and phase==3 else
                ['COVERAGE HOLE DETECTED','CAPACITY REDUCED','ROUTE RECOMPUTATION REQUIRED'] if conflict and phase==4 else
                ['ARCI ACTIVATED / LOCAL INTEGRATION PROJECTION','UAV RELAY CLUSTER','AIRBORNE MESH','FLEET SIZE — DYNAMIC / CAPACITY-DERIVED'] if phase==5 else
                ['EARTHQUAKE / GROUND DISPLACEMENT','MOUNTAIN LANDSLIDE'] if not conflict and phase==1 else
                ['NETWORK PARTITION','TERRAIN OBSTRUCTION','LOS UNAVAILABLE','TERRESTRIAL CROSS-ISLAND PATH LOST'] if not conflict and phase in (2,3,4) else
                ['LOCAL UAV MESH → GROUND TERMINAL → LEO → REMOTE GATEWAY'] if phase>=6 and phase<11 else
                [delivery['status']] if phase==11 else [f['reason'] for f in failures])
        # Only graph-derived values; utilization is route membership, not traffic telemetry.
        ground=[n for n in network['nodes'] if n['layer']=='ground']
        selected=next((c for c in candidates if c['id']==route),None)
        frames.append({'phase':phase,'seconds':seconds,'nextSeconds':SECONDS[scenario_id][min(phase+1,11)],'stage':'LAUNCH' if conflict and phase==2 else STAGES[phase],
                       'networkState':network,'failures':failures,'hazard':hazard,
                       'candidates':deepcopy(candidates) if phase>=5 else [],'routeId':route,'routeStatus':status,
                       'confirmed':phase==11 and delivery['confirmed'],'ack':deepcopy(delivery['ack']) if phase==11 else None,
                       'relayProgress':0 if phase<5 else min(1,(phase-4)/3),'events':events,
                       'layerState':{'groundCapacityKbps':sum(n['capacityKbps'] for n in ground),
                                     'groundMeanReliability':sum(n['reliability'] for n in ground)/len(ground),
                                     'airDeployed':phase>=5,'orbitRouteSelected':bool(selected and 'leo-sat-01' in selected['nodes'])}})
    return {'version':'cinematic-timeline-2','source':'deterministic simulation snapshots','durationSeconds':32,'frames':frames}
