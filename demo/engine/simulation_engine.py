from __future__ import annotations

from statistics import mean

from .seeded_random import SeededRandom


def percentile(values: list[float], percentile_value: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * percentile_value))))
    return ordered[index]


def simulate_candidate(candidate: dict, network: dict, seed: str, runs: int = 240) -> dict:
    rng = SeededRandom(f"{seed}:{candidate['id']}:{runs}")
    environment = network.get("environment", {})
    demand = float(environment.get("demandMultiplier", 1))
    rainfall = float(environment.get("rainfall", 0)) / 100
    # Emergency packets use bounded retry (maximum four attempts). The route
    # reliability is a single-attempt probability; delivery is the probability
    # that at least one of those attempts succeeds.
    single_attempt = max(0.001, min(0.999, candidate["estimatedReliability"] / (1 + max(0, demand - 1) * 0.035)))
    base_probability = 1 - (1 - single_attempt) ** 4
    success_count = 0
    latencies: list[float] = []
    coverage: list[float] = []
    lifetimes: list[float] = []
    for _ in range(runs):
        congestion_jitter = rng.uniform(0.92, 1.12 + max(0, demand - 1) * 0.04)
        weather_jitter = rng.uniform(1.0, 1.0 + rainfall * 0.3)
        success = rng.random() < base_probability
        latency = candidate["estimatedLatency"] * congestion_jitter * weather_jitter
        if success:
            success_count += 1
            latencies.append(latency)
        # Coverage is normalized against the 64 kbps low-data service target,
        # not consumer broadband capacity.
        coverage.append(max(0.1, min(1.0, candidate["availableBandwidth"] / 64 * rng.uniform(0.88, 1.02))))
        lifetimes.append(max(5.0, 180 - candidate["estimatedEnergyCost"] * 4.2 + rng.uniform(-12, 12)))
    delivery = success_count / runs
    all_latency = latencies or [candidate["estimatedLatency"] * 3]
    return {
        "candidateId": candidate["id"],
        "runs": runs,
        "deliveryProbability": round(delivery, 4),
        "meanLatency": round(mean(all_latency), 2),
        "p95Latency": round(percentile(all_latency, 0.95), 2),
        "expectedCoverage": round(mean(coverage), 4),
        "failureProbability": round(1 - delivery, 4),
        "energyCost": candidate["estimatedEnergyCost"],
        "expectedLifetime": round(mean(lifetimes), 2),
    }


def simulate_candidates(candidates: list[dict], network: dict, seed: str, runs: int = 240) -> list[dict]:
    return [simulate_candidate(candidate, network, seed, runs) for candidate in candidates]
