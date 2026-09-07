"""Versioned exhibition fixtures; no carrier inventory or real incident feed."""
from copy import deepcopy

from domain.models import NetworkLink, NetworkNode


PROFILES = {
    "disaster": {"reliability": .20, "capacity": .10, "latency": .15, "energy": .08, "availability": .15, "risk": .10, "deliveryProbability": .22},
    "conflict": {"reliability": .24, "capacity": .05, "latency": .08, "energy": .06, "availability": .18, "risk": .17, "deliveryProbability": .22},
}

SCENARIOS = {
    "disaster": {
        "title": "東部強震・複合斷訊", "scenarioType": "natural-disaster",
        "description": "近海地震使東部基地台、光纖與海纜中斷。山區求救封包需要跨層接力。",
        "seed": "STARRYLINK_V2_EARTHQUAKE_01", "timestamp": "2026-09-06T02:00:00Z",
        "incident": {"type": "earthquake", "severity": 4.4, "affectedNodes": ["ground-bs-01", "submarine-cable-01"], "affectedLinks": ["link-bs-fiber", "link-cable-fiber"], "demandMultiplier": 2.8, "weatherDegradation": .08},
        "controls": {"power": 66}, "uncertainty": .10,
        "degradedNodes": ["lora-01", "mobile-relay-02"],
        "weightReason": "救援送達優先 v2：保留可靠度與送達權重，同時兼顧低延遲及有限電力。展示用政策，尚未經現場校準。",
        "impacts": ["東部基地台離線", "海纜節點中斷", "區域電力受損", "山區求救進入佇列"],
    },
    "conflict": {
        "title": "骨幹受損・民生通訊保全", "scenarioType": "hostile-disruption",
        "description": "西部骨幹與多處基地台失效，海纜中斷。以較保守的策略維持民生應變通訊。",
        "seed": "STARRYLINK_V2_DISRUPTION_01", "timestamp": "2026-09-06T03:00:00Z",
        "incident": {"type": "infrastructure-disruption", "severity": 4.8, "affectedNodes": ["ground-bs-01", "fiber-node-01", "submarine-cable-01", "shelter-01"], "affectedLinks": ["link-bs-fiber", "link-cable-fiber"], "demandMultiplier": 4.2, "weatherDegradation": .03},
        "controls": {"power": 46}, "uncertainty": .28,
        "degradedNodes": ["wifi-ap-01", "mobile-relay-02", "microwave-01"],
        "weightReason": "穩定通訊優先 v2：提高可靠度、基礎設施可用性與風險權重。定位可信度等待來源；不模擬攻擊策略。",
        "impacts": ["西部骨幹受損", "多處地面節點失效", "海纜與供電受影響", "壅塞與環境不確定性升高"],
    },
}

