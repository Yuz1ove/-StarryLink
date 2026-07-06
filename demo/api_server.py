#!/usr/bin/env python3
import json
import os
import socket
import threading
import time
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
STATE_FILE = Path(os.environ.get("STARRY_STATE_FILE", ROOT / "demo_state.json"))
SERVER_STARTED_AT = datetime.now(timezone.utc).isoformat()

RESPONSE_LABELS = {
    "S": "我平安",
    "H": "需要協助",
    "M": "需要醫療",
    "N": "無法通話",
    "L": "位置異常",
}

RESPONSE_KEYS = {
    "S": "safe",
    "H": "help",
    "M": "medical",
    "N": "no_call",
    "L": "location",
}

FOLLOWUP_CODES = {"H", "M", "N", "L"}
LOG_TYPES = {
    "MOBILE_ACTION",
    "COMMAND_MESSAGE",
    "QUICK_REPLY",
    "INTERNAL_ACK",
    "ALERT_SOUND",
    "CONVERSATION_OPENED",
    "SAFETY_CONFIRMED",
    "TRIAGE_QUESTION",
    "TRIAGE_ANSWER",
    "LOCATION_UPDATE",
    "GPS_PERMISSION_DENIED",
    "RISK_SCORE_UPDATED",
    "RISK_MATRIX_UPDATED",
    "ROUTE_DECISION_UPDATED",
    "MOBILE_ALERT",
    "MOBILE_ALERT_RECEIVED",
    "RETRY_SENT",
    "SERVER_ACK",
    "DUPLICATE_IGNORED",
}
ACTION_DEFINITIONS = {
    "SAFE_OK": {
        "responseCode": "S",
        "label": "我平安",
        "severity": 1,
        "status": "已回報平安",
        "needsTriage": False,
        "preferredChannel": "SSE / SMS",
        "reassurance": "已回報平安，守護指揮中心已收到。",
        "routeHint": "記錄 ACK，不進入高優先待處理。",
    },
    "NEED_HELP": {
        "responseCode": "H",
        "label": "需要協助",
        "severity": 3,
        "status": "需要協助",
        "needsTriage": True,
        "preferredChannel": "SMS",
        "reassurance": "需要協助已送出。守護指揮中心已收到，請留在安全位置等待確認。",
        "routeHint": "SMS 主通道，若無 ACK 則升級人工追蹤。",
    },
    "SOS_BUTTON": {
        "responseCode": "H",
        "label": "大型求救按鈕",
        "severity": 5,
        "status": "SOS 已送出",
        "needsTriage": True,
        "preferredChannel": "SMS / Low Data Text + Satellite Backup",
        "reassurance": "SOS 已送出。守望隊工作台已收到最高優先封包；請盡量留在安全位置。",
        "routeHint": "最高優先，低資料封包優先，地面網路失效時提高衛星備援分數。",
    },
    "INJURED": {
        "responseCode": "M",
        "label": "我受傷",
        "severity": 4,
        "status": "受傷狀態已送出",
        "needsTriage": True,
        "preferredChannel": "SMS / Low Data Text",
        "reassurance": "受傷狀態已送出。守望隊會用低資料方式確認位置與身體狀態。",
        "routeHint": "提高醫療與人工追蹤權重，但不宣稱已連接真實醫療服務。",
    },
    "TRAPPED": {
        "responseCode": "H",
        "label": "我被困住",
        "severity": 5,
        "status": "受困狀態已送出",
        "needsTriage": True,
        "preferredChannel": "SMS / BLE Relay / Satellite Backup",
        "reassurance": "受困狀態已送出。請不要勉強移動，系統會優先保留低資料位置與狀態封包。",
        "routeHint": "受困高優先，弱網時提高 SMS / BLE Relay，RED 且地面失效時提高 Satellite Backup。",
    },
    "CANNOT_TALK": {
        "responseCode": "N",
        "label": "無法通話",
        "severity": 4,
        "status": "已切換低資料文字確認",
        "needsTriage": True,
        "preferredChannel": "SMS / Low Data Text",
        "reassurance": "已切換低資料文字確認。後台會優先用按鍵回覆方式與您確認，不需要說話。",
        "routeHint": "避免語音作為主要回覆方式，優先低資料文字與後台追蹤。",
    },
    "NEED_MEDICAL": {
        "responseCode": "M",
        "label": "需要醫療",
        "severity": 5,
        "status": "需要醫療協助已送出",
        "needsTriage": True,
        "preferredChannel": "SMS + Manual Call + Guardian Notify",
        "reassurance": "守護指揮中心已收到。請先確認周圍安全，保持手機在身邊。若身邊有人，請請他協助留意並等待後台聯繫。",
        "routeHint": "最高優先級，建議守護指揮中心人工追蹤與守護者模擬通知。",
    },
    "DISCOMFORT": {
        "responseCode": "M",
        "label": "身體不適",
        "severity": 3,
        "status": "身體不適已送出",
        "needsTriage": True,
        "preferredChannel": "SMS / Low Data Text",
        "reassurance": "身體不適已送出。守望隊會持續確認是否需要人工追蹤。",
        "routeHint": "中風險，保留低資料文字確認。",
    },
    "STATUS_CLEAR": {
        "responseCode": "S",
        "label": "清除狀態",
        "severity": 1,
        "status": "狀態已清除",
        "needsTriage": False,
        "preferredChannel": "SSE / SMS",
        "reassurance": "狀態已清除。若您目前安全，請按「我安全」完成回報。",
        "routeHint": "清除症狀，不刪除事件紀錄。",
    },
    "LOCATION_ANOMALY": {
        "responseCode": "L",
        "label": "位置異常",
        "severity": 4,
        "status": "位置異常已送出",
        "needsTriage": True,
        "preferredChannel": "SMS + Location Check",
        "reassurance": "系統正在用同網路模擬定位協助確認狀態，請留在安全位置。",
        "routeHint": "位置確認與後台追蹤，顯示同網路推測定位但不宣稱 GPS。",
    },
}
DEDUPE_WINDOW_SECONDS = 15

TRIAGE_FLOWS = {
    "SAFE_OK": {
        "title": "平安確認",
        "questions": [
            {
                "id": "SAFE_Q1",
                "text": "是否需要稍後再次提醒您回報？",
                "answers": [
                    {"code": "SAFE_DONE", "label": "不用，現在平安", "riskDelta": -10, "nextQuestionId": None, "nextActionHint": "記錄平安 ACK，不進入高優先待處理。"},
                    {"code": "SAFE_REMIND", "label": "稍後再提醒", "riskDelta": 0, "nextQuestionId": None, "nextActionHint": "保留低優先提醒，不升級。"},
                    {"code": "SAFE_TO_HELP", "label": "其實需要協助", "riskDelta": 40, "nextQuestionId": None, "escalateTo": "NEED_HELP", "nextActionHint": "升級為需要協助，建立後續安全確認。"},
                ],
            }
        ],
    },
    "NEED_HELP": {
        "title": "安全確認",
        "questions": [
            {"id": "HELP_Q1", "text": "您現在是否有立即危險？", "answers": [
                {"code": "HELP_NO_DANGER", "label": "沒有立即危險", "riskDelta": 0, "nextQuestionId": "HELP_Q2", "nextActionHint": "持續低資料按鍵確認。"},
                {"code": "HELP_DANGER", "label": "有危險", "riskDelta": 25, "nextQuestionId": "HELP_Q2", "nextActionHint": "提高人工介入優先序。"},
                {"code": "HELP_UNSURE", "label": "不確定", "riskDelta": 15, "nextQuestionId": "HELP_Q2", "nextActionHint": "以人工確認安全狀態。"},
            ]},
            {"id": "HELP_Q2", "text": "您身邊有人可以協助嗎？", "answers": [
                {"code": "HELP_WITH_PERSON", "label": "有人在旁邊", "riskDelta": -10, "nextQuestionId": "HELP_Q3", "nextActionHint": "可請身邊協助者留意。"},
                {"code": "HELP_ALONE", "label": "我一個人", "riskDelta": 15, "nextQuestionId": "HELP_Q3", "nextActionHint": "建議人工聯繫守護者。"},
                {"code": "HELP_PERSON_UNSURE", "label": "不確定", "riskDelta": 10, "nextQuestionId": "HELP_Q3", "nextActionHint": "確認身邊協助者狀態。"},
            ]},
            {"id": "HELP_Q3", "text": "您希望後台怎麼聯繫？", "answers": [
                {"code": "HELP_TEXT", "label": "用文字", "riskDelta": 0, "nextQuestionId": None, "nextActionHint": "以 LOW_DATA_TEXT 持續確認。"},
                {"code": "HELP_CALL_OK", "label": "可以通話", "riskDelta": -5, "nextQuestionId": None, "nextActionHint": "可由後台人工聯繫，但保留低資料 ACK。"},
                {"code": "HELP_NO_CALL", "label": "不要通話", "riskDelta": 10, "nextQuestionId": None, "nextActionHint": "避免語音作為主要方式。"},
            ]},
        ],
    },
    "CANNOT_TALK": {
        "title": "無法通話確認",
        "questions": [
            {"id": "TALK_Q1", "text": "您現在可以看手機文字嗎？", "answers": [
                {"code": "TALK_TEXT_OK", "label": "可以", "riskDelta": 0, "nextQuestionId": "TALK_Q2", "nextActionHint": "持續文字確認。"},
                {"code": "TALK_TEXT_HARD", "label": "很困難", "riskDelta": 15, "nextQuestionId": "TALK_Q2", "nextActionHint": "降低文字負擔並提高人工追蹤。"},
                {"code": "TALK_TEXT_UNSURE", "label": "不確定", "riskDelta": 20, "nextQuestionId": "TALK_Q2", "nextActionHint": "提高人工確認優先序。"},
            ]},
            {"id": "TALK_Q2", "text": "您身邊有人可以幫忙看手機嗎？", "answers": [
                {"code": "TALK_HELPER_NEAR", "label": "有人可以", "riskDelta": -10, "nextQuestionId": "TALK_Q3", "nextActionHint": "可請身邊協助者留意手機。"},
                {"code": "TALK_ALONE", "label": "我一個人", "riskDelta": 20, "nextQuestionId": "TALK_Q3", "nextActionHint": "建議人工聯繫守護者。"},
                {"code": "TALK_HELPER_UNSURE", "label": "不確定", "riskDelta": 10, "nextQuestionId": "TALK_Q3", "nextActionHint": "確認是否有協助者。"},
            ]},
            {"id": "TALK_Q3", "text": "是否需要後台改用文字持續確認？", "answers": [
                {"code": "TALK_NEED_TEXT", "label": "需要", "riskDelta": 5, "nextQuestionId": None, "nextActionHint": "以 LOW_DATA_TEXT / SMS_SIMULATED 持續確認。"},
                {"code": "TALK_NO_TEXT", "label": "暫時不用", "riskDelta": 0, "nextQuestionId": None, "nextActionHint": "保留低資料 ACK 追蹤。"},
                {"code": "TALK_CANNOT_DECIDE", "label": "我無法判斷", "riskDelta": 20, "nextQuestionId": None, "nextActionHint": "建議人工介入確認。"},
            ]},
        ],
    },
    "NEED_MEDICAL": {
        "title": "醫療協助確認",
        "questions": [
            {"id": "MED_Q1", "text": "您現在還能繼續點選手機回覆嗎？", "answers": [
                {"code": "MED_CAN_REPLY", "label": "可以", "riskDelta": 0, "nextQuestionId": "MED_Q2", "nextActionHint": "持續低資料按鍵確認。"},
                {"code": "MED_REPLY_HARD", "label": "很困難", "riskDelta": 25, "nextQuestionId": "MED_Q2", "nextActionHint": "建議立即守護者確認。"},
                {"code": "MED_REPLY_UNSURE", "label": "無法確認", "riskDelta": 30, "nextQuestionId": "MED_Q2", "nextActionHint": "建議立即守護者確認。"},
            ]},
            {"id": "MED_Q2", "text": "您身邊有人可以協助留意嗎？", "answers": [
                {"code": "MED_WITH_PERSON", "label": "有人在旁邊", "riskDelta": -10, "nextQuestionId": "MED_Q3", "nextActionHint": "請身邊協助者留意並等待後台聯繫。"},
                {"code": "MED_ALONE", "label": "我一個人", "riskDelta": 25, "nextQuestionId": "MED_Q3", "nextActionHint": "建議優先人工聯繫與守護者確認。"},
                {"code": "MED_PERSON_UNSURE", "label": "不確定", "riskDelta": 15, "nextQuestionId": "MED_Q3", "nextActionHint": "確認是否有身邊協助者。"},
            ]},
            {"id": "MED_Q3", "text": "您目前所在位置是否安全？", "answers": [
                {"code": "MED_PLACE_SAFE", "label": "安全", "riskDelta": -5, "nextQuestionId": "MED_Q4", "nextActionHint": "持續低資料確認並等待後台聯繫。"},
                {"code": "MED_PLACE_UNSAFE", "label": "不安全", "riskDelta": 25, "nextQuestionId": "MED_Q4", "nextActionHint": "提高人工確認位置與守護者聯繫。"},
                {"code": "MED_PLACE_UNSURE", "label": "不確定", "riskDelta": 15, "nextQuestionId": "MED_Q4", "nextActionHint": "建議人工確認位置安全。"},
            ]},
            {"id": "MED_Q4", "text": "是否需要後台立即請指定守護者聯繫？", "answers": [
                {"code": "MED_NEED_CONTACT_NOW", "label": "需要立即聯繫", "riskDelta": 20, "nextQuestionId": None, "nextActionHint": "優先人工聯繫指定守護者。"},
                {"code": "MED_CAN_WAIT", "label": "可以等待確認", "riskDelta": 0, "nextQuestionId": None, "nextActionHint": "持續低資料追蹤與人工確認。"},
                {"code": "MED_CANNOT_DECIDE", "label": "我無法判斷", "riskDelta": 20, "nextQuestionId": None, "nextActionHint": "建議人工介入並請守護者確認。"},
            ]},
        ],
    },
    "LOCATION_ANOMALY": {
        "title": "位置確認",
        "questions": [
            {"id": "LOC_Q1", "text": "您現在是在家中或熟悉地點嗎？", "answers": [
                {"code": "LOC_FAMILIAR", "label": "在家 / 熟悉地點", "riskDelta": -10, "nextQuestionId": "LOC_Q2", "nextActionHint": "標示位置較可信，持續確認。"},
                {"code": "LOC_UNFAMILIAR", "label": "不在熟悉地點", "riskDelta": 20, "nextQuestionId": "LOC_Q2", "nextActionHint": "建議人工確認位置。"},
                {"code": "LOC_UNKNOWN", "label": "我不知道", "riskDelta": 25, "nextQuestionId": "LOC_Q2", "nextActionHint": "提高位置確認優先級。"},
            ]},
            {"id": "LOC_Q2", "text": "您可以留在目前安全位置嗎？", "answers": [
                {"code": "LOC_CAN_STAY", "label": "可以", "riskDelta": 0, "nextQuestionId": "LOC_Q3", "nextActionHint": "請留在安全位置等待確認。"},
                {"code": "LOC_CANNOT_STAY", "label": "不方便", "riskDelta": 15, "nextQuestionId": "LOC_Q3", "nextActionHint": "建議人工確認位置與協助者。"},
                {"code": "LOC_STAY_UNSURE", "label": "不確定", "riskDelta": 10, "nextQuestionId": "LOC_Q3", "nextActionHint": "持續位置安全確認。"},
            ]},
            {"id": "LOC_Q3", "text": "是否需要後台請守護者協助確認位置？", "answers": [
                {"code": "LOC_NEED_GUARDIAN", "label": "需要", "riskDelta": 15, "nextQuestionId": None, "nextActionHint": "請守護者協助確認位置。"},
                {"code": "LOC_NO_GUARDIAN", "label": "暫時不用", "riskDelta": 0, "nextQuestionId": None, "nextActionHint": "保留低資料位置確認紀錄。"},
                {"code": "LOC_CANNOT_DECIDE", "label": "我無法判斷", "riskDelta": 15, "nextQuestionId": None, "nextActionHint": "建議人工確認位置。"},
            ]},
        ],
    },
}

BASE_RISK = {
    "SAFE_OK": 5,
    "NEED_HELP": 45,
    "SOS_BUTTON": 90,
    "INJURED": 70,
    "TRAPPED": 82,
    "CANNOT_TALK": 60,
    "NEED_MEDICAL": 75,
    "DISCOMFORT": 55,
    "STATUS_CLEAR": 0,
    "LOCATION_ANOMALY": 55,
}

