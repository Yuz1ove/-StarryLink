from __future__ import annotations

import json
import struct
import sys
import unittest
import zlib
from pathlib import Path


DEMO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEMO_ROOT))

from adapters.scenario_data import ScenarioDataAdapter  # noqa: E402
from domain.models import EmergencyMessage  # noqa: E402
from engine.candidate_generator import generate_candidates  # noqa: E402
from engine.topology_engine import apply_incident  # noqa: E402
from platform_core import StarryLinkPlatform  # noqa: E402


class ResiliencePlatformTests(unittest.TestCase):
    def setUp(self):
        self.platform = StarryLinkPlatform()

    def test_primary_failure_generates_multiple_alternatives(self):
        snapshot = self.platform.run("mountain-rain")
        self.assertGreater(len(snapshot["candidates"]), 1)
        self.assertIn("ground-bs-01", snapshot["networkSummary"]["failedNodes"])

    def test_same_seed_produces_identical_snapshot(self):
        first = self.platform.run("earthquake-fiber", seed="DETERMINISM_GATE")
        second = self.platform.run("earthquake-fiber", seed="DETERMINISM_GATE")
        self.assertEqual(
            json.dumps(first, sort_keys=True, ensure_ascii=False),
            json.dumps(second, sort_keys=True, ensure_ascii=False),
        )

    def test_failed_node_never_appears_in_active_candidate(self):
        snapshot = self.platform.run("mountain-rain")
        for candidate in snapshot["candidates"]:
            self.assertNotIn("ground-bs-01", candidate["nodes"])

    def test_ranking_is_stable(self):
        first = self.platform.run("coastal-backbone", seed="RANKING_GATE")["decision"]["ranking"]
        second = self.platform.run("coastal-backbone", seed="RANKING_GATE")["decision"]["ranking"]
        self.assertEqual(first, second)

    def test_emergency_packet_is_real_53_byte_binary_with_crc(self):
        message = EmergencyMessage("packet-test", "medical", 1787709600000, 25.033, 121.5654, 4, 900, 18)
        packet = message.serialize()
        self.assertEqual(len(packet), 53)
        self.assertEqual(struct.unpack(">I", packet[-4:])[0], zlib.crc32(packet[:-4]) & 0xFFFFFFFF)

    def test_verification_failure_requests_bounded_replan(self):
        snapshot = self.platform.run(
            "mountain-rain",
            seed="FAILURE_REPLAN_GATE",
            controls={"rainfall": 100, "demandMultiplier": 5, "packetLoss": 60},
        )
        self.assertEqual(snapshot["verification"]["status"], "REPLAN_REQUIRED")
        self.assertTrue(snapshot["replan"]["required"])
        self.assertLessEqual(snapshot["replan"]["attempts"], snapshot["execution"]["bounded"]["maxReplans"])
        if snapshot["replan"]["attempts"]:
            self.assertNotEqual(snapshot["replan"]["selectedCandidateId"], snapshot["decision"]["selectedCandidateId"])
            self.assertGreater(snapshot["replan"]["regeneratedCandidateCount"], 0)

    def test_replan_selects_a_measurably_better_alternative(self):
        snapshot = self.platform.run(
            "mountain-rain",
            seed="REPLAN-0",
            controls={"rainfall": 90, "demandMultiplier": 4, "packetLoss": 20},
        )
        self.assertEqual(snapshot["verification"]["status"], "REPLAN_REQUIRED")
        self.assertEqual(snapshot["replan"]["attempts"], 1)
        self.assertEqual(snapshot["replan"]["previousCandidateId"], snapshot["decision"]["selectedCandidateId"])
        self.assertNotEqual(snapshot["replan"]["selectedCandidateId"], snapshot["decision"]["selectedCandidateId"])
        self.assertGreater(snapshot["replan"]["regeneratedCandidateCount"], 0)

    def test_incident_changes_network_metrics(self):
        fixture = ScenarioDataAdapter().load("earthquake-fiber")
        baseline_link = next(item for item in fixture["network"]["links"] if item["id"] == "link-wifi-bs")
        degraded = apply_incident(fixture["network"], fixture["incident"])
        degraded_link = next(item for item in degraded["links"] if item["id"] == "link-wifi-bs")
        self.assertGreater(degraded_link["latencyMs"], baseline_link["latencyMs"])
        self.assertGreater(degraded_link["packetLoss"], baseline_link["packetLoss"])
        self.assertLess(degraded_link["bandwidthKbps"], baseline_link["bandwidthKbps"])

    def test_all_required_network_layers_and_node_types_exist(self):
        network = ScenarioDataAdapter().load("mountain-rain")["network"]
        self.assertEqual({node["layer"] for node in network["nodes"]}, {"ground", "sea", "air", "space"})
        required = {
            "cellular_base_station", "fiber_node", "wifi", "lora", "mesh_relay", "emergency_center",
            "shelter", "mobile_relay", "submarine_cable", "coastal_relay", "maritime_node",
            "uav_relay", "temporary_airborne_node", "leo_satellite", "satellite_gateway",
        }
        self.assertTrue(required.issubset({node["type"] for node in network["nodes"]}))

    def test_three_scenarios_complete_without_crashing(self):
        for scenario_id in ("mountain-rain", "earthquake-fiber", "coastal-backbone"):
            snapshot = self.platform.run(scenario_id)
            self.assertGreaterEqual(len(snapshot["audit"]), 8)
            self.assertEqual(snapshot["audit"][0]["inputHash"], snapshot["audit"][-1]["inputHash"])

    def test_failure_lab_satellite_off_recomputes_engine(self):
        fixture = ScenarioDataAdapter().load("mountain-rain")
        degraded = apply_incident(fixture["network"], fixture["incident"], {"satellite": False})
        candidates = generate_candidates(degraded, fixture["sourceNodeId"], fixture["targetNodeId"])
        self.assertTrue(candidates)
        self.assertTrue(all("leo-sat-01" not in candidate["nodes"] for candidate in candidates))

    def test_required_failure_cases_do_not_crash(self):
        cases = {
            "base-station-failed": {"baseStation": False},
            "fiber-failed": {"fiber": False},
            "uav-unavailable": {"uav": False},
            "satellite-unavailable": {"satellite": False},
            "demand-spike": {"demandMultiplier": 5},
        }
        for label, controls in cases.items():
            with self.subTest(label=label):
                snapshot = self.platform.run("mountain-rain", seed=f"FAILURE-{label}", controls=controls)
                self.assertGreaterEqual(len(snapshot["candidates"]), 2)
                self.assertIn(snapshot["verification"]["status"], {"STABLE", "REPLAN_REQUIRED"})


if __name__ == "__main__":
    unittest.main()
