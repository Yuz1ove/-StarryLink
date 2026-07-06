# StarryLink / 星夜

StarryLink 是災害弱網通訊 Demo，聚焦在「低資料封包、弱網同步、風險矩陣、通訊路徑決策、守望隊工作流」的可互動驗證。此版本為 Demo / Simulation mode：尚未連接真實 SMS、119、醫療、衛星或推播服務。

目前階段聚焦於決策引擎、低資料封包格式、弱網同步與守望隊工作流驗證；外部電信、衛星、119 與醫療系統可作為後續 API / 合作介接。

## 如何啟動

```sh
python3 demo/api_server.py
```

電腦端：

```text
http://127.0.0.1:8765/
```

手機端：

```text
http://<筆電區網 IP>:8765/?view=mobile&target=U-DEMO
```

也可以在電腦端按「複製手機連結」。

## Demo 操作腳本

1. 開啟電腦端工作台。
2. 按「啟動災害模式」。
3. 複製手機連結，用手機開啟。
4. 手機按「我受傷 / 無法說話 / 我被困住」。
5. 電腦端確認同一位 `U-DEMO` 的風險矩陣、`packetSeq`、ACK、retry、raw/display risk 立即改變。
6. 按「模擬地面網路失效」。
7. 觀察通訊路徑由 Wi-Fi / 5G 轉向 SMS / BLE Relay / Satellite Backup，並查看每個 channel 的 score breakdown。

## GPS 展示方式

手機瀏覽器通常只允許 HTTPS 或 localhost 使用 Geolocation API。若用 `http://LAN_IP`，GPS 可能被拒絕。

建議展示：

- 使用 HTTPS tunnel，例如 ngrok 或 Cloudflare Tunnel。
- 若只用 `http://LAN_IP`，請主動展示 GPS fallback 流程。
- GPS 成功會顯示 `GPS confirmed`、lat、lng、accuracy。
- 拒絕權限會顯示 `GPS_DENIED`，不會顯示假座標。
- timeout 或 unavailable 會顯示 `GPS_UNAVAILABLE`。
- 可用「我在家 / 我在學校 / 我在避難點 / 我不知道位置」手動回報。

## Action API

前端互動不再整包覆蓋 `/api/state`，而是使用 action endpoints：

- `POST /api/actions/reply`
- `POST /api/actions/location`
- `POST /api/actions/network`
- `POST /api/actions/medical`
- `POST /api/actions/simulation`
- `POST /api/actions/reset`

每個 action payload 包含：

- `clientId`
- `targetId`
- `actionType`
- `seq` 或 `idempotencyKey`
- `baseRevision`
- `clientTimestamp`
- `payload`

Server 會回傳 `serverAck`、`newRevision`、`updatedTarget`、`stateSummary`，並用 `idempotencyKey` 忽略重複封包。

## 限制聲明

- 本 Demo 的 SMS、119、醫療、衛星、推播皆為本機模擬。
- packet loss、ACK、retry、通訊路徑切換、風險矩陣皆由本機 JS/Python state 驅動。
- GPS 若被瀏覽器拒絕，不會假裝取得定位。
- 同 Wi-Fi / LAN 推估若出現，必須視為「非真實 GPS，僅 Demo 推估」。

## 未來可介接項目

- 電信 SMS / Cell Broadcast API。
- 衛星訊息或備援通訊 API。
- 119 / 地方救災系統協作 API。
- 醫療照護平台或守護者聯絡 API。
- 多節點 store-and-forward / mesh relay。

## 評審展示建議

- 先強調這不是靜態圖片，而是真實 DOM、JS state、HTTP action、packet log。
- 用手機實際點「我受傷」，讓電腦端 `U-DEMO` 風險分數上升。
- 快速連點同一按鈕三次，展示 duplicate ignored，不重複加分。
- 拒絕 GPS 權限，展示 `GPS_DENIED` 與位置待確認風險。
- 模擬地面網路失效，展示 score breakdown 為何提高 SMS / BLE / Satellite Backup。
