# 星夜｜AI 韌性通訊路由助理 Demo

這個展示原型將「星夜」呈現為可操作的三端 Demo，副標為「AI 韌性通訊路由助理」：

- 手機端：模擬使用者收到通知、查看通訊管道、在 SLA 內一鍵回覆 ACK。
- WEB 管理台：查看事件 KPI、未確認名單、通訊路由結果、AI 決策模擬與事件時間線。
- 後端路由決策模擬：以本地 deterministic rule-based engine 產生 RouteDecision，不依賴外部 API。

## 檔案結構

```text
demo/
  index.html                  主展示頁
  styles.css                  深色 SaaS 守護指揮中心 UI
  data.js                     EventScenario / Recipient / Channel mock data
  routeDecisionEngine.js      路由評分與可解釋決策規則
  routeDecisionEngine.test.js 簡易 Node 測試
  app.js                      Demo 狀態管理與互動
  api_server.py               本機靜態檔案與舊 API 伺服器
```

## MVP 現場展示重點

目前 P0 展示流程已改為後端同步模式，不再只靠單頁假資料：

- 筆電後台透過本機後端建立 / 更新事件狀態。
- 手機頁用同一 Wi-Fi 的筆電 IP 開啟，按鈕會送出 Low Data Packet。
- 後端負責 decode、dedupe、寫入 packet log、回 serverAck，並更新事件狀態。
- 後台透過 SSE 即時更新；若 SSE 不可用，前端會用 HTTP polling 讀取 `/api/state`。
- 手機送出回覆一律走 HTTP POST `/api/mobile-event`，使用明確 `action` code，失敗會最多 retry 3 次。
- 後端狀態寫入 `demo/demo_state.json`，重新整理後台或手機頁不會讓事件消失。
- 後台會固定顯示 LAN mobile link、需要處理名單、connected clients、ACK 完成率、收件者狀態、事件時間線與 Low Data Packet Log。
- 後台新增「災害應變倒數」Start / Pause / Reset，可把 SLA、事件狀態與升級流程連在同一個畫面。
- 後台新增分析與派遣建議、同網路位置偵測模擬、即時同步鏈路，方便現場展示風險分數、最近協助者、serverAck 與定位限制。
- P1.8 新增低資料按鍵式安全對答、手機端事件狀態警示卡、短提示音 / 震動、deterministic 風險評分閉環與後台「安全對答流程」面板。

本 demo 用於展示弱網情境下的低資料求援、ACK 追蹤、後台同步與決策輔助，不應宣稱已具備正式救援系統能力。

## 直接開啟

`demo/index.html` 仍可作為靜態 UI 預覽，但雙端同步、serverAck、dedupe 與刷新後保留狀態都需要啟動本機伺服器。

## 啟動本機伺服器

```bash
python3 demo/api_server.py
```

開啟：

```text
http://127.0.0.1:8765/
```

伺服器啟動時會印出同 Wi-Fi 手機可用的連結，例如：

```text
http://<筆電本機 IP>:8765/?view=mobile&recipient=r-elder
```

後台也可以按「複製手機連結」取得目前收件者的手機頁。

## 3 分鐘 MVP 展示流程

1. 筆電開啟 `http://127.0.0.1:8765/`。
2. 按「重置 Demo」清空封包紀錄與 dedupe cache。
3. 按「建立事件」，再按「執行 AI 路由」。
4. 手機用同 Wi-Fi 連到伺服器印出的 mobile URL。
5. 手機按「我平安」：後台 ACK 完成率上升，Low Data Packet Log 顯示 compact payload、bytes、decode result 與 serverAck。
6. 手機按「需要協助」或「需要醫療」：後台「需要處理名單」立即新增該使用者，醫療回覆會提高人工處理建議。
7. 手機按「無法通話」：後台 AI 建議會顯示 Voice IVR 降權，改推 SMS / Manual Call。
8. 手機按「位置異常」：後台會列入需處理名單，並在同網路位置偵測模擬中標示非真實 GPS 定位。
9. 按「模擬 5 分鐘後未回覆」可立即展示 SLA 升級；後台開著時也會依災害應變倒數自動檢查未回覆者。

## API 驗收指令

啟動伺服器後，可用以下重點檢查：

```bash
curl http://127.0.0.1:8765/api/health
curl http://127.0.0.1:8765/api/state
curl http://127.0.0.1:8765/api/demo-link?recipient=r-elder
```

