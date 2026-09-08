"""Fictional local layout and conservative LOS eligibility, in simulation metres.

No Earth coordinates, RF link budget, diffraction model or field observations.
The renderer uses this exact height function before the declared visual scaling.
"""
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
import json
import math


@lru_cache(maxsize=1)
def layout():
    return json.loads((Path(__file__).parents[1] / 'assets/coastal/scene.json').read_text())


def land_noise(x, z):
    ix, iz = math.floor(x), math.floor(z)
    u, v = smooth(x-ix), smooth(z-iz)
    def lattice(a, b):
        n = (a*374761393+b*668265263) & 0xffffffff
        n = ((n ^ (n >> 13))*1274126177) & 0xffffffff
        return (n ^ (n >> 16))/4294967295
    a, b, c, d = lattice(ix,iz), lattice(ix+1,iz), lattice(ix,iz+1), lattice(ix+1,iz+1)
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v


def height(x, z):
    t = layout()['terrain']
    coast = t['coastX'] + t['coastAmplitude']*math.sin(z/210) + 9*math.sin(z/57) + 5*math.sin(z/23) - 22*math.exp(-((z-35)/105)**2)
    shore = x-coast
    if shore < 0:
        return max(-24, shore*(.055+.065*smooth((-shore-48)/210)) + .48*math.sin(z/81+shore/39)*smooth(-shore/18)*(1-smooth(-shore/190)))
    foothill = 8 + 2*math.sin(x/140)*math.sin(z/170)
    massif = 8
    for p in t['hills']:
        foothill += p['height']*math.exp(-(((x-p['x'])/p['sx'])**2+((z-p['z'])/p['sz'])**2))
        warp = 66*math.sin(z/257)+28*math.sin(z/103+.4)
        rx = (x-p['x']-warp)/(p['sx']*1.08)
        rz = (z-p['z'])/(p['sz']*1.24)
        massif += p['height']*.73*math.exp(-(abs(rx)**2.7+abs(rz)**3.2))
    # Exact CPU counterpart of coastal-contract.js; rendering and LOS agree.
    inland = smooth((x-430)/300)
    spine = 1020+105*math.sin(z/410)+50*math.sin(z/173)
    flank = smooth((spine-x+180)/480)
    drainage = math.sin(z/143+(x-spine)/290+.67*math.sin(z/329))
    ravine = math.exp(-((drainage+.16*math.sin(x/163))/.19)**2)
    ribs = .5+.5*math.sin(z/79+(x-spine)/173+.4*math.cos(z/241))
    rock_roughness = (land_noise(x/92,z/92)-.5)*52+(land_noise(x/37,z/37)-.5)*21+3.2*math.sin(x/43+z/71)*math.sin(z/61)
    massif = massif*(1-.23*ravine*flank-.085*ribs)+rock_roughness*smooth((massif-35)/130)
    h = foothill*(1-inland)+massif*inland
    apron = math.exp(-((x-545-64*math.sin(z/187))/165)**2)*smooth((h-18)/90)
    h += apron*(7+5*math.sin(z/96+x/190))*smooth((x-340)/190)
    distant = smooth((x-1530)/670)
    h += distant*(80*math.exp(-(((x-2500)/950)**2+((z+450)/2050)**2))+110*math.exp(-(((x-3600)/1050)**2+((z-850)/2450)**2))+150*math.exp(-(((x-5100)/1400)**2+((z+850)/2900)**2)))*(.73+.27*math.sin(z/381+.6*math.sin(x/317))**2)
    river_side = z-t['riverBaseZ']-t['riverAmplitude']*math.sin(x/180)
    river = abs(river_side)
    lowland = 1-inland
    estuary = (1-smooth((shore-20)/230))*lowland
    inner_bend = .5-.5*(river_side/(river+.001))*math.sin(x/180)
    channel_half = 18+lowland*(4.5*math.sin(x/97+.8)+3*math.sin(x/43))+estuary*15
    valley_width = (85+inland*(64+22*math.sin(x/217)))*(1+lowland*((inner_bend-.5)*.52+.10*math.sin(x/119)))+estuary*22
    bank = smooth((river-channel_half)/valley_width)
    valley = bank*.84+smooth((river-channel_half)/(valley_width*1.8))*.16
    deposition = lowland*(1.15*math.exp(-(((x+190)/92)**2+((river_side-channel_half-3)/13)**2))+1.05*math.exp(-(((x-255)/86)**2+((river_side+channel_half+4)/12)**2)))
    beach = smooth(shore/54)
    dune = .8*math.exp(-((shore-32)/18)**2)*(.5+.5*math.sin(z/63))
    return (-1.5+(h+1.5)*valley+deposition)*beach+dune*beach*(1-smooth((90-river)/55))


def smooth(t):
    t = max(0, min(1, t))
    return t*t*(3-2*t)


