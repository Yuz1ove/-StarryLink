# StarryLink 現場 QA Checklist

## 基本操作

- [ ] 五個分頁仍存在：作品介紹、海地星空通訊架構、Demo 展示、決策矩陣、程式運行。
- [ ] 所有主要按鈕可點，無 console error。
- [ ] 電腦端可啟動災害模式。
- [ ] 手機端連結可開啟 `?view=mobile&target=U-DEMO`。
- [ ] 手機端與電腦端同步同一位 `U-DEMO` target。

## Vercel / Deployment

- [ ] Vercel Project Root 是 `demo/`。
- [ ] 首頁可公開載入，不會被 Vercel SSO / login page 擋住。
- [ ] `index.html`、`styles.css`、`communicationEngine.js`、`lowDataPacket.js`、`demoStore.js`、`app.js` 都是 200。
- [ ] Demo 頁「部署狀態」小卡顯示 Frontend loaded。
- [ ] `/api/health`、`/api/state`、`/api/actions/reply` 顯示 OK；若失敗，畫面明確標示 `Vercel static preview`。
- [ ] Vercel 顯示 serverless volatile preview，不宣稱穩定跨裝置同步。
- [ ] sync mode 明確顯示 SSE / polling / volatile serverless / localStorage only。

## 手機狀態機

- [ ] 按「我安全」後，其他症狀取消，狀態為 GREEN / stable。
- [ ] 再按「我受傷」後，SAFE 取消，風險分數增加。
- [ ] 再按「我被困住」後，raw risk 累加，必要時進入 ORANGE / RED。
- [ ] 按 SOS 後，進入最高優先，通訊路徑偏向低資料 / 衛星備援。
- [ ] 按「清除狀態」後，症狀清空但事件紀錄保留。
- [ ] rawRiskScore 可超過 100，displayRiskScore clamp 到 100。

## Packet / ACK / Retry

- [ ] `packetSeq` 會變。
- [ ] `packetBytes` 會變。
- [ ] packet payload 不是靜態圖片或截圖。
- [ ] packetLog 可看到 accepted / duplicate ignored / retry / ack。
- [ ] 快速連點同一按鈕三次，不會重複加風險分數。
- [ ] 所有 runtime log 能對應 `targetId`、`packetSeq`、`riskScore`。

## GPS / Location

- [ ] GPS 成功時顯示 `GPS confirmed`、lat、lng、accuracy。
- [ ] 拒絕 GPS 權限後顯示 `GPS_DENIED`。
- [ ] GPS timeout/unavailable 顯示 `GPS_UNAVAILABLE`。
- [ ] GPS denied/unavailable 不顯示假座標。
- [ ] 手動位置按鈕可用：我在家、我在學校、我在避難點、我不知道位置。
- [ ] packet payload 的 `gps.status` 能表示 confirmed / denied / unavailable / manual。
- [ ] 後台風險矩陣包含 GPS 未確認或位置待確認。

## 通訊矩陣

- [ ] 正常網路 + 低風險：Wi-Fi 或 5G 優先。
- [ ] 弱訊號 + 中風險：SMS / BLE Relay 分數提高。
- [ ] 地面網路失效 + RED：Satellite Backup 或高優先備援提高分數。
- [ ] 電量低時，高耗電通道分數下降。
- [ ] GPS 未確認時，矩陣顯示 fallback / 人工確認理由。
- [ ] Satellite 不在 GREEN 狀態無條件勝出。
- [ ] UI 顯示 score breakdown、fallbackChannel、lowDataMode、packetSuccessRate、latency、loss、batteryImpact。

## 守望隊工作流

- [ ] 高風險 target 點開後顯示處理卡。
- [ ] 處理卡包含建議下一步、風險加分原因、通訊方式、位置可信度。
- [ ] 「標記已確認安全」可寫入事件紀錄。
- [ ] 「需要人工追蹤」可寫入事件紀錄。
- [ ] 「加入備註」可寫入事件紀錄。
- [ ] 篩選可切換已處理 / 未處理 / 高優先。

## 誠實展示

- [ ] 頁面顯眼位置標示 Demo / Simulation mode。
- [ ] 未宣稱已連接真實 SMS、119、醫療、衛星或推播服務。
- [ ] 沒有用靜態圖片、截圖或假成功畫面取代功能。
