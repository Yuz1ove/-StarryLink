#!/usr/bin/env python3
import json
import math
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent


CHANNELS = [
    {
        "id": "push",
        "name": "行動資料 Push",
        "required": "cellular",
        "min_bandwidth": 64,
        "capacity_kbps": 1500,
        "setup_seconds": 1.2,
        "max_payload_bytes": 4096,
        "base_reliability": 0.91,
        "cost_score": 96,
        "security_score": 82,
        "access_factor": 1,
    },
    {
        "id": "sms",
        "name": "SMS",
        "required": "cellular",
        "min_bandwidth": 2,
        "capacity_kbps": 2,
        "setup_seconds": 4,
        "max_payload_bytes": 140,
        "base_reliability": 0.88,
        "cost_score": 88,
        "security_score": 70,
        "access_factor": 0.08,
    },
    {
        "id": "voice",
        "name": "語音 IVR",
        "required": "cellular",
        "min_bandwidth": 24,
        "capacity_kbps": 24,
        "setup_seconds": 7,
        "max_payload_bytes": 320,
        "base_reliability": 0.84,
        "cost_score": 72,
        "security_score": 72,
        "access_factor": 0.32,
    },
    {
        "id": "satellite",
        "name": "衛星窄頻",
        "required": "satellite",
        "min_bandwidth": 1,
        "capacity_kbps": 9.6,
        "setup_seconds": 18,
        "max_payload_bytes": 180,
        "base_reliability": 0.78,
        "cost_score": 46,
        "security_score": 78,
        "access_factor": 0.18,
    },
    {
        "id": "fixed",
        "name": "固網寬頻",
        "required": "fixed",
        "min_bandwidth": 256,
        "capacity_kbps": 30000,
        "setup_seconds": 0.6,
        "max_payload_bytes": 8192,
        "base_reliability": 0.96,
        "cost_score": 92,
        "security_score": 86,
        "access_factor": 1,
    },
    {
        "id": "backup",
        "name": "企業微波備援",
        "required": "enterpriseBackup",
        "min_bandwidth": 64,
        "capacity_kbps": 5000,
        "setup_seconds": 2,
        "max_payload_bytes": 8192,
        "base_reliability": 0.92,
        "cost_score": 82,
        "security_score": 90,
        "access_factor": 0.85,
    },
]


SCENARIOS = {
    "family": {
        "event_type": "typhoon_family_check",
        "severity": 4,
        "recipient_count": 12,
        "ack_target": 0.8,
        "battery_level": 42,
        "message_bytes": 118,
        "network_snapshot": {
            "bandwidth_kbps": 48,
            "latency_ms": 950,
            "packet_loss": 18,
            "congestion": 72,
            "channel_availability": {
                "cellular": True,
                "fixed": False,
                "satellite": True,
                "enterpriseBackup": False,
            },
        },
    },
    "enterprise": {
        "event_type": "branch_outage",
        "severity": 4,
        "recipient_count": 46,
        "ack_target": 0.9,
        "battery_level": 68,
        "message_bytes": 420,
        "network_snapshot": {
            "bandwidth_kbps": 180,
            "latency_ms": 420,
            "packet_loss": 8,
            "congestion": 55,
            "channel_availability": {
                "cellular": True,
                "fixed": False,
                "satellite": True,
                "enterpriseBackup": True,
            },
        },
    },
    "patrol": {
        "event_type": "mountain_patrol_help",
        "severity": 5,
        "recipient_count": 5,
        "ack_target": 0.95,
        "battery_level": 24,
        "message_bytes": 64,
        "network_snapshot": {
            "bandwidth_kbps": 9,
            "latency_ms": 1850,
            "packet_loss": 36,
            "congestion": 38,
            "channel_availability": {
                "cellular": True,
                "fixed": False,
                "satellite": True,
                "enterpriseBackup": False,
            },
        },
    },
}


def clamp(value, low=0, high=100):
    return max(low, min(high, value))


def policy_match(channel, event):
    severity = event.get("severity", 1)
    recipients = event.get("recipient_count", 1)
    if channel["id"] == "push":
        return 90 if severity <= 3 else 66
    if channel["id"] == "sms":
        return 92 if severity >= 3 else 76
    if channel["id"] == "voice":
        return 88 if severity >= 4 and recipients < 60 else 62
    if channel["id"] == "satellite":
        bandwidth = event.get("network_snapshot", {}).get("bandwidth_kbps", 1)
        if severity >= 5 or bandwidth < 16:
            return 96
        return 76 if severity >= 4 else 58
    if channel["id"] == "fixed":
        return 86 if severity <= 3 else 64
    if channel["id"] == "backup":
        return 99 if recipients >= 20 else 58
    return 70


def route_reason(channel, event, available, bandwidth_fit):
    bandwidth = event["network_snapshot"].get("bandwidth_kbps", 1)
    severity = event.get("severity", 1)
    recipients = event.get("recipient_count", 1)
    if not available:
        return "通道不可用"
    if not bandwidth_fit:
        return "頻寬不足，僅列備援"
    if channel["id"] == "satellite" and severity >= 4:
        return "高嚴重度啟用"
    if channel["id"] == "backup" and recipients >= 20:
        return "企業群組優先"
    if channel["id"] == "sms" and bandwidth < 64:
        return "低頻寬優先"
    return "條件符合"