手機 action Low Data Packet：

```text
{"r":"recipientId","a":"ACTION_CODE","s":severity,"t":timestamp,"d":"dedupeKey","seq":sequence}
```

按鍵回答 Low Data Packet：

```text
{"r":"recipientId","a":"ACTION_CODE","q":"QUESTION_ID","ans":"ANSWER_CODE","t":timestamp,"d":"dedupeKey","seq":sequence}
```

後台問題 payload：

```text
{"r":"recipientId","f":"FLOW_ID","q":"QUESTION_ID","t":timestamp,"seq":sequence}
```

其中 action code 包含 `SAFE_OK / NEED_HELP / CANNOT_TALK / NEED_MEDICAL / LOCATION_ANOMALY`。後端以 `recipientId + action + questionId + answerCode + 15 秒 dedupe window` 去重；相同答案會回 `202 duplicate ACK`，不同答案碼不會被 dedupe，會重新更新風險分數。

## P1.6 手機按鈕資料流

手機端五個大按鈕都使用 `data-action`：

- `SAFE_OK`：我平安，低風險，記錄 ACK，不進入高優先待處理。
- `NEED_HELP`：需要協助，SEV-3，進入需要處理名單。
- `CANNOT_TALK`：無法通話，SEV-4，優先 SMS / Low Data Text，不把 Voice IVR 當主要回覆方式。
- `NEED_MEDICAL`：需要醫療，SEV-5，最高優先級，建議守護指揮中心人工追蹤與守護者模擬通知。
- `LOCATION_ANOMALY`：位置異常，SEV-4，後台追蹤與同網路位置模擬確認。

送出流程：

1. 使用者按下按鈕。
2. 按鈕進入 active 狀態，手機顯示「送出中」。
3. 手機送出 compact low-data payload 到 `/api/mobile-event`。
4. 後端 validate action、dedupe、產生 serverAck。
5. 後台透過 SSE / polling 更新手機鏡像畫面、需要處理名單、事件時間線與 Low Data Packet Log。
6. 手機顯示 `serverAck OK`；重複按同一 action 時顯示「後台已收到，不需要重複按」。

## 災害倒數

後台「災害應變倒數」支援 Start / Pause / Reset：

- 未開始：平時監測。
- 倒數中：警戒中。
- 低於 01:00：高風險。
- 倒數結束：災害模式，AI route decision 更偏向低資料、高可靠度、多通道備援與 ACK 追蹤。
- Reset demo 會清空事件狀態與封包紀錄，但不需要重啟 server。

## 安全確認與對答

後台「安全對答流程」是 demo 內部的模擬安全確認，不是真實 SMS、LINE、119 / 110、醫療或推播服務。

- 手機端按下 `SAFE_OK / NEED_HELP / CANNOT_TALK / NEED_MEDICAL / LOCATION_ANOMALY` 後，後端會建立 `triageFlows[recipientId]`。
- flow 會保存 `flowId / currentQuestionId / completedQuestionIds / answers / risk / recommendedOperatorAction`。
- 後台可點「查看安全對答」、標記已確認、升級處理、加入備註。
- 手機端不做複雜聊天室，只顯示事件狀態卡、serverAck、目前題目與 2 到 4 個大按鈕答案。
- 按鍵回答走 `/api/triage-answer` 回後端，更新對答流程、事件時間線、Low Data Packet Log、需要處理名單與 AI 決策摘要。
- 舊 `/api/conversation/quick-reply` 仍保留給 P1.7 相容展示，但 P1.8 主流程不依賴自由文字或 quick reply。
- `NEED_MEDICAL` 文案只做安全確認與後台聯繫提示，不提供具體醫療處置，也不宣稱真實醫療單位已派出。

## P1.9 安全強化重點

P1.9 補強「手機獨立警示、GPS 補充定位、正確通訊資訊、低資料互動、評分矩陣、可靠 ack/retry/dedupe」。

