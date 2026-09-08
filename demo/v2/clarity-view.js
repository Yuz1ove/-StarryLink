/** Presentation only. The scenario adapter remains the authority for admission. */
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value = v => v == null ? '無資料' : esc(v);
const number = (v, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : '無資料';
const percent = v => Number.isFinite(v) ? `${number(v * 100, 1)}%` : '無資料';
const json = v => esc(JSON.stringify(v ?? null, null, 2));
const routeById = (state, id) => state?.candidates?.find(r => r.id === id);
export const METRICS = [['reliability','可靠度'],['capacity','容量'],['latency','延遲 P95'],['energy','能耗'],['availability','設施可用性'],['risk','風險'],['deliveryProbability','送達機率']];
export function routeName(route) { return route?.hops?.map(h => h.label || h.id).join(' → ') || '無資料'; }
export function inspectedRoute(state, selected) { return routeById(state, selected) || routeById(state, state?.recommendation?.routeId) || state?.candidates?.[0]; }
function tag(text, kind = '') { return `<span class="clarity-tag ${kind}">${esc(text)}</span>`; }
function routeTags(state, route, selected) {
  return [state.recommendation.routeId === route.id && tag('系統推薦','recommended'), selected === route.id && tag('正在檢視','viewing'), state.deliveryStatus.routeId === route.id && tag('本次傳輸路徑'), state.recommendation.fallbackRouteId === route.id && tag('契約備援')].filter(Boolean).join('');
}
function scenarioTools(scenario) {
  return `<div class="heading-tools"><label class="sr-only" for="clarity-scenario">本次情境</label><select id="clarity-scenario" data-scenario-select><option value="disaster" ${scenario === 'disaster' ? 'selected' : ''}>天災 · 震後山谷</option><option value="conflict" ${scenario === 'conflict' ? 'selected' : ''}>戰爭 · 海岸設施受損</option></select></div>`;
}
function context(state, scenario, busy) {
  return `<div class="clarity-context">${tag('情境模擬')}<span>${esc(state?.title || (scenario === 'conflict' ? '海岸設施受損 · 分區接續' : '震後山谷 · 接回求救訊息'))}</span><span>${busy ? '重新評估中' : state ? '後端計算 · 本次結果快照' : '尚無可驗證資料'}</span></div>`;
}
function sourceError(error) {
  return error ? `<aside class="clarity-error" role="alert"><strong>資料來源不可用／無法驗證</strong><p>計算與送達狀態不予推測。${esc(error)}</p><button class="button" data-action="reload">重新載入</button></aside>` : '';
}
function identity(state) {
  return `<p class="clarity-identity">本次結果 <code>${value(state?.runId || state?.inputHash)}</code></p>`;
}
function emptyResult(busy, error, kind) {
  return `<section class="clarity-result"><p class="clarity-kicker">${kind}</p><h2>${busy ? '重新評估中…' : error ? '資料來源不可用' : '尚未計算'}</h2><p>${busy ? '正在讀取同一次情境的計算與確認結果。' : '取得有效資料前，不推測推薦或送達。'}</p></section>`;
}
export function comparisonOrder(state) {
  const routes = state?.candidates || [];
  const best = routeById(state, state?.recommendation?.routeId);
  // This sorts the presentation only; it never assigns a recommendation/fallback.
  const rest = routes.filter(r => r !== best).slice().sort((a,b) => Number(b.eligible) - Number(a.eligible) || b.finalScore - a.finalScore || a.id.localeCompare(b.id));
  return best ? [best, ...rest] : rest;
}
export function recommendationReasons(state) {
  const best = routeById(state, state?.recommendation?.routeId);
  if (!best) return ['目前沒有系統推薦；後端未核准傳輸路徑。'];
  const eligible = state.candidates.filter(r => r.eligible);
  const second = eligible.filter(r => r !== best).sort((a,b) => b.finalScore - a.finalScore || a.id.localeCompare(b.id))[0];
  const reasons = [`通過本次資格檢查；模型估計送達率 ${percent(best.metrics?.deliveryProbability)}，政策門檻 ${percent(state.recommendation.deliveryFloor)}。`];
  if (!second) reasons.push(`本次只有 ${eligible.length} 條合格候選，無合格次選可比較。`);
  else {
    const difference = best.finalScore - second.finalScore;
    reasons.push(difference > 0 ? `七項加權總分較合格次選高 ${number(difference)} 分；比較對象 ${second.id}。` : difference === 0 ? `與合格次選同分；依後端排序結果推薦，不宣稱單一指標勝出。` : `採用後端核准路徑；本次推薦並非最高分，不推測額外原因。`);
  }
  return reasons;
}
export function renderRouteCards(state, selected) {
  const ordered = comparisonOrder(state), inspected = inspectedRoute(state, selected)?.id;
  const cards = (routes, offset = 0) => routes.map((r, i) => `<button class="clarity-candidate ${inspected === r.id ? 'is-viewed' : ''}" data-route="${esc(r.id)}" aria-pressed="${inspected === r.id}"><span class="candidate-heading"><strong>${state.recommendation.routeId === r.id ? '首選' : state.recommendation.routeId && r.eligible && i + offset === 1 ? '次選' : r.eligible ? '合格候選' : '候選'} · ${esc(routeName(r))}</strong><span>${number(r.finalScore)}<small> 路徑評分／100</small></span></span><span class="candidate-tags">${routeTags(state,r,inspected)}</span><span class="candidate-facts"><span>${r.eligible ? '通過門檻' : r.status === 'offline' ? '已排除／不可用' : r.status === 'below-delivery-floor' ? '未通過送達門檻' : value(r.status)}</span><span>模型估計送達率 ${percent(r.metrics?.deliveryProbability)}</span><span>模擬 P95 ${Number.isFinite(r.metrics?.latency) ? `${number(r.metrics.latency)} ms` : '無資料'}</span></span><code>${esc(r.id)}</code></button>`).join('');
  return `${cards(ordered.slice(0,2))}${ordered.length > 2 ? `<details class="clarity-details" data-more-candidates><summary>查看其他 ${ordered.length - 2} 條候選</summary><div class="clarity-detail-body">${cards(ordered.slice(2),2)}</div></details>` : ''}${!ordered.length ? '<p>無候選資料。</p>' : ''}`;
}
export function renderSelectedMetrics(state, selected, traceStep = 0) {
  const r = inspectedRoute(state, selected);
  if (!r) return '<p>尚無可檢視的計算資料。</p>';
  const rawUnit = k => ({capacity:' kbps',latency:' ms',energy:' u'}[k] || '（比例 0–1）');
  return `<p class="clarity-kicker">正在檢視 · ${esc(r.id)}</p><h3>${esc(routeName(r))}</h3><p>以下保留後端回傳精度；加分是本路徑的得分貢獻，不等於候選之間的決勝原因。</p><div class="table-scroll" tabindex="0" role="region" aria-label="完整七項計算，可橫向捲動"><table class="metrics-table" data-trace-stage="${traceStep}"><thead><tr><th>指標</th><th>原始值</th><th>正規化</th><th>效用</th><th>權重</th><th>得分貢獻</th></tr></thead><tbody>${METRICS.map(([k,label],i) => `<tr data-metric-row="${i}"><th scope="row">${label}</th><td>${value(r.metrics?.[k])}${r.metrics?.[k] == null ? '' : rawUnit(k)}</td><td>${value(r.normalizedMetrics?.[k])}</td><td>${value(r.utilities?.[k])}</td><td>${value(state.weightProfile?.weights?.[k])}</td><td>${value(r.weightedContributions?.[k])}</td></tr>`).join('')}</tbody></table></div><p class="clarity-score">路徑評分／100 <strong>${value(r.finalScore)}</strong></p><div class="formula">score(route) = Σ weight × utility × 100<br>延遲、能耗、風險：utility = 1 − normalized<br>其他指標：utility = normalized；正規化 clamp 到 [0,1]</div><h3>正規化定義與政策假設</h3><dl class="clarity-fields">${Object.entries(state.normalization || {}).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${value(v)}</dd></div>`).join('')}</dl><p>權重政策：${value(state.weightProfile?.reason)}。未經現場校準。</p><pre class="clarity-code">${json({weightProfile:state.weightProfile,assumptions:state.assumptions,route:r})}</pre>`;
}
export function renderTrace(state, traceStep) {
  return `<div class="clarity-trace"><h3>計算步驟回放</h3><p>重播已取得的推演紀錄，不會重新執行後端計算。</p><div class="actions"><button class="button" data-action="trace-play">重播計算步驟</button><button class="button quiet" data-action="trace-step">下一步</button></div><ol class="trace-lines">${(state?.calculationTrace || []).map((s,i)=>`<li class="${i === traceStep ? 'active' : i < traceStep ? 'passed' : ''}" data-trace-line="${i}">${esc(s)}</li>`).join('')}</ol><pre class="clarity-code">${json({recommendation:state?.recommendation,inputHash:state?.inputHash})}</pre></div>`;
}
export function renderDecision({state,scenario,busy,error,selected,traceStep,reevaluation}, heading) {
  const best = routeById(state,state?.recommendation?.routeId), second = comparisonOrder(state).find(r => r.eligible && r.id !== best?.id);
  return `<section class="page-panel clarity-page" data-page="matrix">${heading(4,'這次，為什麼選這條路？','',scenarioTools(scenario))}${context(state,scenario,busy)}${sourceError(error)}${!state ? emptyResult(busy,error,'計算決策') : `<section class="clarity-result" data-recommended-route="${esc(best?.id || '')}"><div><p class="clarity-kicker">${best ? '系統推薦' : '尚無系統推薦'}</p><h2>${best ? esc(routeName(best)) : state.recommendation?.status === 'NO_ELIGIBLE_ROUTE' || state.deliveryStatus?.status === 'BLOCKED_NO_ROUTE' && !state.candidates.some(r=>r.eligible) ? '目前沒有符合條件的路徑' : '本次決策未核准路徑'}</h2><ul class="clarity-reasons">${recommendationReasons(state).map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${reevaluation ? `<p class="clarity-update" role="status">${esc(reevaluation)}</p>` : ''}<div class="actions"><button class="button primary" data-page-target="runtime">查看同次送達證據 →</button><button class="button danger" data-action="fail-best" ${best ? '' : 'disabled'}>模擬首選路徑不可用</button><button class="button quiet" data-action="restore-routes">恢復候選</button></div></div><dl class="clarity-numbers"><div><dt>模型估計送達率</dt><dd>${percent(best?.metrics?.deliveryProbability)}</dd></div><div><dt>模擬延遲 P95</dt><dd>${Number.isFinite(best?.metrics?.latency) ? number(best.metrics.latency) + '<small> ms</small>' : '無資料'}</dd></div><div><dt>路徑評分／100</dt><dd>${number(best?.finalScore)}</dd></div><div><dt>合格次選</dt><dd class="small-number">${second ? esc(second.id) : '無次選'}</dd></div></dl><p class="clarity-footnote">${best ? '候選 ID：' + esc(best.id) + ' · ' : ''}機率與延遲均為情境模擬，評分不代表成功率。</p></section><section class="clarity-comparison"><div class="clarity-section-title"><h2>候選比較</h2><span>${state.candidates.length} 條候選</span></div><p>點選只改變「正在檢視」，不改動系統推薦或本次傳輸路徑。</p><div class="clarity-route-list" data-route-list>${renderRouteCards(state,selected)}</div></section><details class="clarity-details" data-calculation><summary>查看完整計算<span>七項指標 · 原始精度 · 公式與推演</span></summary><div class="clarity-detail-body"><section data-metrics>${renderSelectedMetrics(state,selected,traceStep)}</section>${renderTrace(state,traceStep)}</div></details>${identity(state)}`}</section>`;
}

// Snapshot states only. Animation and CRC alone never establish receiver success.
export function deliveryPresentation(state, {busy = false, error = ''} = {}) {
  if (busy) return {key:'loading',title:'正在讀取本次結果',copy:'計算與確認資料就緒前，不沿用上一輪回執。',steps:['unknown','unknown','unknown','unknown']};
  if (error) return {key:'unavailable',title:'資料來源不可用／無法驗證',copy:'目前無法取得可信快照，不能判定是否送達。',steps:['unknown','unknown','unknown','unknown']};
  const d = state?.deliveryStatus;
  if (!d) return {key:'not-started',title:'尚未開始／尚無結果',copy:'尚未取得傳輸資料。',steps:['unknown','unknown','unknown','unknown']};
  const ready = d.packetHex && d.messageId ? 'done' : 'unknown';
  const map = {
    DELIVERY_CONFIRMED: {key:'confirmed',title:'模擬接收端已回傳確認',copy:'確認與本次訊息、路徑及封包身分相符。',steps:[ready,'done','done','done']},
    ACK_TIMEOUT: {key:'unconfirmed',title:'未收到確認',copy:'本次未取得相符確認；不等於對方一定未收到。訊息仍保留在佇列。',steps:[ready,'done','unknown','missing']},
    DELIVERY_FAILED: {key:'failed',title:'本次傳輸失敗',copy:'模擬傳輸嘗試失敗，沒有取得相符的接收確認。',steps:[ready,'failed','not-reached','not-reached']},
    BLOCKED_NO_ROUTE: {key:'blocked',title:state.candidates?.some(r=>r.eligible) ? '本次決策未核准路徑' : '目前沒有符合條件的路徑',copy:'本次停止執行傳輸。完整決策狀態保留於技術證據。',steps:[ready,'not-reached','not-reached','not-reached']},
    QUEUED: {key:'queued',title:'訊息已入列，等待傳送',copy:'只有入列紀錄，尚無接收確認。',steps:[ready,'waiting','not-reached','not-reached']},
    RECEIVER_VALIDATED: {key:'waiting',title:'接收端已核對，等待確認',copy:'尚未取得本次最終確認回執，不宣告已確認送達。',steps:[ready,'done','done','waiting']}
  };
  if (d.status === 'DELIVERY_CONFIRMED' && d.confirmed !== true || d.confirmed && d.status !== 'DELIVERY_CONFIRMED') return {key:'unavailable',title:'確認狀態不一致／無法驗證',copy:'不以不一致的資料宣告已確認。',steps:[ready,'unknown','unknown','unknown']};
  return map[d.status] || {key:'unknown',title:'傳輸狀態尚無法判讀',copy:'保留原始狀態，不推測傳送進度或確認結果。',steps:[ready,'unknown','unknown','unknown']};
}
function technicalEvidence(state) {
  const d = state?.deliveryStatus;
  if (!d) return '<p>無資料。</p>';
  const ack = d.ack;
  const fields = ['messageId','sequence','routeId','packetHash',...(d.runId ? ['runId','scenarioId','executionId','decisionId','executionSnapshotId'] : [])];
  return `<h3>ACK 身分核對欄位</h3><div class="table-scroll" tabindex="0" role="region" aria-label="ACK 欄位比對，可橫向捲動"><table class="clarity-evidence-table"><thead><tr><th>欄位</th><th>本次傳輸</th><th>回傳確認</th><th>欄位比對</th></tr></thead><tbody>${fields.map(k=>`<tr><th scope="row">${k}</th><td>${value(d[k])}</td><td>${value(ack?.[k])}</td><td>${ack?.[k] == null || d[k] == null ? '無資料' : ack[k] === d[k] ? '相符' : '不相符'}</td></tr>`).join('')}</tbody></table></div><dl class="clarity-fields">${[['原始傳輸狀態',d.status],['封包完整性 CRC32',d.crcVerified == null ? null : d.crcVerified ? '通過；單獨不代表接收端已收件' : '未通過'],['接收端 received',ack?.received],['確認來源',ack?.source],['封包大小 bytes',d.packetBytes],['重試次數',d.retry],['佇列數量',d.queue],['去重狀態',d.dedupe],['情境執行秒數（非實測時間）',d.executedAtScenarioSeconds]].map(([k,v])=>`<div><dt>${k}</dt><dd>${value(v)}</dd></div>`).join('')}</dl><h3>逐跳傳輸紀錄</h3><p>耗時由情境鏈路延遲累計，非現場量測。最多嘗試 ${value(state.assumptions?.maxAttempts)} 次。</p><div class="table-scroll" tabindex="0" role="region" aria-label="逐跳傳輸紀錄，可橫向捲動"><table class="clarity-evidence-table"><thead><tr><th>嘗試</th><th>從 → 到</th><th>累計延遲</th><th>原始事件</th></tr></thead><tbody>${(d.hopTrace || []).map(h=>`<tr><td>${value(h.attempt)}</td><td>${esc(state.networkState?.nodes?.find(n=>n.id === h.from)?.label || h.from)} → ${esc(state.networkState?.nodes?.find(n=>n.id === h.to)?.label || h.to)}</td><td>${value(h.elapsedMs)} ms</td><td>${value(h.status)}</td></tr>`).join('')}</tbody></table></div>${d.hopTrace?.length ? '' : '<p>無逐跳紀錄。</p>'}<h3>封包與原始證據</h3><p>SLV1 固定二進位編碼，未套用壓縮。雜湊、完整 ACK、重試及佇列狀態保留如下。</p><pre class="clarity-code">${value(d.packetHex?.match(/.{1,2}/g)?.join(' '))}</pre><pre class="clarity-code">${json({deliveryStatus:d,recommendation:state.recommendation,provenance:state.provenance,inputHash:state.inputHash})}</pre><button class="button" data-action="export-evidence">匯出完整 JSON 證據 ↓</button>`;
}
export function renderRuntime({state,scenario,busy,error}, heading) {
  const d=state?.deliveryStatus, route=routeById(state,d?.routeId), result=deliveryPresentation(state,{busy,error});
  const stepLabels={done:'已完成',waiting:'等待中',missing:'未取得',failed:'失敗','not-reached':'尚未到達',unknown:'無資料／無法確認'};
  const ackSource = d?.ack?.source === 'simulated emergency-center receiver' ? '模擬應變中心接收端' : d?.ack?.source;
  return `<section class="page-panel clarity-page" data-page="runtime">${heading(5,'這則訊息，有收到確認嗎？','',scenarioTools(scenario))}${context(state,scenario,busy)}${sourceError(error)}<section class="clarity-result clarity-receipt" data-delivery-state="${result.key}"><div><p class="clarity-kicker">確認結果 · ${state ? '本次結果回放' : '等待資料'}</p><h2>${result.title}</h2><p class="clarity-result-copy">${result.copy}</p><dl class="clarity-receipt-fields"><div><dt>確認來源</dt><dd>${value(ackSource)}</dd></div><div><dt>本次傳輸路徑</dt><dd>${esc(routeName(route))}</dd></div><div><dt>訊息識別</dt><dd><code>${value(d?.messageId)}</code> <span>／序號 ${value(d?.sequence)}</span></dd></div></dl><p class="clarity-receipt-boundary">情境模擬；不代表真實外部單位已收件或救援已派出。</p></div><div class="clarity-seal" aria-hidden="true"><span>${result.key === 'confirmed' ? '↙' : result.key === 'failed' ? '×' : '…'}</span>${result.key === 'confirmed' ? '已取得相符確認' : '尚無相符確認'}</div></section><section class="clarity-flow"><div class="clarity-section-title"><h2>傳輸流程</h2><span>${state ? '本次結果回放 · 非即時傳輸' : '尚無結果可回放'}</span></div><ol class="clarity-pipeline">${['訊息就緒','沿路傳送','接收端核對','回傳確認'].map((label,i)=>`<li data-step-state="${result.steps[i]}"><small>0${i+1}</small><strong>${label}</strong><span>${stepLabels[result.steps[i]]}</span></li>`).join('')}</ol><p>流程只呈現已取得的快照；動畫不決定確認結果。</p></section><div class="actions clarity-controls"><button class="button danger" data-action="drop-ack">模擬確認未返回</button><button class="button" data-action="resend">${state?.testFault === 'ack-loss' ? '重播目前確認遺失情境' : '恢復確認並重播'}</button><button class="button quiet" data-page-target="matrix">返回同次計算決策 ←</button></div><p class="clarity-control-note">以同一 seed 重播本機模擬；實際電信、救援及外部 ARCI 服務尚未接入。${state?.testFault === 'ack-loss' ? ' 情境頁的確認遺失仍啟用；此控制只取消本頁設定，情境故障須回情境頁恢復。' : ''}</p><details class="clarity-details" data-evidence><summary>查看技術證據<span>封包 · ACK 核對 · 逐跳紀錄 · 完整匯出</span></summary><div class="clarity-detail-body">${technicalEvidence(state)}</div></details>${identity(state)}</section>`;
}
