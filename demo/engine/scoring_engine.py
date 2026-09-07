from __future__ import annotations


DEFAULT_WEIGHTS = {
    "delivery": 0.34,
    "reliability": 0.22,
    "coverage": 0.16,
    "latency": 0.12,
    "energy": 0.08,
    "deploymentTime": 0.08,
}


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def rank_candidates(candidates: list[dict], simulations: list[dict], weights: dict | None = None) -> dict:
    weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    simulations_by_id = {item["candidateId"]: item for item in simulations}
    ranking = []
    for candidate in candidates:
        simulation = simulations_by_id[candidate["id"]]
        normalized = {
            "delivery": clamp(simulation["deliveryProbability"]),
            "reliability": clamp(candidate["estimatedReliability"]),
            "coverage": clamp(simulation["expectedCoverage"]),
            "latency": clamp(1 - simulation["p95Latency"] / 5000),
            "energy": clamp(1 - candidate["estimatedEnergyCost"] / 60),
            "deploymentTime": clamp(1 - candidate["deploymentTimeSec"] / 300),
        }
        contributions = {key: round(normalized[key] * weights[key] * 100, 4) for key in weights}
        score = round(sum(contributions.values()), 4)
        ranking.append(
            {
                "candidateId": candidate["id"],
                "score": score,
                "normalizedMetrics": normalized,
                "contributions": contributions,
                # Safety gate: a route below the operational delivery threshold
                # can be explained in Why-not, but cannot win on visual coverage
                # or cost alone.
                "eligible": simulation["deliveryProbability"] >= 0.62,
            }
        )
    ranking.sort(key=lambda item: (not item["eligible"], -item["score"], item["candidateId"]))
    if not ranking:
        raise ValueError("No feasible communication candidates")
    selected = ranking[0]
    reasons = sorted(selected["contributions"].items(), key=lambda item: (-item[1], item[0]))[:3]
    rejected = [
        {
            "candidateId": item["candidateId"],
            "reason": "hard delivery floor" if not item["eligible"] else f"score delta {round(selected['score'] - item['score'], 2)}",
        }
        for item in ranking[1:]
    ]
    confidence = clamp(0.55 + (selected["score"] - ranking[1]["score"] if len(ranking) > 1 else 20) / 100)
    return {
        "selectedCandidateId": selected["candidateId"],
        "ranking": ranking,
        "score": selected["score"],
        "confidence": round(confidence, 4),
        "reasons": [{"metric": key, "contribution": value} for key, value in reasons],
        "rejectedReasons": rejected,
        "weights": weights,
    }


def resilience_score(network: dict, simulations: list[dict], recovery_time: float, redundancy: int) -> dict:
    nodes = network["nodes"]
    available = sum(node["status"] != "failed" for node in nodes) / max(1, len(nodes))
    best_delivery = max((item["deliveryProbability"] for item in simulations), default=0)
    critical_coverage = max((item["expectedCoverage"] for item in simulations), default=0)
    recovery = clamp(1 - recovery_time / 600)
    redundancy_score = clamp(redundancy / 6)
    components = {
        "availability": round(available, 4),
        "deliveryProbability": round(best_delivery, 4),
        "recoveryTime": round(recovery, 4),
        "criticalCoverage": round(critical_coverage, 4),
        "networkRedundancy": round(redundancy_score, 4),
    }
    weights = {"availability": 0.22, "deliveryProbability": 0.3, "recoveryTime": 0.18, "criticalCoverage": 0.18, "networkRedundancy": 0.12}
    contributions = {key: round(components[key] * weights[key] * 100, 2) for key in components}
    return {"score": round(sum(contributions.values()), 1), "components": components, "contributions": contributions, "weights": weights}
