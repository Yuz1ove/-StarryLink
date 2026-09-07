"""Stateless V2 projection using the existing graph, seeded simulator and SLV1 codec.

All policy constants below are exhibition assumptions, not field calibration.
ARCI may later propose candidates through an adapter; it cannot issue an ACK.
"""
from copy import deepcopy
from datetime import datetime
from math import isfinite
import hashlib
import json
import struct
import zlib
import uuid

from adapters.mission_scenarios import load_mission
from domain.models import EmergencyMessage
from engine.candidate_generator import generate_candidates
from engine.seeded_random import SeededRandom
from engine.simulation_engine import simulate_candidates
from engine.topology_engine import apply_incident
from engine.cinematic_timeline import apply_failure_modes, build_timeline

VERSION = "starrylink-mission-2.2.0"
LIMITS = {"latency": 5000, "capacity": 64, "energy": 60}
DELIVERY_FLOOR = .62
METRICS = ("reliability", "capacity", "latency", "energy", "availability", "risk", "deliveryProbability")


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def clamp(value):
    return max(0., min(1., value))


def evaluate_routes(candidates, simulations, network, fixture, excluded):
    nodes = {n["id"]: n for n in network["nodes"]}
    links = {l["id"]: l for l in network["links"]}
    sim = {s["candidateId"]: s for s in simulations}
    routes = []
    for candidate in candidates:
        sample = sim[candidate["id"]]
        route_nodes = [nodes[n] for n in candidate["nodes"]]
        route_links = [links[l] for l in candidate["links"]]
        # Availability is reserve-adjusted asset availability; risk combines
        # observed fixture loss with the scenario's explicitly synthetic uncertainty.
        availability = sum((.5 if n["status"] == "degraded" else 1) * (.5 + .5 * n.get("powerRemaining", 100) / 100 if n.get("powerRemaining") is not None else 1) for n in route_nodes) / len(route_nodes)
        risk = clamp(.65 * sum(l["packetLoss"] for l in route_links) / len(route_links) + .35 * fixture["uncertainty"])
        raw = {"latency": sample["p95Latency"], "reliability": candidate["estimatedReliability"], "capacity": candidate["availableBandwidth"], "energy": candidate["estimatedEnergyCost"], "availability": availability, "risk": risk, "deliveryProbability": sample["deliveryProbability"]}
        normalized = {k: clamp(v / LIMITS.get(k, 1)) for k, v in raw.items()}
        utility = {k: 1-v if k in ("latency", "energy", "risk") else v for k, v in normalized.items()}
        contributions = {k: round(fixture["weights"][k] * utility[k] * 100, 6) for k in METRICS}
        score = round(sum(contributions.values()), 6)
        blocked = candidate["id"] in excluded
        eligible = raw["deliveryProbability"] >= DELIVERY_FLOOR and not blocked
        routes.append({**candidate, "hops": [{"id": n["id"], "label": n["label"], "layer": n["layer"]} for n in route_nodes], "metrics": raw, "normalizedMetrics": normalized, "utilities": utility, "weightedContributions": contributions, "finalScore": score, "status": "offline" if blocked else "eligible" if eligible else "below-delivery-floor", "eligible": eligible, "source": "scenario simulation", "runs": sample["runs"]})
    return sorted(routes, key=lambda r: (not r["eligible"], -r["finalScore"], r["id"]))


def validate_ack(packet, ack, message_id, route_id, sequence=1):
    crc_ok = len(packet) == 53 and struct.unpack(">I", packet[-4:])[0] == zlib.crc32(packet[:-4]) & 0xffffffff
    return bool(crc_ok and ack and ack.get("messageId") == message_id and ack.get("routeId") == route_id and ack.get("sequence") == sequence and ack.get("packetHash") == hashlib.sha256(packet).hexdigest() and ack.get("received") is True)


class SimulationReceiver:
    """Bounded per-mission in-memory receiver; no external transmission."""

    def __init__(self):
        self.received = {}

    def receive(self, packet, message_id, route_id, sequence):
        packet_hash = hashlib.sha256(packet).hexdigest()
        ack = {"messageId": message_id, "sequence": sequence, "routeId": route_id, "packetHash": packet_hash, "received": True, "source": "simulated emergency-center receiver"}
        if not validate_ack(packet, ack, message_id, route_id, sequence) or packet[:5] != b"SLV1\x01":
            return {"status": "INVALID_PACKET", "ack": None}
        try:
            expected_uuid = uuid.UUID(message_id).bytes
        except ValueError:
            expected_uuid = uuid.uuid5(uuid.NAMESPACE_URL, f"starrylink:{message_id}").bytes
        if packet[5:21] != expected_uuid:
            return {"status": "IDENTITY_MISMATCH", "ack": None}
        key = (message_id, sequence)
        if key in self.received:
            previous = self.received[key]
            return {"status": "DUPLICATE_IGNORED" if previous["packetHash"] == packet_hash else "IDENTITY_CONFLICT", "ack": previous if previous["packetHash"] == packet_hash else None}
        self.received[key] = ack
        return {"status": "RECEIVED", "ack": ack}