SYSTEM_MESSAGES = {
    "SAFE_OK": "長者已回報：我平安。系統已記錄 ACK，暫不列入高優先處理。",
    "NEED_HELP": "長者已回報：需要協助。建議守護指揮中心確認所在位置與是否有立即危險。",
    "SOS_BUTTON": "使用者已按下 SOS。系統以最高優先寫入 packet log，並提高低資料與衛星備援通道權重。",
    "INJURED": "使用者已回報：我受傷。建議守望隊用低資料文字確認位置、意識狀態與身邊是否有人協助。",
    "TRAPPED": "使用者已回報：我被困住。請優先確認位置可信度、是否可回覆與最近協助者。",
    "CANNOT_TALK": "長者已回報：無法通話。建議改用低資料文字確認，不要以語音作為唯一聯繫方式。",
    "NEED_MEDICAL": "長者已回報：需要醫療協助。請優先確認是否可繼續按鍵回覆、所在位置、身邊是否有人可協助。此 demo 未連接真實外部通報服務。",
    "DISCOMFORT": "使用者已回報：身體不適。系統保留低資料確認並建議人工追蹤。",
    "STATUS_CLEAR": "使用者已清除手機端狀態。事件紀錄保留，風險矩陣重新計算。",
    "LOCATION_ANOMALY": "長者已回報：位置異常。請確認同網路模擬定位結果，並以文字方式向長者確認目前是否安全。",
}

QUICK_REPLY_SETS = {
    "general": ["我安全", "我需要人來", "我無法回覆"],
    "nearby": ["有人在旁邊", "我一個人", "我不確定"],
    "location": ["我在家", "我不在家", "我不知道位置"],
    "medical": ["我需要立即協助", "我可以等待聯繫", "我無法判斷"],
}

store_lock = threading.RLock()
store_changed = threading.Condition(store_lock)
store = {
    "state": None,
    "packetLog": [],
    "seenPackets": {},
    "seenMobileEvents": {},
    "lastSeqByRecipient": {},
    "lastSeqByTarget": {},
    "version": 0,
    "connectedClients": {},
    "startedAt": SERVER_STARTED_AT,
}

TARGET_REQUIRED_STATE_KEYS = ("targets", "packetLog", "events", "starryState")


def clone_json(value):
    return json.loads(json.dumps(value, ensure_ascii=False))


def ensure_target_shape(target):
    if not isinstance(target, dict):
        return None
    target.setdefault("id", target.get("targetId") or target.get("recipientId") or target.get("userId"))
    target.setdefault("name", target.get("displayName") or target.get("recipientName") or target.get("id", "Demo target"))
    target.setdefault("role", target.get("role", "general"))
    target.setdefault("age", target.get("age", 0))
    target.setdefault("phoneOnline", True)
    target.setdefault("signalQuality", target.get("lastSignalQuality", 72))
    target.setdefault("battery", target.get("batteryLevel", 72))
    target.setdefault("selectedSymptoms", [])
    target.setdefault(
        "location",
        {
            "lat": None,
            "lng": None,
            "accuracy": "unknown",
            "confirmed": False,
            "source": "UNKNOWN",
            "updatedAt": None,
            "staticMinutes": 0,
        },
    )
    target.setdefault(
        "medical",
        {
            "chronicNote": target.get("chronicNote", "無特殊"),
            "heartRate": target.get("heartRate"),
            "spo2": target.get("spo2"),
            "discomfort": False,
            "injury": False,
            "cannotMove": False,
            "breathingDifficulty": False,
            "trapped": False,
            "hypothermia": False,
        },
    )
    target.setdefault(
        "communication",
        {
            "primaryRoute": "WIFI",
            "fallbackRoute": "LTE",
            "packetSeq": 0,
            "packetBytes": 0,
            "ackStatus": "pending",
            "retryCount": 0,
            "lastAckAt": None,
            "ackPendingSince": None,
            "packetSuccessRate": 0,
            "averageLatencyMs": 0,
            "packetLossRate": 0,
            "lowDataMode": False,
            "satelliteRecommended": False,
            "channelScores": [],
        },
    )
    target.setdefault("risk", {"score": 0, "rawRiskScore": 0, "displayRiskScore": 0, "level": "GREEN", "reason": [], "items": []})
    target.setdefault("workflow", {"status": "unhandled", "priority": "normal", "notes": [], "updatedAt": None})
    target.setdefault("lastUpdatedAt", target.get("lastAckAt"))
    ensure_recipient_profile(target)
    return target


def migrate_state_to_targets(state):
    if not isinstance(state, dict):
        return state
    if not isinstance(state.get("targets"), list) or not state.get("targets"):
        legacy_targets = state.get("recipients")
        if not legacy_targets:
            legacy_targets = state.get("event", {}).get("recipients")
        if isinstance(legacy_targets, list):
            state["targets"] = [clone_json(item) for item in legacy_targets if isinstance(item, dict)]
    state["targets"] = [target for target in (ensure_target_shape(item) for item in state.get("targets", [])) if target and target.get("id")]
    state.pop("recipients", None)
    if isinstance(state.get("event"), dict):
        event = state["event"]
        if not isinstance(event.get("targets"), list) and isinstance(event.get("recipients"), list):
            event["targets"] = [clone_json(item) for item in event.get("recipients", [])]
        event.pop("recipients", None)
    state.setdefault("packetLog", [])
    state.setdefault("events", [])
    state.setdefault("starryState", {})
    state.setdefault("revision", store.get("version", 0))
    state.setdefault("updatedAt", utc_now())
    return state


def state_targets(state):
    migrate_state_to_targets(state)
    return state.get("targets", []) if isinstance(state, dict) else []


def target_id_from_body(body):
    return body.get("targetId") or body.get("recipientId") or body.get("r") or body.get("userId")


def find_target(state, target_id):
    return next((item for item in state_targets(state) if item.get("id") == target_id), None)


def sync_state_runtime_lists(state):
    if not isinstance(state, dict):
        return
    migrate_state_to_targets(state)
    state["packetLog"] = store["packetLog"][:80]
    state.setdefault("events", [])
    state.setdefault("starryState", {})
    state["serverUpdatedAt"] = utc_now()
    state["revision"] = store["version"]


def append_state_event(state, target_id, title, detail, kind="server", sequence=None, risk_score=None):
    if not isinstance(state, dict):
        return
    events = state.setdefault("events", [])
    events.insert(
        0,
        {
            "id": f"srv-{int(time.time() * 1000)}-{len(events) + 1}",
            "targetId": target_id or "system",
            "kind": kind,
            "title": title,
            "detail": detail,
            "seq": sequence,
            "packetSeq": sequence,
            "riskScore": risk_score,
            "timestamp": utc_now(),
        },
    )
    del events[80:]


def state_summary(state):
    targets = state_targets(state)
    high = [target for target in targets if str(target.get("risk", {}).get("level", "")).upper() in {"RED", "ORANGE"}]
    return {
        "targetCount": len(targets),
        "highRiskCount": len(high),
        "packetLogCount": len(state.get("packetLog", [])),
        "eventCount": len(state.get("events", [])),
        "starryState": state.get("starryState", {}),
    }


def iso_ms(value):
    if not value:
        return 0
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() * 1000
    except Exception:
        try:
            return float(value)
        except Exception:
            return 0


def target_freshness(target):
    communication = target.get("communication", {})
    return max(
        iso_ms(target.get("lastUpdatedAt")),
        iso_ms(target.get("updatedAt")),
        iso_ms(communication.get("lastAckAt")),
        float(communication.get("packetSeq") or 0),
    )


def merge_unique_by_id(existing, incoming, limit=80):
    seen = set()
    merged = []
    for item in list(incoming or []) + list(existing or []):
        key = item.get("id") if isinstance(item, dict) else None
        if not key:
            key = json.dumps(item, ensure_ascii=False, sort_keys=True)[:160]
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged[:limit]


def merge_state_from_client(incoming_state, reason="state-merge"):
    incoming = clone_json(incoming_state or {})
    migrate_state_to_targets(incoming)
    if not store["state"]:
        store["state"] = incoming
        ensure_state_defaults(store["state"])
        append_state_event(store["state"], "system", "Server state initialized", f"/api/state 初始化：{reason}", "server")
        return

    current = store["state"]
    ensure_state_defaults(current)
    current_revision = int(current.get("revision") or store.get("version") or 0)
    incoming_revision = int(incoming.get("revision") or 0)
    if incoming.get("app"):
        current["app"] = incoming.get("app")
    current.setdefault("activeTargetId", incoming.get("activeTargetId") or "U-DEMO")
    current.setdefault("selectedTargetId", incoming.get("selectedTargetId") or current.get("activeTargetId"))

    if incoming_revision >= current_revision:
        incoming_event = incoming.get("event")
        if isinstance(incoming_event, dict):
            current_event = current.setdefault("event", {})
            for key, value in incoming_event.items():
                if key == "network" and isinstance(value, dict):
                    current_event.setdefault("network", {}).update(value)
                elif key == "script" and isinstance(value, dict):
                    current_event.setdefault("script", {}).update(value)
                elif key != "targets":
                    current_event[key] = value
    else:
        append_state_event(current, "system", "Stale state merge", f"/api/state base revision {incoming_revision} < server {current_revision}，只合併較新的 target。", "server")

    current_by_id = {target.get("id"): target for target in state_targets(current)}
    for incoming_target in state_targets(incoming):
        target_id = incoming_target.get("id")
        if not target_id:
            continue
        if target_id not in current_by_id:
            current_by_id[target_id] = incoming_target
            current["targets"].append(incoming_target)
            continue
        if target_freshness(incoming_target) >= target_freshness(current_by_id[target_id]):
            current_by_id[target_id].update(incoming_target)

    current["events"] = merge_unique_by_id(current.get("events", []), incoming.get("events", []), 80)
    if incoming.get("starryState") and incoming_revision >= current_revision:
        current["starryState"] = incoming.get("starryState")
    current["updatedAt"] = utc_now()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def load_store():
    if not STATE_FILE.exists():
        return
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return
    with store_lock:
        store["state"] = data.get("state")
        if store["state"]:
            ensure_state_defaults(store["state"])
        store["packetLog"] = data.get("packetLog", [])
        store["seenPackets"] = data.get("seenPackets", {})
        store["seenMobileEvents"] = data.get("seenMobileEvents", {})
        store["lastSeqByRecipient"] = data.get("lastSeqByRecipient", {})
        store["lastSeqByTarget"] = data.get("lastSeqByTarget", data.get("lastSeqByRecipient", {}))
        store["version"] = int(data.get("version", 0))
        if store["state"]:
            sync_state_runtime_lists(store["state"])


def persist_store():
    payload = {
        "state": store["state"],
        "packetLog": store["packetLog"][:80],
        "seenPackets": store["seenPackets"],
        "seenMobileEvents": store["seenMobileEvents"],
        "lastSeqByRecipient": store["lastSeqByRecipient"],
        "lastSeqByTarget": store["lastSeqByTarget"],
        "version": store["version"],
        "savedAt": utc_now(),
    }
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        # Serverless file systems can be read-only outside /tmp. The in-memory
        # store still drives the current warm instance, and polling keeps clients
        # honest about the active server revision.
        pass


def bump_version():
    store["version"] += 1
    if store["state"]:
        sync_state_runtime_lists(store["state"])
    persist_store()
    store_changed.notify_all()


def public_state():
    with store_lock:
        if store["state"]:
            sync_state_runtime_lists(store["state"])
        return {
            "state": store["state"],
            "packetLog": store["packetLog"][:40],
            "version": store["version"],
            "connectedClients": len(store["connectedClients"]),
            "startedAt": store["startedAt"],
            "savedAt": utc_now(),
        }


def client_id(handler):
    host, port = handler.client_address
    return f"{host}:{port}"


def remember_client(handler, kind):
    with store_lock:
        store["connectedClients"][client_id(handler)] = {"kind": kind, "seenAt": utc_now()}
        stale_cutoff = time.time() - 45
        for key, value in list(store["connectedClients"].items()):
            try:
                seen_ts = datetime.fromisoformat(value["seenAt"]).timestamp()
            except Exception:
                seen_ts = time.time()
            if seen_ts < stale_cutoff:
                store["connectedClients"].pop(key, None)


def decode_packet(packet):
    parts = str(packet).split("|")
    if len(parts) != 8 or parts[0] != "XY1":
        raise ValueError("invalid packet format")
    _, event_id, recipient_id, sequence, response_code, sent_at, mode, retry = parts
    if response_code not in RESPONSE_LABELS:
        raise ValueError("unknown response code")
    return {
        "protocol": "XY1",
        "eventId": event_id,
        "recipientId": recipient_id,
        "sequence": int(sequence),
        "responseCode": response_code,
        "responseKey": RESPONSE_KEYS[response_code],
        "responseLabel": RESPONSE_LABELS[response_code],
        "sentAt": int(sent_at),
        "mode": mode,
        "retry": int(retry),
    }


def append_timeline(state, title, description, channel, recipient, status, entry_type="packet"):
    timeline = state.setdefault("timeline", [])
    timeline.insert(
        0,
        {
            "time": datetime.now().strftime("%H:%M"),
            "type": entry_type,
            "title": title,
            "description": description,
            "channel": channel,
            "recipient": recipient,
            "status": status,
        },
    )
    del timeline[12:]


def text_bytes(text):
    return len(str(text or "").encode("utf-8"))


def next_message_id(thread):
    return f"msg-{int(time.time() * 1000)}-{len(thread.get('messages', [])) + 1}"


def ensure_recipient_profile(recipient):
    device = recipient.get("deviceProfile") or {}
    role = recipient.get("role", "recipient")
    suffix_seed = "".join(ch for ch in str(recipient.get("id", "")) if ch.isdigit())[-3:] or {
        "elder": "186",
        "parent": "238",
        "child": "512",
        "neighbor": "705",
        "community_guardian": "119",
        "responder": "767",
        "admin": "550",
    }.get(role, "320")
    suffix = suffix_seed.zfill(3)
    guardian_suffix = str((int(suffix) + 17) % 1000).zfill(3)
    can_use_voice = bool(recipient.get("canUseVoice", device.get("featurePhone") or device.get("fixedLine")))
    can_use_text = bool(recipient.get("canUseText", device.get("featurePhone") or device.get("smartphone", True)))
    preferred = recipient.get("preferredChannels") or []
    guardian_missing = recipient.get("guardianPhoneMasked") == "" or recipient.get("id") in {"m-patient", "d-2"}
    recipient.setdefault("displayName", f"{recipient.get('name', recipient.get('id'))}（長者）" if role == "elder" else recipient.get("name", recipient.get("id")))
    recipient.setdefault("preferredLanguage", "zh-Hant")
    recipient.setdefault("elderFriendly", role == "elder")
    recipient["canUseVoice"] = can_use_voice
    recipient["canUseText"] = can_use_text
    recipient.setdefault("phoneMasked", f"09xx-xxx-{suffix}")
    recipient.setdefault("guardianName", "" if guardian_missing else ("指定守護者" if role == "elder" else "家庭聯絡人"))
    recipient.setdefault("guardianPhoneMasked", "" if guardian_missing else f"09xx-xxx-{guardian_suffix}")
    recipient.setdefault("communityHelperName", recipient.get("name") if role == "community_guardian" else "社區守望者")
    recipient.setdefault("communityHelperDistanceKm", 1.2 if role == "elder" else 2.4)
    recipient.setdefault("emergencyNote", "demo profile，通訊資料需於正式服務中另行驗證。")
    recipient.setdefault("lastKnownLocation", "新北市板橋區某社區 A 棟 5 樓" if role == "elder" else "demo 聯絡地址待確認")
    recipient.setdefault("communicationProfileUpdatedAt", "2026-06-29T20:00:00+08:00")
    recipient["communicationProfileComplete"] = bool(
        recipient.get("communicationProfileComplete", bool(preferred and can_use_text and recipient.get("phoneMasked") and recipient.get("guardianPhoneMasked")))
    )


def ensure_state_defaults(state):
    if not state:
        return
    migrate_state_to_targets(state)
    for target in state.get("targets", []):
        ensure_target_shape(target)
    for target in state.get("event", {}).get("targets", []):
        ensure_target_shape(target)
    conversations = state.get("conversations")
    if not isinstance(conversations, dict):
        conversations = {}
        state["conversations"] = conversations
    triage_flows = state.get("triageFlows")
    if not isinstance(triage_flows, dict):
        state["triageFlows"] = {}
    state.setdefault("activeConversationRecipientId", state.get("activeRecipientId"))
    state.setdefault("lastSeqByTarget", state.get("lastSeqByRecipient", {}))
    state.setdefault("locationUpdates", {})
    state.setdefault("locationPreference", {})
    state.setdefault("mobileAlertReceipts", {})


def quick_reply_set_for(action_code, text=""):
    message = str(text or "")
    if action_code == "LOCATION_ANOMALY" or "位置" in message or "在哪" in message:
        return QUICK_REPLY_SETS["location"]
    if "有人" in message or "一個人" in message:
        return QUICK_REPLY_SETS["nearby"]
    if action_code == "NEED_MEDICAL":
        return QUICK_REPLY_SETS["medical"]
    return QUICK_REPLY_SETS["general"]