def position_at(node, seconds):
    if node['layer'] != 'air':
        return node['anchorM'][:]
    flight = node['flight']
    start, end = flight['startM'], node['anchorM']
    a = flight['launchSeconds']; b = flight['arrivalSeconds']
    # Ascend at the pad before horizontal travel; descend only on the final leg.
    if seconds <= a:
        return start[:]
    if seconds < a+2:
        return [start[0], start[1]+(end[1]-start[1])*smooth((seconds-a)/2), start[2]]
    p = smooth((seconds-a-2)/(b-a-2))
    return [start[0]+(end[0]-start[0])*p, end[1], start[2]+(end[2]-start[2])*p]


def scene_fixture(scenario):
    nodes, links = [], []

    def node(id, label, x, z, kind, region='A', agl=1, **extra):
        nodes.append(dict(id=id, label=label, type=kind, layer='air' if kind=='uav_relay' else 'sea' if kind=='submarine_cable' else 'ground',
                          region=region, position={'lat':0, 'lng':0, 'altitude':None},
                          anchorM=[x, height(x,z)+agl, z], status='healthy', capacityKbps=512,
                          latencyMs=2, reliability=.998, powerRemaining=85, provenance='fixture', **extra))

    node('citizen-01', 'A 區 · 山谷求救端', 420,-295,'citizen_device')
    node('ground-bs-01', 'A 區基地台', 480,-450,'base_station',agl=28)
    node('fiber-east', '坡道光纖接點', 660,-425,'fiber_node')
    node('terminal-a', 'A 區 · 地面回傳終端', -80,-215,'mobile_relay')
    node('emergency-center', '應變中心', 90,400,'emergency_center',region='CENTER',agl=38)
    node('users-b', 'B 區 · 港區求救端', 90,250,'citizen_device','B')
    node('tower-b', 'B 區基地台', -65,235,'base_station','B',agl=26)
    node('backhaul-b', '港區回傳機房', -135,135,'fiber_node','B')
    node('terminal-b', 'B 區 · 地面回傳終端', -180,380,'mobile_relay','B')
    node('subsea-landing', '海纜登陸站', -280,570,'fiber_node','B')
    node('submarine-cable-01', '海纜剖切接點', -680,640,'submarine_cable','B',agl=-4)
    node('ridge-relay', '山背端點 · 未通過直視', 1160,-540,'base_station','A',agl=8)
    for id,label,x,z,y,region,role,a,b in [
        ('uav-access-a','A01 · 服務區接入',390,-290,145,'A','access',10,17),
        ('uav-relay-a','A02 · 回傳中繼',120,-230,155,'A','backhaul',10,17),
        ('uav-spare-a','A03 · 待命輪替',155,-235,160,'A','standby-replacement',23,29),
        ('uav-access-b','B01 · 服務區接入',90,235,110,'B','access',10,17),
        ('uav-relay-b','B02 · 回傳中繼',-90,285,125,'B','backhaul',10,17),
    ]:
        node(id,label,x,z,'uav_relay',region,agl=0,role=role)
        n=nodes[-1]; n['anchorM'][1]=y
        px=-70+(len(nodes)%3)*20; pz=-160+(len(nodes)%2)*20
        n['flight']={'startM':[px,height(px,pz)+3,pz],'launchSeconds':a,'arrivalSeconds':b,
                     'source':'compressed narrative seconds; not aircraft performance'}
        n['modelScale']=3

    def link(id,a,b,medium='mesh',range_m=700,**extra):
        links.append(dict(id=id,source=a,target=b,medium=medium,latencyMs=8 if medium=='fiber' else 18,
                          bandwidthKbps=256,packetLoss=.008,reliability=.994,status='healthy',bidirectional=True,
                          maxRangeM=range_m,sourceType='simulation',**extra))
    link('a-cell','citizen-01','ground-bs-01','5g')
    link('a-road-fiber','ground-bs-01','fiber-east','fiber')
    link('a-main-backhaul','fiber-east','emergency-center','fiber')
    link('b-cell','users-b','tower-b','5g')
    link('b-tower-backhaul','tower-b','backhaul-b','fiber')
    link('b-main-backhaul','backhaul-b','emergency-center','fiber')
    link('a-local-access','citizen-01','uav-access-a')
    link('a-primary-mesh','uav-access-a','uav-relay-a')
    link('a-primary-egress','uav-relay-a','terminal-a')
    link('a-spare-mesh','uav-access-a','uav-spare-a')
    link('a-spare-egress','uav-spare-a','terminal-a')
    link('a-egress','terminal-a','emergency-center','fiber')
    link('b-local-access','users-b','uav-access-b')
    link('b-mesh','uav-access-b','uav-relay-b')
    link('b-relay-egress','uav-relay-b','terminal-b')
    link('b-egress','terminal-b','emergency-center','fiber')
    link('coastal-cable','subsea-landing','submarine-cable-01','fiber',renderMode='cutaway')
    link('landing-spur','backhaul-b','subsea-landing','fiber')
    link('ridge-los','citizen-01','ridge-relay',range_m=2000)
    link('unknown-radio','ridge-relay','emergency-center',range_m=None)
    impact = 8 if scenario=='conflict' else 5
    events = [
        {'id':'event-primary','seconds':impact,'kind':'impact' if scenario=='conflict' else 'earthquake',
         'label':'A 區設施受損' if scenario=='conflict' else '地震 · 坡道崩落、供電中斷',
         'positionM':next(n['anchorM'] for n in nodes if n['id']=='ground-bs-01'),
         'nodeChanges':{'ground-bs-01':'structural_damage' if scenario=='conflict' else 'power_loss'},
         'linkChanges':{'a-road-fiber':'fiber_severed'} if scenario=='disaster' else {},
         'damageAssets':['road-cut','slope-east','building-2-2'] if scenario=='disaster' else ['tower-a','building-2-2'],
         'source':'scenario dependency; not measured damage'},
        {'id':'event-port','seconds':10,'kind':'impact' if scenario=='conflict' else 'power',
         'label':'B 區回傳機房受損；塔體仍完整' if scenario=='conflict' else 'B 區機房供電耗盡；道路損傷不代表所有光纖失效',
         'positionM':next(n['anchorM'] for n in nodes if n['id']=='backhaul-b'),
         'nodeChanges':{'backhaul-b':'backhaul_lost'},'linkChanges':{},'damageAssets':['port-cabinet'],
         'source':'separate configured dependency'},
        {'id':'event-secondary','seconds':23,'kind':'relay_failure','label':'A02 中繼失效；A03 起飛輪替，B 區備援電源耗盡',
         'positionM':next(n['anchorM'] for n in nodes if n['id']=='uav-relay-a'),
         'nodeChanges':{'uav-relay-a':'relay_fault','terminal-b':'power_loss'},'linkChanges':{},'damageAssets':[],
         'source':'repeatable secondary failure fixture'},
    ]
    return {'nodes':nodes,'links':links}, events