def deliver(message, route, network, seed, drop_ack=False):
    packet = message.serialize()
    packet_hash = hashlib.sha256(packet).hexdigest()
    base = {"mode": "simulation", "source": "seeded local packet transport", "messageId": message.id, "sequence": 1, "packetBytes": len(packet), "packetHex": packet.hex(), "packetHash": packet_hash, "compression": "not applied; fixed binary encoding", "queue": 1, "retry": 0, "dedupe": "NOT_RUN", "hopTrace": [], "ack": None, "confirmed": False, "status": "BLOCKED_NO_ROUTE"}
    if not route:
        return base
    rng = SeededRandom(f"{seed}:{route['id']}:packet")
    link_map = {l["id"]: l for l in network["links"]}
    node_map = {n["id"]: n for n in network["nodes"]}
    attempts = []
    elapsed = 0
    for attempt in range(1, 5):
        passed = True
        for i, link_id in enumerate(route["links"]):
            link = link_map[link_id]
            node = node_map[route["nodes"][i+1]]
            elapsed += round(link["latencyMs"], 1)
            success = rng.random() < clamp(link["reliability"] * (1-link["packetLoss"]) * node["reliability"])
            attempts.append({"attempt": attempt, "from": route["nodes"][i], "to": route["nodes"][i+1], "linkId": link_id, "elapsedMs": round(elapsed, 1), "status": "received" if success else "timeout"})
            if not success:
                passed = False
                break
        if passed:
            break
    receiver = SimulationReceiver()
    receipt = receiver.receive(packet, message.id, route["id"], 1) if passed else {"ack": None}
    ack = receipt["ack"] if not drop_ack else None
    confirmed = validate_ack(packet, ack, message.id, route["id"])
    duplicate_ignored = confirmed and receiver.receive(packet, message.id, route["id"], 1)["status"] == "DUPLICATE_IGNORED"
    base.update(routeId=route["id"], hopTrace=attempts, retry=attempt-1, queue=0 if confirmed else 1, ack=ack, confirmed=confirmed, status="DELIVERY_CONFIRMED" if confirmed else "ACK_TIMEOUT" if passed else "DELIVERY_FAILED", dedupe="DUPLICATE_IGNORED" if duplicate_ignored else "NOT_RUN", crcVerified=validate_ack(packet, {"messageId": message.id, "sequence": 1, "routeId": route["id"], "packetHash": packet_hash, "received": True}, message.id, route["id"]))
    return base