- 手機端獨立頁面也會透過 SSE `/api/events` 接收 `demo_state_updated`；若 SSE 失敗，仍會用 `/api/state` polling 更新。
- 手機不需要在後台 iframe 內，也能收到 `DEMO_STARTED / DISASTER_COUNTDOWN_STARTED / DISASTER_MODE_ENABLED / HIGH_RISK_EVENT / OPERATOR_MESSAGE / TRIAGE_QUESTION / ROUTE_DECISION_UPDATED / RESET_DEMO` 這類 demo 狀態。
- 手機提示音與震動需要使用者先點「啟用提示音與震動」。瀏覽器拒絕自動播放時，手機仍會顯示紅 / 橘色視覺警示與 document title 警示。
- 手機端 GPS 使用 Browser Geolocation API，必須由使用者授權；使用者可拒絕，拒絕後仍可完成 demo。
- GPS 不會阻塞求援事件。手機按 action 會先送出 `MOBILE_ACTION`，定位成功或失敗後再送 `LOCATION_UPDATE` / `GPS_PERMISSION_DENIED`。
- GPS 失敗後依序 fallback：同網路模擬定位、demo fallback profile、位置待確認。
- 同網路定位只是 demo 推估，不是真實 GPS，也不是正式救援定位系統。
- 後台「通訊資訊確認」顯示 recipient communication profile，電話均為 masked demo profile，不顯示完整真實電話。
- `routeDecisionEngine` 是 deterministic rule-based scoring matrix，不是醫療診斷，不呼叫外部 AI。
- demo 未連接真實 SMS、119、110、醫療、推播或外部派遣服務。
- `seq / serverAck / retry / dedupeKey / resync` 用於降低弱網下事件遺漏風險，但不宣稱網路層絕對不丟包。

手機 action compact payload：

```json
{"r":"recipientId","a":"NEED_MEDICAL","s":5,"t":1780000000,"seq":12,"d":"dedupeKey"}
```

GPS payload：

```json
{"r":"recipientId","type":"LOCATION_UPDATE","source":"GPS","lat":25.0123,"lng":121.4621,"accuracy":38,"timestamp":"...","seq":13,"dedupeKey":"..."}
```

serverAck 會包含：

```json
{"ackId":"ack-...","seq":12,"dedupeStatus":"accepted","serverTimestamp":"...","receivedAction":"NEED_MEDICAL","recipientId":"r-elder"}
```

## 警示音與瀏覽器限制

後台上方有「啟用警示音 / 靜音」按鈕。瀏覽器通常禁止未經使用者互動的自動播放音效，因此現場展示建議先點擊「啟用警示音」；點擊 Start 災害倒數也會嘗試初始化 Web Audio API。

- Start 災害倒數：短提示音。
- 倒數低於 01:00：中高優先提示。
- 倒數結束：高優先警報，事件進入災害模式。
- 收到 `NEED_MEDICAL` 或 SEV-5：高優先警報。
- 收到 `CANNOT_TALK / LOCATION_ANOMALY / NEED_HELP`：中高優先提示。
- `SAFE_OK` 不播放刺耳警報。
- 靜音後仍保留 alert banner、toast、需要處理名單高亮與 document title 閃爍。
- Reset Demo 會停止排程中的提示音、清除 banner/toast/title 警示與所有安全確認對話。

## 同網路位置偵測（模擬）

後端會讀取手機端 remote IP，判斷是否與筆電 LAN IP 在同一 subnet，並套用 `demoLocationProfile`。

畫面必須視為展示輔助：

- 此為同網路推測定位，非真實 GPS 定位。
- 顯示區域、建物、樓層、demo fixed coordinates、模擬精準度、最近協助者、距離與預估抵達。
- 不代表真實定位本人，也不代表真實救援單位已派出。

## 決策引擎說明

`routeDecisionEngine.js` 是 deterministic rule-based demo，不是外部 AI、不是醫療判斷，也不會呼叫外部服務。它根據事件嚴重度、action、災害模式、頻寬、延遲、封包遺失、SSE 狀態、收件者能力、ACK 狀態、通道可用性與模擬位置可信度產生：

- 主通道
- 備援通道
- 風險分數
- 決策原因
- ACK plan
- 建議下一步
- 派遣建議

P1.8 起，`routeActionDecision` 也會納入 `triageFlow` 狀態：

- `NEED_MEDICAL + MED_ALONE / MED_REPLY_HARD / MED_REPLY_UNSURE` 會提高風險並建議人工聯繫或守護者確認。
- `CANNOT_TALK` 不把 Voice IVR 當主要確認方式。
- `LOCATION_ANOMALY + LOC_UNKNOWN` 會提高位置確認優先級。
- `SAFE_OK + SAFE_DONE` 保持低風險。
- `SAFE_OK + SAFE_TO_HELP` 會升級成 `NEED_HELP`。
- `safetyConfirmed=true` 會降低風險，但高風險事件不會被完全清除。
- 後台訊息逾時未回覆會建議升級處理。
- 位置異常且無長者回覆時會建議優先人工確認。

