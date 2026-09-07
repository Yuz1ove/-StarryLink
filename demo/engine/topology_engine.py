from __future__ import annotations

from copy import deepcopy


def apply_incident(network: dict, incident: dict, controls: dict | None = None) -> dict:
    controls = controls or {}
    result = deepcopy(network)
    severity = max(0.0, min(1.0, float(incident.get("severity", 0)) / 5.0))
    demand = max(1.0, float(controls.get("demandMultiplier", incident.get("demandMultiplier", 1))))
    rainfall = max(0.0, min(100.0, float(controls.get("rainfall", incident.get("weatherDegradation", 0) * 100))))
    power = max(0.0, min(100.0, float(controls.get("power", 100))))
    extra_loss = max(0.0, min(0.8, float(controls.get("packetLoss", 0)) / 100.0))
    affected_nodes = set(incident.get("affectedNodes", []))
    affected_links = set(incident.get("affectedLinks", []))

    forced_nodes = {
        "baseStation": "ground-bs-01",
        "fiber": "fiber-node-01",
        "satellite": "leo-sat-01",
        "uav": "uav-relay-03",
    }
    for key, node_id in forced_nodes.items():
        if controls.get(key) is False:
            affected_nodes.add(node_id)

    for node in result["nodes"]:
        if node["id"] in affected_nodes:
            node["status"] = "failed"
            node["reliability"] = 0.0
            node["capacityKbps"] = 0
        elif node.get("powerRemaining") is not None:
            node["powerRemaining"] = min(float(node["powerRemaining"]), power)
            if power <= 5:
                node["status"] = "failed"
                node["reliability"] = 0.0
                node["capacityKbps"] = 0
            elif power < 30:
                node["status"] = "degraded"
                node["reliability"] *= 0.72
                node["capacityKbps"] *= 0.55

    for link in result["links"]:
        endpoint_failed = any(
            node["id"] in {link["source"], link["target"]} and node["status"] == "failed"
            for node in result["nodes"]
        )
        if link["id"] in affected_links or endpoint_failed:
            link["status"] = "failed"
            link["reliability"] = 0.0
            link["bandwidthKbps"] = 0
            continue
        weather_penalty = rainfall / 100 * (0.22 if link["medium"] in {"satellite", "wifi", "5g"} else 0.08)
        link["packetLoss"] = min(0.95, link["packetLoss"] + extra_loss + weather_penalty * 0.35 + severity * 0.04)
        link["reliability"] = max(0.0, link["reliability"] - weather_penalty - severity * 0.025)
        link["latencyMs"] *= 1 + (demand - 1) * 0.18 + rainfall / 100 * 0.15
        link["bandwidthKbps"] /= 1 + (demand - 1) * 0.55
        if link["packetLoss"] >= 0.65 or link["reliability"] < 0.4:
            link["status"] = "degraded"

    result["environment"] = {
        "rainfall": rainfall,
        "demandMultiplier": demand,
        "power": power,
        "injectedPacketLoss": extra_loss,
    }
    return result
