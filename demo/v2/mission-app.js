import {renderDecision,renderRuntime,renderRouteCards,renderSelectedMetrics} from './clarity-view.js';
import {ScenarioAdapter} from './scenario-adapter.js';
import {DigitalTwin,LAYERS} from './digital-twin.js';
import {frameAt} from './timeline.js';
import {WORLD_PRESETS} from './cinematic-world.js';
import {openingMarkup,mountOpening} from './opening.js';
import {domainsMarkup} from './domains-template.js';
import {coastalMarkup,CoastalDemo} from './coastal-demo.js';

let coastal=null,coastalFault='none';
let reevaluation='';

const PAGES=[['intro','重新連結','INTRO / WHY'],['architecture','地海空星','RESILIENCE NETWORK'],['demo','天災情境','SCENARIO A'],['conflict','戰爭情境','SCENARIO B'],['matrix','計算決策','DECISION SPACE'],['runtime','送達證據','RUNTIME / DELIVERY'],['arci','ARCI 架構','INTELLIGENCE ARCHITECTURE']];
const PHASES=[['NORMAL','城市亮著，訊息持續流動。','地面與海纜承載日常通訊；空中中繼保留待命。','正常'],['WARNING','異常已出現，網路尚未中斷。','先觀測事件，再確認基礎設施影響。','預警'],['IMPACT','衝擊抵達，設施開始降級。','局部供電與回程品質下降，節點由正常轉為 degraded。','衝擊'],['FAILURE','基礎設施逐步退出服務。','斷電、斷纖與回程失效傳播到鏈路，重要訊息進入佇列。','失效'],['OBSERVE','尋找下一條可用通路。','啟動備援偵測，無人機升空。ARCI 整合投影開始觀測。','感知'],['PROBE','探測跨層候選。','搜尋可達節點與路徑，排除已失效的基礎設施。','探測'],['EVALUATE','用相同依據比較每條路。','模擬延遲、容量與送達率，再將七項效用依政策加權。','推演'],['DECIDE','候選通過政策，等待執行。','後端選定最高合格分數；琥珀色代表評估結果，尚未送達。','決策'],['ATTEMPT','嘗試建立替代鏈路。','紫色通路開始接續。建立連結不等於確認送達。','嘗試'],['TRANSMIT','封包沿替代鏈路前進。','依本機 transport 結果逐跳傳送，失敗時進行有限重試。','傳輸'],['RECEIVE','接收端核對封包。','檢查 message、sequence 與 CRC32，等待 ACK 回傳。','接收'],['ACK','ACK 返回，通路鎖定。','相符的模擬 ACK 已返回，訊息完成此次跨層接力。','確認']];
const METRICS=[['reliability','可靠度','Reliability','%'],['capacity','容量','Capacity','kbps'],['latency','延遲 P95','Latency','ms'],['energy','能耗','Energy','u'],['availability','設施可用性','Availability','%'],['risk','風險','Risk','%'],['deliveryProbability','送達機率','Delivery','%']];
const ARCI=[
 ['Perception','感知與觀測','接收環境、節點狀態與通訊事件，保留來源和觀測時間。','情境事件、節點與鏈路狀態','帶來源的 observation','StarryLink 的 scenario adapter 在此投影輸入；即時感測尚未接入。'],
 ['World State','世界狀態模型','把分散觀測整合成可版本化、可驗證的當前局勢。','帶時間與來源的 observation','World state snapshot / input hash','將台灣節點、失效鏈路與可用資產整合為一致的網路快照。'],
 ['Memory / Context','記憶與任務上下文','保留歷史狀態、先前策略及任務限制，讓後續決策具有上下文。','歷史 snapshot、結果與任務','可追溯的 context','未接入持久記憶。此展示保留單次計算資料，跨任務記憶為 unavailable。'],
 ['Simulation','模擬與候選生成','搜尋替代通路，使用可重播推演比較候選策略。','網路快照、任務與政策','候選拓樸、推演指標','沿用 StarryLink graph search 與固定 seed simulator；候選不指定勝者。'],
 ['Governance','規則、權限與治理','在推薦進入執行前檢查可用性、風險與政策門檻。','候選、來源與政策限制','Eligible / blocked 與理由','目前示範失效排除與送達門檻。未來 ARCI 輸出仍須獨立驗證。'],
 ['Decision','決策與協調','將已通過治理的候選排序，建立行動順序與備援條件。','合格候選與權重','Selected route / fallback','後端決定路徑；畫面只展示加權貢獻與選路原因。'],
 ['Execution Core','執行與調適核心','驅動具體行動，收集回報；將成功與失敗回饋到下一次觀测。','策略、封包與執行限制','ACK、失敗與 evidence','本機模擬 transport 執行有限重試。ARCI provider 無權自行宣告 ACK。']
];
const main=document.querySelector('#main');const adapter=new ScenarioAdapter();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||new URLSearchParams(location.search).get('motion')==='reduce';document.documentElement.dataset.motion=reduced?'reduce':'full';
let page=pageAlias(new URLSearchParams(location.search).get('page')||'intro'),state=null,scenario=page==='conflict'?'conflict':new URLSearchParams(location.search).get('scenario')==='conflict'?'conflict':'disaster';
let cameraMode='TACTICAL',followTarget='uav';
let phase=0,layer='all',view='network',selectedNode='citizen-01',selectedRoute=null,excluded=[],dropAck=false,playing=false,phaseTimer,traceStep=0,traceTimer,arciLayer=0,arciMode='layers',flowStep=0,flowTimer,exploded=false,twin=null,rendererError='',loadError='',busy=false,controller,requestVersion=0,routeVersion=0,tourTimer,tourStart=0,tourIndex=-1;
const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'unavailable';const pct=n=>Number.isFinite(n)?`${f(n*100)}%`:'unavailable';
function pageAlias(p){return p==='platform'?'intro':p==='disaster'?'demo':PAGES.some(x=>x[0]===p)?p:'intro';}
function announce(s){$('#announcement').textContent=s;}
function fmtMetric(route,key){const v=route?.metrics[key];return key==='capacity'?`${f(v)} kbps`:key==='latency'?`${f(v)} ms`:key==='energy'?`${f(v)} u`:pct(v);}
function routeById(id){return state?.candidates.find(r=>r.id===id);}
function currentRoute(){return routeById(selectedRoute)||routeById(state?.recommendation.routeId)||state?.candidates[0];}
function badge(text,type=''){return `<span class="badge ${type}">${esc(text)}</span>`;}
function errorMarkup(){return loadError?`<aside class="error-state" role="alert"><div><h2>資料暫時無法取得</h2><p>live source unavailable · ${esc(loadError)}。計算與送達狀態不予推測。</p></div><button class="button small" data-action="reload">重新載入 ↻</button></aside>`:'';}
function sceneMarkup(extra=''){return `<div class="scene-host cinematic-host" data-scene-host data-world="${layer}">${rendererError?'<p class="loading-copy">3D renderer unavailable；請使用節點清單與計算介面。</p>':''}<span class="scene-kicker" data-world-title>${WORLD_PRESETS[layer].title}</span><div class="scene-badge">${badge('SCENARIO / SIMULATION')}</div><div class="camera-modes" aria-label="鏡頭模式">${['FREE','TACTICAL','CINEMATIC','FOLLOW'].map(m=>`<button data-camera-mode="${m}" aria-pressed="${cameraMode===m}">${m}</button>`).join('')}<select data-follow-target aria-label="鏡頭跟隨目標" ${cameraMode==='FOLLOW'?'':'hidden'}>${[['uav','UAV'],['satellite','Satellite'],['packet','Packet'],['station','Selected station'],['route','Selected route']].map(([v,n])=>`<option value="${v}" ${followTarget===v?'selected':''}>${n}</option>`).join('')}</select><span class="follow-wait">目標尚未啟用，等待情境進展</span></div>${extra}<div class="world-readout"><small data-world-detail>${WORLD_PRESETS[layer].detail}</small><strong data-scene-clock>T+${String(frameAt(state,phase)?.seconds||0).padStart(2,'0')}</strong><span data-route-status>${frameAt(state,phase)?.routeStatus||'WAITING'}</span></div><div class="scene-toolbar"><button data-action="camera-home" aria-label="重設立體視角">⌂</button><button data-action="camera-top" aria-label="俯視台灣">⊙</button><button data-action="camera-east" aria-label="東側視角">◧</button><button data-action="zoom-in" aria-label="放大模型">＋</button><button data-action="zoom-out" aria-label="縮小模型">−</button></div><div class="scene-caption"><span>COAST / NATURAL EARTH · PROCEDURAL TERRAIN + ASSETS</span><span>FREE: DRAG ORBIT · RIGHT DRAG PAN · SCROLL ZOOM</span></div></div>`;}
function heading(index,title,copy,tools=''){const p=PAGES[index];return `<header class="section-heading"><div><p class="eyebrow">${String(index+1).padStart(2,'0')} / ${p[2]}</p><h1>${title}</h1></div>${tools||`<p>${copy}</p>`}</header>`;}
function legend(){return '<div class="legend"><span><i></i>Online</span><span><i class="amber"></i>Degraded</span><span><i class="red"></i>Offline</span><span><i class="violet"></i>Alternate</span><span><i class="green"></i>ACK</span><span><i class="gray"></i>Standby</span></div>';}
function layerDock(){return `<div class="layer-dock" aria-label="隔離通訊層級">${Object.entries(LAYERS).map(([key,l])=>{const normal=(page==='demo'||page==='conflict'||page==='intro')?phase===0:view==='normal';const nodes=((page==='demo'||page==='conflict'||page==='intro')?frameAt(state,phase)?.networkState.nodes:normal?state?.baselineNetwork.nodes:state?.networkState.nodes)?.filter(n=>n.layer===key)||[];const count=nodes.filter(n=>n.status!=='failed').length;return `<button data-layer="${key}" class="${layer===key?'active':''}" aria-pressed="${layer===key}"><span class="layer-icon">${l.label}</span><span><strong>${l.name}</strong><small>${state?`${count} / ${nodes.length} available`:'waiting for source'}</small></span></button>`;}).join('')}</div>`;}
function intro(){return openingMarkup();}
function network(){return domainsMarkup();}
function phaseContent(){
 if(!state)return [PHASES[phase][0],'等待情境資料','waiting for source。未建立候選、通訊鏈路或送達確認。'];
 if(phase>=7&&!state.recommendation.routeId)return [PHASES[phase][0],'沒有符合條件的通路','所有候選已失效或低於政策門檻。停止執行，等待新來源。'];
 if(phase===11&&!state.deliveryStatus.confirmed)return ['ACK','ACK 尚未返回。','執行結果尚未確認，保留佇列。沒有相符的 ACK，系統不宣告送達。'];
 if(scenario==='conflict'){
  if(phase===1)return ['DETECTED','西部外海，敵對平台被偵測。','HOSTILE PLATFORM DETECTED。通訊網路仍在線；艦艇與海面尾流進入畫面。'];
  if(phase===2)return ['LAUNCH','多條攻擊軌跡飛向西部設施。','艦體武器動作、發射閃光與煙霧先於命中；此刻基地台仍維持 ONLINE。'];
  if(phase===3)return ['IMPACT','三個城市的通訊塔遭到命中。','HOSTILE IMPACT DETECTED → WESTERN INFRASTRUCTURE LOSS → BACKHAUL DEGRADED。閃光、碎片與火煙伴隨塔體倒塌，連線退出網路。'];
  if(phase===4)return ['COLLAPSE','覆蓋出現缺口，容量下降。','COVERAGE HOLE DETECTED → CAPACITY REDUCED → ROUTE RECOMPUTATION REQUIRED。等待重新選路。'];
 }else{
  if(phase===1)return ['EARTHQUAKE','地震開始，山坡與道路受擾動。','局部地形震動、位移與落石先發生；中央山脈限制東西向視線通訊。'];
  if(phase>=2&&phase<=4)return ['PARTITION','跨山地面通路失效，網路分割。','TERRAIN OBSTRUCTION / LOS UNAVAILABLE。光纖與微波回程中斷；需要先接回當地 gateway，再由 LEO 跨越地形。'];
 }
 if(phase===5)return ['ARCI ACTIVATED','各地 UAV mesh 開始接回閘道。','UAV RELAY CLUSTER / AIRBORNE MESH。圖示只代表 cluster；FLEET SIZE — DYNAMIC / CAPACITY-DERIVED，並非城市部署數量估計。'];
 return PHASES[phase];
}
function impactSummary(){const fr=frameAt(state,phase);return (fr?.failures||[]).slice(0,3).map(f=>`<span>${esc(f.reason)}${f.sinrDb!=null?` · ${f.sinrDb} dB`:''}</span>`).join('');}
function eventMarkup(){const fr=frameAt(state,phase);return `<p class="panel-kicker">WORLD STATE / T+${String(fr?.seconds||0).padStart(2,'0')}</p><ul class="event-list">${(fr?.events||['Waiting for source']).map((e,i)=>`<li><i></i><span>${esc(e)}</span></li>`).join('')}</ul>${fr?.layerState?`<p class="source-note">GROUND CAPACITY ${f(fr.layerState.groundCapacityKbps,0)} kbps · RELIABILITY ${pct(fr.layerState.groundMeanReliability)}<br>AIR ${fr.layerState.airDeployed?'MESH DEPLOYED':'STANDBY'} · ORBIT ${fr.layerState.orbitRouteSelected?'SELECTED ROUTE':'STANDBY'}<br>情境節點容量加總／平均可靠度；非城市服務容量或流量量測</p>`:''}${fr?.hazard.pgaG!=null?`<div class="hazard-meter"><span>PGA / synthetic</span><b>${f(fr.hazard.pgaG,2)} g</b><small>情境門檻 ${f(fr.hazard.thresholdG,2)} g</small></div>`:''}`;}
function routeScoreMarkup(){const fr=frameAt(state,phase),r=fr?.candidates.find(r=>r.id===selectedRoute)||fr?.candidates.find(r=>r.id===fr.routeId)||fr?.candidates[0];return `<p class="panel-kicker">ROUTE SCORE / ${r?esc(r.id):'WAITING'}</p><h3>${r?(!r.eligible?'此路徑未通過送達門檻。':fr.routeStatus==='LOCKED'&&r.id===fr.routeId?'ACK 已確認，此次通路鎖定。':phase<7?'候選評估中。':'候選通路已有計算依據。'):'等待事件與網路觀測。'}</h3>${r?`<select class="score-route-select" data-score-route aria-label="檢視路徑計算">${fr.candidates.map(c=>`<option value="${c.id}" ${c.id===r.id?'selected':''}>${esc(c.id)} · ${!c.eligible?'REJECTED':c.id===fr.routeId?'SELECTED':'CANDIDATE'}</option>`).join('')}</select><div class="mini-score">${METRICS.map(([k,cn])=>`<div><span>${{latency:'延遲效用',risk:'避險效用',energy:'能耗效用'}[k]||cn}</span><meter min="0" max="1" value="${r.utilities[k]}"></meter><b>${f(r.utilities[k],2)}</b></div>`).join('')}</div><p class="source-note">${r.hops.map(h=>esc(h.label)).join(' → ')}</p><div class="score-total"><span>Σ weight × utility × 100</span><strong>${f(r.finalScore,2)}</strong></div><p class="route-verdict">${!r.eligible?'REJECTED':phase<7?'EVALUATING':'ELIGIBLE'} · ${esc(r.id===fr.routeId?fr.routeStatus:phase<7?'POLICY CHECK':'NOT SELECTED')}</p><p class="source-note">${fr.candidates.filter(c=>!c.eligible).length} 個候選未通過門檻 · ${state.runs} 次／路徑<br>效用 0–1；總分 0–100，非即時量測</p>`:'<p>先辨識受損設施，再探測可用候選；不預先顯示最終選路。</p>'}<button class="minor-link" data-page-target="matrix">檢視完整計算 →</button>`;}
function scenarioPage(){const conflict=page==='conflict',fr=frameAt(state,phase);return `<section class="page-panel scenario-panel" data-page="${page}">${heading(conflict?3:2,conflict?'當骨幹受損，守住民生通訊。':'當地震切斷日常，接回求救訊息。','',`<div class="heading-tools">${badge(conflict?'B / HOSTILE DISRUPTION':'A / NATURAL DISASTER','amber')}<button class="button small quiet" data-action="reset-scenario">重置情境 ↻</button></div>`)}${errorMarkup()}<div class="workspace cinematic-workspace"><div class="model-surface">${sceneMarkup()}${layerDock()}${legend()}<ol class="timeline">${PHASES.map((s,i)=>`<li><button data-phase="${i}" class="${phase===i?'active':i<phase?'passed':''}" aria-current="${phase===i?'step':'false'}"><small>T+${state?String(state.timeline.frames[i].seconds).padStart(2,'0'):'—'}</small><span>${conflict&&i===2?'發射':conflict&&i===3?'命中':s[3]}</span></button></li>`).join('')}</ol><section class="panel scenario-evidence" data-scenario-events>${eventMarkup()}</section></div><aside class="stack"><section class="panel"><div class="phase-title"><span data-phase-code>${phaseContent()[0]}</span><span data-phase-index>${String(phase+1).padStart(2,'0')} / 12</span></div><div class="scenario-copy"><h2 data-phase-title>${phaseContent()[1]}</h2><p data-phase-copy>${phaseContent()[2]}</p><div class="impact-summary" data-impact-summary>${impactSummary()}</div></div><div class="phase-controls"><button class="button primary small" data-action="play-scenario">${playing?'Ⅱ 暫停':'▶ 播放情境'}</button><button class="button small" data-action="step-scenario">下一步 →</button></div><div class="phase-progress"><label class="sr-only" for="phase-range">情境階段</label><input id="phase-range" data-phase-range type="range" min="0" max="11" step="1" value="${phase}" /></div><div class="impact-counts"><div><strong data-failed-count>${fr?fr.networkState.nodes.filter(n=>n.status==='failed').length:'—'}</strong><small>離線節點</small></div><div><strong data-candidate-count>${phase>=5?state?.candidates.length??'—':'—'}</strong><small>候選 / derived</small></div><div><strong data-runs-count>${phase>=6?state?.runs??'—':'—'}</strong><small>每路推演</small></div></div><p class="source-note">可重播情境 · 非即時事故<br>ARCI integration / UNCONNECTED</p></section><section class="panel" data-scenario-score>${routeScoreMarkup()}</section></aside></div></section>`;}
function routeCards(){return renderRouteCards(state,selectedRoute);}
function selectedMetrics(){return renderSelectedMetrics(state,selectedRoute,traceStep);}
function decision(){return renderDecision({state,scenario,busy,error:loadError,selected:selectedRoute,traceStep,reevaluation},heading);}
function runtime(){return renderRuntime({state,scenario,busy,error:loadError},heading);}
function arciDetail(){const a=ARCI[arciLayer];return `<div><div class="index">${String(arciLayer+1).padStart(2,'0')}</div><p class="eyebrow">${a[0]}</p><h2>${a[1]}</h2><p>${a[2]}</p></div><div><dl><dt>INPUT</dt><dd>${a[3]}</dd><dt>OUTPUT</dt><dd>${a[4]}</dd><dt>STARRYLINK CONNECTION</dt><dd>${a[5]}</dd></dl><div class="arci-boundary"><strong>ARCI-READY INTEGRATION SHELL</strong>此球層是 StarryLink 的整合投影；真 ARCI 核心將於壓力測試與資格驗證完成後接入。</div></div>`;}
function arciPage(){return `<section class="page-panel arci-panel" data-page="arci">${heading(6,'從觀測到行動，一層一層建立智慧。','',`<div class="heading-tools"><div class="toggle-group"><button data-arci-mode="layers" class="${arciMode==='layers'?'active':''}">Layer explanation</button><button data-arci-mode="flow" class="${arciMode==='flow'?'active':''}">Flow mode</button></div></div>`)}<div class="arci-layout"><nav class="arci-layer-list" aria-label="ARCI 七層架構">${ARCI.map((a,i)=>`<button data-arci-layer="${i}" class="${i===arciLayer?'active':''}" aria-pressed="${i===arciLayer}">${String(i+1).padStart(2,'0')}<div>${a[0]}<span>${a[1]}</span></div></button>`).join('')}</nav><div class="arci-scene"><div class="scene-host" data-scene-host><span class="scene-kicker">ARCI / CONCENTRIC INTELLIGENCE SPHERES</span><div class="scene-toolbar"><button data-action="explode" aria-label="切換球層展開" aria-pressed="${exploded}">⇆</button><button data-action="camera-home" aria-label="重設球體視角">⌂</button><button data-action="zoom-in" aria-label="放大模型">＋</button><button data-action="zoom-out" aria-label="縮小模型">−</button></div><div class="scene-caption"><span>INTERACTIVE CUTAWAY<br>由外向內 / 點選球殼或側邊層級</span><span>07 LAYERS / CONCEPTUAL PROJECTION</span></div></div></div><section class="panel arci-detail" data-arci-detail>${arciDetail()}</section></div><div class="arci-flow" aria-label="ARCI 觀測到學習流程">${['Observe','Model','Simulate','Govern','Decide','Act','Learn'].map((n,i)=>`${i?'<b>→</b>':''}<button data-flow-step="${i}" class="${arciMode==='flow'&&flowStep===i?'active':''}">${n}</button>`).join('')}</div><div class="arci-integration"><p>StarryLink context → ARCI proposal → local validation → bounded execution → ACK evidence</p><span>ARCI / UNCONNECTED · QUALIFICATION PENDING</span></div></section>`;}
let opening=null,domains=null,componentVersion=0,twinPending=null,twinEpoch=0;
function clearComponents(){++componentVersion;opening?.dispose();opening=null;domains?.dispose();domains=null;coastal?.dispose();coastal=null;}
function releaseTwin(){++twinEpoch;twinPending?.abort();twinPending=null;twin?.dispose();twin=null;}
async function ensureTwin(){
 if(twin||twinPending||!$('[data-scene-host]'))return;
 const epoch=++twinEpoch,abort=new AbortController();twinPending=abort;
 let next;
 try{next=new DigitalTwin(selectNode,setArciLayer);await next.initialize(abort.signal);
  if(epoch!==twinEpoch||!$('[data-scene-host]')){next.dispose();return;}
  twin=next;if(page!=='arci')twin.setState(state);attachTwin();
 }catch(error){next?.dispose();if(epoch!==twinEpoch)return;rendererError=error.message;const host=$('[data-scene-host]');if(host){host.dataset.render='unavailable';host.insertAdjacentHTML('beforeend','<p class="loading-copy">3D renderer unavailable；仍可使用節點清單與計算介面。</p>');}}
 finally{if(epoch===twinEpoch)twinPending=null;}
}
function render(){
 clearComponents();
 if(page!=='arci')releaseTwin();
 main.innerHTML=page==='intro'?intro():page==='architecture'?network():page==='demo'||page==='conflict'?coastalMarkup(scenario,loadError,busy):page==='matrix'?decision():page==='runtime'?runtime():arciPage();
 const meta=PAGES.find(x=>x[0]===page);document.title=`${meta[1]}｜星夜 StarryLink 2.0`;
 document.querySelector('.nav-tabs').innerHTML=PAGES.map((p,i)=>`<a href="?page=${p[0]}" data-page-target="${p[0]}" ${page===p[0]?'aria-current="page"':''}><small>${String(i+1).padStart(2,'0')}</small>${p[1]}</a>`).join('');
 $('#pageProgress').textContent=`${String(PAGES.findIndex(p=>p[0]===page)+1).padStart(2,'0')} / 07`;
 if(page==='intro')opening=mountOpening($('.sl-opening'));
 else if(page==='architecture'){
  const root=$('.sl-domains'),version=componentVersion;
  import('./domains.js').then(({mountDomains})=>{if(version===componentVersion&&root.isConnected)domains=mountDomains(root);}).catch(()=>{if(root.isConnected){root.querySelector('#fallback').hidden=false;}});
 }else if(page==='demo'||page==='conflict'){
  coastal=new CoastalDemo($('[data-coastal-root]'),state,{reduced,onPhase:p=>{phase=p;},onFault:f=>{coastalFault=f;void loadScenario(false);}});
 }else{attachTwin();void ensureTwin();}
 syncBusy();
}
function attachTwin(){const host=$('[data-scene-host]');if(!host||!twin)return;if(twin.host!==host)twin.mount(host,page==='arci'?'arci':'twin');if(page==='arci'){twin.setSphereLayer(arciLayer);twin.setExploded(exploded);}else{twin.setPresentation({phase,layer,view:phase>=8?'routing':'impact',routeId:state?.recommendation.routeId,playing});twin.followTarget=followTarget;twin.selectNode(selectedNode);if($('[data-world-title]'))$('[data-world-title]').textContent=WORLD_PRESETS[layer].title;if($('[data-world-detail]'))$('[data-world-detail]').textContent=WORLD_PRESETS[layer].detail;}}
function syncBusy(){document.querySelectorAll('[data-action="fail-best"],[data-action="restore-routes"],[data-action="drop-ack"],[data-action="resend"],[data-action="play-scenario"],[data-action="step-scenario"]').forEach(b=>b.disabled=busy||!state||(b.dataset.action==='fail-best'&&!state.recommendation.routeId));main.setAttribute('aria-busy',String(busy&&!['intro','architecture'].includes(page)));}
async function loadScenario(reset=false){
 const clarityFocus=['matrix','runtime'].includes(page)?document.activeElement?.dataset:null;const focusAction=clarityFocus?.action,focusScenario=clarityFocus?.scenarioSelect!=null;
 const version=++requestVersion;controller?.abort();controller=new AbortController();busy=true;loadError='';state=null;twin?.setState(null);if(!['intro','architecture'].includes(page))render();
 if(reset){excluded=[];dropAck=false;selectedRoute=null;reevaluation='';}
 const currentController=controller;const timeout=setTimeout(()=>currentController.abort(),12000);
 try{const next=await adapter.load({scenarioId:scenario,sceneProfile:'coastal-v1',testFault:coastalFault,excludedRouteIds:excluded,dropAck},currentController.signal);if(version!==requestVersion)return;state=next;loadError='';if(page!=='arci')twin?.setState(state);announce(`${state.title}，情境資料就緒。`);}
 catch(error){if(version!==requestVersion)return;loadError=error.name==='AbortError'?'source timeout':error.message;state=null;twin?.setState(null);}
 finally{clearTimeout(timeout);if(version===requestVersion){busy=false;if(!['intro','architecture'].includes(page))render();if(['matrix','runtime'].includes(page)){const target=focusScenario?$('[data-scenario-select]'):focusAction?document.querySelector(`[data-action="${focusAction}"]`):null;if(target&&!target.disabled)target.focus({preventScroll:true});else if(focusAction)main.focus({preventScroll:true});}}}
}
function stopPlayback(){clearTimeout(phaseTimer);opening?.pause();coastal?.pause();clearInterval(traceTimer);clearInterval(flowTimer);playing=false;if(twin)twin.playing=false;}
function stopTour(){clearInterval(tourTimer);tourTimer=null;document.querySelector('.tour-button').classList.remove('active');document.querySelector('.tour-button').innerHTML='導覽模式 <span>↗</span>';}
async function navigate(target,{history=true,touring=false}={}){
 target=pageAlias(target);if(!touring)stopTour();const version=++routeVersion;stopPlayback();
 if(!reduced&&target!==page){const tr=$('.transmission');tr.classList.remove('active');void tr.offsetWidth;tr.classList.add('active');setTimeout(()=>{if(version===routeVersion)tr.classList.remove('active');},1250);await new Promise(r=>setTimeout(r,440));}
 if(version!==routeVersion)return;page=target;phase=0;layer='all';view='network';
 const nextScenario=target==='demo'?'disaster':target==='conflict'?'conflict':scenario;const changed=nextScenario!==scenario;scenario=nextScenario;if(changed){state=null;coastalFault='none';}
 if(history){const url=new URL(location.href);url.searchParams.set('page',page);url.searchParams.set('scenario',scenario);window.history.pushState({},'',url);}
 render();window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});
 if(!['intro','architecture'].includes(page)&&(changed||!state&&!busy))await loadScenario(true);if(version!==routeVersion)return;
 if(page==='arci'&&arciMode==='flow'&&!reduced)playFlow();
}
function setPhase(p){phase=Math.min(11,Math.max(0,p));if(coastal&&state){coastal.setTime(state.timeline.frames[phase].seconds);return;}attachTwin();if(page==='demo'||page==='conflict'){
 $('[data-failed-count]').textContent=state?frameAt(state,phase).networkState.nodes.filter(n=>n.status==='failed').length:'—';$('[data-candidate-count]').textContent=phase>=5?state?.candidates.length??'—':'—';$('[data-runs-count]').textContent=phase>=6?state?.runs??'—':'—';$('.layer-dock').outerHTML=layerDock();
 $('[data-phase-code]').textContent=phaseContent()[0];$('[data-phase-index]').textContent=`${String(phase+1).padStart(2,'0')} / 12`;
 $('[data-impact-summary]').innerHTML=impactSummary();$('[data-scenario-events]').innerHTML=eventMarkup();$('[data-scenario-score]').innerHTML=routeScoreMarkup();$('[data-scene-clock]').textContent=`T+${String(frameAt(state,phase)?.seconds||0).padStart(2,'0')}`;$('[data-route-status]').textContent=frameAt(state,phase)?.routeStatus||'WAITING';
 const content=phaseContent();
 $('[data-phase-title]').textContent=content[1];$('[data-phase-copy]').textContent=content[2];$('[data-phase-range]').value=phase;
 document.querySelectorAll('[data-phase]').forEach(b=>{const i=Number(b.dataset.phase);b.classList.toggle('active',i===phase);b.classList.toggle('passed',i<phase);b.setAttribute('aria-current',i===phase?'step':'false');});
 if(phase===11){clearInterval(phaseTimer);playing=false;if(twin)twin.playing=false;$('[data-action="play-scenario"]').textContent='↻ 重播情境';}
 }
}