## P1.8 低資料按鍵式安全對答

P1.8 不做完整聊天室，也不要求長者打字。手機端流程是：

1. 長者點選大按鈕狀態回報。
2. 手機顯示事件狀態卡與 serverAck。
3. 系統顯示一題固定問題。
4. 長者只點選 2 到 4 個大按鈕中的一個。
5. 手機送出短碼 answer payload。
6. 後台即時更新目前題目、最近回答、風險分數、建議處置與 Low Data Packet Log。

`TRIAGE_FLOWS` 包含：

- `SAFE_OK`：平安確認，`SAFE_TO_HELP` 會升級成 `NEED_HELP`。
- `NEED_HELP`：確認立即危險、身邊協助者、偏好聯繫方式。
- `CANNOT_TALK`：確認是否可看文字、是否有人協助、是否要持續文字確認；不把 Voice IVR 當唯一主要方式。
- `NEED_MEDICAL`：確認是否能繼續點選、是否有人留意、位置是否安全、是否需指定守護者立即聯繫。
- `LOCATION_ANOMALY`：確認是否熟悉地點、是否可留在安全位置、是否需守護者協助確認位置。

風險分數是 deterministic rule-based：

- base score：`SAFE_OK=5 / NEED_HELP=45 / CANNOT_TALK=60 / NEED_MEDICAL=75 / LOCATION_ANOMALY=55`
- modifiers：災害模式、弱網、ACK 未收到、回覆困難、獨自一人、位置不確定、位置不安全、要求立即聯繫、已安全確認等。
- tier：`0-29 低風險 / 30-59 中風險 / 60-79 高風險 / 80-100 緊急優先`

新增 Low Data Packet Log 類型：

```text
MOBILE_ACTION
TRIAGE_QUESTION
TRIAGE_ANSWER
LOCATION_UPDATE
GPS_PERMISSION_DENIED
RETRY_SENT
RISK_MATRIX_UPDATED
ROUTE_DECISION_UPDATED
MOBILE_ALERT_RECEIVED
SERVER_ACK
DUPLICATE_IGNORED
COMMAND_MESSAGE
QUICK_REPLY
INTERNAL_ACK
ALERT_SOUND
CONVERSATION_OPENED
SAFETY_CONFIRMED
```

手機端提示：

- `SAFE_OK` 只做平安視覺提示。
- `NEED_HELP / CANNOT_TALK / LOCATION_ANOMALY` 嘗試短提示音或震動一次。
- `NEED_MEDICAL` 嘗試 2 到 3 段短提示音 / 震動，但不持續播放。
- 手機端可按「關閉提示音」，瀏覽器不支援音效或震動時仍保留視覺高亮與警示卡。

安全限制：

- 不連接真實 SMS、LINE、119 / 110、醫療、GPS 或推播服務。
- 不宣稱真實外部單位已派出。
- 不提供具體醫療處置。
- 同網路位置只顯示「同網路推測定位，非真實 GPS 定位」。

## P1.9 風險評分矩陣

後台「風險評分矩陣」會顯示每個因素的 current value、score delta、reason、confidence，最後輸出 `baseScore / totalDelta / finalRiskScore / riskTier / recommendedAction / primaryChannel / backupChannels / escalationRequired`。

矩陣因素包含：

- 事件類型
- 事件嚴重度
- 災害模式
- 網路頻寬
- 延遲
- 封包遺失率
- 基地台壅塞
- ACK 狀態
- retry 次數
- 是否可通話
- 是否可文字
- 長者最近回答
- 是否獨自一人
- 位置來源
- GPS 精準度
- 位置是否異常
- 最近協助者距離
- 通訊資料完整度
- 未回覆時間

後台「風險矩陣操作模式」可調整 GPS 狀態、通訊資料、長者回覆、ACK 狀態；頻寬、延遲、封包遺失、災害模式、行動網路、固網、衛星、電力風險也會連動 route decision。調整情境只會重算 matrix，不會新增事件；必須按「建立事件」或由手機送出 action 才會建立事件。

