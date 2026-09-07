# StarryLink Resilience Platform V1

## Authority boundary

The browser renders the `resilience` object returned by `GET /api/state`. It does
not generate candidates, simulate delivery, rank policies, select a winner, or
compute the resilience score. Those operations live in `domain/`, `engine/`,
`adapters/`, and `platform_core.py`.

The current decision provider is `LocalDeterministicDecisionProvider`. The
future `ARCIDecisionProvider` implements the same `DecisionProvider.evaluate`
contract. ARCI may propose a decision, but execution authority remains subject
to local deterministic validation.

## Fixed demo contract

- Scenario: `mountain-rain`
- Seed: `STARRYLINK_DEMO_001`
- Scenario version: `scenario-a-1.0.0`
- Engine version: `starrylink-resilience-1.0.0`
- Simulation count: 240 runs per candidate
- Emergency packet: 53-byte SLV1 binary packet with CRC32
- Provenance: `SCENARIO SIMULATION — NOT LIVE TAIWAN DATA`

## Quantitative evidence record

| Visual ID | Claim | Source | Raw values / transformation | Result | Allowed interpretation |
| --- | --- | --- | --- | --- | --- |
| STORY-PACKET | Emergency payload is 53 bytes | `EmergencyMessage.serialize()` | `struct.calcsize(">4sB16sQiiHBBH6sI")`; test verifies length and CRC32 | SYNTHETIC_DEMO | The SLV1 fixture packet is exactly 53 bytes |
| MISSION-RESILIENCE | Recovery improves resilience | `resilience_score()` | Availability 22%, delivery 30%, recovery 18%, coverage 18%, redundancy 12%; all normalized before weighting | SYNTHETIC_DEMO | Compare the same scenario before and after planned recovery only |
| ANALYST-DELIVERY | Candidate delivery probability | `simulate_candidate()` | Successful bounded-retry deliveries divided by 240 seeded runs | SYNTHETIC_DEMO | Compare candidates inside the same scenario and engine version |
| ANALYST-RANKING | Candidate 02 is authorized | `rank_candidates()` | Weighted normalized score plus a 62% delivery safety floor | SYNTHETIC_DEMO | A lower raw score may win when a higher score fails the safety gate |
| MISSION-TOPOLOGY | Nodes/links failed or selected | `apply_incident()` and `generate_candidates()` | Direct render of backend node/link status and selected candidate IDs | SYNTHETIC_DEMO | Inspect modeled scenario connectivity; never infer live Taiwan network health |

Forbidden interpretation: none of these values are live Taiwan carrier,
weather, disaster, satellite, 119, or medical observations.

## API contract

- `GET /api/state`
- `GET /api/resilience`
- `GET /api/decision`
- `GET /api/audit`
- `POST /api/scenario`
- `POST /api/simulate`
- `POST /api/failure`

## Replan bounds

Verification compares predicted and observed delivery, packet loss, latency,
and coverage. Failure produces `REPLAN_REQUIRED`, but replanning is bounded by
`maxReplans`, `cooldownSec`, and `minimumImprovement`. If no alternative clears
the improvement threshold, the runtime stops and records the reason instead of
looping indefinitely.
