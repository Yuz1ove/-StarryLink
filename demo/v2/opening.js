// The supplied film is an optional introduction; navigation never waits for media.
const asset=name=>new URL(`../assets/opening/${name}`,import.meta.url).href;
const sessionKey='starrylink-opening-integrated-v1';
let seenInMemory=false;
let activeOpening=null;
const filmName='opening-score-2a2ac414bcb5.mp4';
function hasSeen(){try{return seenInMemory||sessionStorage.getItem(sessionKey)==='seen';}catch{return seenInMemory;}}
function remember(){seenInMemory=true;try{sessionStorage.setItem(sessionKey,'seen');}catch{}}
export function openingMarkup(){return `<section class="page-panel sl-opening" data-page="intro" aria-label="StarryLink 星夜首頁">
 <div class="opening-stage" data-mode="static">
  <div class="opening-cover"><img src="${asset('poster-art.jpg')}" alt="海纜、岸站、無人機與衛星構成的海岸通訊地景"/><div class="opening-copy"><p>StarryLink <span>星夜</span></p><h1>讓求救，找到出路。</h1><p>在連線受阻時，為關鍵訊息尋找備援路徑。</p></div></div>
  <video muted playsinline preload="none" poster="${asset('poster.jpg')}" aria-label="22 秒星夜開場影片" aria-describedby="opening-transcript" hidden></video>
  <button class="opening-skip" data-opening="skip" hidden>跳過影片 ↗</button>
 </div>
 <div class="opening-entry"><button class="button primary" data-page-target="architecture">探索四域架構 <span>↗</span></button><span>旋轉模型，理解不同通訊方式如何彼此補位。</span></div>
 <div class="opening-controls" aria-label="影片控制"><button data-opening="play">播放開場</button><button data-opening="sound" aria-pressed="false">開啟聲音</button><button data-opening="replay">從頭重播</button><output data-opening-time aria-label="影片播放時間">00:00 / 00:22</output></div>
 <progress class="opening-progress" max="1" value="0" aria-label="影片播放進度"></progress><p class="opening-notice" role="status" aria-live="polite"></p>
 <details class="opening-details"><summary>影片說明與文字版</summary><div id="opening-transcript"><p>海纜近景：每一次連結，都有一條路。岸站特寫：當原本的路，突然中斷。局部無人機中繼把訊息接向具備衛星終端的地面閘道，再呈現衛星備援。最後回到完整海岸地景：StarryLink 星夜，讓求救，找到出路。</p><p>22 秒概念片，無旁白。配樂：<a href="https://www.scottbuckley.com.au/library/a-kind-of-hope/" target="_blank" rel="noreferrer">‘A Kind Of Hope’ by Scott Buckley</a> — released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC-BY 4.0</a> · <a href="https://www.scottbuckley.com.au" target="_blank" rel="noreferrer">www.scottbuckley.com.au</a>。本片使用 314–336 秒節選，調整淡入淡出與音量。地形、設備尺度、連線與光點皆為示意，非真實部署、即時資料或遠端確認收受。</p><a href="${asset('transcript.zh-Hant.txt')}">閱讀完整文字版 ↗</a></div></details>
 </section>`;}
