from __future__ import annotations

from copy import deepcopy

from domain.models import Incident, NetworkLink, NetworkNode


def _base_network() -> dict:
    nodes = [
        NetworkNode("citizen-01", "mobile_client", "ground", 24.1811, 121.3122, capacityKbps=256, latencyMs=8, reliability=0.995, powerRemaining=74),
        NetworkNode("wifi-ap-01", "wifi", "ground", 24.182, 121.313, capacityKbps=25000, latencyMs=5, reliability=0.98, powerRemaining=82),
        NetworkNode("lora-01", "lora", "ground", 24.184, 121.316, capacityKbps=64, latencyMs=35, reliability=0.96, powerRemaining=88),
        NetworkNode("mesh-relay-01", "mesh_relay", "ground", 24.191, 121.33, capacityKbps=768, latencyMs=22, reliability=0.96, powerRemaining=91),
        NetworkNode("ground-bs-01", "cellular_base_station", "ground", 24.205, 121.35, capacityKbps=100000, latencyMs=9, reliability=0.985, powerRemaining=66),
        NetworkNode("fiber-node-01", "fiber_node", "ground", 24.34, 121.51, capacityKbps=1000000, latencyMs=3, reliability=0.998, powerRemaining=96),
        NetworkNode("shelter-01", "shelter", "ground", 24.215, 121.37, capacityKbps=5000, latencyMs=12, reliability=0.97, powerRemaining=80),
        NetworkNode("mobile-relay-02", "mobile_relay", "ground", 24.225, 121.38, capacityKbps=4000, latencyMs=25, reliability=0.955, powerRemaining=72),
        NetworkNode("emergency-center", "emergency_center", "ground", 25.038, 121.564, capacityKbps=1000000, latencyMs=2, reliability=0.999, powerRemaining=100),
        NetworkNode("coastal-relay-01", "coastal_relay", "sea", 24.13, 121.66, capacityKbps=50000, latencyMs=15, reliability=0.975),
        NetworkNode("maritime-node-01", "maritime_node", "sea", 24.08, 121.78, capacityKbps=18000, latencyMs=28, reliability=0.96),
        NetworkNode("submarine-cable-01", "submarine_cable", "sea", 24.4, 122.1, capacityKbps=800000, latencyMs=18, reliability=0.992),
        NetworkNode("uav-relay-03", "uav_relay", "air", 24.32, 121.42, altitude=1100, capacityKbps=12000, latencyMs=32, reliability=0.95, powerRemaining=72),
        NetworkNode("airborne-node-01", "temporary_airborne_node", "air", 24.48, 121.48, altitude=1800, capacityKbps=24000, latencyMs=25, reliability=0.955, powerRemaining=84),
        NetworkNode("leo-sat-01", "leo_satellite", "space", 24.6, 121.5, altitude=550000, capacityKbps=40000, latencyMs=44, reliability=0.965),
        NetworkNode("sat-gateway-01", "satellite_gateway", "space", 24.75, 121.4, capacityKbps=80000, latencyMs=18, reliability=0.98, powerRemaining=93),
    ]
    links = [
        NetworkLink("link-user-wifi", "citizen-01", "wifi-ap-01", "wifi", 18, 16000, 0.012, 0.985),
        NetworkLink("link-wifi-bs", "wifi-ap-01", "ground-bs-01", "5g", 26, 24000, 0.018, 0.98),
        NetworkLink("link-bs-fiber", "ground-bs-01", "fiber-node-01", "fiber", 8, 200000, 0.004, 0.995),
        NetworkLink("link-fiber-center", "fiber-node-01", "emergency-center", "fiber", 12, 300000, 0.003, 0.997),
        NetworkLink("link-user-lora", "citizen-01", "lora-01", "lora", 120, 48, 0.035, 0.96),
        NetworkLink("link-lora-uav", "lora-01", "uav-relay-03", "lora", 155, 42, 0.04, 0.945),
        NetworkLink("link-uav-air", "uav-relay-03", "airborne-node-01", "mesh", 44, 5000, 0.025, 0.95),
        NetworkLink("link-air-center", "airborne-node-01", "emergency-center", "5g", 68, 9000, 0.03, 0.955),
        NetworkLink("link-wifi-mesh", "wifi-ap-01", "mesh-relay-01", "mesh", 42, 1200, 0.028, 0.965),
        NetworkLink("link-mesh-sat", "mesh-relay-01", "leo-sat-01", "satellite", 520, 900, 0.05, 0.94),
        NetworkLink("link-sat-gateway", "leo-sat-01", "sat-gateway-01", "satellite", 410, 18000, 0.035, 0.96),
        NetworkLink("link-gateway-center", "sat-gateway-01", "emergency-center", "fiber", 20, 60000, 0.008, 0.985),
        NetworkLink("link-lora-mobile", "lora-01", "mobile-relay-02", "lora", 130, 44, 0.038, 0.95),
        NetworkLink("link-mobile-sat", "mobile-relay-02", "leo-sat-01", "satellite", 580, 680, 0.055, 0.935),
        NetworkLink("link-shelter-mobile", "shelter-01", "mobile-relay-02", "mesh", 35, 1800, 0.02, 0.97),
        NetworkLink("link-bs-shelter", "ground-bs-01", "shelter-01", "5g", 34, 9000, 0.024, 0.96),
        NetworkLink("link-coastal-maritime", "coastal-relay-01", "maritime-node-01", "mesh", 90, 1800, 0.04, 0.95),
        NetworkLink("link-maritime-cable", "maritime-node-01", "submarine-cable-01", "fiber", 42, 120000, 0.012, 0.985),
        NetworkLink("link-cable-fiber", "submarine-cable-01", "fiber-node-01", "fiber", 28, 220000, 0.008, 0.99),
        NetworkLink("link-coastal-uav", "coastal-relay-01", "uav-relay-03", "mesh", 72, 2200, 0.035, 0.945),
    ]
    return {"nodes": [item.to_dict() for item in nodes], "links": [item.to_dict() for item in links]}


