# StarryLink Demo State Schema

StarryLink uses one runtime model: `targets`.

Legacy `recipients` may appear only as migration input from older saved demo state. The server and frontend must normalize it into `state.targets` before reading or returning state.

## Public State Shape

```json
{
  "app": "xingye-sea-ground-space-demo",
  "revision": 1,
  "updatedAt": "2026-07-06T00:00:00.000Z",
  "activeTargetId": "U-DEMO",
  "selectedTargetId": "U-DEMO",
  "event": {
    "title": "地震後海纜與地面骨幹不穩情境",
    "status": "災害模式啟動",
    "network": {},
    "script": {}
  },
  "targets": [],
  "packetLog": [],
  "events": [],
  "starryState": {}
}
```

Required public keys returned by runtime endpoints:

- `state.targets`
- `state.packetLog`
- `state.events`
- `state.starryState`

## Target Shape

```json
{
  "id": "U-DEMO",
  "name": "Demo 使用者",
  "role": "general",
  "signalQuality": 78,
  "battery": 72,
  "selectedSymptoms": ["INJURED"],
  "location": {
    "lat": null,
    "lng": null,
    "accuracy": "unknown",
    "confirmed": false,
    "source": "GPS_DENIED",
    "manualLabel": null,
    "updatedAt": "2026-07-06T00:00:00.000Z"
  },
  "medical": {},
  "latestReply": {
    "code": "INJURED",
    "label": "我受傷",
    "timestamp": 1780000000000
  },
  "communication": {
    "primaryRoute": "SMS",
    "fallbackRoute": "BLE_RELAY",
    "packetSeq": 12,
    "packetBytes": 148,
    "ackStatus": "received",
    "retryCount": 0,
    "lowDataMode": true,
    "channelScores": []
  },
  "risk": {
    "rawRiskScore": 116,
    "displayRiskScore": 100,
    "score": 100,
    "level": "RED",
    "items": []
  },
  "workflow": {
    "status": "unhandled",
    "priority": "normal",
    "notes": [],
    "updatedAt": null
  }
}
```

## Action API Envelope

All action endpoints use this envelope:

```json
{
  "clientId": "client-abc",
  "targetId": "U-DEMO",
  "actionType": "reply",
  "seq": 12,
  "idempotencyKey": "client-abc:U-DEMO:reply:INJURED:118",
  "baseRevision": 4,
  "clientTimestamp": "2026-07-06T00:00:00.000Z",
  "payload": {}
}
```

Endpoints:

- `POST /api/actions/reply`
- `POST /api/actions/location`
- `POST /api/actions/network`
- `POST /api/actions/medical`
- `POST /api/actions/simulation`
- `POST /api/actions/reset`

Server response includes `serverAck`, `newRevision`, `updatedTarget`, `stateSummary`, and `publicState.state`.
