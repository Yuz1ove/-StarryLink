from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from threading import RLock

from adapters.arci import DecisionProvider, LocalDeterministicDecisionProvider
from adapters.scenario_data import ScenarioDataAdapter
from domain.models import EmergencyMessage
from engine.candidate_generator import generate_candidates
from engine.scoring_engine import resilience_score
from engine.seeded_random import SeededRandom
from engine.simulation_engine import simulate_candidates
from engine.topology_engine import apply_incident


ENGINE_VERSION = "starrylink-resilience-1.0.0"
DEFAULT_RUNS = 240


def stable_hash(value: dict) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def logical_time(started_at: str, seconds: int) -> str:
    origin = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    return (origin + timedelta(seconds=seconds)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class StarryLinkPlatform:
    def __init__(self, provider: DecisionProvider | None = None):
        self.provider = provider or LocalDeterministicDecisionProvider()
        self.scenarios = ScenarioDataAdapter()
        self.lock = RLock()
        self._snapshot: dict | None = None

    def current(self) -> dict:
        with self.lock:
            if self._snapshot is None:
                self._snapshot = self.run("mountain-rain")
            return deepcopy(self._snapshot)

    def run(
        self,
        scenario_id: str = "mountain-rain",
        *,
        seed: str | None = None,
        runs: int = DEFAULT_RUNS,
        controls: dict | None = None,
        weights: dict | None = None,
    ) -> dict:
        if runs < 20 or runs > 2000:
            raise ValueError("runs must be between 20 and 2000")
        fixture = self.scenarios.load(scenario_id)
        seed = str(seed or fixture["seed"])
        controls = controls or {}
        incident = fixture["incident"]
        source = fixture["sourceNodeId"]
        target = fixture["targetNodeId"]
        baseline_network = deepcopy(fixture["network"])
        degraded_network = apply_incident(baseline_network, incident, controls)
        baseline_candidates = generate_candidates(baseline_network, source, target)
        candidates = generate_candidates(degraded_network, source, target)
        if len(candidates) < 2:
            raise ValueError("Incident leaves fewer than two feasible alternatives")

        baseline_simulations = simulate_candidates(baseline_candidates, baseline_network, f"{seed}:baseline", runs)
        simulations = simulate_candidates(candidates, degraded_network, seed, runs)
        decision_input = {"candidates": candidates, "simulations": simulations, "weights": weights}
        decision = self.provider.evaluate(decision_input)
        selected = next(item for item in candidates if item["id"] == decision["selectedCandidateId"])
        predicted = next(item for item in simulations if item["candidateId"] == selected["id"])

        message = EmergencyMessage(
            id=f"{scenario_id}:{seed}", category="trapped", timestamp=1787709600000,
            lat=24.1811, lng=121.3122, accuracy=36, priority=5, ttl=900,
        )
        execution, verification, replan = self._execute_and_verify(
            candidates, simulations, decision, seed, incident["startedAt"]
        )
        recovery_time = selected["deploymentTimeSec"] + 51
        before = resilience_score(degraded_network, simulations, recovery_time=600, redundancy=len(candidates))
        after = resilience_score(degraded_network, simulations, recovery_time=recovery_time, redundancy=len(candidates))
        audit = self._audit(fixture, seed, runs, controls, message, candidates, decision, execution, verification, replan)
        replay = self._replay(incident["startedAt"], degraded_network, candidates, decision, execution, verification, replan)
        snapshot = {
            "platform": "StarryLink Autonomous Resilient Communication Digital Twin",
            "label": "星夜｜自主韌性通訊數位孿生系統",
            "provenance": "SCENARIO SIMULATION — NOT LIVE TAIWAN DATA",
            "engineVersion": ENGINE_VERSION,
            "scenarioVersion": fixture["scenarioVersion"],
            "seed": seed,
            "runs": runs,
            "inputHash": stable_hash({"scenario": fixture, "seed": seed, "runs": runs, "controls": controls, "weights": weights}),
            "flow": ["SENSE", "MODEL", "GENERATE", "SIMULATE", "DECIDE", "EXECUTE", "VERIFY", "REPLAN"],
            "scenario": {key: value for key, value in fixture.items() if key != "network"},
            "controls": degraded_network["environment"],
            "network": degraded_network,
            "networkSummary": {
                "nodes": len(degraded_network["nodes"]),
                "links": len(degraded_network["links"]),
                "failedNodes": [node["id"] for node in degraded_network["nodes"] if node["status"] == "failed"],
                "failedLinks": [link["id"] for link in degraded_network["links"] if link["status"] == "failed"],
            },
            "emergencyMessage": message.to_dict(),
            "candidates": candidates,
            "simulations": simulations,
            "decision": decision,
            "execution": execution,
            "verification": verification,
            "replan": replan,
            "resilience": {
                "before": before,
                "after": after,
                "explanation": "Availability, delivery probability, recovery time, critical coverage, and route redundancy are normalized before weighting.",
            },
            "audit": audit,
            "replay": replay,
            "adapters": {
                "scenario": "ScenarioDataAdapter / SCENARIO_SIMULATION",
                "weather": "ScenarioDataAdapter / UNCONNECTED",
                "network": "ScenarioDataAdapter / UNCONNECTED",
                "disaster": "ScenarioDataAdapter / UNCONNECTED",
                "geo": "ScenarioDataAdapter / UNCONNECTED",
                "decisionProvider": decision["provider"],
                "arci": "ARCIDecisionProvider hook / UNCONNECTED",
            },
            "baseline": {"candidateCount": len(baseline_candidates), "bestDelivery": max(item["deliveryProbability"] for item in baseline_simulations)},
        }
        with self.lock:
            self._snapshot = deepcopy(snapshot)
        return snapshot

    def _execute_and_verify(self, candidates: list[dict], simulations: list[dict], decision: dict, seed: str, started_at: str):
        selected_id = decision["selectedCandidateId"]
        selected = next(item for item in candidates if item["id"] == selected_id)
        predicted = next(item for item in simulations if item["candidateId"] == selected_id)
        rng = SeededRandom(f"{seed}:verification:{selected_id}")
        observed_delivery = max(0.0, min(1.0, predicted["deliveryProbability"] + rng.uniform(-0.028, 0.018)))
        observed_loss = 1 - observed_delivery
        observed_latency = predicted["meanLatency"] * rng.uniform(0.96, 1.08)
        # Minimum operational delivery rate for the low-data emergency service.
        # Kept explicit in the verification record and replan audit.
        threshold = 0.62
        status = "STABLE" if observed_delivery >= threshold else "REPLAN_REQUIRED"
        execution = {
            "candidateId": selected_id,
            "executionId": stable_hash({"seed": seed, "candidate": selected_id})[:16],
            "lifecycle": ["PLANNED", "DEPLOYING", "ACTIVE", "VERIFYING", status],
            "status": status,
            "deploymentTimeSec": selected["deploymentTimeSec"],
            "bounded": {"maxReplans": 2, "cooldownSec": 30, "minimumImprovement": 0.03},
        }
        verification = {
            "status": status,
            "threshold": threshold,
            "predicted": {
                "deliveryRate": predicted["deliveryProbability"],
                "packetLoss": predicted["failureProbability"],
                "latencyMs": predicted["meanLatency"],
                "coverage": predicted["expectedCoverage"],
            },
            "observed": {
                "deliveryRate": round(observed_delivery, 4),
                "packetLoss": round(observed_loss, 4),
                "latencyMs": round(observed_latency, 2),
                "coverage": round(max(0, predicted["expectedCoverage"] + rng.uniform(-0.02, 0.01)), 4),
            },
            "measuredAt": logical_time(started_at, 51),
        }
        replan = {"required": status == "REPLAN_REQUIRED", "attempts": 0, "selectedCandidateId": selected_id, "reason": "verification within threshold"}
        if status == "REPLAN_REQUIRED":
            simulations_by_id = {item["candidateId"]: item for item in simulations}
            alternatives = sorted(
                [item for item in decision["ranking"] if item["candidateId"] != selected_id],
                key=lambda item: (-simulations_by_id[item["candidateId"]]["deliveryProbability"], -item["score"], item["candidateId"]),
            )
            best_alternative = alternatives[0] if alternatives else None
            alternative_delivery = simulations_by_id[best_alternative["candidateId"]]["deliveryProbability"] if best_alternative else 0
            improvement = alternative_delivery - observed_delivery
            if best_alternative and improvement >= execution["bounded"]["minimumImprovement"]:
                replan = {
                    "required": True,
                    "attempts": 1,
                    "selectedCandidateId": best_alternative["candidateId"],
                    "reason": f"alternative predicted delivery improves observed route by {improvement:.4f}",
                    "regeneratedCandidateCount": len(candidates) - 1,
                    "previousCandidateId": selected_id,
                }
            else:
                replan["reason"] = "bounded stop: no alternative meets minimum delivery improvement"
        return execution, verification, replan

    def _audit(self, fixture, seed, runs, controls, message, candidates, decision, execution, verification, replan):
        events = [
            (0, "INCIDENT_DETECTED", {"incident": fixture["incident"]["id"]}),
            (1, "NETWORK_MODELED", {"controls": controls}),
            (2, "PRIMARY_ROUTE_UNAVAILABLE", {"affectedNodes": fixture["incident"]["affectedNodes"]}),
            (3, "CANDIDATES_GENERATED", {"count": len(candidates)}),
            (4, "SIMULATION_COMPLETED", {"runs": runs, "candidateRuns": runs * len(candidates)}),
            (5, "DECISION_SELECTED", {"candidateId": decision["selectedCandidateId"], "score": decision["score"]}),
            (7, "EXECUTION_STARTED", {"executionId": execution["executionId"]}),
            (51, "VERIFICATION_COMPLETED", {"status": verification["status"]}),
            (52, "REPLAN_EVALUATED", replan),
        ]
        input_hash = stable_hash({"scenario": fixture["id"], "seed": seed, "runs": runs, "controls": controls})
        return [
            {
                "event": event,
                "timestamp": logical_time(fixture["incident"]["startedAt"], offset),
                "engineVersion": ENGINE_VERSION,
                "seed": seed,
                "inputHash": input_hash,
                "decision": detail,
                "reason": "deterministic engine event",
                "emergencyPacketBytes": message.payload_bytes,
            }
            for offset, event, detail in events
        ]

    def _replay(self, started_at, network, candidates, decision, execution, verification, replan):
        failed_nodes = [node["id"] for node in network["nodes"] if node["status"] == "failed"]
        rows = [
            (0, "Incident detected"),
            (1, f"{len(failed_nodes)} nodes failed or degraded"),
            (2, "Primary path unavailable"),
            (3, f"{len(candidates)} candidates generated"),
            (4, "Seeded simulation started"),
            (5, f"{decision['selectedCandidateId']} selected"),
            (7, "Deployment started"),
            (49, "Relay online"),
            (51, f"Verification {verification['status']}"),
            (52, "Replan bounded evaluation complete" if replan["required"] else "Recovery stable"),
        ]
        return [
            {"offsetSec": offset, "timecode": f"T+{offset // 60:02d}:{offset % 60:02d}", "timestamp": logical_time(started_at, offset), "event": event}
            for offset, event in rows
        ]


platform = StarryLinkPlatform()
