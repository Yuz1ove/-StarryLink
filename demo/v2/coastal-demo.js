import {frameAtTime} from './coastal-contract.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PHASE_NAMES=['正常','事件前兆','衝擊','設施受損','等待接續','備援起飛','資格檢查','路徑選定','次級失效','等待輪替','接收端核對','確認結果'];
const FAULT_LABELS={none:'預設情境','no-egress':'所有回傳出口失效','no-spare':'輪替機不可用','ack-loss':'目的端 ACK 遺失','arci-timeout':'決策 timeout（模擬）','arci-schema':'決策格式錯誤（模擬）','arci-stale':'過期決策（模擬）'};
export function coastalMarkup(scenario,error='',busy=false){return `<section class="coastal-demo" data-coastal-root data-scenario="${scenario}">
 <header class="coastal-heading"><div><p class="eyebrow">${scenario==='conflict'?'04 / SCENARIO B':'03 / SCENARIO A'} · 星灣 / FICTIONAL COAST</p><h1>${scenario==='conflict'?'設施受損之後，逐區接回訊息。':'地震過後，求救還有下一段路。'}</h1></div><p>虛構局部地景與示意部署<br>ARCI 未連接 · 本機模擬執行</p></header>
 ${error?`<div class="error-state" role="alert">${E(error)} · 未推測任何成功結果。<button class="button" data-action="reload">重新載入</button></div>`:''}
 <div class="coastal-stage" data-coastal-stage><div class="coastal-view-controls"><button data-coastal="guide" aria-pressed="true">導覽鏡頭</button><button data-coastal="free" aria-pressed="false">自由檢視</button><button data-coastal="topology" aria-pressed="false">透視拓樸</button><button data-coastal="cutaway" aria-pressed="false">海纜剖切</button></div>
 <div class="coastal-now" data-coastal-now>正常 / 模擬</div><div class="coastal-place"><span>星灣 · 河口與山谷</span><small>LOCAL SCENARIO · 全部為模擬設定</small></div>
 <div class="coastal-fallback" data-coastal-fallback ${busy||error?'':'hidden'}><strong>${busy?'正在載入場景與事件資料':'3D 尚未就緒'}</strong><p>仍可用播放、事件步進與節點清單檢查通訊因果。</p></div>
 <div class="coastal-focus" aria-label="定位與縮放"><button data-coastal-focus="overview">總覽</button><button data-coastal-focus="source">求救端</button><button data-coastal-focus="fault">故障點</button><button data-coastal-focus="center">應變中心</button>${scenario==='conflict'?'<button data-coastal-focus="vessel">艦艇</button>':''}<button data-coastal="zoom-in" aria-label="放大">＋</button><button data-coastal="zoom-out" aria-label="縮小">−</button></div>
 <div class="coastal-key"><span>━ 採用</span><span>┄ 失效／拒絕</span><span>·· 未驗證</span><span>↩ 目的端 ACK</span></div>
 </div>
 <div class="coastal-transport"><div class="coastal-clock"><strong data-coastal-time>T+00.0</strong><span>情境秒數 / 非量測延遲</span></div><div class="coastal-play"><button data-coastal="play" class="primary" disabled>啟動</button><button data-coastal="back" aria-label="上一事件" disabled>←</button><button data-coastal="next" aria-label="下一事件" disabled>→</button><button data-coastal="restart" disabled>重啟</button></div><div class="coastal-disclosures"><button data-coastal-panel="nodes">節點與部署</button><button data-coastal-panel="links">查看計算</button><button data-coastal-panel="events">事件與證據</button></div></div>
 <div class="coastal-timeline" aria-label="事件時間軸">${PHASE_NAMES.map((n,i)=>`<button data-coastal-phase="${i}" aria-current="${i===0?'step':'false'}"><small>${String(i+1).padStart(2,'0')}</small>${n}</button>`).join('')}</div>
 <section class="coastal-result" aria-live="polite" aria-atomic="true"><div><p class="eyebrow" data-coastal-event>NORMAL</p><h2 data-coastal-title>等待情境資料</h2><p data-coastal-copy>沒有資料時，不建立候選或送達確認。</p></div><div class="coastal-region-results" data-coastal-regions></div></section>
 <p class="coastal-boundary">程序地形 · 垂直比例放大 1.25 倍 · 無人機外形放大 3 倍 · 光線為資訊流示意 · 簡化直視检查不代表實測射頻能力</p>
 <dialog class="coastal-dialog" data-coastal-dialog><header><h2 data-coastal-dialog-title>詳細資料</h2><button data-coastal="close" aria-label="關閉詳細資料">×</button></header><div data-coastal-detail></div></dialog>
 </section>`;}