function playScenario(){stopTour();clearTimeout(phaseTimer);if(playing){playing=false;attachTwin();$('[data-action="play-scenario"]').textContent='▶ 繼續情境';return;}playing=true;if(phase===11)setPhase(0);attachTwin();$('[data-action="play-scenario"]').textContent='Ⅱ 暫停';const advance=()=>{if(!playing)return;const fr=frameAt(state,phase),next=frameAt(state,phase+1);phaseTimer=setTimeout(()=>{setPhase(phase+1);if(phase<11)advance();},((next?.seconds||3)-(fr?.seconds||0))*1000);};advance();}
function selectLayer(l){layer=layer===l?'all':l;document.querySelectorAll('[data-layer]').forEach(b=>{b.classList.toggle('active',b.dataset.layer===layer);b.setAttribute('aria-pressed',String(b.dataset.layer===layer));});attachTwin();}
function selectNode(id){selectedNode=id;twin?.selectNode(id);}
function selectRoute(id){
 const expanded=$('[data-more-candidates]')?.open;selectedRoute=id;$('[data-route-list]').innerHTML=routeCards();$('[data-metrics]').innerHTML=selectedMetrics();
 if(expanded&&$('[data-more-candidates]'))$('[data-more-candidates]').open=true;
 [...document.querySelectorAll('[data-route]')].find(b=>b.dataset.route===id)?.focus({preventScroll:true});announce('已更新正在檢視的候選；系統推薦與傳輸路徑不變。');
}
function updateTrace(step){traceStep=step%Math.max(1,state?.calculationTrace?.length||1);document.querySelectorAll('[data-trace-line]').forEach(b=>{const i=+b.dataset.traceLine;b.className=i===traceStep?'active':i<traceStep?'passed':'';});const table=$('.metrics-table');if(table)table.dataset.traceStage=traceStep;}
function setArciLayer(i){arciLayer=i;twin?.setSphereLayer(i);if(page==='arci'){document.querySelectorAll('[data-arci-layer]').forEach(b=>{b.classList.toggle('active',+b.dataset.arciLayer===i);b.setAttribute('aria-pressed',String(+b.dataset.arciLayer===i));});$('[data-arci-detail]').innerHTML=arciDetail();}}
function setFlow(i){flowStep=i%7;const mapping=[0,1,3,4,5,6,2];setArciLayer(mapping[flowStep]);document.querySelectorAll('[data-flow-step]').forEach(b=>b.classList.toggle('active',+b.dataset.flowStep===flowStep));}
function playFlow(){clearInterval(flowTimer);setFlow(0);flowTimer=setInterval(()=>setFlow(flowStep+1),2400);}
const TOUR=[['intro',20],['architecture',14],['demo',36],['conflict',32],['matrix',18],['runtime',14],['arci',16]];
function startTour(){if(tourTimer){stopTour();return;}stopPlayback();tourStart=Date.now();tourIndex=-1;document.querySelector('.tour-button').classList.add('active');document.querySelector('.tour-button').textContent='Ⅱ 結束導覽';const tick=()=>{const elapsed=(Date.now()-tourStart)/1000;let start=0;for(let i=0;i<TOUR.length;i++){const [p,duration]=TOUR[i];if(elapsed<start+duration){if(tourIndex!==i){tourIndex=i;navigate(p,{touring:true}).then(()=>{if(!tourTimer||tourIndex!==i||page!==p)return;if(p==='arci'){arciMode='flow';render();playFlow();}if(p==='matrix'){updateTrace(0);traceTimer=setInterval(()=>updateTrace(traceStep+1),2000);}});}else if(p==='demo'||p==='conflict')setPhase(Math.min(11,Math.floor((elapsed-start)/duration*12)));return;}start+=duration;}stopTour();stopPlayback();announce('導覽完成');};tourTimer=setInterval(tick,1000);tick();}