def compact_json(payload):
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def question_ids(flow_id):
    return [question["id"] for question in TRIAGE_FLOWS.get(flow_id, {}).get("questions", [])]


def first_question_id(flow_id):
    ids = question_ids(flow_id)
    return ids[0] if ids else None


def question_by_id(flow_id, question_id):
    for question in TRIAGE_FLOWS.get(flow_id, {}).get("questions", []):
        if question.get("id") == question_id:
            return question
    return None


def answer_by_code(flow_id, question_id, answer_code):
    question = question_by_id(flow_id, question_id)
    if not question:
        return None
    for answer in question.get("answers", []):
        if answer.get("code") == answer_code:
            return answer
    return None


def current_question_payload(flow):
    flow_id = flow.get("flowId")
    question = question_by_id(flow_id, flow.get("currentQuestionId"))
    if not question or flow.get("flowComplete"):
        return None
    ids = question_ids(flow_id)
    index = ids.index(question["id"]) + 1 if question["id"] in ids else 1
    return {
        "flowId": flow_id,
        "title": TRIAGE_FLOWS[flow_id]["title"],
        "questionId": question["id"],
        "text": question["text"],
        "index": index,
        "total": len(ids),
        "answers": [
            {
                "code": answer["code"],
                "label": answer["label"],
                "riskDelta": answer.get("riskDelta", 0),
                "nextActionHint": answer.get("nextActionHint"),
            }
            for answer in question.get("answers", [])
        ],
    }


def compact_question_packet(recipient_id, flow, sequence):
    compact = {
        "r": recipient_id,
        "f": flow.get("flowId"),
        "q": flow.get("currentQuestionId"),
        "t": int(time.time()),
        "seq": sequence,
    }
    packet = compact_json(compact)
    return packet, compact, len(packet.encode("utf-8"))


def compact_triage_answer_packet(recipient_id, action_code, question_id, answer_code, sequence, dedupe_key):
    compact = {
        "r": recipient_id,
        "a": action_code,
        "q": question_id,
        "ans": answer_code,
        "t": int(time.time()),
        "d": dedupe_key,
        "seq": sequence,
    }
    packet = compact_json(compact)
    return packet, compact, len(packet.encode("utf-8"))


def compact_location_packet(body, sequence, dedupe_key):
    compact = {
        "r": body.get("recipientId") or body.get("r"),
        "type": "LOCATION_UPDATE",
        "source": body.get("source", "UNKNOWN"),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "accuracy": body.get("accuracy"),
        "t": int(time.time()),
        "seq": sequence,
        "d": dedupe_key,
    }
    packet = compact_json({key: value for key, value in compact.items() if value is not None})
    return packet, compact, len(packet.encode("utf-8"))


def risk_tier(score):
    if score >= 80:
        return "緊急優先"
    if score >= 60:
        return "高風險"
    if score >= 30:
        return "中風險"
    return "低風險"


def calculate_triage_risk(state, recipient, flow, location=None, ack_missing=False):
    action_code = flow.get("actionCode") or flow.get("flowId") or recipient.get("lastAction") or "SAFE_OK"
    base = BASE_RISK.get(action_code, 30)
    modifiers = []

    def add(reason, delta):
        if delta:
            modifiers.append({"reason": reason, "delta": delta})

    network = state.get("network", {})
    location = location or state.get("simulatedLocation") or {}
    add("災害模式", 10 if network.get("disasterMode") else 0)
    add("弱網", 5 if network.get("bandwidthKbps", 999) < 64 or network.get("latencyMs", 0) > 900 else 0)
    add("ACK 未收到", 15 if ack_missing else 0)
    add("無法通話", 10 if action_code == "CANNOT_TALK" else 0)
    add("連續未回覆", min(40, int(flow.get("unansweredCount") or 0) * 20))
    if location.get("simulated") and (not location.get("sameLan") or location.get("accuracyMeters", 0) > 240):
        add("同網路模擬定位可信度低", 10)

    answers = flow.get("answers", [])
    answer_codes = {answer.get("answerCode") for answer in answers}
    for answer in answers:
        label = answer.get("label") or answer.get("answerCode")
        add(f"按鍵回覆：{label}", int(answer.get("riskDelta") or 0))
    if answer_codes & {"MED_ALONE", "HELP_ALONE", "TALK_ALONE"}:
        add("獨自一人", 10)
    if answer_codes & {"LOC_UNKNOWN", "LOC_UNFAMILIAR"}:
        add("位置不確定", 10)
    if "MED_PLACE_UNSAFE" in answer_codes:
        add("目前位置不安全", 10)
    if answer_codes & {"MED_NEED_CONTACT_NOW", "LOC_NEED_GUARDIAN"}:
        add("要求立即聯繫", 5)
    if answer_codes & {"SAFE_DONE", "MED_PLACE_SAFE", "LOC_FAMILIAR", "HELP_WITH_PERSON", "MED_WITH_PERSON", "TALK_HELPER_NEAR"}:
        add("已安全確認或有人協助", -15 if "SAFE_DONE" in answer_codes else -5)

    final_score = max(0, min(100, base + sum(item["delta"] for item in modifiers)))
    if action_code == "NEED_MEDICAL" and "SAFE_DONE" not in answer_codes:
        final_score = max(final_score, 75)
    if action_code == "NEED_MEDICAL" and answer_codes & {"MED_REPLY_HARD", "MED_REPLY_UNSURE", "MED_ALONE", "MED_PLACE_UNSAFE", "MED_NEED_CONTACT_NOW"}:
        final_score = max(final_score, 85)
    return {
        "baseScore": base,
        "modifiers": modifiers,
        "finalScore": final_score,
        "tier": risk_tier(final_score),
        "reasons": [f"{action_code} base {base}"] + [f"{item['reason']} {item['delta']:+d}" for item in modifiers],
        "lastDelta": int(answers[-1].get("riskDelta") or 0) if answers else 0,
    }


def operator_recommendation(action_code, risk, flow, location=None):
    answer_codes = {answer.get("answerCode") for answer in flow.get("answers", [])}
    if action_code == "SAFE_OK" and "SAFE_DONE" in answer_codes:
        return "記錄平安 ACK，不進入高優先待處理。"
    if "SAFE_TO_HELP" in answer_codes:
        return "SAFE_OK 已升級 NEED_HELP，請建立需要協助追蹤。"
    if {"MED_ALONE", "MED_REPLY_HARD"} <= answer_codes:
        return "需要醫療 + 獨自一人 + 回覆困難：建議優先人工聯繫與守護者確認。"
    if answer_codes & {"MED_REPLY_HARD", "MED_REPLY_UNSURE"}:
        return "長者回覆困難：建議立即守護者確認，並持續低資料按鍵確認。"
    if "MED_ALONE" in answer_codes:
        return "長者回覆我一個人：建議優先人工聯繫指定守護者。"
    if "LOC_UNKNOWN" in answer_codes:
        return "位置不確定：建議人工確認位置，並標示同網路定位為非真實 GPS。"
    if action_code == "CANNOT_TALK":
        return "優先 LOW_DATA_TEXT / SMS_SIMULATED / 後台人工追蹤，不以 Voice IVR 作唯一主要方式。"
    if action_code == "LOCATION_ANOMALY":
        return "同網路推測定位僅供 demo，建議人工確認位置與最近協助者。"
    if risk["finalScore"] >= 80:
        return "緊急優先：守護指揮中心人工檢視，並模擬聯繫指定守護者。"
    if risk["finalScore"] >= 60:
        return "高風險：持續低資料按鍵確認並保留人工追蹤。"
    return "持續 ACK 追蹤並等待下一題回覆。"


def ensure_triage_flow(state, recipient_id, action_code, location=None, reset=False):
    ensure_state_defaults(state)
    if action_code not in TRIAGE_FLOWS:
        action_code = "NEED_MEDICAL" if action_code in {"INJURED", "DISCOMFORT"} else "NEED_HELP" if action_code in {"SOS_BUTTON", "TRAPPED"} else "SAFE_OK"
    flows = state.setdefault("triageFlows", {})
    existing = flows.get(recipient_id)
    if existing and not reset and existing.get("flowId") == action_code and not existing.get("flowComplete"):
        return existing
    flow = {
        "recipientId": recipient_id,
        "flowId": action_code,
        "actionCode": action_code,
        "title": TRIAGE_FLOWS[action_code]["title"],
        "currentQuestionId": first_question_id(action_code),
        "completedQuestionIds": [],
        "lastAnswerCode": None,
        "lastAnswerLabel": None,
        "answers": [],
        "unansweredCount": 0,
        "flowComplete": False,
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
        "timeline": [],
    }
    flow["currentQuestion"] = current_question_payload(flow)
    flow["risk"] = calculate_triage_risk(state, find_target(state, recipient_id) or {}, flow, location)
    flow["recommendedOperatorAction"] = operator_recommendation(action_code, flow["risk"], flow, location)
    flows[recipient_id] = flow
    return flow


def refresh_triage_flow(state, recipient, flow, location=None, ack_missing=False):
    flow["updatedAt"] = utc_now()
    flow["currentQuestion"] = current_question_payload(flow)
    flow["risk"] = calculate_triage_risk(state, recipient, flow, location, ack_missing=ack_missing)
    flow["recommendedOperatorAction"] = operator_recommendation(flow.get("actionCode"), flow["risk"], flow, location)
    recipient["riskScore"] = flow["risk"]["finalScore"]
    recipient["riskTier"] = flow["risk"]["tier"]
    recipient["riskReasons"] = flow["risk"]["reasons"]
    recipient["recentRiskDelta"] = flow["risk"]["lastDelta"]
    ids = set(question_ids(flow.get("flowId")))
    completed_count = len([item for item in flow.get("completedQuestionIds", []) if item in ids])
    recipient["triageStatus"] = f"{completed_count}/{len(ids)}"
    recipient["latestAnswer"] = flow.get("lastAnswerLabel")
    recipient["manualRecommendation"] = flow["recommendedOperatorAction"]
    return flow


def ensure_conversation_thread(state, recipient_id, action_code=None, severity=None):
    ensure_state_defaults(state)
    conversations = state.setdefault("conversations", {})
    recipient = find_target(state, recipient_id) or {}
    thread = conversations.get(recipient_id)
    if not thread:
        thread = {
            "conversationId": f"cv-{recipient_id}",
            "recipientId": recipient_id,
            "recipientName": recipient.get("name", recipient_id),
            "currentAction": action_code,
            "currentActionLabel": ACTION_DEFINITIONS.get(action_code, {}).get("label"),
            "severity": severity or ACTION_DEFINITIONS.get(action_code, {}).get("severity", 1),
            "status": "active",
            "lastMessageAt": None,
            "ackStatus": recipient.get("ackStatus", "pending"),
            "elderResponded": False,
            "lastReplyFromElderAt": None,
            "lastQuickReply": None,
            "unansweredOperatorMessages": 0,
            "safetyConfirmed": False,
            "unableToRespond": False,
            "quickReplies": quick_reply_set_for(action_code),
            "messages": [],
        }
        conversations[recipient_id] = thread
    if action_code:
        definition = ACTION_DEFINITIONS[action_code]
        thread["currentAction"] = action_code
        thread["currentActionLabel"] = definition["label"]
        thread["severity"] = severity or definition["severity"]
        thread["quickReplies"] = quick_reply_set_for(action_code)
    thread["recipientName"] = recipient.get("name", thread.get("recipientName", recipient_id))
    thread["ackStatus"] = recipient.get("ackStatus", thread.get("ackStatus", "pending"))
    state["activeConversationRecipientId"] = recipient_id
    return thread


def append_conversation_message(thread, *, msg_type, sender, sender_role, text, channel, delivery_status="serverAck", system_generated=False):
    timestamp = utc_now()
    message = {
        "id": next_message_id(thread),
        "type": msg_type,
        "sender": sender,
        "senderRole": sender_role,
        "text": text,
        "timestamp": timestamp,
        "deliveryStatus": delivery_status,
        "packetBytes": text_bytes(text),
        "channel": channel,
        "systemGenerated": system_generated,
    }
    thread.setdefault("messages", []).append(message)
    del thread["messages"][:-80]
    thread["lastMessageAt"] = timestamp
    return message


