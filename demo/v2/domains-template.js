export function domainsMarkup(){return `<section class="page-panel sl-domains" data-page="architecture" aria-label="四域通訊架構"><div class="page">

<div class="hero">
<section class="intro" aria-label="StarryLink 星夜簡介"><p class="eyebrow"><span></span>四域通訊架構</p><h1>四種連結，<br><span>彼此支援。</span></h1><p class="lede">從海底纜線到空中節點，<br>理解不同通訊方式如何彼此補位。</p><button class="cta" id="explore">切換通訊層級 <span>↗</span></button><p class="interaction-intro">點選模型或下方層級，<br>探索四種通訊方式如何彼此支援。</p></section>
<section id="stage" class="stage" aria-label="星海地空即時3D模型">
<div class="stage-aura" aria-hidden="true"></div>
<canvas id="world" tabindex="0" aria-label="互動3D通訊模型。拖曳旋轉，滾輪或加減鍵縮放，方向鍵旋轉，Escape回到總覽。"></canvas>
<div id="fallback" class="fallback" hidden><strong>這個瀏覽器未能啟用 3D 畫面</strong><p>仍可用下方的四域按鈕閱讀架構。<br>互動模型需要支援 WebGL 2 的瀏覽器。</p></div>
<div class="stage-top"><span class="view-caption">FOUR DOMAINS. ONE PURPOSE.</span><div class="light-switch" role="group" aria-label="光影方案"><button data-light="dusk" aria-pressed="true">暮光</button><button data-light="studio" aria-pressed="false">柔光</button></div></div>
<div class="model-label" id="model-label" hidden></div>
<div class="stage-tools" role="group" aria-label="模型操作"><button id="zoom-in" aria-label="放大模型" title="放大">＋</button><button id="zoom-out" aria-label="縮小模型" title="縮小">−</button><span></span><button id="pause" aria-label="暫停動態" aria-pressed="false" title="暫停動態">Ⅱ</button><button id="reset" aria-label="重設視角" title="重設視角">↺</button></div>
<div class="stage-bottom"><button id="touch-mode" aria-pressed="false">啟用模型操作</button><p id="gesture-hint">拖曳旋轉 <i>·</i> 滾輪縮放 <i>·</i> 點選模型聚焦</p><button id="routes" aria-pressed="true">連線示意 <span class="toggle" aria-hidden="true"></span></button></div>
</section>
<section class="realm-bar" aria-label="選擇通訊層"><div class="realm-tabs" role="group" aria-label="通訊層"><button class="realm-tab" data-realm="all" aria-pressed="true"><span class="realm-number">00</span><strong>總覽</strong><small>Overview</small></button><button class="realm-tab" data-realm="space" aria-pressed="false"><span class="realm-number">01</span><strong>星</strong><small>Space</small></button><button class="realm-tab" data-realm="sea" aria-pressed="false"><span class="realm-number">02</span><strong>海</strong><small>Sea</small></button><button class="realm-tab" data-realm="land" aria-pressed="false"><span class="realm-number">03</span><strong>地</strong><small>Land</small></button><button class="realm-tab" data-realm="air" aria-pressed="false"><span class="realm-number">04</span><strong>空</strong><small>Air</small></button></div><div class="realm-copy" aria-live="polite" aria-atomic="true"><p id="realm-title">四個層級，同一個通訊世界。</p><span id="realm-description">從海底纜線到空中節點，在同一座地景中理解不同的連結方式。</span></div></section>
</div>
<div class="domain-disclosure"><p>互動架構示意 · 非比例模型 · 非真實部署或即時連線</p><button id="about-open">模型與操作說明 ↗</button><button data-page-target="intro">返回首頁 →</button></div>
</div>
<dialog id="about"><div class="dialog-head"><span>四域架構 / 操作說明</span><button id="about-close" aria-label="關閉設計說明">×</button></div><h2>精細，而不繁複。</h2><p>本版用一座可旋轉的海岸剖面，呈現星、海、地、空四個通訊層。模型、材質、光線及相機由瀏覽器即時計算，不是背景影片。</p><h3>模型細節</h3><p>衛星的電池板與熱控表面、無人機的旋翼與機腹設備、地面岸站的窗帶及格構塔，以及沿海床進入岸站的海纜，分別使用獨立幾何細節。</p><h3>光影邏輯</h3><p>暮光：暖白主光、冷色側光、小面積暖色窗光。柔光：提高填充光，便於檢查材質與結構。保留接觸陰影，不使用全畫面泛光或景深模糊。</p><h3>操作</h3><p>手機先點「啟用模型操作」。拖曳旋轉；滾輪、雙指或 ＋／− 縮放。點選物件或四域按鈕聚焦；↺／Escape 回到總覽。鍵盤聚焦畫布後，方向鍵也能旋轉。動態可暫停；系統偏好減少動態時預設靜止。</p><h3>示意邊界</h3><p>地形為原創程序化示意，不是臺灣實際高程；衛星高度、物件尺寸與數量不依比例。示意路徑依序為「局部地面節點 → 無人機中繼 → 具備衛星終端的地面閘道 → 衛星」。藍線與移動光點只表達示意路徑，不是實測吞吐量、已建立的通訊鏈路或 ARCI 決策。並未連接 ARCI、部署服務或即時資料。</p></dialog>
</section>`;}