## P1.9 Low Data Packet Log

新增或強化的 log 類型：

```text
MOBILE_ACTION
TRIAGE_ANSWER
LOCATION_UPDATE
GPS_PERMISSION_DENIED
SERVER_ACK
RETRY_SENT
DUPLICATE_IGNORED
RISK_MATRIX_UPDATED
ROUTE_DECISION_UPDATED
MOBILE_ALERT_RECEIVED
```

每筆 log 會盡量顯示 time、type、recipient、action、seq、bytes、channel、ack、source；accepted action 會另外補一筆 `SERVER_ACK` row，讓評審可以直接看到 ACK 回來的節點；duplicate 會回 `202 duplicate ACK`，畫面顯示「後台已收到，不需要重複按」。

## P1.9 展示流程

1. 筆電啟動 server：`python3 demo/api_server.py`。
2. 筆電開後台：`http://127.0.0.1:8765/`。
3. 手機開 LAN mobile link：`http://<筆電本機 IP>:8765/?view=mobile&recipient=r-elder`。
4. 手機點「啟用提示音與震動」。
5. 手機點「重新取得位置」並允許 GPS。
6. 後台按 Start 災害倒數。
7. 手機端收到災害模式提醒。
8. 手機按「需要醫療」。
9. 後台收到 action、GPS、seq、serverAck。
10. 手機進入低資料按鍵式確認。
11. 使用者點選「我一個人」或「無法確認」。
12. 後台評分矩陣升高風險。
13. route decision 建議 SMS / LOW_DATA_TEXT + Manual Follow-up。
14. Low Data Packet Log 顯示完整封包鏈。
15. Reset Demo 後重新展示。

## P1.10 分頁化展示與程式運行判讀

後台 Demo 工作區改為 client-side tabs，不建立多個 HTML 檔，也不引入 React / Vue / Next.js。切換 tab 只改 UI 顯示，不會重啟 SSE、不會清空手機狀態、GPS 狀態、pending queue、route decision、Low Data Packet Log 或 runtime trace。CHT 整合與市場模式移到預設收合的補充資料區，避免現場 demo 時頁面被非流程資訊拉長。

分頁用途：

- 總覽：展示標題、倒數、災害模式、手機連線、LAN mobile link、最高風險事件、風險分數、主通道 / 備援、ACK 與最近事件。
- 手機互動：手機即時鏡像、連線狀態、active action、手機警報、GPS、安全確認題目、最近回答、serverAck、Low Data bytes、提示音 / 震動狀態。
- 守護指揮中心：需要處理名單、事件詳情、安全確認對答、快捷處置建議、標記已確認、升級處理、守護者 / 社區協助者資訊。
- 位置與 GPS：GPS 權限、座標、accuracy、同網路模擬定位、fallback 優先級、位置警告、協助者距離與 demo 模擬地圖卡。
- 風險矩陣：`baseScore / totalDelta / finalRiskScore / riskTier / recommendedAction / escalationRequired / primaryChannel / backupChannels` 與每個 factor 的 reason。
- 封包紀錄：Low Data Packet Log、compact payload、normalized event、seq、dedupeKey、serverAck、retry、duplicate、bytes、channel、timestamp；點選 log row 可看詳情。
- 程式判讀：Runtime Pipeline、Current State Snapshot、Last Event Trace、Decision Reasoning Trace、Channel Score Table、Reliability Trace、GPS / Location Trace、SSE Trace。
- 展示設定：情境、倒數、網路 slider、災害 / 電力 / 行動網路開關、GPS / 通訊資料 / 回覆 / ACK 模擬與 Reset Demo。

建議展示順序：

1. 總覽：說明星夜解決弱網求援問題。
2. 手機互動：手機按下需要醫療或無法通話。
3. 守護指揮中心：後台看到待處理事件。
4. 風險矩陣：展示為什麼風險分數升高。
5. 低資料封包：展示封包很小且有 ACK。
6. 程式運行與判讀：展示背後每一步判斷與路由選擇。
7. 位置與 GPS：展示 GPS / fallback 定位。
8. 展示設定：Reset Demo 後重新展示。

### Runtime Trace