def packet_log_entry(
    log_type,
    recipient_id,
    recipient_label,
    content,
    channel,
    *,
    ack="serverAck OK",
    packet=None,
    bytes_len=None,
    dedupe_status="accepted",
    sequence=None,
    action_code=None,
    question_id=None,
    answer_code=None,
    risk_change=None,
    ok=True,
):
    timestamp = utc_now()
    packet_payload = packet or json.dumps(
        {"type": log_type, "recipientId": recipient_id, "content": content, "channel": channel, "ts": timestamp},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return {
        "serverAck": {
            "ok": ok,
            "ackId": f"ack-{int(time.time() * 1000)}-{recipient_id}-{sequence or 0}",
            "duplicate": dedupe_status == "duplicate",
            "dedupeStatus": dedupe_status,
            "message": ack,
            "receivedAt": timestamp,
            "serverTimestamp": timestamp,
            "sequence": sequence,
            "seq": sequence,
            "action": log_type,
            "receivedAction": action_code or log_type,
            "recipientId": recipient_id,
            "targetId": recipient_id,
        },
        "packet": packet_payload,
        "bytes": text_bytes(packet_payload if bytes_len is None else "x" * int(bytes_len)),
        "targetId": recipient_id,
        "packetSeq": sequence,
        "riskScore": risk_change,
        "decodeResult": {
            "logType": log_type,
            "recipientId": recipient_id,
            "targetId": recipient_id,
            "recipientName": recipient_label,
            "targetName": recipient_label,
            "content": content,
            "channel": channel,
            "ack": ack,
            "dedupeStatus": dedupe_status,
            "actionCode": action_code,
            "questionId": question_id,
            "answerCode": answer_code,
            "riskChange": risk_change,
            "riskScore": risk_change,
            "packetSeq": sequence,
            "seq": sequence,
            "q": question_id or sequence,
            "timestamp": timestamp,
        },
    }


def append_packet_log(log_type, recipient_id, recipient_label, content, channel, **kwargs):
    if kwargs.get("risk_change") is None and store.get("state"):
        target = find_target(store["state"], recipient_id)
        if target:
            kwargs["risk_change"] = target.get("risk", {}).get("displayRiskScore", target.get("riskScore"))
    response = packet_log_entry(log_type, recipient_id, recipient_label, content, channel, **kwargs)
    store["packetLog"].insert(0, response)
    del store["packetLog"][80:]
    return response


def append_server_ack_log(response):
    ack = response.get("serverAck") or {}
    decoded = response.get("decodeResult") or {}
    recipient_id = ack.get("recipientId") or decoded.get("recipientId") or "command-center"
    recipient_label = decoded.get("recipientName") or recipient_id
    action = ack.get("receivedAction") or ack.get("action") or decoded.get("logType") or "SERVER_ACK"
    return append_packet_log(
        "SERVER_ACK",
        recipient_id,
        recipient_label,
        ack.get("message") or "serverAck OK",
        "SERVER",
        bytes_len=0,
        sequence=ack.get("seq") or ack.get("sequence") or decoded.get("seq"),
        action_code=action,
        dedupe_status=ack.get("dedupeStatus") or decoded.get("dedupeStatus") or "accepted",
    )


def recipient_name(state, recipient_id):
    for recipient in state_targets(state):
        if recipient.get("id") == recipient_id:
            return recipient.get("name", recipient_id)
    return recipient_id


def sync_event_recipient_state(state, recipient_id, source):
    event_targets = state.get("event", {}).get("targets", [])
    for recipient in event_targets:
        if recipient.get("id") != recipient_id:
            continue
        recipient.update(
            {
                "ackStatus": source.get("ackStatus"),
                "response": source.get("response"),
                "lastAction": source.get("lastAction"),
                "actionLabel": source.get("actionLabel"),
                "actionSeverity": source.get("actionSeverity"),
                "mobileReassurance": source.get("mobileReassurance"),
                "lastPacketSequence": source.get("lastPacketSequence"),
                "lastPacketMode": source.get("lastPacketMode"),
                "lastAckAt": source.get("lastAckAt"),
                "lastChannel": source.get("lastChannel"),
                "manualRecommendation": source.get("manualRecommendation"),
                "priority": source.get("priority"),
                "safetyStatus": source.get("safetyStatus"),
                "lastQuickReply": source.get("lastQuickReply"),
                "riskScore": source.get("riskScore"),
                "riskTier": source.get("riskTier"),
                "riskReasons": source.get("riskReasons"),
                "recentRiskDelta": source.get("recentRiskDelta"),
                "triageStatus": source.get("triageStatus"),
                "latestAnswer": source.get("latestAnswer"),
                "locationSnapshot": source.get("locationSnapshot"),
                "communicationProfileComplete": source.get("communicationProfileComplete"),
                "guardianPhoneMasked": source.get("guardianPhoneMasked"),
            }
        )
        break


def action_for_response_code(response_code):
    for code, definition in ACTION_DEFINITIONS.items():
        if definition["responseCode"] == response_code:
            return code
    return "SAFE_OK"


def same_subnet(ip_a, ip_b):
    a_parts = str(ip_a).split(".")
    b_parts = str(ip_b).split(".")
    return len(a_parts) == 4 and len(b_parts) == 4 and a_parts[:3] == b_parts[:3]


def simulated_location_for(handler):
    remote_ip = handler.client_address[0]
    lan_ip = local_ip()
    same_lan = remote_ip in {"127.0.0.1", "::1"} or same_subnet(remote_ip, lan_ip)
    return {
        "simulated": True,
        "method": "同 Wi-Fi / LAN 推估",
        "sameLan": same_lan,
        "remoteIp": remote_ip,
        "lanIp": lan_ip,
        "status": "同網路內" if same_lan else "不同網段或未確認",
        "areaName": "新北市板橋區",
        "buildingName": "某社區 A 棟",
        "floor": "5 樓",
        "coordinates": "demo fixed coordinates",
        "accuracyMeters": 180 if same_lan else 300,
        "nearestHelper": "社區守望者",
        "distanceToHelperKm": 1.2 if same_lan else 1.8,
        "etaMinutes": 6 if same_lan else 10,
        "note": "此為同網路推測定位，非真實 GPS 定位。",
    }


def compact_mobile_packet(event_id, recipient_id, action_code, definition, sequence, dedupe_key):
    compact = {
        "r": recipient_id,
        "a": action_code,
        "s": definition["severity"],
        "t": int(time.time()),
        "d": dedupe_key,
        "seq": sequence,
    }
    packet = compact_json(compact)
    return packet, compact, len(packet.encode("utf-8"))


def mobile_route_decision(action_code, definition, state, recipient, location):
    network = state.get("network", {})
    weak = network.get("disasterMode") or network.get("bandwidthKbps", 999) < 64 or network.get("latencyMs", 0) > 900
    can_use_voice = recipient.get("canUseVoice") is not False
    can_use_text = recipient.get("canUseText") is not False
    comm_complete = bool(recipient.get("communicationProfileComplete"))
    primary = "SMS" if weak or definition["severity"] >= 3 else "App Push"
    if weak and can_use_text:
        primary = "SMS / LOW_DATA_TEXT"
    if action_code == "CANNOT_TALK":
        primary = "LOW_DATA_TEXT" if can_use_text else "Manual Follow-up"
        backup = ["SMS_SIMULATED", "Manual Follow-up"]
    elif action_code == "NEED_MEDICAL":
        primary = "SMS / LOW_DATA_TEXT" if can_use_text else "Manual Follow-up"
        backup = ["Manual Call", "Guardian Notify", "Satellite Relay"]
    elif action_code == "LOCATION_ANOMALY":
        primary = "SMS / LOW_DATA_TEXT" if can_use_text else "Manual Follow-up"
        backup = ["Manual Call", "Location Check"]
    elif action_code == "SAFE_OK":
        backup = ["SMS"] if primary == "App Push" else ["App Push"]
    else:
        backup = ["Voice IVR", "Manual Call", "Satellite Relay"] if action_code == "NEED_HELP" else ["Manual Call"]
    if action_code == "CANNOT_TALK" or not can_use_voice:
        backup = [item for item in backup if item != "Voice IVR"]
    scoring_matrix = backend_scoring_matrix(action_code, definition, state, recipient, location, weak)
    base_score = definition["severity"] * 15
    total_delta = sum(row["scoreDelta"] for row in scoring_matrix if row["factor"] != "事件類型")
    risk = min(100, max(0, base_score + total_delta))
    if action_code == "SAFE_OK":
        risk = min(risk, 29)
    tier = risk_tier(risk)
    communication_warnings = []
    if not comm_complete:
        communication_warnings.append("守護者或首選通道資料待確認。")
    if not can_use_voice:
        communication_warnings.append("不可通話，Voice IVR 不可作為唯一主要方式。")
    if action_code == "NEED_MEDICAL" and not recipient.get("guardianPhoneMasked"):
        communication_warnings.append("NEED_MEDICAL 但缺守護者通訊資料，建議人工確認。")
    communication_warnings.append("此 demo 未連接真實 SMS、119、醫療或推播服務。")
    location_warnings = location_warning_texts(location, action_code)
    return {
        "primaryChannel": primary,
        "backupChannels": backup,
        "riskScore": risk,
        "finalRiskScore": risk,
        "riskTier": tier,
        "baseScore": base_score,
        "totalDelta": total_delta,
        "scoringMatrix": scoring_matrix,
        "escalationRequired": definition["needsTriage"] or risk >= 60,
        "decisionReason": f"{definition['label']}，SEV-{definition['severity']}，弱網={bool(weak)}，主通道 {primary}，備援 {', '.join(backup) or '無'}。",
        "ackPlan": "低資料 ACK + serverAck；若逾時未回覆則升級。" if definition["needsTriage"] else "記錄平安 ACK，維持監測。",
        "recommendedAction": dispatch_suggestion(action_code, location),
        "dispatchSuggestion": dispatch_suggestion(action_code, location),
        "nextActions": next_actions(action_code, location),
        "communicationWarnings": communication_warnings,
        "locationWarnings": location_warnings,
    }


def backend_scoring_matrix(action_code, definition, state, recipient, location, weak):
    network = state.get("network", {})
    retry_count = int(recipient.get("fallbackAttempts") or 0)
    ack_status = recipient.get("ackStatus", "pending")
    gps_accuracy = location.get("accuracy") or location.get("accuracyMeters")
    source = location.get("source") or ("GPS" if location.get("lat") and location.get("lng") else "SAME_LAN_SIMULATED" if location.get("sameLan") else "DEMO_FALLBACK")
    rows = [
        {"factor": "事件類型", "currentValue": action_code, "scoreDelta": definition["severity"] * 15, "reason": f"{definition['label']} 基礎風險", "confidence": "high"},
        {"factor": "事件嚴重度", "currentValue": f"SEV-{definition['severity']}", "scoreDelta": 10 if definition["severity"] >= 5 else 6 if definition["severity"] >= 4 else 0, "reason": "高等級事件提高處理優先序", "confidence": "high"},
        {"factor": "災害模式", "currentValue": "開啟" if network.get("disasterMode") else "關閉", "scoreDelta": 10 if network.get("disasterMode") else 0, "reason": "災害模式提高弱網與壅塞風險", "confidence": "high"},
        {"factor": "網路頻寬", "currentValue": f"{network.get('bandwidthKbps')}kbps", "scoreDelta": 5 if network.get("bandwidthKbps", 999) < 64 else 0, "reason": "頻寬低於 64kbps 時偏向 SMS / LOW_DATA_TEXT", "confidence": "high"},
        {"factor": "延遲", "currentValue": f"{network.get('latencyMs')}ms", "scoreDelta": 5 if network.get("latencyMs", 0) > 900 else 0, "reason": "延遲偏高時互動式資料通道可靠度下降", "confidence": "high"},
        {"factor": "封包遺失率", "currentValue": f"{network.get('packetLossPercent')}%", "scoreDelta": 5 if network.get("packetLossPercent", 0) > 18 else 0, "reason": "封包遺失偏高時需依賴 serverAck / retry / dedupe", "confidence": "high"},
        {"factor": "基地台壅塞", "currentValue": f"{network.get('congestionLevel', 0)}%", "scoreDelta": 5 if network.get("congestionLevel", 0) > 70 else 0, "reason": "基地台壅塞會提高通訊失敗風險", "confidence": "medium"},
        {"factor": "ACK 狀態", "currentValue": ack_status, "scoreDelta": -10 if ack_status == "acknowledged" else 8, "reason": "serverAck 狀態影響是否升級", "confidence": "high"},
        {"factor": "是否可通話", "currentValue": "可通話" if recipient.get("canUseVoice") is not False else "不可通話", "scoreDelta": -2 if recipient.get("canUseVoice") is not False else 8, "reason": "不可通話時排除 Voice IVR 作為主通道", "confidence": "high"},
        {"factor": "是否可文字", "currentValue": "可文字" if recipient.get("canUseText") is not False else "不可文字", "scoreDelta": -6 if recipient.get("canUseText") is not False else 10, "reason": "低資料文字可降低弱網風險", "confidence": "high"},
        {"factor": "長者最近回答", "currentValue": recipient.get("latestAnswer") or recipient.get("lastQuickReply") or "尚未回覆", "scoreDelta": 0, "reason": "安全對答會即時重算", "confidence": "medium"},
        {"factor": "是否獨自一人", "currentValue": "我一個人" if recipient.get("lastQuickReply") == "我一個人" or recipient.get("latestAnswer") == "我一個人" else "未回報", "scoreDelta": 25 if recipient.get("lastQuickReply") == "我一個人" or recipient.get("latestAnswer") == "我一個人" else 0, "reason": "缺乏現場協助時提高風險", "confidence": "medium"},
        {"factor": "位置來源", "currentValue": source, "scoreDelta": -8 if source == "GPS" and gps_accuracy and gps_accuracy <= 80 else 4 if location.get("sameLan") else 10, "reason": "GPS 或同網路模擬會影響位置不確定風險", "confidence": "medium"},
        {"factor": "GPS 精準度", "currentValue": f"±{round(gps_accuracy)}m" if gps_accuracy else "無資料", "scoreDelta": -5 if source == "GPS" and gps_accuracy and gps_accuracy <= 50 else 12 if source == "GPS" and gps_accuracy and gps_accuracy > 150 else 0, "reason": "GPS 精準度越低，越需要人工確認", "confidence": "medium"},
        {"factor": "位置是否異常", "currentValue": "異常" if action_code == "LOCATION_ANOMALY" or location.get("isAnomaly") else "未標記", "scoreDelta": 20 if action_code == "LOCATION_ANOMALY" or location.get("isAnomaly") else 0, "reason": "位置異常需人工確認", "confidence": "medium"},
        {"factor": "最近協助者距離", "currentValue": f"{location.get('distanceToHelperKm', 0)}km", "scoreDelta": -4 if location.get("distanceToHelperKm", 9) <= 1.5 else 8 if location.get("distanceToHelperKm", 0) >= 5 else 0, "reason": "協助者距離影響跟進優先序", "confidence": "medium"},
        {"factor": "通訊資料完整度", "currentValue": "完整" if recipient.get("communicationProfileComplete") else "缺漏 / 待確認", "scoreDelta": -5 if recipient.get("communicationProfileComplete") else 12, "reason": "守護者與首選通道資料需可確認", "confidence": "high"},
        {"factor": "未回覆時間", "currentValue": "demo 即時", "scoreDelta": 0, "reason": "此端點收到 mobile action，未回覆時間由後台對話更新", "confidence": "medium"},
        {"factor": "retry 次數", "currentValue": retry_count, "scoreDelta": min(20, retry_count * 5), "reason": "retry 增加代表弱網不穩", "confidence": "high"},
    ]
    return rows


def location_warning_texts(location, action_code):
    source = location.get("source") or ("SAME_LAN_SIMULATED" if location.get("sameLan") else "DEMO_FALLBACK")
    warnings = []
    if source == "GPS":
        warnings.append(f"GPS 定位已取得，精準度約 ±{round(location.get('accuracy') or location.get('accuracyMeters') or 0)} 公尺。")
    if source == "GPS_DENIED":
        warnings.append("使用者未授權 GPS，請以低資料對答確認位置。")
    if location.get("simulated") or source in {"SAME_LAN_SIMULATED", "DEMO_FALLBACK"}:
        warnings.append("此為 demo 推測定位，非真實 GPS。")
    if action_code == "LOCATION_ANOMALY" or location.get("isAnomaly"):
        warnings.append("位置異常已提高人工位置確認優先級。")
    return warnings


def dispatch_suggestion(action_code, location):
    helper = location.get("nearestHelper", "社區守望者")
    eta = location.get("etaMinutes", 6)
    if action_code == "SAFE_OK":
        return "低風險，守護指揮中心記錄平安回覆。"
    if action_code == "NEED_MEDICAL":
        return f"最高優先級：守護指揮中心人工追蹤，並以 demo 模擬通知 {helper}，預估 {eta} 分鐘可聯繫。"
    if action_code == "CANNOT_TALK":
        return "高風險：以 SMS / Low Data Text 為主，人工追蹤時避免要求使用者通話。"
    if action_code == "LOCATION_ANOMALY":
        return "需確認位置；同網路位置僅為模擬推估，非真實 GPS。"
    return f"中高風險：建議通知 {helper} 並持續 ACK 追蹤。"


def next_actions(action_code, location):
    actions = ["記錄 Low Data Packet", "更新手機鏡像畫面"]
    if action_code == "SAFE_OK":
        actions.append("維持監測")
    else:
        actions.extend(["更新需要處理名單", "守護指揮中心追蹤"])
    if action_code == "LOCATION_ANOMALY" or location.get("simulated"):
        actions.append("標示位置為模擬推估，非真實 GPS")
    return actions


def runtime_trace_summary(event_id, recipient_id, sequence, action, dedupe_status, route_decision=None, location=None, log_type=None):
    route_decision = route_decision or {}
    location = location or {}
    duplicate = dedupe_status == "duplicate"
    return {
        "eventId": event_id,
        "recipientId": recipient_id,
        "seq": sequence,
        "message": f"{action} {dedupe_status}",
        "inputSummary": f"action={action}; seq={sequence}; target={recipient_id}",
        "outputSummary": f"{log_type or action}; route={route_decision.get('primaryChannel', '-')}; risk={route_decision.get('riskScore', route_decision.get('finalRiskScore', '-'))}",
        "durationMs": 0,
        "steps": [
            {"step": "Server Validate Action", "status": "ok", "seq": sequence, "eventId": event_id, "message": f"{action} validated"},
            {"step": "Dedupe Check", "status": "warning" if duplicate else "ok", "seq": sequence, "eventId": event_id, "message": dedupe_status},
            {"step": "Normalize Event", "status": "ok", "seq": sequence, "eventId": event_id, "message": "normalized internal event"},
            {"step": "GPS / Location Merge", "status": "warning" if location.get("source") in {"GPS_DENIED", "DEMO_FALLBACK"} else "ok", "seq": sequence, "eventId": event_id, "message": location.get("status") or location.get("source") or "location merged"},
            {"step": "Triage Flow Update", "status": "ok" if action not in {"SAFE_OK", "LOCATION_UPDATE"} else "pending", "seq": sequence, "eventId": event_id, "message": "triage state refreshed" if action != "LOCATION_UPDATE" else "location-only update"},
            {"step": "Risk Matrix Calculate", "status": "ok", "seq": sequence, "eventId": event_id, "message": f"risk {route_decision.get('riskScore', route_decision.get('finalRiskScore', '-'))}"},
            {"step": "routeDecisionEngine Evaluate", "status": "ok", "seq": sequence, "eventId": event_id, "message": route_decision.get("primaryChannel") or "route evaluated"},
            {"step": "SSE Broadcast", "status": "ok", "seq": sequence, "eventId": event_id, "message": "state + demo_state_updated"},
            {"step": "Mobile Mirror Render", "status": "ok", "seq": sequence, "eventId": event_id, "message": "mobile mirror state updated"},
            {"step": "Low Data Packet Log Append", "status": "ok", "seq": sequence, "eventId": event_id, "message": log_type or action},
        ],
        "broadcastEvents": ["state", "demo_state_updated"],
    }


def apply_mobile_event(body, handler):
    state = store.get("state")
    if not state:
        return None, None, False, "no active event"
    ensure_state_defaults(state)
    action_code = body.get("action")
    if action_code not in ACTION_DEFINITIONS:
        raise ValueError("unknown action")
    definition = ACTION_DEFINITIONS[action_code]
    recipient_id = target_id_from_body(body)
    event_id = body.get("eventId") or state.get("event", {}).get("id") or "starrylink-demo"
    state_event_id = state.get("event", {}).get("id")
    if state_event_id and event_id != state_event_id:
        return None, None, False, "event mismatch"
    recipient = find_target(state, recipient_id)
    if not recipient:
        return None, None, False, "recipient not found"

    now_ts = time.time()
    compact_payload = body.get("compactPayload") if isinstance(body.get("compactPayload"), dict) else {}
    sequence = int(body.get("sequence") or body.get("seq") or compact_payload.get("seq") or 0)
    dedupe_key = body.get("dedupeKey") or compact_payload.get("d") or f"{event_id}:{recipient_id}:{action_code}:-:-:{sequence}"
    previous = store["seenMobileEvents"].get(dedupe_key)
    duplicate = bool(
        previous
        and previous.get("sequence") == sequence
        and previous.get("action") == action_code
        and previous.get("recipientId") == recipient_id
    )
    packet, compact, bytes_len = compact_mobile_packet(event_id, recipient_id, action_code, definition, sequence, dedupe_key)
    location = simulated_location_for(handler)
    route_decision = mobile_route_decision(action_code, definition, state, recipient, location)
    thread = ensure_conversation_thread(state, recipient_id, action_code, definition["severity"])
    retry_count = int(compact_payload.get("x") or body.get("retryCount") or 0)

    if not duplicate:
        if retry_count:
            append_packet_log(
                "RETRY_SENT",
                recipient_id,
                recipient_name(state, recipient_id),
                action_code,
                "LOW_DATA_TEXT",
                bytes_len=bytes_len,
                sequence=sequence,
                action_code=action_code,
            )
        previous_risk = int(recipient.get("riskScore") or 0)
        flow = ensure_triage_flow(state, recipient_id, action_code, location, reset=True)
        refresh_triage_flow(state, recipient, flow, location, ack_missing=False)
        response_status = "acknowledged" if not definition["needsTriage"] else "needs_followup"
        recipient["ackStatus"] = response_status
        recipient["response"] = definition["label"]
        recipient["lastAction"] = action_code
        recipient["actionLabel"] = definition["label"]
        recipient["actionSeverity"] = definition["severity"]
        recipient["mobileReassurance"] = definition["reassurance"]
        recipient["lastPacketSequence"] = sequence
        recipient["lastPacketMode"] = "LOW_DATA_JSON"
        recipient["lastAckAt"] = utc_now()
        recipient["lastChannel"] = route_decision["primaryChannel"]
        recipient["manualRecommendation"] = flow["recommendedOperatorAction"]
        recipient["locationSnapshot"] = location
        if definition["severity"] >= 4:
            recipient["priority"] = min(recipient.get("priority", 3), 1)
        if action_code == "NEED_MEDICAL":
            recipient["priority"] = 0
        sync_event_recipient_state(state, recipient_id, recipient)
        state["event"]["status"] = "waiting_ack" if action_code == "SAFE_OK" else "escalating"
        state["mobileMirrorState"] = {
            "recipientId": recipient_id,
            "action": action_code,
            "actionLabel": definition["label"],
            "severity": definition["severity"],
            "status": definition["status"],
            "reassurance": definition["reassurance"],
            "routeHint": definition["routeHint"],
            "backendMessage": None,
            "quickReplies": thread.get("quickReplies", QUICK_REPLY_SETS["general"]),
            "triageFlow": flow,
            "currentQuestion": flow.get("currentQuestion"),
            "risk": flow.get("risk"),
            "recommendedOperatorAction": flow.get("recommendedOperatorAction"),
            "alertTriggered": body.get("clientViewState", {}).get("alertTriggered"),
            "serverAck": "serverAck OK",
            "dedupeStatus": "accepted",
            "updatedAt": utc_now(),
        }
        state["simulatedLocation"] = location
        state["lastActionRouteDecision"] = route_decision
        state["routeAdvisory"] = route_decision["decisionReason"]
        state["lastServerAck"] = {
            "ok": True,
            "ackId": f"ack-{int(now_ts * 1000)}-{recipient_id}-{sequence}",
            "eventId": event_id,
            "recipientId": recipient_id,
            "targetId": recipient_id,
            "sequence": sequence,
            "seq": sequence,
            "action": action_code,
            "receivedAction": action_code,
            "response": definition["label"],
            "duplicate": False,
            "dedupeStatus": "accepted",
            "receivedAt": utc_now(),
            "serverTimestamp": utc_now(),
        }
        question_packet, _question_compact, question_bytes = compact_question_packet(recipient_id, flow, sequence)
        if flow.get("currentQuestion"):
            append_packet_log(
                "TRIAGE_QUESTION",
                recipient_id,
                recipient_name(state, recipient_id),
                flow["currentQuestion"]["text"],
                "SSE",
                packet=question_packet,
                bytes_len=question_bytes,
                sequence=sequence,
                action_code=action_code,
                question_id=flow.get("currentQuestionId"),
            )
        append_packet_log(
            "RISK_MATRIX_UPDATED",
            recipient_id,
            recipient_name(state, recipient_id),
            f"{previous_risk} → {route_decision['riskScore']}（{route_decision.get('riskTier', flow['risk']['tier'])}）",
            "LOCAL",
            bytes_len=0,
            sequence=sequence,
            action_code=action_code,
            risk_change=f"{previous_risk}->{route_decision['riskScore']}",
        )
        append_packet_log(
            "ROUTE_DECISION_UPDATED",
            recipient_id,
            recipient_name(state, recipient_id),
            f"{route_decision['primaryChannel']} + {', '.join(route_decision.get('backupChannels', []))}",
            "LOCAL",
            bytes_len=0,
            sequence=sequence,
            action_code=action_code,
        )
        alert_triggered = body.get("clientViewState", {}).get("alertTriggered")
        if alert_triggered:
            append_packet_log(
                "MOBILE_ALERT",
                recipient_id,
                recipient_name(state, recipient_id),
                alert_triggered,
                "MOBILE_DEVICE",
                bytes_len=0,
                sequence=sequence,
                action_code=action_code,
            )
        append_conversation_message(
            thread,
            msg_type="mobile_action",
            sender=recipient_name(state, recipient_id),
            sender_role="elder",
            text=f"我按下：{definition['label']}",
            channel="LOW_DATA_TEXT",
            delivery_status="serverAck",
        )
        append_conversation_message(
            thread,
            msg_type="system",
            sender="星夜系統",
            sender_role="system",
            text=SYSTEM_MESSAGES[action_code],
            channel="SSE",
            delivery_status="serverAck",
            system_generated=True,
        )
        thread["status"] = "acknowledged" if action_code == "SAFE_OK" else "active"
        thread["ackStatus"] = response_status
        thread["elderResponded"] = True
        thread["lastReplyFromElderAt"] = utc_now()
        thread["lastQuickReply"] = definition["label"]
        thread["safetyConfirmed"] = action_code == "SAFE_OK"
        thread["unableToRespond"] = action_code == "CANNOT_TALK"
        thread["unansweredOperatorMessages"] = 0
        thread["quickReplies"] = quick_reply_set_for(action_code)
        thread["triageFlowId"] = flow.get("flowId")
        thread["currentQuestionId"] = flow.get("currentQuestionId")
        thread["riskScore"] = flow["risk"]["finalScore"]
        thread["riskTier"] = flow["risk"]["tier"]
        state["activeConversationRecipientId"] = recipient_id
        if definition["severity"] >= 4:
            state["activeAlert"] = {
                "level": "critical" if action_code == "NEED_MEDICAL" else "warning",
                "title": f"{recipient_name(state, recipient_id)}回報：{definition['label']}",
                "message": "已建立安全確認對話，請守護指揮中心立即檢視。",
                "recipientId": recipient_id,
                "action": action_code,
                "timestamp": utc_now(),
            }
        append_timeline(
            state,
            "收到手機端回覆",
            f"{recipient_name(state, recipient_id)} 按下「{definition['label']}」（{action_code}），serverAck OK，後台已更新鏡像畫面。",
            route_decision["primaryChannel"],
            recipient_name(state, recipient_id),
            response_status,
            "ack" if action_code == "SAFE_OK" else "followup",
        )
        state.setdefault("lastSeqByTarget", {})[recipient_id] = sequence
        store["lastSeqByTarget"][recipient_id] = sequence
        store["seenMobileEvents"][dedupe_key] = {
            "seenTs": now_ts,
            "action": action_code,
            "recipientId": recipient_id,
            "sequence": sequence,
            "dedupeKey": dedupe_key,
        }
    else:
        if state.get("mobileMirrorState"):
            state["mobileMirrorState"]["serverAck"] = "duplicate ACK"
            state["mobileMirrorState"]["dedupeStatus"] = "duplicate ignored"
            state["mobileMirrorState"]["updatedAt"] = utc_now()
        append_packet_log(
            "DUPLICATE_IGNORED",
            recipient_id,
            recipient_name(state, recipient_id),
            action_code,
            "LOW_DATA_TEXT",
            bytes_len=0,
            dedupe_status="duplicate",
            sequence=sequence,
            action_code=action_code,
        )
        thread["ackStatus"] = recipient.get("ackStatus", thread.get("ackStatus"))

    response = {
        "serverAck": {
            "ok": True,
            "ackId": f"ack-{int(time.time() * 1000)}-{recipient_id}-{sequence}",
            "duplicate": duplicate,
            "dedupeStatus": "duplicate" if duplicate else "accepted",
            "message": "後台已收到，不需要重複按。" if duplicate else "serverAck OK",
            "receivedAt": utc_now(),
            "serverTimestamp": utc_now(),
            "sequence": sequence,
            "seq": sequence,
            "action": action_code,
            "receivedAction": action_code,
            "recipientId": recipient_id,
            "targetId": recipient_id,
        },
        "packet": packet,
        "bytes": bytes_len,
        "decodeResult": {
            **compact,
            "logType": "MOBILE_ACTION",
            "recipientId": recipient_id,
            "targetId": recipient_id,
            "recipientName": recipient_name(state, recipient_id),
            "targetName": recipient_name(state, recipient_id),
            "actionCode": action_code,
            "actionLabel": definition["label"],
            "content": definition["label"],
            "channel": route_decision["primaryChannel"],
            "dedupeStatus": "duplicate ignored" if duplicate else "accepted",
            "routeDecision": route_decision,
            "simulatedLocation": location,
            "seq": sequence,
            "compactPayload": compact,
            "internalEvent": {
                "eventId": event_id,
                "recipientId": recipient_id,
                "targetId": recipient_id,
                "recipientName": recipient_name(state, recipient_id),
                "targetName": recipient_name(state, recipient_id),
                "actionCode": action_code,
                "actionLabel": definition["label"],
                "severity": definition["severity"],
                "clientTimestamp": body.get("clientTimestamp"),
                "serverTimestamp": utc_now(),
                "seq": sequence,
                "dedupeKey": dedupe_key,
                "lowDataMode": bool(body.get("lowDataMode", True)),
                "communicationProfileSnapshot": {
                    key: recipient.get(key)
                    for key in [
                        "id",
                        "name",
                        "displayName",
                        "preferredLanguage",
                        "elderFriendly",
                        "canUseVoice",
                        "canUseText",
                        "preferredChannels",
                        "phoneMasked",
                        "guardianName",
                        "guardianPhoneMasked",
                        "communityHelperName",
                        "communityHelperDistanceKm",
                        "emergencyNote",
                        "lastKnownLocation",
                        "communicationProfileComplete",
                    ]
                },
                "locationSnapshot": location,
                "networkSnapshot": body.get("networkHint") or state.get("network"),
                "ackStatus": "duplicate" if duplicate else "serverAck OK",
            },
        },
        "trace": runtime_trace_summary(
            event_id,
            recipient_id,
            sequence,
            action_code,
            "duplicate" if duplicate else "accepted",
            route_decision,
            location,
            "MOBILE_ACTION",
        ),
    }
    return response, route_decision, duplicate, "duplicate ignored" if duplicate else "accepted"


def apply_triage_answer(body, handler):
    state = store.get("state")
    if not state:
        return None, False, "no active event"
    ensure_state_defaults(state)
    recipient_id = target_id_from_body(body)
    action_code = body.get("action") or body.get("a") or "SAFE_OK"
    question_id = body.get("questionId") or body.get("q")
    answer_code = body.get("answerCode") or body.get("ans")
    event_id = body.get("eventId") or state.get("event", {}).get("id") or "starrylink-demo"
    state_event_id = state.get("event", {}).get("id")
    if state_event_id and event_id != state_event_id:
        return None, False, "event mismatch"
    recipient = find_target(state, recipient_id)
    if not recipient:
        return None, False, "recipient not found"
    now_ts = time.time()
    compact_payload = body.get("compactPayload") if isinstance(body.get("compactPayload"), dict) else {}
    sequence = int(body.get("sequence") or body.get("seq") or compact_payload.get("seq") or 0)
    dedupe_key = body.get("dedupeKey") or compact_payload.get("d") or f"{event_id}:{recipient_id}:{action_code}:{question_id}:{answer_code}:{sequence}"
    previous = store["seenMobileEvents"].get(dedupe_key)
    duplicate = bool(
        previous
        and previous.get("sequence") == sequence
        and previous.get("action") == action_code
        and previous.get("recipientId") == recipient_id
        and previous.get("questionId") == question_id
        and previous.get("answerCode") == answer_code
    )
    packet, compact, bytes_len = compact_triage_answer_packet(recipient_id, action_code, question_id, answer_code, sequence, dedupe_key)
    location = simulated_location_for(handler)
    retry_count = int(compact_payload.get("x") or body.get("retryCount") or 0)

    flow = state.setdefault("triageFlows", {}).get(recipient_id)
    if not flow:
        flow = ensure_triage_flow(state, recipient_id, action_code, location, reset=True)
    answer = answer_by_code(flow.get("flowId"), question_id, answer_code)
    if not answer and not duplicate:
        return None, False, "unknown triage answer"

    if not duplicate:
        if retry_count:
            append_packet_log(
                "RETRY_SENT",
                recipient_id,
                recipient_name(state, recipient_id),
                f"{question_id}={answer_code}",
                "LOW_DATA_TEXT",
                bytes_len=bytes_len,
                sequence=sequence,
                action_code=action_code,
                question_id=question_id,
                answer_code=answer_code,
            )
        previous_risk = int(recipient.get("riskScore") or flow.get("risk", {}).get("finalScore") or 0)
        answer_record = {
            "questionId": question_id,
            "answerCode": answer_code,
            "label": answer["label"],
            "riskDelta": int(answer.get("riskDelta") or 0),
            "nextActionHint": answer.get("nextActionHint"),
            "answeredAt": utc_now(),
            "sequence": sequence,
        }
        flow.setdefault("answers", []).append(answer_record)
        if question_id and question_id not in flow.setdefault("completedQuestionIds", []):
            flow["completedQuestionIds"].append(question_id)
        flow["lastAnswerCode"] = answer_code
        flow["lastAnswerLabel"] = answer["label"]
        flow.setdefault("timeline", []).insert(
            0,
            {
                "time": utc_now(),
                "questionId": question_id,
                "answerCode": answer_code,
                "label": answer["label"],
                "riskDelta": int(answer.get("riskDelta") or 0),
            },
        )
        del flow["timeline"][20:]

        if answer.get("escalateTo"):
            action_code = answer["escalateTo"]
            flow["escalatedFrom"] = flow.get("flowId")
            flow["flowId"] = action_code
            flow["actionCode"] = action_code
            flow["title"] = TRIAGE_FLOWS[action_code]["title"]
            flow["currentQuestionId"] = first_question_id(action_code)
            flow["flowComplete"] = False
        else:
            flow["currentQuestionId"] = answer.get("nextQuestionId")
            flow["flowComplete"] = not bool(flow.get("currentQuestionId"))

        definition = ACTION_DEFINITIONS[action_code]
        refresh_triage_flow(state, recipient, flow, location, ack_missing=False)
        route_decision = mobile_route_decision(action_code, definition, state, recipient, location)
        safe_done = answer_code == "SAFE_DONE" and action_code == "SAFE_OK"
        recipient["ackStatus"] = "acknowledged" if safe_done else "needs_followup"
        if action_code == "SAFE_OK" and flow.get("flowComplete") and answer_code != "SAFE_TO_HELP":
            recipient["ackStatus"] = "acknowledged"
        recipient["response"] = definition["label"]
        recipient["lastAction"] = action_code
        recipient["actionLabel"] = definition["label"]
        recipient["actionSeverity"] = definition["severity"]
        recipient["lastQuickReply"] = answer["label"]
        recipient["latestAnswer"] = answer["label"]
        recipient["lastPacketSequence"] = sequence
        recipient["lastPacketMode"] = "LOW_DATA_TRIAGE"
        recipient["lastAckAt"] = utc_now()
        recipient["lastChannel"] = route_decision["primaryChannel"]
        recipient["mobileReassurance"] = "已送出，守護指揮中心已收到。"
        recipient["locationSnapshot"] = location
        if flow["risk"]["finalScore"] >= 80:
            recipient["priority"] = 0
        elif flow["risk"]["finalScore"] >= 60:
            recipient["priority"] = min(recipient.get("priority", 3), 1)
        sync_event_recipient_state(state, recipient_id, recipient)

        thread = ensure_conversation_thread(state, recipient_id, action_code, definition["severity"])
        thread["status"] = "elder_replied" if not flow.get("flowComplete") else "confirmed" if recipient["ackStatus"] == "acknowledged" else "active"
        thread["ackStatus"] = recipient["ackStatus"]
        thread["elderResponded"] = True
        thread["lastReplyFromElderAt"] = utc_now()
        thread["lastQuickReply"] = answer["label"]
        thread["triageFlowId"] = flow.get("flowId")
        thread["currentQuestionId"] = flow.get("currentQuestionId")
        thread["riskScore"] = flow["risk"]["finalScore"]
        thread["riskTier"] = flow["risk"]["tier"]
        thread["safetyConfirmed"] = bool(thread.get("safetyConfirmed") or safe_done)
        thread["unableToRespond"] = bool(thread.get("unableToRespond") or answer_code in {"MED_REPLY_HARD", "MED_REPLY_UNSURE", "TALK_TEXT_HARD", "TALK_TEXT_UNSURE", "TALK_CANNOT_DECIDE"})
        append_conversation_message(
            thread,
            msg_type="triage_answer",
            sender=recipient_name(state, recipient_id),
            sender_role="elder",
            text=f"{question_id}={answer['label']}（{answer_code}）",
            channel="LOW_DATA_TEXT",
            delivery_status="serverAck",
        )

        state["event"]["status"] = "waiting_ack" if recipient["ackStatus"] == "acknowledged" else "escalating"
        state["activeConversationRecipientId"] = recipient_id
        state["simulatedLocation"] = location
        state["lastActionRouteDecision"] = route_decision
        state["routeAdvisory"] = flow["recommendedOperatorAction"]
        state["lastServerAck"] = {
            "ackId": f"ack-{int(now_ts * 1000)}-{recipient_id}-{sequence}",
            "eventId": event_id,
            "recipientId": recipient_id,
            "targetId": recipient_id,
            "sequence": sequence,
            "seq": sequence,
            "action": action_code,
            "receivedAction": "TRIAGE_ANSWER",
            "questionId": question_id,
            "answerCode": answer_code,
            "duplicate": False,
            "dedupeStatus": "accepted",
            "receivedAt": utc_now(),
            "serverTimestamp": utc_now(),
        }
        state["mobileMirrorState"] = {
            **(state.get("mobileMirrorState") or {}),
            "recipientId": recipient_id,
            "action": action_code,
            "actionLabel": definition["label"],
            "severity": definition["severity"],
            "status": definition["status"],
            "reassurance": "已送出，守護指揮中心已收到。",
            "latestAnswer": answer["label"],
            "latestAnswerCode": answer_code,
            "triageFlow": flow,
            "currentQuestion": flow.get("currentQuestion"),
            "risk": flow.get("risk"),
            "recommendedOperatorAction": flow.get("recommendedOperatorAction"),
            "serverAck": "serverAck OK",
            "dedupeStatus": "accepted",
            "updatedAt": utc_now(),
        }
        if flow["risk"]["finalScore"] >= 80 or answer_code in {"MED_REPLY_HARD", "MED_REPLY_UNSURE", "MED_ALONE", "MED_PLACE_UNSAFE", "LOC_UNKNOWN"}:
            state["activeAlert"] = {
                "level": "critical" if flow["risk"]["finalScore"] >= 80 else "warning",
                "title": f"{recipient_name(state, recipient_id)}回覆：{answer['label']}",
                "message": flow["recommendedOperatorAction"],
                "recipientId": recipient_id,
                "action": action_code,
                "timestamp": utc_now(),
            }

        append_timeline(
            state,
            "收到按鍵式安全回覆",
            f"{recipient_name(state, recipient_id)} 回覆 {question_id}={answer['label']}（{answer_code}），風險 {previous_risk} → {flow['risk']['finalScore']}。",
            "LOW_DATA_TEXT",
            recipient_name(state, recipient_id),
            recipient["ackStatus"],
            "triage_answer",
        )
        append_packet_log(
            "RISK_MATRIX_UPDATED",
            recipient_id,
            recipient_name(state, recipient_id),
            f"{previous_risk} → {route_decision['riskScore']}（{route_decision.get('riskTier', flow['risk']['tier'])}）",
            "LOCAL",
            bytes_len=0,
            sequence=sequence,
            action_code=action_code,
            question_id=question_id,
            answer_code=answer_code,
            risk_change=f"{previous_risk}->{route_decision['riskScore']}",
        )
        append_packet_log(
            "ROUTE_DECISION_UPDATED",
            recipient_id,
            recipient_name(state, recipient_id),
            f"{route_decision['primaryChannel']} + {', '.join(route_decision.get('backupChannels', []))}",
            "LOCAL",
            bytes_len=0,
            sequence=sequence,
            action_code=action_code,
            question_id=question_id,
            answer_code=answer_code,
        )
        if flow.get("currentQuestion"):
            question_packet, _question_compact, question_bytes = compact_question_packet(recipient_id, flow, sequence)
            append_packet_log(
                "TRIAGE_QUESTION",
                recipient_id,
                recipient_name(state, recipient_id),
                flow["currentQuestion"]["text"],
                "SSE",
                packet=question_packet,
                bytes_len=question_bytes,
                sequence=sequence,
                action_code=action_code,
                question_id=flow.get("currentQuestionId"),
            )
        store["seenMobileEvents"][dedupe_key] = {
            "seenTs": now_ts,
            "action": action_code,
            "recipientId": recipient_id,
            "questionId": question_id,
            "answerCode": answer_code,
            "sequence": sequence,
            "dedupeKey": dedupe_key,
        }
        state.setdefault("lastSeqByTarget", {})[recipient_id] = sequence
        store["lastSeqByTarget"][recipient_id] = sequence
    else:
        route_decision = mobile_route_decision(action_code, ACTION_DEFINITIONS.get(action_code, ACTION_DEFINITIONS["SAFE_OK"]), state, recipient, location)
        if state.get("mobileMirrorState"):
            state["mobileMirrorState"]["serverAck"] = "duplicate ACK"
            state["mobileMirrorState"]["dedupeStatus"] = "duplicate ignored"
            state["mobileMirrorState"]["updatedAt"] = utc_now()
        append_packet_log(
            "DUPLICATE_IGNORED",
            recipient_id,
            recipient_name(state, recipient_id),
            f"{question_id}={answer_code}",
            "LOW_DATA_TEXT",
            bytes_len=0,
            dedupe_status="duplicate",
            sequence=sequence,
            action_code=action_code,
            question_id=question_id,
            answer_code=answer_code,
        )

    response = {
        "serverAck": {
            "ok": True,
            "ackId": f"ack-{int(time.time() * 1000)}-{recipient_id}-{sequence}",
            "duplicate": duplicate,
            "dedupeStatus": "duplicate" if duplicate else "accepted",
            "message": "守護指揮中心已收到，不需要重複按。" if duplicate else "serverAck OK",
            "receivedAt": utc_now(),
            "serverTimestamp": utc_now(),
            "sequence": sequence,
            "seq": sequence,
            "action": "TRIAGE_ANSWER",
            "receivedAction": "TRIAGE_ANSWER",
            "recipientId": recipient_id,
            "targetId": recipient_id,
        },
        "packet": packet,
        "bytes": bytes_len,
        "decodeResult": {
            **compact,
            "logType": "TRIAGE_ANSWER",
            "recipientId": recipient_id,
            "targetId": recipient_id,
            "recipientName": recipient_name(state, recipient_id),
            "targetName": recipient_name(state, recipient_id),
            "actionCode": action_code,
            "questionId": question_id,
            "answerCode": answer_code,
            "content": f"{question_id}={answer_code}",
            "channel": "LOW_DATA_TEXT",
            "dedupeStatus": "duplicate ignored" if duplicate else "accepted",
            "routeDecision": route_decision,
            "seq": sequence,
            "compactPayload": compact,
            "internalEvent": {
                "eventId": event_id,
                "recipientId": recipient_id,
                "targetId": recipient_id,
                "recipientName": recipient_name(state, recipient_id),
                "targetName": recipient_name(state, recipient_id),
                "actionCode": action_code,
                "actionLabel": ACTION_DEFINITIONS.get(action_code, ACTION_DEFINITIONS["SAFE_OK"])["label"],
                "questionId": question_id,
                "answerCode": answer_code,
                "severity": ACTION_DEFINITIONS.get(action_code, ACTION_DEFINITIONS["SAFE_OK"])["severity"],
                "clientTimestamp": body.get("clientTimestamp"),
                "serverTimestamp": utc_now(),
                "seq": sequence,
                "dedupeKey": dedupe_key,
                "lowDataMode": True,
                "communicationProfileSnapshot": {
                    key: recipient.get(key)
                    for key in [
                        "id",
                        "name",
                        "displayName",
                        "preferredLanguage",
                        "elderFriendly",
                        "canUseVoice",
                        "canUseText",
                        "preferredChannels",
                        "phoneMasked",
                        "guardianName",
                        "guardianPhoneMasked",
                        "communityHelperName",
                        "communityHelperDistanceKm",
                        "emergencyNote",
                        "lastKnownLocation",
                        "communicationProfileComplete",
                    ]
                },
                "locationSnapshot": location,
                "networkSnapshot": state.get("network"),
                "ackStatus": "duplicate" if duplicate else "serverAck OK",
            },
        },
        "trace": runtime_trace_summary(
            event_id,
            recipient_id,
            sequence,
            "TRIAGE_ANSWER",
            "duplicate" if duplicate else "accepted",
            route_decision,
            location,
            "TRIAGE_ANSWER",
        ),
    }
    return response, duplicate, "duplicate ignored" if duplicate else "accepted"


def apply_location_update(body, handler):
    state = store.get("state")
    if not state:
        return None, False, "no active event"
    ensure_state_defaults(state)
    recipient_id = target_id_from_body(body)
    event_id = body.get("eventId") or state.get("event", {}).get("id") or "starrylink-demo"
    state_event_id = state.get("event", {}).get("id")
    if state_event_id and event_id != state_event_id:
        return None, False, "event mismatch"
    recipient = find_target(state, recipient_id)
    if not recipient:
        return None, False, "recipient not found"

    now_ts = time.time()
    compact_payload = body.get("compactPayload") if isinstance(body.get("compactPayload"), dict) else {}
    sequence = int(body.get("sequence") or body.get("seq") or compact_payload.get("seq") or 0)
    source = body.get("source") or compact_payload.get("source") or "UNKNOWN"
    dedupe_key = body.get("dedupeKey") or compact_payload.get("d") or f"{event_id}:{recipient_id}:LOCATION_UPDATE:{source}:{sequence}"
    previous = store["seenMobileEvents"].get(dedupe_key)
    duplicate = bool(previous and previous.get("sequence") == sequence and previous.get("recipientId") == recipient_id and previous.get("action") == "LOCATION_UPDATE")
    packet, compact, bytes_len = compact_location_packet({**body, "recipientId": recipient_id, "source": source}, sequence, dedupe_key)

    simulated = simulated_location_for(handler)
    gps_denied = source == "GPS_DENIED" or body.get("permissionDenied")
    gps_failed = source in {"GPS_FAILED", "UNKNOWN"} or body.get("error")
    gps_usable = source == "GPS" and body.get("lat") is not None and body.get("lng") is not None and float(body.get("accuracy") or 9999) <= 150
    if gps_usable:
        location = {
            "source": "GPS",
            "simulated": False,
            "sameLan": simulated.get("sameLan"),
            "lat": float(body.get("lat")),
            "lng": float(body.get("lng")),
            "accuracy": float(body.get("accuracy") or 0),
            "altitude": body.get("altitude"),
            "heading": body.get("heading"),
            "speed": body.get("speed"),
            "status": "GPS 定位已取得",
            "method": "Browser Geolocation API",
            "lastUpdatedAt": utc_now(),
            "nearestHelper": simulated.get("nearestHelper"),
            "distanceToHelperKm": simulated.get("distanceToHelperKm"),
            "etaMinutes": simulated.get("etaMinutes"),
            "note": f"GPS 定位已取得，精準度約 ±{round(float(body.get('accuracy') or 0))} 公尺。",
        }
    elif simulated.get("sameLan"):
        location = {
            **simulated,
            "source": "GPS_DENIED" if gps_denied else "SAME_LAN_SIMULATED",
            "status": "GPS 權限拒絕" if gps_denied else "GPS 尚未取得，已改用同網路模擬定位",
            "lastUpdatedAt": utc_now(),
            "gpsError": body.get("error") or ("permission denied" if gps_denied else "unavailable"),
        }
    else:
        location = {
            **simulated,
            "source": "GPS_DENIED" if gps_denied else "DEMO_FALLBACK",
            "status": "位置待確認",
            "lastUpdatedAt": utc_now(),
            "gpsError": body.get("error") or ("permission denied" if gps_denied else "unavailable"),
        }

    log_type = "GPS_PERMISSION_DENIED" if gps_denied else "LOCATION_UPDATE"
    if not duplicate:
        state.setdefault("locationUpdates", {})[recipient_id] = location
        state["simulatedLocation"] = location
        recipient["locationSnapshot"] = location
        sync_event_recipient_state(state, recipient_id, recipient)
        state["lastServerAck"] = {
            "ackId": f"ack-{int(now_ts * 1000)}-{recipient_id}-{sequence}",
            "eventId": event_id,
            "recipientId": recipient_id,
            "targetId": recipient_id,
            "sequence": sequence,
            "seq": sequence,
            "action": "LOCATION_UPDATE",
            "receivedAction": "LOCATION_UPDATE",
            "duplicate": False,
            "dedupeStatus": "accepted",
            "receivedAt": utc_now(),
            "serverTimestamp": utc_now(),
        }
        if state.get("mobileMirrorState", {}).get("recipientId") == recipient_id:
            state["mobileMirrorState"] = {
                **state.get("mobileMirrorState", {}),
                "locationSnapshot": location,
                "gpsStatus": location.get("status"),
                "serverAck": "serverAck OK",
                "updatedAt": utc_now(),
            }
        append_timeline(
            state,
            "收到位置更新",
            f"{recipient_name(state, recipient_id)} 位置來源：{location.get('source')}，{location.get('note') or location.get('status')}",
            "HTTPS",
            recipient_name(state, recipient_id),
            "serverAck",
            "location",
        )
        append_packet_log(
            log_type,
            recipient_id,
            recipient_name(state, recipient_id),
            location.get("note") or location.get("status"),
            "HTTPS",
            packet=packet,
            bytes_len=bytes_len,
            sequence=sequence,
            action_code="LOCATION_UPDATE",
        )
        store["seenMobileEvents"][dedupe_key] = {
            "seenTs": now_ts,
            "action": "LOCATION_UPDATE",
            "recipientId": recipient_id,
            "sequence": sequence,
            "dedupeKey": dedupe_key,
        }
        state.setdefault("lastSeqByTarget", {})[recipient_id] = sequence
        store["lastSeqByTarget"][recipient_id] = sequence
    else:
        append_packet_log(
            "DUPLICATE_IGNORED",
            recipient_id,
            recipient_name(state, recipient_id),
            f"LOCATION_UPDATE {source}",
            "HTTPS",
            bytes_len=0,
            dedupe_status="duplicate",
            sequence=sequence,
            action_code="LOCATION_UPDATE",
        )

    response = {
        "serverAck": {
            "ok": True,
            "ackId": f"ack-{int(time.time() * 1000)}-{recipient_id}-{sequence}",
            "duplicate": duplicate,
            "dedupeStatus": "duplicate" if duplicate else "accepted",
            "message": "位置更新已收到，不需要重複送出。" if duplicate else "serverAck OK",
            "receivedAt": utc_now(),
            "serverTimestamp": utc_now(),
            "sequence": sequence,
            "seq": sequence,
            "action": "LOCATION_UPDATE",
            "receivedAction": "LOCATION_UPDATE",
            "recipientId": recipient_id,
            "targetId": recipient_id,
        },
        "packet": packet,
        "bytes": bytes_len,
        "decodeResult": {
            **compact,
            "logType": log_type,
            "recipientId": recipient_id,
            "targetId": recipient_id,
            "recipientName": recipient_name(state, recipient_id),
            "targetName": recipient_name(state, recipient_id),
            "actionCode": "LOCATION_UPDATE",
            "content": location.get("note") or location.get("status"),
            "channel": "HTTPS",
            "dedupeStatus": "duplicate ignored" if duplicate else "accepted",
            "locationSnapshot": location,
            "seq": sequence,
        },
        "trace": runtime_trace_summary(
            event_id,
            recipient_id,
            sequence,
            "LOCATION_UPDATE",
            "duplicate" if duplicate else "accepted",
            {"primaryChannel": "HTTPS", "riskScore": "-"},
            location,
            log_type,
        ),
    }
    return response, duplicate, "duplicate ignored" if duplicate else "accepted"


def apply_decoded_packet(decoded):
    state = store.get("state")
    if not state:
        return False, "no active event"
    ensure_state_defaults(state)
    event = state.get("event", {})
    if event.get("id") != decoded["eventId"]:
        return False, "event mismatch"

    key = f"{decoded['eventId']}:{decoded['recipientId']}:{decoded['sequence']}"
    duplicate = key in store["seenPackets"]
    recipient_found = False
    response_code = decoded["responseCode"]
    response_label = decoded["responseLabel"]
    response_status = "needs_followup" if response_code in FOLLOWUP_CODES else "acknowledged"

    if not duplicate:
        for recipient in state_targets(state):
            if recipient.get("id") != decoded["recipientId"]:
                continue
            recipient_found = True
            recipient["ackStatus"] = response_status
            recipient["response"] = response_label
            recipient["lastPacketSequence"] = decoded["sequence"]
            recipient["lastPacketMode"] = decoded["mode"]
            recipient["lastAckAt"] = utc_now()
            if response_code == "M":
                recipient["priority"] = 0
                recipient["manualRecommendation"] = "醫療優先，建議人工電話與救援窗口同步處理"
            if response_code == "N":
                recipient["manualRecommendation"] = "使用者無法通話，降低 Voice IVR，優先文字、SMS 或人工通道"
            if response_code == "H":
                recipient["manualRecommendation"] = "使用者需要協助，請通知守護者並安排最近協助者前往"
            if response_code == "L":
                recipient["manualRecommendation"] = "位置異常，後台需確認同網路推測定位與安全狀態"
            sync_event_recipient_state(state, decoded["recipientId"], recipient)
            break
        if not recipient_found:
            return False, "recipient not found"

        state["event"]["status"] = "escalating" if response_code in FOLLOWUP_CODES else "waiting_ack"
        state["lastServerAck"] = {
            "eventId": decoded["eventId"],
            "recipientId": decoded["recipientId"],
            "sequence": decoded["sequence"],
            "response": response_label,
            "duplicate": False,
            "receivedAt": utc_now(),
        }
        if response_code == "N":
            state["routeAdvisory"] = "無法通話：Voice IVR 分數下降，建議 SMS / Manual Call 優先。"
        elif response_code == "M":
            state["routeAdvisory"] = "需要醫療：提高優先序，建議 Manual Call / 救援窗口同步。"
        elif response_code in {"H", "L"}:
            state["routeAdvisory"] = "需要協助或位置異常：列入需處理名單，建議人工追蹤與同網路定位確認。"

        title = "收到 Low Data ACK" if response_status == "acknowledged" else "收到需處理回覆"
        append_timeline(
            state,
            title,
            f"{recipient_name(state, decoded['recipientId'])} 回覆「{response_label}」，後端已 decode 並寫入 serverAck。",
            decoded["mode"],
            recipient_name(state, decoded["recipientId"]),
            response_status,
            "ack" if response_status == "acknowledged" else "followup",
        )
        store["seenPackets"][key] = utc_now()

    return duplicate, "duplicate ignored" if duplicate else "accepted"


def apply_command_message(body):
    state = store.get("state")
    if not state:
        raise ValueError("no active event")
    ensure_state_defaults(state)
    recipient_id = body.get("recipientId") or state.get("activeConversationRecipientId") or state.get("activeRecipientId")
    if not recipient_id:
        raise ValueError("recipient required")
    text = str(body.get("text") or "").strip()
    if not text:
        raise ValueError("message required")
    thread = ensure_conversation_thread(state, recipient_id)
    message = append_conversation_message(
        thread,
        msg_type="command_message",
        sender="守護指揮中心",
        sender_role="command_center",
        text=text,
        channel="LOW_DATA_TEXT",
        delivery_status="serverAck",
    )
    thread["status"] = "waiting_elder_reply"
    thread["unansweredOperatorMessages"] = int(thread.get("unansweredOperatorMessages") or 0) + 1
    thread["quickReplies"] = quick_reply_set_for(thread.get("currentAction"), text)
    state["activeConversationRecipientId"] = recipient_id
    state["mobileMirrorState"] = {
        **(state.get("mobileMirrorState") or {}),
        "recipientId": recipient_id,
        "action": thread.get("currentAction"),
        "actionLabel": thread.get("currentActionLabel"),
        "severity": thread.get("severity"),
        "backendMessage": text,
        "quickReplies": thread.get("quickReplies"),
        "serverAck": "serverAck OK",
        "updatedAt": utc_now(),
    }
    append_timeline(
        state,
        "後台送出模擬訊息",
        f"守護指揮中心傳送：「{text}」。此為 demo 內部訊息，未連接外部通訊服務。",
        "LOW_DATA_TEXT",
        thread.get("recipientName", recipient_id),
        "serverAck",
        "command",
    )
    response = append_packet_log(
        "COMMAND_MESSAGE",
        recipient_id,
        thread.get("recipientName", recipient_id),
        text,
        "LOW_DATA_TEXT",
        bytes_len=message["packetBytes"],
    )
    return {**response, "conversation": thread}


def quick_reply_safety_flags(text):
    safety_confirmed = text in {"我安全", "有人在旁邊", "我在家"}
    unable = text in {"我無法回覆", "我無法確認", "我無法判斷"} or "無法" in text
    alone = text == "我一個人"
    return safety_confirmed, unable, alone


def apply_quick_reply(body):
    state = store.get("state")
    if not state:
        raise ValueError("no active event")
    ensure_state_defaults(state)
    recipient_id = body.get("recipientId") or state.get("activeConversationRecipientId") or state.get("activeRecipientId")
    text = str(body.get("text") or "").strip()
    if not recipient_id or not text:
        raise ValueError("recipient and text required")
    recipient = find_target(state, recipient_id)
    if not recipient:
        raise ValueError("recipient not found")
    thread = ensure_conversation_thread(state, recipient_id)
    message = append_conversation_message(
        thread,
        msg_type="quick_reply",
        sender=recipient_name(state, recipient_id),
        sender_role="elder",
        text=text,
        channel="LOW_DATA_TEXT",
        delivery_status="serverAck",
    )
    safety_confirmed, unable, alone = quick_reply_safety_flags(text)
    action_code = thread.get("currentAction") or recipient.get("lastAction")
    high_followup = action_code in {"NEED_MEDICAL", "CANNOT_TALK", "LOCATION_ANOMALY"} or alone or unable
    recipient["lastQuickReply"] = text
    recipient["lastAckAt"] = utc_now()
    recipient["ackStatus"] = "acknowledged" if safety_confirmed and not high_followup else "needs_followup"
    recipient["manualRecommendation"] = conversation_recommendation(action_code, text, safety_confirmed, unable, alone)
    sync_event_recipient_state(state, recipient_id, recipient)
    thread["elderResponded"] = True
    thread["lastReplyFromElderAt"] = message["timestamp"]
    thread["lastQuickReply"] = text
    thread["unansweredOperatorMessages"] = 0
    thread["safetyConfirmed"] = bool(thread.get("safetyConfirmed") or safety_confirmed)
    thread["unableToRespond"] = bool(thread.get("unableToRespond") or unable)
    thread["status"] = "elder_replied"
    thread["ackStatus"] = recipient["ackStatus"]
    state["activeConversationRecipientId"] = recipient_id
    state["mobileMirrorState"] = {
        **(state.get("mobileMirrorState") or {}),
        "recipientId": recipient_id,
        "action": action_code,
        "latestQuickReply": text,
        "serverAck": "serverAck OK",
        "updatedAt": utc_now(),
    }
    state["routeAdvisory"] = recipient["manualRecommendation"]
    if alone or unable or action_code in {"NEED_MEDICAL", "LOCATION_ANOMALY"}:
        state["activeAlert"] = {
            "level": "critical" if action_code == "NEED_MEDICAL" or unable else "warning",
            "title": f"{recipient_name(state, recipient_id)}回覆：{text}",
            "message": "對話狀態已影響 AI 風險評估，請檢視建議下一步。",
            "recipientId": recipient_id,
            "action": action_code,
            "timestamp": utc_now(),
        }
    append_timeline(
        state,
        "收到 quick reply",
        f"{recipient_name(state, recipient_id)} 回覆「{text}」，已寫入安全確認對話與 Low Data Packet Log。",
        "LOW_DATA_TEXT",
        recipient_name(state, recipient_id),
        recipient["ackStatus"],
        "quick_reply",
    )
    response = append_packet_log(
        "QUICK_REPLY",
        recipient_id,
        recipient_name(state, recipient_id),
        text,
        "LOW_DATA_TEXT",
        bytes_len=message["packetBytes"],
    )
    return {**response, "conversation": thread}


def conversation_recommendation(action_code, text, safety_confirmed, unable, alone):
    if unable:
        return "長者回覆無法確認或無法回覆，建議升級人工追蹤並保留低資料文字確認。"
    if alone:
        return "長者回覆我一個人，建議優先人工聯繫並確認指定守護者是否可協助。"
    if action_code == "NEED_MEDICAL":
        return "需要醫療情境已收到 quick reply，請確認安全狀態、位置與身邊協助者；此 demo 未連接真實外部通報服務。"
    if action_code == "LOCATION_ANOMALY":
        return "位置仍需確認，請以文字方式確認目前是否安全，並明確標示定位為模擬推估。"
    if safety_confirmed:
        return "長者已回覆安全訊號，風險降低但仍保留追蹤紀錄。"
    return "已收到長者 quick reply，請依對話內容決定是否持續追蹤。"


def apply_mark_confirmed(body):
    state = store.get("state")
    if not state:
        raise ValueError("no active event")
    ensure_state_defaults(state)
    recipient_id = body.get("recipientId") or state.get("activeConversationRecipientId") or state.get("activeRecipientId")
    thread = ensure_conversation_thread(state, recipient_id)
    action_code = thread.get("currentAction")
    recipient = find_target(state, recipient_id)
    if not recipient:
        raise ValueError("recipient not found")
    sustained_tracking = action_code in {"NEED_MEDICAL", "CANNOT_TALK"}
    recipient["ackStatus"] = "manual_review" if sustained_tracking else "acknowledged"
    recipient["safetyStatus"] = "已確認，持續追蹤" if sustained_tracking else "已平安"
    recipient["manualRecommendation"] = "守護指揮中心已確認，仍需持續追蹤。" if sustained_tracking else "已確認平安，降低優先級。"
    sync_event_recipient_state(state, recipient_id, recipient)
    thread["status"] = "confirmed_tracking" if sustained_tracking else "confirmed"
    thread["ackStatus"] = recipient["ackStatus"]
    thread["safetyConfirmed"] = True
    if state.get("activeAlert", {}).get("recipientId") == recipient_id:
        state["activeAlert"] = None
    append_conversation_message(
        thread,
        msg_type="system",
        sender="星夜系統",
        sender_role="system",
        text="守護指揮中心已標記此事件為已確認。",
        channel="INTERNAL_NOTE",
        delivery_status="serverAck",
        system_generated=True,
    )
    append_timeline(
        state,
        "安全確認完成",
        f"{thread.get('recipientName', recipient_id)} 已由守護指揮中心標記確認。",
        "INTERNAL_NOTE",
        thread.get("recipientName", recipient_id),
        recipient["ackStatus"],
        "safety_confirmed",
    )
    append_packet_log("INTERNAL_ACK", recipient_id, thread.get("recipientName", recipient_id), "守護指揮中心已標記此事件為已確認。", "INTERNAL_NOTE")
    response = append_packet_log("SAFETY_CONFIRMED", recipient_id, thread.get("recipientName", recipient_id), recipient["safetyStatus"], "INTERNAL_NOTE")
    return {**response, "conversation": thread}


def apply_escalate_conversation(body):
    state = store.get("state")
    if not state:
        raise ValueError("no active event")
    ensure_state_defaults(state)
    recipient_id = body.get("recipientId") or state.get("activeConversationRecipientId") or state.get("activeRecipientId")
    thread = ensure_conversation_thread(state, recipient_id)
    recipient = find_target(state, recipient_id)
    if not recipient:
        raise ValueError("recipient not found")
    recipient["ackStatus"] = "escalated"
    recipient["manualRecommendation"] = "已升級處理；請以低資料文字與人工追蹤確認，不代表已完成真實外部通報。"
    recipient["fallbackAttempts"] = int(recipient.get("fallbackAttempts") or 0) + 1
    sync_event_recipient_state(state, recipient_id, recipient)
    state["event"]["status"] = "escalating"
    state["fallbackTriggers"] = int(state.get("fallbackTriggers") or 0) + 1
    thread["status"] = "escalated"
    thread["ackStatus"] = "escalated"
    append_conversation_message(
        thread,
        msg_type="system",
        sender="星夜系統",
        sender_role="system",
        text="守護指揮中心已升級此事件。此 demo 僅模擬內部處理流程，未執行真實外部通報。",
        channel="INTERNAL_NOTE",
        delivery_status="serverAck",
        system_generated=True,
    )
    state["activeAlert"] = {
        "level": "critical",
        "title": f"{thread.get('recipientName', recipient_id)}已升級處理",
        "message": "請持續追蹤安全確認對話與需要處理名單。",
        "recipientId": recipient_id,
        "action": thread.get("currentAction"),
        "timestamp": utc_now(),
    }
    append_timeline(state, "升級處理", f"{thread.get('recipientName', recipient_id)} 已由後台升級為人工追蹤。", "INTERNAL_NOTE", thread.get("recipientName", recipient_id), "escalated", "escalation")
    response = append_packet_log("INTERNAL_ACK", recipient_id, thread.get("recipientName", recipient_id), "後台升級處理", "INTERNAL_NOTE")
    return {**response, "conversation": thread}


def apply_note(body):
    state = store.get("state")
    if not state:
        raise ValueError("no active event")
    ensure_state_defaults(state)
    recipient_id = body.get("recipientId") or state.get("activeConversationRecipientId") or state.get("activeRecipientId")
    text = str(body.get("text") or "").strip()
    if not text:
        raise ValueError("note required")
    thread = ensure_conversation_thread(state, recipient_id)
    message = append_conversation_message(
        thread,
        msg_type="internal_note",
        sender="守護指揮中心",
        sender_role="command_center",
        text=text,
        channel="INTERNAL_NOTE",
        delivery_status="serverAck",
    )
    append_timeline(state, "加入備註", f"{thread.get('recipientName', recipient_id)}：{text}", "INTERNAL_NOTE", thread.get("recipientName", recipient_id), thread.get("ackStatus", "serverAck"), "note")
    response = append_packet_log("INTERNAL_ACK", recipient_id, thread.get("recipientName", recipient_id), f"備註：{text}", "INTERNAL_NOTE", bytes_len=message["packetBytes"])
    return {**response, "conversation": thread}


def apply_ui_log(body):
    state = store.get("state")
    if state:
        ensure_state_defaults(state)
    log_type = body.get("type") or "ALERT_SOUND"
    if log_type not in LOG_TYPES:
        log_type = "ALERT_SOUND"
    recipient_id = body.get("recipientId") or "command-center"
    label = body.get("recipientName") or recipient_name(state or {}, recipient_id) if state else recipient_id
    content = body.get("content") or body.get("message") or log_type
    channel = body.get("channel") or "LOCAL_UI"
    if state and log_type == "CONVERSATION_OPENED":
        state["activeConversationRecipientId"] = recipient_id
    response = append_packet_log(log_type, recipient_id, label, content, channel, bytes_len=int(body.get("bytes") or 0))
    return response


def merge_target_patch(target, patch):
    if not isinstance(patch, dict):
        return target
    for key, value in patch.items():
        if key in {"location", "medical", "communication", "risk", "workflow"} and isinstance(value, dict):
            target.setdefault(key, {})
            target[key].update(value)
        elif key in {"packetLog", "events", "starryState", "targets", "recipients"}:
            continue
        else:
            target[key] = value
    ensure_target_shape(target)
    return target


def normalize_action_body(body, bucket):
    payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
    target_id = body.get("targetId") or payload.get("targetId") or target_id_from_body(body) or target_id_from_body(payload)
    action_type = body.get("actionType") or payload.get("actionType") or bucket
    sequence = body.get("seq") or body.get("sequence") or payload.get("seq") or payload.get("packetSeq") or payload.get("sequence") or 0
    idempotency_key = body.get("idempotencyKey") or payload.get("idempotencyKey")
    if not idempotency_key:
        idempotency_key = f"{body.get('clientId', 'client')}:{target_id}:{action_type}:{payload.get('code') or payload.get('operation') or ''}:{sequence}"
    return payload, target_id, action_type, int(sequence or 0), idempotency_key


def apply_client_action(body, handler, bucket):
    payload, target_id, action_type, sequence, idempotency_key = normalize_action_body(body, bucket)
    incoming_state = payload.get("state")
    if not store.get("state") and isinstance(incoming_state, dict):
        store["state"] = clone_json(incoming_state)
        ensure_state_defaults(store["state"])
    state = store.get("state")
    if not state:
        raise ValueError("state not initialized")
    ensure_state_defaults(state)

    target = find_target(state, target_id) if target_id else None
    if bucket not in {"simulation", "network", "reset"} and not target:
        raise ValueError("target not found")

    base_revision = int(body.get("baseRevision") or payload.get("baseRevision") or 0)
    server_revision = int(state.get("revision") or store.get("version") or 0)
    stale = base_revision and base_revision < server_revision
    previous = store["seenMobileEvents"].get(idempotency_key)
    duplicate = bool(previous)
    now = utc_now()
    updated_target = clone_json(target) if target else None

    if action_type in {"healthcheck", "deployment-health"}:
        if not duplicate:
            store["seenMobileEvents"][idempotency_key] = {
                "seenTs": time.time(),
                "action": action_type,
                "targetId": target_id,
                "sequence": sequence,
                "baseRevision": base_revision,
                "idempotencyKey": idempotency_key,
            }
        ack = {
            "ok": True,
            "ackId": f"ack-health-{int(time.time() * 1000)}-{target_id or 'system'}-{sequence}",
            "duplicate": duplicate,
            "dedupeStatus": "duplicate ignored" if duplicate else "accepted",
            "message": "deployment healthcheck ok",
            "targetId": target_id,
            "packetSeq": sequence,
            "seq": sequence,
            "actionType": action_type,
            "baseRevision": base_revision,
            "serverRevision": server_revision,
            "receivedAt": now,
        }
        return {
            "serverAck": ack,
            "newRevision": store["version"],
            "updatedTarget": updated_target,
            "stateSummary": state_summary(state),
            "state": state,
        }, duplicate

    if duplicate:
        label = target.get("name", target_id) if target else target_id or "system"
        append_packet_log(
            "DUPLICATE_IGNORED",
            target_id or "system",
            label,
            f"{action_type} duplicate ignored",
            "ACTION_API",
            bytes_len=0,
            dedupe_status="duplicate",
            sequence=sequence,
            action_code=action_type,
            risk_change=target.get("risk", {}).get("displayRiskScore") if target else None,
        )
        append_state_event(state, target_id or "system", "duplicate ignored", f"{action_type} / packetSeq {sequence} 已忽略，未重複加分。", "dedupe", sequence, target.get("risk", {}).get("displayRiskScore") if target else None)
    else:
        if bucket == "reset":
            reset_state = payload.get("state")
            if not isinstance(reset_state, dict):
                raise ValueError("reset payload.state required")
            store["state"] = clone_json(reset_state)
            state = store["state"]
            ensure_state_defaults(state)
            store["packetLog"] = []
            append_state_event(state, "system", "Demo reset", "Action API 已重置 demo state。", "reset", sequence)
            updated_target = find_target(state, state.get("activeTargetId")) or (state_targets(state)[0] if state_targets(state) else None)
        else:
            if bucket in {"network", "simulation"}:
                event_patch = payload.get("eventPatch")
                if isinstance(event_patch, dict):
                    current_event = state.setdefault("event", {})
                    for key, value in event_patch.items():
                        if key == "network" and isinstance(value, dict):
                            current_event.setdefault("network", {}).update(value)
                        elif key == "script" and isinstance(value, dict):
                            current_event.setdefault("script", {}).update(value)
                        else:
                            current_event[key] = value
                for patch in payload.get("targetPatches", []) if isinstance(payload.get("targetPatches"), list) else []:
                    patch_target_id = patch.get("id") or patch.get("targetId")
                    patch_target = find_target(state, patch_target_id)
                    if patch_target:
                        merge_target_patch(patch_target, patch)
                state["starryState"] = payload.get("starryState", state.get("starryState", {}))

            target_patch = payload.get("targetPatch") or payload.get("target")
            if target and isinstance(target_patch, dict):
                merge_target_patch(target, target_patch)
                updated_target = clone_json(target)
            elif target:
                updated_target = clone_json(target)

            if isinstance(payload.get("starryState"), dict):
                state["starryState"] = payload["starryState"]

            packet_entry = payload.get("packetLogEntry") if isinstance(payload.get("packetLogEntry"), dict) else {}
            label = (updated_target or target or {}).get("name", target_id or "system")
            risk_score = (updated_target or target or {}).get("risk", {}).get("displayRiskScore")
            packet = packet_entry.get("packet")
            bytes_len = packet_entry.get("bytes")
            append_packet_log(
                "SERVER_ACK",
                target_id or "system",
                label,
                f"{action_type} accepted",
                packet_entry.get("route") or "ACTION_API",
                packet=packet,
                bytes_len=bytes_len,
                dedupe_status="accepted",
                sequence=sequence,
                action_code=action_type,
                risk_change=risk_score,
            )
            append_state_event(
                state,
                target_id or "system",
                f"{action_type} accepted",
                f"packetSeq {sequence} / riskScore {risk_score if risk_score is not None else '-'} / {('stale baseRevision merged' if stale else 'ack')}",
                bucket,
                sequence,
                risk_score,
            )

        store["seenMobileEvents"][idempotency_key] = {
            "seenTs": time.time(),
            "action": action_type,
            "targetId": target_id,
            "sequence": sequence,
            "baseRevision": base_revision,
            "idempotencyKey": idempotency_key,
        }
        if target_id:
            state.setdefault("lastSeqByTarget", {})[target_id] = sequence
            store["lastSeqByTarget"][target_id] = sequence

    state["updatedAt"] = now
    ack = {
        "ok": True,
        "ackId": f"ack-{int(time.time() * 1000)}-{target_id or 'system'}-{sequence}",
        "duplicate": duplicate,
        "dedupeStatus": "duplicate ignored" if duplicate else "accepted",
        "message": "duplicate ignored" if duplicate else ("accepted with stale baseRevision merge" if stale else "accepted"),
        "targetId": target_id,
        "packetSeq": sequence,
        "seq": sequence,
        "actionType": action_type,
        "baseRevision": base_revision,
        "serverRevision": server_revision,
        "receivedAt": now,
    }
    return {
        "serverAck": ack,
        "newRevision": store["version"] + 1,
        "updatedTarget": updated_target,
        "stateSummary": state_summary(state),
        "state": state,
    }, duplicate


def packet_response(packet, decoded=None, error=None, duplicate=False, message="accepted"):
    return {
        "serverAck": {
            "ok": error is None,
            "ackId": f"ack-{int(time.time() * 1000)}",
            "duplicate": duplicate,
            "dedupeStatus": "duplicate" if duplicate else "accepted",
            "message": message if error is None else error,
            "receivedAt": utc_now(),
            "serverTimestamp": utc_now(),
            "sequence": decoded.get("sequence") if decoded else None,
            "seq": decoded.get("sequence") if decoded else None,
            "receivedAction": decoded.get("responseCode") if decoded else None,
            "recipientId": decoded.get("recipientId") if decoded else None,
            "targetId": decoded.get("recipientId") if decoded else None,
        },
        "packet": packet,
        "bytes": len(str(packet).encode("utf-8")),
        "targetId": decoded.get("recipientId") if decoded else None,
        "packetSeq": decoded.get("sequence") if decoded else None,
        "decodeResult": decoded,
    }


def local_ip():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        try:
            sock.close()
        except Exception:
            pass


def public_origin(handler):
    proto = handler.headers.get("X-Forwarded-Proto")
    host = handler.headers.get("X-Forwarded-Host") or handler.headers.get("Host")
    if proto and host:
        return f"{proto}://{host}"
    if os.environ.get("VERCEL") and host:
        return f"https://{host}"
    port = getattr(getattr(handler, "server", None), "server_port", 8765)
    return f"http://{host or f'127.0.0.1:{port}'}"


def plan_route(event):
    snapshot = event.get("network_snapshot", {})
    bandwidth = snapshot.get("bandwidth_kbps", 64)
    severity = event.get("severity", 1)
    if bandwidth < 16:
        payload_mode = "CODE"
        payload_bytes = 42
    elif bandwidth < 64:
        payload_mode = "SMS160"
        payload_bytes = min(140, event.get("message_bytes", 120))
    else:
        payload_mode = "BRIEF"
        payload_bytes = min(420, max(180, event.get("message_bytes", 160)))
    primary = "SMS" if bandwidth < 64 else "App Push"
    fallback = ["Voice IVR", "Satellite Relay", "Manual Call"] if severity >= 4 else ["SMS", "Manual Call"]
    return {
        "primary_channel": primary,
        "primary_score": 88 if primary == "SMS" else 82,
        "fallback_order": fallback,
        "payload_mode": payload_mode,
        "payload_bytes": payload_bytes,
        "estimated_reach_rate": 0.86,
        "ack_deadline_minutes": 5 if severity >= 4 else 30,
        "ranked_channels": [],
        "operator_actions": ["低頻寬模式，改寫為 SMS160 或 CODE payload"] if bandwidth < 64 else [],
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            remember_client(self, "health")
            self.json(
                {
                    "status": "ok",
                    "service": "xingye",
                    "version": public_state()["version"],
                    "mode": "vercel-serverless" if os.environ.get("VERCEL") or os.environ.get("STARRY_SERVERLESS") else "python-threading-http",
                    "sse": "one-shot" if os.environ.get("VERCEL") or os.environ.get("STARRY_SERVERLESS") else "streaming",
                    "stateFile": str(STATE_FILE),
                }
            )
        elif parsed.path == "/api/state":
            remember_client(self, "poll")
            self.json(public_state())
        elif parsed.path == "/api/demo-link":
            query = parse_qs(parsed.query)
            target = query.get("target", query.get("recipient", ["U-DEMO"]))[0]
            origin = public_origin(self).rstrip("/")
            if os.environ.get("VERCEL"):
                mobile_url = f"{origin}/?view=mobile&target={target}"
                lan_ip = "cloud-preview"
            else:
                port = getattr(getattr(self, "server", None), "server_port", 8765)
                lan_ip = local_ip()
                mobile_url = f"http://{lan_ip}:{port}/?view=mobile&target={target}"
            self.json(
                {
                    "adminUrl": f"{origin}/",
                    "mobileUrl": mobile_url,
                    "lanIp": lan_ip,
                }
            )
        elif parsed.path == "/api/events":
            self.stream_events()
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception as exc:
            self.json({"error": f"invalid json: {exc}"}, status=400)
            return

        if parsed.path == "/api/route/plan":
            self.json(plan_route(body))
            return

        if parsed.path == "/api/state":
            with store_lock:
                merge_state_from_client(body.get("state"), body.get("reason", "state-merge"))
                bump_version()
                payload = public_state()
            self.json(payload)
            return

        if parsed.path.startswith("/api/actions/"):
            action_bucket = parsed.path.rsplit("/", 1)[-1]
            if action_bucket in {"reply", "location", "network", "medical", "simulation", "reset"}:
                self.handle_client_action(body, action_bucket)
                return

        if parsed.path == "/api/reset":
            with store_lock:
                store["state"] = None
                store["packetLog"] = []
                store["seenPackets"] = {}
                store["seenMobileEvents"] = {}
                store["lastSeqByRecipient"] = {}
                store["lastSeqByTarget"] = {}
                bump_version()
            self.json(public_state())
            return

        if parsed.path == "/api/packets":
            self.handle_packet(body)
            return

        if parsed.path == "/api/mobile-event":
            self.handle_mobile_event(body)
            return

        if parsed.path == "/api/triage-answer":
            self.handle_triage_answer(body)
            return

        if parsed.path == "/api/location-update":
            self.handle_location_update(body)
            return

        if parsed.path == "/api/conversation/message":
            self.handle_state_action(body, apply_command_message)
            return

        if parsed.path == "/api/conversation/quick-reply":
            self.handle_state_action(body, apply_quick_reply)
            return

        if parsed.path == "/api/conversation/confirm":
            self.handle_state_action(body, apply_mark_confirmed)
            return

        if parsed.path == "/api/conversation/escalate":
            self.handle_state_action(body, apply_escalate_conversation)
            return

        if parsed.path == "/api/conversation/note":
            self.handle_state_action(body, apply_note)
            return

        if parsed.path == "/api/ui-log":
            self.handle_state_action(body, apply_ui_log)
            return

        self.send_error(404)

    def handle_client_action(self, body, action_bucket):
        try:
            with store_lock:
                response, duplicate = apply_client_action(body, self, action_bucket)
                bump_version()
                response["newRevision"] = store["version"]
                response["publicState"] = public_state()
            self.json(response, status=202 if duplicate else 200)
        except Exception as exc:
            with store_lock:
                response = packet_response(body, error=str(exc), message="action failed")
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                bump_version()
            self.json(response, status=400)

    def handle_packet(self, body):
        packet = body.get("packet", "")
        try:
            decoded = decode_packet(packet)
            with store_lock:
                duplicate, message = apply_decoded_packet(decoded)
                response = packet_response(packet, decoded, duplicate=duplicate, message=message)
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                bump_version()
                payload = {**response, "stateVersion": store["version"]}
            self.json(payload, status=202 if duplicate else 200)
        except Exception as exc:
            with store_lock:
                response = packet_response(packet, error=str(exc), message="decode failed")
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                bump_version()
            self.json(response, status=400)

    def handle_mobile_event(self, body):
        try:
            with store_lock:
                response, _route_decision, duplicate, _message = apply_mobile_event(body, self)
                if response is None:
                    response = packet_response(body, error=_message, message="mobile event failed")
                    store["packetLog"].insert(0, response)
                    del store["packetLog"][80:]
                    bump_version()
                    self.json(response, status=400)
                    return
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                append_server_ack_log(response)
                bump_version()
                payload = {**response, "stateVersion": store["version"], "publicState": public_state()}
            self.json(payload, status=202 if duplicate else 200)
        except Exception as exc:
            with store_lock:
                response = packet_response(body, error=str(exc), message="mobile event failed")
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                bump_version()
            self.json(response, status=400)

    def handle_triage_answer(self, body):
        try:
            with store_lock:
                response, duplicate, _message = apply_triage_answer(body, self)
                if response is None:
                    response = packet_response(body, error=_message, message="triage answer failed")
                    store["packetLog"].insert(0, response)
                    del store["packetLog"][80:]
                    bump_version()
                    self.json(response, status=400)
                    return
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                append_server_ack_log(response)
                bump_version()
                payload = {**response, "stateVersion": store["version"], "publicState": public_state()}
            self.json(payload, status=202 if duplicate else 200)
        except Exception as exc:
            with store_lock:
                response = packet_response(body, error=str(exc), message="triage answer failed")
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                bump_version()
            self.json(response, status=400)

    def handle_location_update(self, body):
        try:
            with store_lock:
                response, duplicate, _message = apply_location_update(body, self)
                if response is None:
                    response = packet_response(body, error=_message, message="location update failed")
                    store["packetLog"].insert(0, response)
                    del store["packetLog"][80:]
                    bump_version()
                    self.json(response, status=400)
                    return
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                append_server_ack_log(response)
                bump_version()
                payload = {**response, "stateVersion": store["version"], "publicState": public_state()}
            self.json(payload, status=202 if duplicate else 200)
        except Exception as exc:
            with store_lock:
                response = packet_response(body, error=str(exc), message="location update failed")
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                bump_version()
            self.json(response, status=400)

    def handle_state_action(self, body, action):
        try:
            with store_lock:
                response = action(body)
                bump_version()
                payload = {**response, "stateVersion": store["version"], "publicState": public_state()}
            self.json(payload)
        except Exception as exc:
            with store_lock:
                response = packet_response(body, error=str(exc), message="state action failed")
                store["packetLog"].insert(0, response)
                del store["packetLog"][80:]
                bump_version()
            self.json(response, status=400)

    def stream_events(self):
        remember_client(self, "sse")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        if os.environ.get("VERCEL") or os.environ.get("STARRY_SERVERLESS"):
            payload = public_state()
            data = json.dumps(payload, ensure_ascii=False)
            try:
                self.wfile.write(f"event: state\ndata: {data}\n\n".encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
            return
        last_version = -1
        started = time.time()
        try:
            while time.time() - started < 300:
                with store_changed:
                    current = store["version"]
                    if current == last_version:
                        store_changed.wait(timeout=15)
                    payload = public_state()
                    last_version = payload["version"]
                data = json.dumps(payload, ensure_ascii=False)
                self.wfile.write(f"event: state\ndata: {data}\n\n".encode("utf-8"))
                demo_state = payload.get("state") or {}
                active_alert = demo_state.get("activeAlert") or {}
                countdown = (demo_state.get("event") or {}).get("countdown") or {}
                demo_event = {
                    "type": "demo_state_updated",
                    "demoMode": bool((demo_state.get("event") or {}).get("demoCreatedAt")),
                    "disasterMode": bool((demo_state.get("network") or {}).get("disasterMode")),
                    "countdownRemaining": countdown.get("remainingSeconds"),
                    "alertLevel": active_alert.get("level") or ("critical" if (demo_state.get("network") or {}).get("disasterMode") else "info"),
                    "message": active_alert.get("message") or active_alert.get("title") or "星夜 demo 狀態已更新。",
                    "action": active_alert.get("action"),
                    "recipientId": active_alert.get("recipientId") or demo_state.get("activeRecipientId"),
                    "timestamp": active_alert.get("timestamp") or utc_now(),
                    "version": payload.get("version"),
                }
                self.wfile.write(f"event: demo_state_updated\ndata: {json.dumps(demo_event, ensure_ascii=False)}\n\n".encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            return

    def json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    load_store()
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    ip = local_ip()
    print(f"星夜 demo admin: http://127.0.0.1:{port}/")
    print(f"同 Wi-Fi 手機: http://{ip}:{port}/?view=mobile&target=U-DEMO")
    print(f"Route API: POST http://127.0.0.1:{port}/api/route/plan")
    server.serve_forever()


if __name__ == "__main__":
    main()
