# 星夜｜AI 韌性通訊路由助理 Demo

這個展示原型將「星夜」呈現為可操作的三端 Demo，副標為「AI 韌性通訊路由助理」：

- 手機端：模擬使用者收到通知、查看通訊管道、在 SLA 內一鍵回覆 ACK。
- WEB 管理台：查看事件 KPI、未確認名單、通訊路由結果、AI 決策模擬與事件時間線。
- 後端路由決策模擬：以本地 deterministic rule-based engine 產生 RouteDecision，不依賴外部 API。

## 檔案結構

```text
demo/
  index.html                  主展示頁
  styles.css                  深色 SaaS 戰情室 UI
  data.js                     EventScenario / Recipient / Channel mock data
  routeDecisionEngine.js      路由評分與可解釋決策規則
  routeDecisionEngine.test.js 簡易 Node 測試
  app.js                      Demo 狀態管理與互動
  api_server.py               本機靜態檔案與舊 API 伺服器
```

## 直接開啟

可直接開啟：

```text
demo/index.html
```

## 啟動本機伺服器

```bash
python3 demo/api_server.py
```

開啟：

```text
http://127.0.0.1:8765/
```

## 驗證決策引擎

```bash
node demo/routeDecisionEngine.test.js
```

測試會檢查：

- 弱網家庭情境優先 SMS 或 Voice IVR。
- 長者不會只依賴 App Push。
- 行動網路不可用時不選 Push / SMS。
- 企業網路正常時優先 App Push。

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