def payload_mode(event):
    bandwidth = event["network_snapshot"].get("bandwidth_kbps", 1)
    if bandwidth < 16:
        return "CODE"
    if bandwidth < 64:
        return "SMS160"
    if bandwidth < 256:
        return "BRIEF"
    return "FULL"


def payload_size_bytes(event):
    mode = payload_mode(event)
    message_bytes = event.get("message_bytes", 160)
    if mode == "CODE":
        return 42
    if mode == "SMS160":
        return min(140, message_bytes)
    if mode == "BRIEF":
        return min(420, max(180, message_bytes))
    return min(2200, max(640, message_bytes * 3))


def plan_route(event):
    snapshot = event.get("network_snapshot", {})
    availability = snapshot.get("channel_availability", {})
    bandwidth = snapshot.get("bandwidth_kbps", 1)
    latency = snapshot.get("latency_ms", 999)
    loss = snapshot.get("packet_loss", 0)
    congestion = snapshot.get("congestion", 50)
    battery = event.get("battery_level", 100)
    payload_bytes = payload_size_bytes(event)
    scored = []

    for channel in CHANNELS:
        available = bool(availability.get(channel["required"], False))
        effective_kbps = max(0.5, min(channel["capacity_kbps"], bandwidth * channel["access_factor"]))
        bandwidth_fit = effective_kbps >= channel["min_bandwidth"] and payload_bytes <= channel["max_payload_bytes"]
        delivery_seconds = channel["setup_seconds"] + latency / 1000 + (payload_bytes * 8) / (effective_kbps * 1000)
        retry_factor = 1 + loss / 35 + congestion / 220
        expected_delivery_seconds = delivery_seconds * retry_factor
        reliability = clamp(
            channel["base_reliability"] * 100 - loss * 0.72 - congestion * 0.18 - max(0, latency - 800) / 80
        )
        availability_score = 96 if available and bandwidth_fit else 56 if available else 4
        latency_score = clamp(100 - expected_delivery_seconds * (1.1 if channel["id"] == "satellite" else 3.4))
        payload_fit_score = 100 if payload_bytes <= channel["max_payload_bytes"] else 35
        battery_penalty = 14 if battery < 18 and channel["id"] in {"push", "voice"} else 0
        score = (
            availability_score * 0.22
            + reliability * 0.24
            + latency_score * 0.18
            + payload_fit_score * 0.12
            + channel["security_score"] * 0.08
            + channel["cost_score"] * 0.06
            + policy_match(channel, event) * 0.10
            - battery_penalty
        )
        scored.append(
            {
                "id": channel["id"],
                "name": channel["name"],
                "score": round(clamp(score)),
                "effective_kbps": round(effective_kbps, 1),
                "delivery_seconds": round(expected_delivery_seconds, 1),
                "reliability": round(reliability),
                "payload_bytes": payload_bytes,
                "reason": route_reason(channel, event, available, bandwidth_fit),
            }
        )

    ranked = sorted(scored, key=lambda item: item["score"], reverse=True)
    primary = next((item for item in ranked if item["score"] >= 60), ranked[0])
    fallback = [item for item in ranked if item["id"] != primary["id"] and item["score"] >= 45][:3]
    reach_rate = round(
        clamp(primary["score"] * 0.70 + sum(item["score"] for item in fallback) * 0.08 + event.get("ack_target", 0.8) * 13)
    )
    return {
        "primary_channel": primary["name"],
        "primary_score": primary["score"],
        "fallback_order": [item["name"] for item in fallback],
        "payload_mode": payload_mode(event),
        "payload_bytes": payload_bytes,
        "estimated_reach_rate": reach_rate / 100,
        "ack_deadline_minutes": 5 if event.get("severity", 1) >= 4 else 30,
        "ranked_channels": ranked,
        "operator_actions": operator_actions(event, primary, fallback, reach_rate),
    }


def operator_actions(event, primary, fallback, reach_rate):
    actions = []
    if primary["score"] < 75:
        actions.append("主通道低於 75 分，啟用備援同步發送")
    if event.get("severity", 1) >= 4:
        actions.append("事件等級 >= 4，要求管理台追蹤未確認名單")
    if event.get("network_snapshot", {}).get("bandwidth_kbps", 1) < 64:
        actions.append("低頻寬模式，改寫為 SMS160 或 CODE payload")
    if fallback:
        actions.append("備援順序已產生，可同步或延遲補送")
    if reach_rate < 80:
        actions.append("預估送達率低於 80%，建議語音或衛星補送")
    return actions


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            self.json({"status": "ok", "service": "xingye-watch"})
        elif self.path == "/api/scenarios":
            self.json(SCENARIOS)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != "/api/route/plan":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            event = json.loads(self.rfile.read(length) or b"{}")
            self.json(plan_route(event))
        except Exception as exc:
            self.json({"error": str(exc)}, status=400)

    def json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("星夜守望者 demo: http://127.0.0.1:8765/")
    print("Route API: POST http://127.0.0.1:8765/api/route/plan")
    server.serve_forever()


if __name__ == "__main__":
    main()