SCENARIOS = {
    "mountain-rain": {
        "id": "mountain-rain",
        "name": "Scenario A｜山區豪雨＋基地台失聯",
        "seed": "STARRYLINK_DEMO_001",
        "scenarioVersion": "scenario-a-1.0.0",
        "sourceNodeId": "citizen-01",
        "targetNodeId": "emergency-center",
        "incident": Incident(
            "incident-a-001", "landslide", 4.4, "2026-08-26T02:00:00Z",
            {"type": "circle", "center": {"lat": 24.2, "lng": 121.34}, "radiusKm": 18},
            ("ground-bs-01",), 2.8, ("link-bs-fiber",), 0.82,
        ).to_dict(),
    },
    "earthquake-fiber": {
        "id": "earthquake-fiber",
        "name": "Scenario B｜地震＋光纖中斷",
        "seed": "STARRYLINK_DEMO_002",
        "scenarioVersion": "scenario-b-1.0.0",
        "sourceNodeId": "citizen-01",
        "targetNodeId": "emergency-center",
        "incident": Incident(
            "incident-b-001", "earthquake", 4.8, "2026-08-26T03:00:00Z",
            {"type": "circle", "center": {"lat": 24.34, "lng": 121.51}, "radiusKm": 24},
            ("fiber-node-01",), 3.6, ("link-fiber-center", "link-cable-fiber"), 0.18,
        ).to_dict(),
    },
    "coastal-backbone": {
        "id": "coastal-backbone",
        "name": "Scenario C｜沿海骨幹／海纜異常",
        "seed": "STARRYLINK_DEMO_003",
        "scenarioVersion": "scenario-c-1.0.0",
        "sourceNodeId": "coastal-relay-01",
        "targetNodeId": "emergency-center",
        "incident": Incident(
            "incident-c-001", "fiber_failure", 4.1, "2026-08-26T04:00:00Z",
            {"type": "corridor", "name": "east-coast-backbone"},
            ("submarine-cable-01",), 2.4, ("link-maritime-cable",), 0.45,
        ).to_dict(),
    },
}


class ScenarioDataAdapter:
    provenance = "SCENARIO_SIMULATION"

    def load(self, scenario_id: str) -> dict:
        if scenario_id not in SCENARIOS:
            raise KeyError(f"Unknown scenario: {scenario_id}")
        return {**deepcopy(SCENARIOS[scenario_id]), "network": _base_network(), "provenance": self.provenance}

    def list(self) -> list[dict]:
        return [{"id": item["id"], "name": item["name"], "seed": item["seed"]} for item in SCENARIOS.values()]