def qualify_link(link, nodes):
    a,b=nodes[link['source']],nodes[link['target']]
    if any(n['status']=='failed' for n in (a,b)):
        return 'FAILED', '端點失效'
    if any(n.get('operation')!='serving' for n in (a,b)):
        return 'WAITING', '中繼尚未抵達；不提供服務'
    if link['medium']=='fiber':
        return 'QUALIFIED', '已配置的模擬實體纜線'
    if link.get('maxRangeM') is None:
        return 'UNVERIFIED', '缺少設備範圍參數'
    p,q=a['scenePositionM'],b['scenePositionM']
    distance=math.dist(p,q)
    if distance>link['maxRangeM']:
        return 'REJECTED','超出設定範圍'
    clearance=min(p[1]+(q[1]-p[1])*i/96-height(p[0]+(q[0]-p[0])*i/96,p[2]+(q[2]-p[2])*i/96) for i in range(1,96))
    link['calculation']={'distanceM':round(distance,2),'minTerrainClearanceM':round(clearance,2),
                         'samples':95,'maxRangeM':link['maxRangeM'],'source':'simulated local metres; not RF budget'}
    return ('QUALIFIED','簡化直視與範圍通過') if clearance>0 else ('REJECTED','解析地形阻擋直視；未模擬繞射或反射')


def network_at(baseline,events,seconds,fault='none',controls=None):
    network=deepcopy(baseline); node_map={n['id']:n for n in network['nodes']}
    for n in network['nodes']:
        n['scenePositionM']=position_at(n,seconds)
        n['operation']='serving' if n['layer']!='air' or seconds>=n['flight']['arrivalSeconds'] else 'deploying' if seconds>n['flight']['launchSeconds'] else 'standby'
        n['modelState']='intact'; n['causeEventId']=None
    damage=[]
    for event in events:
        if seconds<event['seconds']:continue
        damage.extend(event['damageAssets'])
        for id,reason in event['nodeChanges'].items():
            n=node_map[id];n.update(status='failed',operation='failed',failureMode=reason,causeEventId=event['id'],reliability=0,capacityKbps=0)
            n['modelState']='damaged' if reason=='structural_damage' else 'intact'
            if reason=='power_loss':n['powerRemaining']=0
    controlled=controls or {}
    for n in network['nodes']:
        off=(fault=='no-egress' and n['id'] in ('terminal-a','terminal-b','fiber-east','backhaul-b') or
             fault=='no-spare' and n['id']=='uav-spare-a' or controlled.get('power',85)<=5 or
             controlled.get('uav') is False and n['layer']=='air')
        if off:
            n.update(status='failed',operation='failed',failureMode='injected_failure',causeEventId='test-fault',reliability=0,capacityKbps=0)
    for link in network['links']:
        qualification,reason=qualify_link(link,node_map)
        cause=None
        for event in events:
            if seconds>=event['seconds'] and link['id'] in event['linkChanges']:
                qualification,reason,cause='FAILED',event['linkChanges'][link['id']],event['id']
        link.update(qualification=qualification,qualificationReason=reason,causeEventId=cause,
                    status='healthy' if qualification=='QUALIFIED' else 'failed')
        if qualification!='QUALIFIED':link.update(bandwidthKbps=0,reliability=0)
    network.update(damageAssets=sorted(set(damage)),environment={'demandMultiplier':1.8,'rainfall':0,'power':85})
    return network