export function mountOpening(root){
 activeOpening?.dispose();
 const events=new AbortController(),listen=(el,event,fn)=>el.addEventListener(event,fn,{signal:events.signal});
 const video=root.querySelector('video'),stage=root.querySelector('.opening-stage'),cover=root.querySelector('.opening-cover'),notice=root.querySelector('.opening-notice'),progress=root.querySelector('progress');
 const control=name=>root.querySelector(`[data-opening="${name}"]`);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width:760px)');
 let mode='static',disposed=false,token=0,pending=false,lastError='';
 const format=t=>`00:${String(Math.floor(t||0)).padStart(2,'0')}`;
 function update(next){if(disposed)return;mode=next;stage.dataset.mode=next;const showing=next==='playing'||next==='paused'||next==='loading';video.hidden=!showing;cover.hidden=showing;control('skip').hidden=!showing;control('play').textContent=next==='playing'?'暫停影片':next==='paused'?'繼續播放':next==='loading'?'取消播放':'播放開場';}
 function pause(){++token;pending=false;video.pause();if(mode!=='static')update('paused');}
 function finish(message=''){++token;pending=false;video.pause();video.muted=true;update('static');syncSound();notice.textContent=message;remember();}
 function syncSound(){control('sound').textContent=video.muted?'開啟聲音':'關閉聲音';control('sound').setAttribute('aria-pressed',String(!video.muted));}
 async function begin(restart=false){
  if(disposed||document.hidden)return;const attempt=++token;pending=true;remember();notice.textContent='';lastError='';
  if(!video.getAttribute('src')||video.error){video.src=asset(filmName);video.load();}
  if(restart||mode==='static')video.currentTime=0;
  update('loading');
  try{await video.play();if(disposed||attempt!==token||document.hidden){if(disposed||mode==='static'||mode==='paused'||document.hidden)video.pause();return;}pending=false;update('playing');}
  catch(error){if(disposed||attempt!==token)return;lastError=error.name;pending=false;video.pause();video.muted=true;syncSound();update('paused');notice.textContent='播放未獲允許或暫時中斷，目前無聲。可按「開啟聲音」重試，或繼續靜音播放。';}
 }
 listen(control('play'),'click',()=>{if(mode==='playing')pause();else if(mode==='loading')finish();else begin(mode==='static');});
 listen(control('skip'),'click',()=>finish());listen(control('replay'),'click',()=>begin(true));
 // Unmute and play within the same explicit user gesture. Confirm the native
 // play promise instead of only changing an aria label on a paused player.
 listen(control('sound'),'click',()=>{if(disposed||document.hidden)return;video.muted=!video.muted;syncSound();if(!video.muted)void begin(mode==='static');});
 listen(video,'ended',()=>finish());listen(video,'error',()=>finish('影片暫時無法載入，仍可直接探索四域架構。'));
 listen(video,'playing',()=>{if(disposed||!pending&&mode==='static'||document.hidden)video.pause();else update('playing');});
 listen(video,'pause',()=>{if(!disposed&&mode==='playing')update('paused');});
 listen(video,'waiting',()=>{if(!disposed&&mode==='playing')update('loading');});
 listen(video,'volumechange',syncSound);
 function syncTime(){const duration=Number.isFinite(video.duration)?video.duration:22;progress.value=duration?video.currentTime/duration:0;root.querySelector('[data-opening-time]').textContent=`${format(video.currentTime)} / ${format(duration)}`;}
 listen(video,'timeupdate',syncTime);listen(video,'durationchange',syncTime);
 listen(document,'visibilitychange',()=>{if(document.hidden){pause();video.muted=true;syncSound();}});
 const preference=()=>{if(reduced.matches||mobile.matches||navigator.connection?.saveData)finish('已保留靜態封面；可自行播放開場。');};
 listen(reduced,'change',preference);listen(mobile,'change',preference);if(navigator.connection)listen(navigator.connection,'change',preference);
 video.muted=true;syncSound();
 if(!hasSeen()&&!reduced.matches&&!mobile.matches&&!navigator.connection?.saveData&&!document.hidden&&document.documentElement.dataset.motion!=='reduce')begin(true);
 const manager={pause,dispose(){if(disposed)return;remember();++token;pending=false;disposed=true;events.abort();video.pause();video.muted=true;video.removeAttribute('src');video.load();if(activeOpening===manager)activeOpening=null;},snapshot:()=>({mode,paused:video.paused,muted:video.muted,time:video.currentTime,pending,disposed,src:video.currentSrc,volume:video.volume,lastError})};
 activeOpening=manager;
 return manager;
}