def run_mission(body=None):
    body = {} if body is None else body
    if not isinstance(body, dict):
        raise ValueError("Request must be an object")
    if body.get('sceneProfile') == 'coastal-v1':
        from engine.coastal_engine import run_coastal
        return run_coastal(body)
    if body.get('sceneProfile') is not None:
        raise ValueError('Unknown sceneProfile')
    scenario_id = body.get("scenarioId", "disaster")
    fixture = load_mission(scenario_id)
    runs = body.get("runs", 240)
    if isinstance(runs, bool) or not isinstance(runs, int) or not 20 <= runs <= 2000:
        raise ValueError("runs must be an integer between 20 and 2000")
    seed = body.get("seed", fixture["seed"])
    if not isinstance(seed, str) or not 1 <= len(seed) <= 128:
        raise ValueError("seed must contain 1 to 128 characters")
    controls = body.get("controls", {})
    if not isinstance(controls, dict) or set(controls) - {"power", "demandMultiplier", "packetLoss", "satellite", "uav"}:
        raise ValueError("Unknown controls")
    for key, value in controls.items():
        if key in ("satellite", "uav"):
            if not isinstance(value, bool):
                raise ValueError(f"{key} must be boolean")
        elif isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or not (1 <= value <= 8 if key == "demandMultiplier" else 0 <= value <= 100):
            raise ValueError(f"Invalid {key}")
    excluded = body.get("excludedRouteIds", [])
    if not isinstance(excluded, list) or len(excluded) > 24 or any(not isinstance(x, str) for x in excluded):
        raise ValueError("Invalid excludedRouteIds")
    drop_ack = body.get("dropAck", False)
    if not isinstance(drop_ack, bool):
        raise ValueError("dropAck must be boolean")
    baseline = fixture["network"]
    if controls.get("uav") is False:
        fixture["incident"]["affectedNodes"] += [n["id"] for n in baseline["nodes"] if n["layer"] == "air"]
    network = apply_incident(baseline, fixture["incident"], {**fixture["controls"], **controls})
    for node in network["nodes"]:
        if node["id"] in fixture["degradedNodes"] and node["status"] != "failed":
            node["status"] = "degraded"
            node["reliability"] *= .94
            node["capacityKbps"] *= .70
            if node.get("powerRemaining") is not None:
                node["powerRemaining"] = min(node["powerRemaining"], 28)
    apply_failure_modes(network, scenario_id)
    candidates = generate_candidates(network, "citizen-01", "emergency-center")
    unknown = set(excluded) - {r["id"] for r in candidates}
    if unknown:
        raise ValueError("Excluded route is not in this network snapshot")
    simulations = simulate_candidates(candidates, network, seed, runs)
    routes = evaluate_routes(candidates, simulations, network, fixture, excluded)
    eligible = [r for r in routes if r["eligible"]]
    selected = eligible[0] if eligible else None
    recommendation = {"routeId": selected["id"] if selected else None, "fallbackRouteId": eligible[1]["id"] if len(eligible) > 1 else None, "status": "SELECTED" if selected else "BLOCKED_NO_ELIGIBLE_ROUTE", "reason": "最高加權效用，且通過模擬送達率門檻" if selected else "沒有候選通過政策門檻，停止執行", "deliveryFloor": DELIVERY_FLOOR}
    source = next(n for n in network["nodes"] if n["id"] == "citizen-01")
    message = EmergencyMessage(id=f"{scenario_id}:{seed}", category="trapped", timestamp=int(datetime.fromisoformat(fixture["timestamp"].replace("Z", "+00:00")).timestamp()*1000), lat=source["position"]["lat"], lng=source["position"]["lng"], priority=5, ttl=900, accuracy=36)
    delivery = deliver(message, selected, network, seed, drop_ack)
    input_hash = digest({"fixture": fixture, "engine": VERSION, "seed": seed, "runs": runs, "controls": controls, "excluded": sorted(excluded), "dropAck": drop_ack})
    return {
        "contractVersion": "2.0", "engineVersion": VERSION, "scenarioId": scenario_id, "scenarioType": fixture["scenarioType"], "title": fixture["title"], "description": fixture["description"], "timestamp": fixture["timestamp"], "mode": "simulation", "source": "versioned scenario fixture + deterministic Python engine", "seed": seed, "runs": runs, "inputHash": input_hash,
        "provenance": {"network": "fixture", "metrics": "simulation", "scores": "derived", "delivery": "simulation", "liveSource": "unavailable", "arci": "unconnected", "position": "fixture layout; not real infrastructure"},
        "timeline": build_timeline(baseline, network, scenario_id, routes, recommendation, delivery),
        "baselineNetwork": baseline, "networkState": network, "regionStatus": fixture["impacts"], "availableAssets": [n["id"] for n in network["nodes"] if n["status"] != "failed"], "sosRequests": [message.to_dict()], "candidates": routes, "recommendation": recommendation, "deliveryStatus": delivery,
        "weightProfile": {"id": f"{scenario_id}-v2", "weights": fixture["weights"], "reason": fixture["weightReason"]},
        "normalization": {"latency": "clamp(p95LatencyMs / 5000)", "capacity": "clamp(bottleneckKbps / 64)", "energy": "clamp(fixtureEnergyUnits / 60)", "reliability": "product(link reliability × (1-loss)) × product(node reliability)", "availability": "mean(statusFactor × (0.5 + 0.5 × powerReserve)); degraded statusFactor=0.5; otherwise 1; no battery metric uses factor 1", "risk": "clamp(0.65 × mean(link loss) + 0.35 × scenario uncertainty)", "deliveryProbability": "successful seeded simulation runs / total runs"},
        "assumptions": {"source": "fixture policy; not field calibrated", "uncertainty": fixture["uncertainty"], "limits": LIMITS, "maxAttempts": 4, "deliveryFloor": DELIVERY_FLOOR, "positionConfidence": "unavailable"},
        "calculationTrace": ["01 取得圖搜尋候選與原始指標", "02 clamp 正規化到 [0, 1]", "03 延遲、能耗、風險轉為 1 − normalized", "04 各項效用 × 權重 × 100", "05 加總並按分數排序，同分依 ID", f"06 排除 offline 與 delivery < {DELIVERY_FLOOR}", f"07 選出 {recommendation['routeId'] or 'NONE'}；fallback = {recommendation['fallbackRouteId'] or 'unavailable'}"],
        "arciProjection": {"observation": "scenario fixture", "worldState": input_hash, "memorySummary": "unavailable", "candidateSummary": len(routes), "policyStatus": recommendation["status"], "confidence": None, "selectedAction": recommendation["routeId"], "evidenceStatus": delivery["status"], "integrationStatus": "ARCI_UNCONNECTED_PENDING_QUALIFICATION", "authority": "local deterministic engine; ARCI may only propose"},
    }