前端維護 `runtimeTrace`、`debugTrace` 與 `sseTrace` 記憶體狀態。手機 action、triage answer、GPS update、SSE event、serverAck 回應與 dashboard render 都會呼叫 `recordTrace(...)` 或 `recordSseTrace(...)`。後端 `/api/mobile-event`、`/api/triage-answer`、`/api/location-update` 也會回傳 `trace` summary，前端收到後併入 Runtime Pipeline。

這是 demo 透明化工具，不是 console log 替代品。它讓評審看到：

- 手機如何建立 compact payload。
- `/api/mobile-event` 如何驗證 action、dedupe 與回傳 serverAck。
- triage flow 與 GPS / fallback 如何合併到事件狀態。
- 風險分數如何由 baseScore 加總 modifiers。
- routeDecisionEngine 為何選 SMS / LOW_DATA_TEXT / Manual Follow-up。
- SSE 如何讓 dashboard 與 mobile mirror 同步。

`routeDecisionEngine` 是 deterministic rule-based decision engine，不是醫療診斷，也不宣稱外部通報已完成。`seq / serverAck / retry / dedupe` 用來降低弱網下事件漏接與重複處理風險，但不宣稱網路層絕對不丟包。

GPS 與位置：

- GPS 成功且 accuracy 合理時，位置來源顯示 GPS。
- GPS 被拒絕或失敗時，fallback 到同網路模擬定位或 demo profile，並要求低資料位置確認。
- 同網路定位是 demo 推測，不是真實 GPS。
- 本 demo 未連接真實 SMS、真實 119 / 110、醫療派遣、登入、永久資料庫或真實推播。

## P1.8 現場展示流程

1. 筆電開啟 `http://127.0.0.1:8765/`。
2. 點擊「啟用警示音」，手機端可保留或關閉提示音。
3. 點擊災害倒數 Start。
4. 手機端按下「需要醫療」。
5. 手機端顯示紅色高優先狀態卡，嘗試短提示音 / 震動，並顯示「醫療協助確認 1 / 4」。
6. 筆電端顯示高風險事件、需要處理名單與「安全對答流程」。
7. 手機端回答 `MED_Q1=MED_REPLY_HARD`。
8. 後台風險分數提高，Low Data Packet Log 出現 `TRIAGE_ANSWER / RISK_SCORE_UPDATED / ROUTE_DECISION_UPDATED`。
9. 手機端回答 `MED_Q2=MED_ALONE`。
10. 後台建議更新為「優先人工聯繫與守護者確認」。
11. 可改測 `LOCATION_ANOMALY + LOC_UNKNOWN`，確認後台顯示「同網路推測定位，非真實 GPS 定位」。
12. Reset Demo 後可重新展示。

## P2 未實作

本輪刻意不實作：

- 真實 SMS 串接
- 真實緊急醫療通報
- 正式救援級 GPS 定位或派遣
- 登入權限
- 永久資料庫
- 真實推播

## 驗證決策引擎

```bash
node demo/routeDecisionEngine.test.js
```

測試會檢查：

- 弱網家庭情境優先 SMS 或 Voice IVR。
- 長者不會只依賴 App Push。
- 行動網路不可用時不選 Push / SMS。
- 企業網路正常時優先 App Push。
- NEED_MEDICAL + GPS 成功 + ACK OK 仍高風險，但位置不確定風險降低。
- GPS denied、低精準度、LOCATION_ANOMALY、缺 guardian contact、retry / ACK timeout、SAFE_OK + GPS denied 與 dedupe 行為。

## 現場展示模式

頁面中的「Demo Script Mode」按「下一步」會依序播放：

1. 建立家庭平安事件。
2. 普通網路先走 App Push + SMS fallback。
3. 將網路切到弱訊號。
4. 重新路由為 SMS + Voice IVR。
5. 模擬其中一人未 ACK。
6. 升級通知社區守望者與管理端。
7. 顯示結案摘要。

## 手動操作建議

1. 選擇「颱風災害弱網」或「社區長者失聯」。
2. 按「建立事件」再按「執行 AI 路由」。
3. 在手機端按「我平安」或「需要醫療」，觀察管理端 ACK 狀態與時間線更新。
4. 按「模擬 5 分鐘後未回覆」，觀察未確認者轉為需升級、備援觸發數增加。
5. 到「決策引擎」區查看輸入 JSON、路由評分表、RouteDecision JSON 與 fallback plan。
6. 用「災害應變倒數」Start / Pause / Reset 展示事件時間、ACK 追蹤與升級狀態如何同步。