# Local cluster spacing is a schematic fixture, never a fleet sizing estimate.
def load_mission(scenario_id: str) -> dict:
    if scenario_id not in SCENARIOS:
        raise ValueError("Unknown scenarioId")
    fixture = deepcopy(SCENARIOS[scenario_id])
    nodes, links = [], []
    def node(id, label, lat, lng, layer="ground", type="base_station", **extra):
        nodes.append({**NetworkNode(id, type, layer, lat, lng, capacityKbps=12000,
                                   reliability=.999, powerRemaining=90).to_dict(),
                      "label":label, "provenance":"fixture", **extra})
    def link(id, a, b, medium="mesh", **extra):
        links.append({**NetworkLink(id,a,b,medium,180 if medium=="satellite" else 12,
                                   8000,.001,.999).to_dict(), "provenance":"fixture", **extra})
    node("emergency-center","Emergency Response Center",25.04,121.56,type="emergency_center")
    node("sat-gateway-01","NORTHERN REMOTE GATEWAY",24.95,121.50,type="satellite_gateway")
    node("east-gateway","EASTERN SURVIVING GATEWAY",24.02,121.60,type="satellite_gateway")
    node("leo-sat-01","LEO / CROSS-TERRAIN BACKBONE",23.6,122.1,"space","leo_satellite")
    link("link-leo-north","leo-sat-01","sat-gateway-01","satellite")
    link("link-leo-east","leo-sat-01","east-gateway","satellite")
    link("link-north-center","sat-gateway-01","emergency-center","fiber")
    link("link-east-center","east-gateway","emergency-center","fiber")
    node("submarine-cable-01","SUBSEA BACKHAUL",24.4,122.3,"sea","submarine_cable")
    link("link-subsea-east","submarine-cable-01","east-gateway","fiber")
    clusters = [("west","WESTERN DISASTER AREA",24.15,120.72)] if scenario_id=="disaster" else [
        ("taichung","TAICHUNG",24.15,120.67), ("tainan","TAINAN",23.00,120.22), ("kaohsiung","KAOHSIUNG",22.63,120.31)]
    for index,(region,label,lat,lng) in enumerate(clusters):
        user="citizen-01" if index==0 else region+"-users"
        tower="ground-bs-01" if index==0 else region+"-tower"
        gateway=region+"-terminal"
        node(user,label+" / EMERGENCY USERS",lat-.05,lng-.04,type="citizen_device",region=region)
        node(tower,label+" / COMMUNICATION TOWER",lat,lng,region=region)
        node(gateway,label+" / TEMPORARY SATELLITE TERMINAL",lat+.06,lng+.045,type="satellite_gateway",region=region)
        node(region+"-survivor",label+" / SURVIVING TOWER",lat+.09,lng+.07,region=region)
        link(region+"-access",user,tower,"5g")
        link(region+"-backhaul",tower,"sat-gateway-01","fiber")
        link(region+"-surviving-access",region+"-survivor",gateway,"fiber",role="local-gateway-access")
        link(region+"-uplink",gateway,"leo-sat-01","satellite",role="orbit-backbone")
        fleet=[]
        for i,(dy,dx) in enumerate([(-.045,-.025),(-.02,.012),(.012,-.025),(.04,.018),(.065,-.02),(.015,.055)]):
            id="uav-relay-03" if index==0 and i==0 else region+"-uav-"+str(i+1)
            fleet.append(id)
            node(id,label+" / LOCAL UAV "+str(i+1),lat+dy,lng+dx,"air","uav_relay",region=region,
                 role="LOCAL AIRBORNE RELAY",clusterLabel=label+" UAV CLUSTER",fleetSize="DYNAMIC / CAPACITY-DERIVED",clusterLead=i==0)
        link(region+"-user-uav",user,fleet[0],role="last-mile")
        for a,b in [(0,1),(0,2),(1,3),(2,3),(3,4),(3,5),(4,5)]:
            link(region+f"-mesh-{a}-{b}",fleet[a],fleet[b],role="airborne-mesh")
        for i in [1,3,5]:
            link(region+f"-gateway-{i}",fleet[i],gateway,role="local-gateway-access")
        link(region+"-uav-survivor",fleet[4],region+"-survivor",role="local-gateway-access")
    if scenario_id=="disaster":
        node("ridge-fiber","CENTRAL RANGE / FIBER",24.15,121.22)
        node("ridge-microwave","CENTRAL RANGE / MICROWAVE",24.03,121.17)
        link("cross-mountain-fiber-west","ground-bs-01","ridge-fiber","fiber",terrainCrossing=True)
        link("cross-mountain-fiber-east","ridge-fiber","east-gateway","fiber",terrainCrossing=True)
        link("cross-mountain-microwave","ground-bs-01","ridge-microwave",terrainCrossing=True)
        link("cross-mountain-los-east","ridge-microwave","east-gateway",terrainCrossing=True)
        link("west-subsea","ground-bs-01","submarine-cable-01","fiber")
        affected=["ground-bs-01","ridge-fiber","ridge-microwave"]
        fixture.update(title="中央山脈強震・地面網路分割",description="地震損壞回程並阻斷跨山 LOS。局部 UAV 接回衛星終端，由 LEO 跨越地形障礙。",
                       impacts=["NETWORK PARTITION", "TERRESTRIAL CROSS-ISLAND PATH LOST", "LOCAL AIRBORNE RELAY", "LEO / CROSS-TERRAIN BACKBONE"])
    else:
        affected=["ground-bs-01","tainan-tower","kaohsiung-tower"]
        # Independent western fibre spine: simultaneous city losses fragment it.
        link("western-spine-north","ground-bs-01","tainan-tower","fiber")
        link("western-spine-south","tainan-tower","kaohsiung-tower","fiber")
        link("west-subsea","kaohsiung-tower","submarine-cable-01","fiber")
        fixture.update(description="西部外海平台造成多城通訊塔失效。各地 UAV mesh 接入殘存 gateway，再經 LEO 送往應變中心。",
                       impacts=["WESTERN INFRASTRUCTURE LOSS","COVERAGE HOLE DETECTED","UAV RELAY CLUSTERS","FLEET SIZE — DYNAMIC / CAPACITY-DERIVED"])
    fixture["incident"].update(affectedNodes=affected,affectedLinks=[])
    fixture["degradedNodes"]=[]
    fixture.update(scenarioId=scenario_id,version="starrylink-scenario-2.2.0",network={"nodes":nodes,"links":links},weights=PROFILES[scenario_id])
    return fixture