export class CoastalDemo {
 constructor(root,state,{onPhase,onFault,reduced=false}={}){
  this.root=root;this.state=state;this.onPhase=onPhase;this.onFault=onFault;this.reduced=reduced;this.time=0;this.phase=-1;this.playing=false;this.guide=true;this.events=new AbortController();this.dialog=root.querySelector('dialog');this.last=0;
  this.host=root.querySelector('[data-coastal-stage]');this.query=s=>root.querySelector(s);this.boundaryError='';
  root.addEventListener('click',e=>this.click(e),{signal:this.events.signal});root.addEventListener('change',e=>{if(e.target.matches('[data-coastal-motion]')){if(this.renderer)this.renderer.reduced=!e.target.checked;}if(e.target.matches('[data-coastal-fault]'))this.onFault?.(e.target.value);if(e.target.matches('[data-coastal-node-select]'))this.selectNode(e.target.value);},{signal:this.events.signal});
  this.dialog.addEventListener('close',()=>{const target=this.returnFocus?.isConnected?this.returnFocus:this.query('[data-coastal-panel="'+this.panel+'"]');this.panel=null;target?.focus();},{signal:this.events.signal});
  root.addEventListener('keydown',e=>{if(e.key.startsWith('Arrow'))e.stopPropagation();},{signal:this.events.signal});
  if(!state)return;
  const renderReady=this.initializeRenderer();
  root.querySelectorAll('[data-coastal="play"],[data-coastal="back"],[data-coastal="next"],[data-coastal="restart"]').forEach(b=>b.disabled=false);
  this.setTime(0);this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
  Promise.all([document.fonts.ready,renderReady]).then(()=>{if(!this.disposed){this.renderer?.render(this.time);root.dataset.ready='true';}});
 }
 async initializeRenderer(){
  try{
   if(new URLSearchParams(location.search).get('webgl')==='off')throw Error('已選擇無 WebGL 文字模式');
   const {CoastalRenderer}=await import('./coastal-renderer.js');
   await CoastalRenderer.prepare?.();
   if(this.disposed)return;
   this.renderer?.dispose();this.renderer=new CoastalRenderer(this.host,this.state,{reduced:this.reduced,quality:new URLSearchParams(location.search).get('quality')||'standard',select:id=>this.selectNode(id),onFree:()=>this.setGuide(false),onFailure:m=>this.fallback(m)});
   this.renderer.setFrame(this.frame||this.state.timeline.frames[0],this.time);this.query('[data-coastal-fallback]').hidden=true;this.boundaryError='';
  }catch(e){if(!this.disposed)this.fallback(e.message);}
 }
 fallback(message){this.boundaryError=message;const el=this.query('[data-coastal-fallback]');el.hidden=false;el.innerHTML=`<strong>文字演練模式</strong><p>${E(message)}</p><p>場景：虛構海岸—河口—城市—山谷。求救端 → 合格接入／中繼 → 配置回傳終端 → 應變中心；失效與未驗證鏈路不採用。</p><button data-coastal-panel="nodes">查看節點與可用狀態</button><button data-coastal="retry-3d">重新載入 3D</button>`;this.host.dataset.render='unavailable';}
 setGuide(value){this.guide=value;this.query('[data-coastal="guide"]').setAttribute('aria-pressed',String(value));this.query('[data-coastal="free"]').setAttribute('aria-pressed',String(!value));}
 setTime(value,{fixedCamera=false}={}){
  if(!this.state)return;this.time=Math.max(0,Math.min(32,value));const frame=frameAtTime(this.state,this.time);const changed=frame.phase!==this.phase;
  this.phase=frame.phase;this.frame=frame;this.renderer?.setFrame(frame,this.time);this.onPhase?.(this.phase);
  if(changed){this.sync();if(this.guide&&!fixedCamera){const target=this.phase===0?'overview':this.phase<=3?'fault':this.phase<7?'source':this.phase<10?'relay':'center';this.renderer?.focus(target,this.reduced);}}
  this.query('[data-coastal-time]').textContent=`T+${this.time.toFixed(1).padStart(4,'0')}`;
  if(this.time>=32){this.playing=false;this.query('[data-coastal="play"]').textContent='重新播放';}
  this.renderer?.render(this.time);
 }
 sync(){
  const f=this.frame,s=this.state,primary=s.scenarioId==='conflict';let title,copy;
  if(f.phase===0){title='城市運作中，先認識原有通路。';copy='A 區山谷、B 區港區沿已配置的地面回傳連到應變中心；5 架示意無人機仍在停機坪待命。';}
  else if(f.phase===1){title=primary?'外海出現事件前兆，設施仍在線。':'地震前的地景與通訊基線。';copy=primary?'艦艇為虛構輪廓；接下來的發射與飛行時間僅為敘事示意，不含火控計算。':'事件在 T+5 發生。道路、供電與纜線分別依情境依賴更新，不會一併任意停用。';}
  else if(f.phase<=3){title=primary?(f.seconds<8?'短暫發射，尚未造成設施失效。':'A 區塔體受損，地面通路退出。'):'坡面崩落，A 區斷電與斷纖。';copy=primary?'事件依序發生。B 區回傳機房於 T+10 受損，基地台外形保持完整。':'崩落面、坡腳堆積与局部斷路會保留；同一事件明確切斷坡道纜線。山背鏈路仍受地形遮蔽限制。';}
  else if(f.phase<=5){title='求救暫存，備援正在前往指定位置。';copy='接入機與回傳中繼具有不同角色。T+17 到達前，任何部署中的機體都不能建立有效新路徑。';}
  else if(f.phase===6){title='端點就位，開始檢查可用鏈路。';copy='以局部公尺座標檢查直視與設定範圍，再用固定 seed 比較模擬候選；山背路徑保持拒絕或未驗證。';}
  else if(f.phase===7){title='提案通過檢查，還沒有送達證據。';copy='此為本機 fixture 決策；原生 ARCI 尚未連接。A、B 區分開評估，只示範關鍵訊息通道。';}
  else if(f.phase<10){title='A02 失效，等待輪替機抵達。';copy='既有候選已撤銷。A03 從停機坪起飛，T+29 抵達前沒有可用替代路徑；B 區備援電源耗盡，保持未恢復。';}
  else if(f.phase===10){title='新的合格路徑，接收端核對封包。';copy='本機 transport 執行逐跳傳送、有限重試與 SLV1 完整性檢查；介面此時仍不宣告目的端已確認。';}
  else {title=f.confirmed?'應變中心已收到 A 區求救訊息。':'尚未取得同一訊息的目的端確認。';copy=f.confirmed?'模擬接收端回覆的 message、run、route、sequence 與 packet hash 相符；B 區仍受阻，受損地景保持原狀。':'保留求救佇列與失敗原因。沒有有效出口、合格決策或相符 ACK，均不顯示已送達。';}
  if(f.decision.status==='PROVIDER_TIMEOUT'||f.decision.status==='SCHEMA_REJECTED'||f.decision.status==='STALE_REJECTED'){title='決策未通過接入檢查。';copy=`${f.decision.status} · 故障注入為模擬。自由文字、過期回應與 timeout 都不能觸發執行；原生 ARCI 仍未連接。`;}
  this.query('[data-coastal-now]').textContent=`T+${f.seconds} · ${PHASE_NAMES[f.phase]}`;this.query('[data-coastal-title]').textContent=title;this.query('[data-coastal-copy]').textContent=copy;this.query('[data-coastal-event]').textContent=`${PHASE_NAMES[f.phase]} / ${f.stage}`;
  this.query('[data-coastal-regions]').innerHTML=f.regions.map(r=>`<div><span>${r.region} 區</span><strong>${f.phase===0?'原有通訊':f.phase===11&&r.delivery.confirmed?'模擬目的端 ACK 相符':r.routeId?'僅關鍵訊息通道':'等待接續'}</strong><small>${f.phase===11?E(r.delivery.status):'來源：情境模擬'}</small></div>`).join('');
  this.root.querySelectorAll('[data-coastal-phase]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.coastalPhase)===f.phase?'step':'false')));
  if(this.panel)this.renderPanel();
 }
 click(e){
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.coastalPanel){this.showPanel(b.dataset.coastalPanel,b);return;}
  if(b.dataset.coastalNode){this.selectNode(b.dataset.coastalNode);return;}
  if(b.dataset.coastalLink){this.selectedLink=b.dataset.coastalLink;if(this.renderer)this.renderer.selectedLink=this.selectedLink;this.showPanel('links',b);return;}
  if(b.dataset.coastalFocus){this.setGuide(false);this.renderer?.focus(b.dataset.coastalFocus,this.reduced);return;}
  if(b.dataset.coastalPhase!=null){this.pause();this.setTime(this.state?.timeline.frames[+b.dataset.coastalPhase].seconds||0);return;}
  const a=b.dataset.coastal;if(!a)return;
  if(a==='play'){if(this.playing){this.pause();return;}if(this.time>=32)this.setTime(0);this.playing=true;b.textContent='暫停';}
  if(a==='restart'){this.pause();this.setTime(0);}
  if(a==='back'||a==='next'){this.pause();const i=Math.min(11,Math.max(0,this.phase+(a==='next'?1:-1)));this.setTime(this.state.timeline.frames[i].seconds);}
  if(a==='guide'){this.setGuide(true);this.renderer?.focus('overview',this.reduced);}
  if(a==='free'){this.setGuide(false);if(this.renderer)this.renderer.cameraGoal=null;}
  if(a==='zoom-in'||a==='zoom-out')this.renderer?.zoom(a==='zoom-in'?.8:1.2);
  if(a==='close')this.dialog.close();
  if(a==='retry-3d')void this.initializeRenderer();
  if(a==='topology'||a==='cutaway'){const field=a==='topology'?'topology':'cutaway';this[field]=!this[field];b.setAttribute('aria-pressed',String(this[field]));if(this.renderer)this.renderer[field]=this[field];}
  if(a==='export'){const blob=new Blob([JSON.stringify(this.state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${this.state.runId}.json`;a.click();URL.revokeObjectURL(url);}
 }
 pause(){this.playing=false;this.query('[data-coastal="play"]').textContent=this.time===0?'啟動':'繼續';}
 selectNode(id){this.selectedNode=id;this.renderer?.focus(id,this.reduced);this.setGuide(false);this.showPanel('nodes',document.activeElement);}
 showPanel(panel,button){this.pause();if(!this.dialog.open)this.returnFocus=button?.isConnected?button:this.query('[data-coastal-panel="'+panel+'"]');this.panel=panel;this.renderPanel();if(!this.dialog.open)this.dialog.showModal();}
 renderPanel(){
  const f=this.frame,s=this.state;if(!f)return;let html='';
  this.query('[data-coastal-dialog-title]').textContent=this.panel==='nodes'?'節點與示意部署':this.panel==='links'?'鏈路、資格與計算':'事件、決策與送達證據';
  if(this.panel==='nodes'){
   const uavs=f.networkState.nodes.filter(n=>n.layer==='air'),available=uavs.filter(n=>n.operation==='serving');
   html=`<p>畫面／清單 ${uavs.length} 架 · 可服務 ${available.length} 架。由同一節點資料推導；不代表最佳機數或全區覆蓋。</p><label>定位節點<select data-coastal-node-select>${f.networkState.nodes.map(n=>`<option value="${n.id}" ${this.selectedNode===n.id?'selected':''}>${E(n.label)}</option>`).join('')}</select></label>`;
   html+=f.networkState.nodes.map(n=>`<article class="coastal-record ${n.id===this.selectedNode?'selected':''}"><button data-coastal-node="${n.id}">${E(n.label)} ↗</button><code>${n.id}</code><p>${E(n.role||n.type)} · ${E(n.operation)}${n.failureMode?' · '+E(n.failureMode):''}</p><small>局部模擬座標 [${n.scenePositionM.map(v=>v.toFixed(1)).join(', ')}] m${n.flight?` · 抵達 T+${n.flight.arrivalSeconds}`:''}<br>連接：${f.networkState.links.filter(l=>[l.source,l.target].includes(n.id)&&l.qualification==='QUALIFIED').map(l=>E(l.id)).join(', ')||'無合格鏈路'}</small></article>`).join('');
  }else if(this.panel==='links'){
   html='<p>簡化幾何模型：局部公尺座標、95 個內部地形取樣點、配置範圍。未處理繞射、反射與 Fresnel zone，未經現場驗證。</p>';
   html+=f.networkState.links.map(l=>`<article class="coastal-record"><button data-coastal-link="${l.id}">${l.id} ↗</button><strong>${l.qualification}</strong><p>${E(l.qualificationReason)}</p><small>${l.source} → ${l.target}</small>${l.calculation?`<dl><div><dt>模擬距離</dt><dd>${l.calculation.distanceM} m</dd></div><div><dt>最小地形淨空</dt><dd>${l.calculation.minTerrainClearanceM} m</dd></div><div><dt>設定範圍</dt><dd>${l.calculation.maxRangeM} m</dd></div></dl>`:''}</article>`).join('');
   html+='<h3>目前快照候選</h3>'+f.candidates.map(c=>`<article class="coastal-record"><strong>${c.id} · ${c.eligible?'ELIGIBLE':'REJECTED'}</strong><p>${c.hops.map(h=>E(h.label)).join(' → ')}</p><p>分數 ${c.finalScore.toFixed(2)} · 送達模擬 ${c.metrics.deliveryProbability} / ${c.runs} runs</p><details><summary>加權貢獻與原始值</summary><pre>${E(JSON.stringify({metrics:c.metrics,weightedContributions:c.weightedContributions},null,2))}</pre></details></article>`).join('');
   if(!f.candidates.length)html+='<p>此快照無可用候選。</p>';
  }else{
   html=`<label><input type="checkbox" data-coastal-motion ${this.renderer&&!this.renderer.reduced?'checked':''}> 動態效果（震動、閃光、煙塵與粒子）</label><label>失敗案例（本機模擬）<select data-coastal-fault>${Object.entries(FAULT_LABELS).map(([v,l])=>`<option value="${v}" ${s.testFault===v?'selected':''}>${l}</option>`).join('')}</select></label><p>原生 ARCI / UNCONNECTED；provider = fixture；actuation = simulation。未操作外部設備。</p><button data-coastal="export">匯出完整 JSON 證據</button><p class="coastal-code">RUN ${E(s.runId)}<br>SNAPSHOT ${E(f.snapshotId)}<br>DECISION ${E(f.decision.id)}<br>MESSAGE ${E(f.delivery.messageId)}</p>`;
   html+=f.events.map(e=>`<article class="coastal-record"><strong>T+${e.seconds} · ${E(e.label)}</strong><p>${E(e.id)}</p><small>節點 ${E(JSON.stringify(e.nodeChanges))}<br>鏈路 ${E(JSON.stringify(e.linkChanges))}</small></article>`).join('')||'<p>尚無事件。</p>';
   html+=`<h3>目前階段送達證據</h3><pre>${E(JSON.stringify(f.delivery,null,2))}</pre><p>只有目的端 SimulationReceiver 驗證封包後的 ACK 可以確認；畫面時鐘不产生 ACK。所有 elapsedMs 為鏈路設定累計，非動畫時間或端到端實測。</p>`;
  }
  this.query('[data-coastal-detail]').innerHTML=html;
 }
 tick(t){if(this.disposed)return;this.raf=requestAnimationFrame(this.tick);const dt=this.last?Math.min(.1,(t-this.last)/1000):0;this.last=t;if(document.hidden||this.renderer&&!this.renderer.visible)return;
  if(this.playing){const next=Math.min(32,this.time+dt);if(frameAtTime(this.state,next).phase!==this.phase)this.setTime(next);else{this.time=next;this.query('[data-coastal-time]').textContent=`T+${next.toFixed(1).padStart(4,'0')}`;}if(next===32)this.setTime(32);}
  this.renderer?.render(this.time);
 }
 snapshot(){return {ready:this.root.dataset.ready==='true',runId:this.state?.runId,scenario:this.state?.scenarioId,time:this.time,phase:this.phase,playing:this.playing,guided:this.guide,confirmed:!!this.frame?.confirmed,decision:this.frame?.decision,status:this.frame?.routeStatus,fallback:this.boundaryError||null,stats:this.renderer?.stats()};}
 dispose(){if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.raf);this.events.abort();this.dialog?.close();this.renderer?.dispose();this.renderer=null;}
}