const ACTIONS={
 'source':()=>$('#source-dialog').showModal(),'close-source':()=>$('#source-dialog').close(),
 'previous':()=>navigate(PAGES[(PAGES.findIndex(x=>x[0]===page)+6)%7][0]),'next':()=>navigate(PAGES[(PAGES.findIndex(x=>x[0]===page)+1)%7][0]),
 'tour':startTour,'reload':()=>loadScenario(false),'play-scenario':playScenario,
 'step-scenario':()=>{stopPlayback();setPhase(phase===11?0:phase+1);$('[data-action="play-scenario"]').textContent='▶ 播放情境';},
 'reset-scenario':async()=>{stopPlayback();phase=0;await loadScenario(true);},
 'all-layers':()=>{layer='all';attachTwin();document.querySelectorAll('[data-layer]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});},
 'camera-home':()=>{if(page==='arci')twin?.resetCamera();else{twin?.setCameraMode('TACTICAL');twin?.frameLayer();}},'camera-top':()=>{twin?.setCameraMode('FREE');twin?.resetCamera('top');},'camera-east':()=>{twin?.setCameraMode('FREE');twin?.resetCamera('east');},
 'zoom-in':()=>twin?.zoom(.85),'zoom-out':()=>twin?.zoom(1.15),'camera-tour':()=>{if(twin)twin.cinematic=!twin.cinematic;},
 'trace-step':()=>{clearInterval(traceTimer);updateTrace(traceStep+1);},'trace-play':()=>{clearInterval(traceTimer);updateTrace(0);if(reduced){updateTrace((state?.calculationTrace?.length||1)-1);return;}traceTimer=setInterval(()=>{updateTrace(traceStep+1);if(traceStep===(state?.calculationTrace?.length||1)-1)clearInterval(traceTimer);},900);},
 'fail-best':async()=>{if(!state?.recommendation.routeId)return;const previous=state.recommendation.routeId;excluded=[...excluded,previous];selectedRoute=null;reevaluation='';await loadScenario(false);if(state&&excluded.includes(previous)){reevaluation=state.recommendation.routeId?`已排除 ${previous} 並由後端重新評估；${state.recommendation.routeId===previous?'首選未改變':'新的首選為 '+state.recommendation.routeId}。`:`已排除 ${previous} 並由後端重新評估；本次沒有核准的傳輸路徑。`;if(page==='matrix'){render();$('[data-action="restore-routes"]')?.focus({preventScroll:true});}}},
 'restore-routes':()=>loadScenario(true),'drop-ack':async()=>{dropAck=true;await loadScenario(false);},'resend':async()=>{dropAck=false;await loadScenario(false);},
 'explode':()=>{exploded=!exploded;twin?.setExploded(exploded);$('[data-action="explode"]').setAttribute('aria-pressed',String(exploded));},
 'export-evidence':()=>{if(!state)return;const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`starrylink-${scenario}-${state.inputHash.slice(0,12)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
};
document.addEventListener('click',e=>{const el=e.target.closest('button,a');if(!el)return;
 if(el.dataset.pageTarget){e.preventDefault();navigate(el.dataset.pageTarget);return;}
 if(el.dataset.cameraMode){twin?.setCameraMode(el.dataset.cameraMode);return;}
 if(el.dataset.action){ACTIONS[el.dataset.action]?.();return;}
 if(el.dataset.layer){selectLayer(el.dataset.layer);return;}
 if(el.dataset.view){view=el.dataset.view;phase=view==='normal'?0:8;render();return;}
 if(el.dataset.phase!=null){stopPlayback();setPhase(+el.dataset.phase);$('[data-action="play-scenario"]').textContent=phase===11?'↻ 重播情境':'▶ 播放情境';return;}
 if(el.dataset.route){selectRoute(el.dataset.route);return;}
 if(el.dataset.arciLayer!=null){clearInterval(flowTimer);setArciLayer(+el.dataset.arciLayer);return;}
 if(el.dataset.arciMode){arciMode=el.dataset.arciMode;clearInterval(flowTimer);render();if(arciMode==='flow')playFlow();return;}
 if(el.dataset.flowStep!=null){clearInterval(flowTimer);arciMode='flow';setFlow(+el.dataset.flowStep);}
});
document.addEventListener('camera-mode-change',e=>{cameraMode=e.detail;document.querySelectorAll('[data-camera-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cameraMode===cameraMode)));const select=$('[data-follow-target]');if(select)select.hidden=cameraMode!=='FOLLOW';});
document.addEventListener('change',e=>{if(e.target.matches('[data-score-route]')){selectedRoute=e.target.value;$('[data-scenario-score]').innerHTML=routeScoreMarkup();}if(e.target.matches('[data-follow-target]')){followTarget=e.target.value;if(twin)twin.followTarget=followTarget;}if(e.target.matches('[data-node-select]'))selectNode(e.target.value);if(e.target.matches('[data-scenario-select]')){stopPlayback();phase=0;scenario=e.target.value;const url=new URL(location.href);url.searchParams.set('scenario',scenario);history.replaceState({},'',url);loadScenario(true);}});
document.addEventListener('toggle',e=>{if(e.target.matches?.('[data-calculation]')&&!e.target.open)clearInterval(traceTimer);},true);
document.addEventListener('input',e=>{if(e.target.matches('[data-phase-range]')){stopPlayback();setPhase(+e.target.value);$('[data-action="play-scenario"]').textContent='▶ 播放情境';}});
window.addEventListener('popstate',()=>{const q=new URLSearchParams(location.search);const next=q.get('scenario')==='conflict'?'conflict':'disaster';if(next!==scenario){scenario=next;state=null;}navigate(q.get('page')||'intro',{history:false});});
window.addEventListener('pagehide',()=>{++requestVersion;++routeVersion;busy=false;stopPlayback();stopTour();controller?.abort();clearComponents();releaseTwin();});
render();
if(!['intro','architecture'].includes(page))await loadScenario();
window.addEventListener('pageshow',e=>{if(e.persisted){render();if(!state&&!['intro','architecture'].includes(page))void loadScenario();}});
// Read-only diagnostics for local render and resource-budget verification.
window.STARRYLINK_V2=Object.freeze({inspect:()=>({page,scenario,phase,layer,view,mode:state?.mode||'unavailable',busy,error:loadError,inputHash:state?.inputHash,candidates:state?.candidates.length,selected:state?.recommendation.routeId,fallback:state?.recommendation.fallbackRouteId,delivery:coastal?.frame?.delivery.status||state?.deliveryStatus.status,confirmed:coastal?!!coastal.frame?.confirmed:state?.deliveryStatus.confirmed,arciLayer,arciMode,stats:coastal?.renderer?.stats()||twin?.stats(),coastal:coastal?.snapshot(),opening:opening?.snapshot(),domains:domains?.snapshot(),resources:{coastal:!!coastal?.renderer,twin:!!twin,twinPending:!!twinPending,domains:!!domains,opening:!!opening}})});

// Explicit local QA clock; absent from normal product sessions.
if(new URLSearchParams(location.search).get('qa')==='1')window.STARRYLINK_COASTAL_QA=Object.freeze({seek:t=>{coastal?.pause();coastal?.setGuide(false);coastal?.setTime(t,{fixedCamera:true});},camera:name=>coastal?.renderer?.focus(name,true),loseContext:()=>coastal?.renderer?.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext(),state:()=>state});
