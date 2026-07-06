# StarryLink Demo

This folder contains the runnable StarryLink disaster weak-network communication demo.

## Run

```sh
python3 demo/api_server.py
```

Admin:

```text
http://127.0.0.1:8765/
```

Mobile:

```text
http://<LAN_IP>:8765/?view=mobile&target=U-DEMO
```

## Canonical Data Model

The runtime model is `targets`.

Legacy `recipients` is accepted only as migration input and is normalized to `state.targets`. Public runtime state must expose:

- `state.targets`
- `state.packetLog`
- `state.events`
- `state.starryState`

See [schema.md](./schema.md).

## Demo Mode

This is a local simulation. It does not connect to real SMS, 119, medical, satellite, or push services. Low-data packets, ACK, retry, risk matrix scoring, and route switching are driven by local DOM, JS state, HTTP actions, and Python server state.

## Vercel Preview Mode

The Vercel deployment root is `demo/`. The root URL must serve `index.html` plus `styles.css`, `communicationEngine.js`, `lowDataPacket.js`, `demoStore.js`, and `app.js`.

Vercel does not run the local `ThreadingHTTPServer` as a long-lived process. The preview uses a Python serverless entrypoint at `api/index.py`; the frontend uses polling and action ACK checks instead of long-running SSE. Without an external store such as Vercel KV, Redis, Supabase, or Neon, serverless state can reset after cold starts. If the API is unavailable, the UI displays `Vercel static preview` and does not promise cross-device state sharing.

For stable judge demos, prefer:

- Local: `python3 demo/api_server.py`, laptop and phone on the same Wi-Fi.
- Online: verify the Deployment card shows `/api/health`, `/api/state`, and `/api/actions/reply` as OK before claiming cross-device sync.
- GPS: use HTTPS tunnel for real mobile geolocation; if it fails, demonstrate fallback instead of fake coordinates.

## Acceptance Walkthrough

1. Open the admin page.
2. Start disaster mode.
3. Copy the mobile link.
4. On mobile, tap `我受傷`, `無法說話`, and `我被困住`.
5. Confirm the admin list updates the same `U-DEMO` target.
6. Confirm `rawRiskScore`, `displayRiskScore`, `packetSeq`, ACK, retry, packet bytes, and event log change.
7. Simulate ground network failure.
8. Confirm the communication matrix shifts toward SMS / BLE Relay / Satellite Backup with score breakdown.
9. Deny GPS permission and confirm the UI shows `GPS_DENIED`, not fake coordinates.
10. Use manual location fallback and confirm packet payload `gps.status` becomes `manual`.

## GPS Notes

Browser geolocation usually requires HTTPS or localhost. For a phone on `http://LAN_IP`, permission may be denied or unavailable. For a polished live demo, use an HTTPS tunnel such as ngrok or Cloudflare Tunnel.

Fallback behavior:

- GPS success: `GPS confirmed`, lat/lng/accuracy.
- Permission denied: `GPS_DENIED`.
- Timeout/unavailable: `GPS_UNAVAILABLE`.
- Manual report: `MANUAL_HOME`, `MANUAL_SCHOOL`, `MANUAL_SHELTER`, or `MANUAL_UNKNOWN`.

## Action Endpoints

- `POST /api/actions/reply`
- `POST /api/actions/location`
- `POST /api/actions/network`
- `POST /api/actions/medical`
- `POST /api/actions/simulation`
- `POST /api/actions/reset`

Each action includes `clientId`, `targetId`, `actionType`, `seq` or `idempotencyKey`, `baseRevision`, `clientTimestamp`, and `payload`.

The server merges action patches, checks duplicate `idempotencyKey`, appends event/packet logs, and returns `serverAck`, `newRevision`, `updatedTarget`, and `stateSummary`.

## Online Smoke Test

```sh
npx --yes playwright --version
node demo/online-smoke-test.mjs https://YOUR-VERCEL-PREVIEW.vercel.app
```

The script opens desktop and mobile views, checks health endpoints, verifies `INJURED` sync, duplicate handling, `SAFE`, ground-network failure, and GPS denied fallback.
