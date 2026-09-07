
/* StarryLink / Four domains — original interactive design study.
 * Native WebGL2, self-contained; no network, fonts, analytics or application API.
 * All placements, units and signal motion are schematic, not telemetry.
 */
export function mountDomains(root){
'use strict';
const events=new AbortController();
const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal:events.signal});
const $=s=>root.querySelector(s), canvas=$('#world'), stage=$('#stage');
const realmInfo={all:['四個層級，同一個通訊世界。','從海底纜線到空中節點，在同一座地景中理解不同的連結方式。'],space:['星｜在地面之外，保留一種回傳選擇。','聚焦衛星電池板、熱控表面與天線。高度與大小僅作視覺示意。'],sea:['海｜從海床，接入岸上的網路。','海纜沿海床通往登陸岸站；聚焦時降低水面遮蔽，查看接續位置。'],land:['地｜把連結落實到地面節點。','岸站、格構通訊塔與地面設施保留基座、窗帶及接觸陰影。'],air:['空｜讓臨時節點，延伸連結的可能。','局部地面節點經無人機中繼，接回具備衛星終端的地面閘道，再使用衛星備援。數量及位置不是部署建議。']};
const realmId={all:0,space:1,sea:2,land:3,air:4};
const media=matchMedia('(prefers-reduced-motion: reduce)');
const state={realm:'all',light:'dusk',paused:media.matches,routes:true,ready:false,active:true,error:null,renderCount:0};
let controls=null,queue=()=>{},gl=null;
function setRealm(name){if(!realmInfo[name])return;state.realm=name;root.querySelectorAll('[data-realm]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.realm===name)));$('#realm-title').textContent=realmInfo[name][0];$('#realm-description').textContent=realmInfo[name][1];if(controls)controls.focus(name);queue()}
function setLight(name){state.light=name;root.dataset.light=name;root.querySelectorAll('[data-light]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.light===name)));queue()}
function setPaused(v){state.paused=v;$('#pause').setAttribute('aria-pressed',String(v));$('#pause').textContent=v?'▷':'Ⅱ';$('#pause').setAttribute('aria-label',v?'播放動態':'暫停動態');$('#pause').title=v?'播放動態':'暫停動態';queue()}
for(const el of root.querySelectorAll('[data-realm]'))listen(el,'click',()=>setRealm(el.dataset.realm));
for(const el of root.querySelectorAll('[data-light]'))listen(el,'click',()=>setLight(el.dataset.light));
listen($('#reset'),'click',()=>setRealm('all'));
listen($('#explore'),'click',()=>{const keys=['all','space','sea','land','air'];setRealm(keys[(keys.indexOf(state.realm)+1)%keys.length]);if(innerWidth<761)stage.scrollIntoView({block:'center',behavior:media.matches?'instant':'smooth'})});
listen($('#pause'),'click',()=>setPaused(!state.paused));setPaused(state.paused);
listen($('#routes'),'click',()=>{state.routes=!state.routes;$('#routes').setAttribute('aria-pressed',String(state.routes));queue()});
listen($('#zoom-in'),'click',()=>controls?.zoom(.86));listen($('#zoom-out'),'click',()=>controls?.zoom(1.16));
const about=$('#about');listen($('#about-open'),'click',()=>about.showModal());listen($('#about-close'),'click',()=>about.close());listen(about,'click',e=>{if(e.target===about){const r=about.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)about.close()}});
listen(media,'change',e=>{if(e.matches)setPaused(true)});
const V={add:(a,b)=>a.map((v,i)=>v+b[i]),sub:(a,b)=>a.map((v,i)=>v-b[i]),mul:(a,s)=>a.map(v=>v*s),dot:(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm:a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n)},mix:(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t)};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), smooth=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)}, I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const M={mul:(a,b)=>{const o=new Array(16).fill(0);for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)o[i+j*4]+=a[i+k*4]*b[k+j*4];return o},point:(m,p,w=1)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]*w,m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13]*w,m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]*w],translate:p=>{const m=I();m[12]=p[0];m[13]=p[1];m[14]=p[2];return m},scale:s=>[s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1],rx:t=>{const c=Math.cos(t),s=Math.sin(t);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]},ry:t=>{const c=Math.cos(t),s=Math.sin(t);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]},rz:t=>{const c=Math.cos(t),s=Math.sin(t);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]},perspective:(f,a,n,far)=>{const t=1/Math.tan(f/2);return[t/a,0,0,0,0,t,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]},look:(e,t)=>{const z=V.norm(V.sub(e,t)),x=V.norm(V.cross([0,1,0],z)),y=V.cross(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,e),-V.dot(y,e),-V.dot(z,e),1]},ortho:(l,r,b,t,n,f)=>[2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]};
function pose(p,r=[0,0,0],s=1){return M.mul(M.translate(p),M.mul(M.rz(r[2]),M.mul(M.ry(r[1]),M.mul(M.rx(r[0]),M.scale(s)))))}
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const C=hex=>{if(Array.isArray(hex))return hex;hex=hex.replace('#','');return[0,2,4].map(i=>linear(parseInt(hex.slice(i,i+2),16)/255))};
function mat(hex,rough=.6,metal=0,glow=0,realm=3){return{c:C(hex),p:[rough,metal,glow],realm}}
const material={stone:mat('#8c877c',.87),earth:mat('#393e3b',.95),sand:mat('#afaa8e',.88),concrete:mat('#c4c5b9',.8),roof:mat('#4e605f',.65,.2),glass:mat('#243c47',.16,.55),steel:mat('#afb7b4',.28,.7),dark:mat('#242e32',.5,.35),warm:mat('#ddc599',.4,0,.6),signal:mat('#82b9b8',.35,.2,.7),seaFloor:mat('#526461',.9,0,0,2)};
class Builder{
 constructor(){this.data=[];this.x=I()}
 push(p,n,m){p=M.point(this.x,p);n=V.norm(M.point(this.x,n,0));this.data.push(...p,...n,...m.c,...m.p,m.realm)}
 tri(a,b,c,m,ns=null){const n=ns||V.norm(V.cross(V.sub(b,a),V.sub(c,a)));this.push(a,ns?ns[0]:n,m);this.push(b,ns?ns[1]:n,m);this.push(c,ns?ns[2]:n,m)}
 quad(a,b,c,d,m,n){this.tri(a,b,c,m,n?[n,n,n]:null);this.tri(a,c,d,m,n?[n,n,n]:null)}
 with(transform,fn){const old=this.x;this.x=M.mul(old,transform);fn();this.x=old}
 box(center,size,m,r=.03,rotation=[0,0,0]){
  this.with(pose(center,rotation),()=>{const h=size.map(v=>v/2);r=Math.min(r,...h.map(v=>v*.8));
   for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    const a=(axis+1)%3,b=(axis+2)%3,us=[-h[a],-h[a]+r,h[a]-r,h[a]],vs=[-h[b],-h[b]+r,h[b]-r,h[b]];
    const vertex=(u,v)=>{const p=[0,0,0];p[axis]=h[axis]*sign;p[a]=u;p[b]=v;const q=p.map((v,i)=>clamp(v,-h[i]+r,h[i]-r)),n=V.norm(V.sub(p,q));return{p:V.add(q,V.mul(n,r)),n}};
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){const A=vertex(us[i],vs[j]),B=vertex(us[i+1],vs[j]),D=vertex(us[i],vs[j+1]),E=vertex(us[i+1],vs[j+1]);this.tri(A.p,B.p,E.p,m,[A.n,B.n,E.n]);this.tri(A.p,E.p,D.p,m,[A.n,E.n,D.n])}
   }
  })
 }
 beam(a,b,r,m,sides=9,r2=r){const axis=V.norm(V.sub(b,a)),x=V.norm(V.cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),z=V.cross(axis,x);const vv=(p,t,rad)=>{const n=V.add(V.mul(x,Math.cos(t)),V.mul(z,Math.sin(t)));return{p:V.add(p,V.mul(n,rad)),n}};for(let i=0;i<sides;i++){const t=i/sides*Math.PI*2,u=(i+1)/sides*Math.PI*2,A=vv(a,t,r),B=vv(a,u,r),D=vv(b,t,r2),E=vv(b,u,r2);this.tri(A.p,D.p,E.p,m,[A.n,D.n,E.n]);this.tri(A.p,E.p,B.p,m,[A.n,E.n,B.n]);this.tri(a,B.p,A.p,m,[V.mul(axis,-1),V.mul(axis,-1),V.mul(axis,-1)]);this.tri(b,D.p,E.p,m,[axis,axis,axis])}}
 sphere(center,r,m,scale=[1,1,1],nx=12,ny=8){const vv=(u,v)=>{const n=[Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)];return{p:n.map((x,i)=>center[i]+x*r*scale[i]),n:V.norm(n.map((x,i)=>x/scale[i]))}};for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=vv(i/nx*6.283,j/ny*Math.PI),b=vv((i+1)/nx*6.283,j/ny*Math.PI),c=vv((i+1)/nx*6.283,(j+1)/ny*Math.PI),d=vv(i/nx*6.283,(j+1)/ny*Math.PI);this.tri(a.p,b.p,c.p,m,[a.n,b.n,c.n]);this.tri(a.p,c.p,d.p,m,[a.n,c.n,d.n])}}
 tube(points,r,m,dash=0){for(let i=0;i<points.length-1;i++)if(!dash||Math.floor(i/dash)%2===0)this.beam(points[i],points[i+1],r,m,7)}
 dish(center,r,dir,m){const a=V.norm(dir),x=V.norm(V.cross(a,Math.abs(a[1])>.9?[1,0,0]:[0,1,0])),z=V.cross(a,x);const vv=(rr,t)=>{const radial=V.add(V.mul(x,Math.cos(t)),V.mul(z,Math.sin(t)));return{p:V.add(center,V.add(V.mul(radial,rr),V.mul(a,rr*rr*.9/r))),n:V.norm(V.sub(a,V.mul(radial,rr*1.8/r)))}};for(let i=0;i<24;i++)for(let j=0;j<5;j++){const A=vv(j*r/5,i/24*6.283),B=vv((j+1)*r/5,i/24*6.283),D=vv(j*r/5,(i+1)/24*6.283),E=vv((j+1)*r/5,(i+1)/24*6.283);this.tri(A.p,B.p,E.p,m,[A.n,B.n,E.n]);this.tri(A.p,E.p,D.p,m,[A.n,E.n,D.n])}const feed=V.add(center,V.mul(a,r*1.25));this.sphere(feed,r*.085,m,[1,1,1],8,5);for(let i=0;i<3;i++)this.beam(vv(r,i/3*6.283).p,feed,r*.025,m,6)}
}
let seed=712311;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
function noise(x,z){return .45*Math.sin(x*2.7+z*.7)*Math.sin(z*3.1-x*.4)+.3*Math.sin(x*6.2+z*3.4)+.15*Math.cos(z*11-x*4.1)}
const shore=x=>.32*x+.30+.22*Math.sin(x*1.15)+.10*Math.sin(x*2.7);
const g=(x,z,a,b,wx,wz)=>Math.exp(-Math.pow((x-a)/wx,2)-Math.pow((z-b)/wz,2));
function rawH(x,z){const d=shore(x)-z;if(d<0)return Math.max(-1.5,-.07+d*.48)+noise(x,z)*.035;const mount=1.92*g(x,z,2.6,-1.65,1.22,1.18)+1.2*g(x,z,.35,-2.35,.95,.8)+1.03*g(x,z,4.3,-2.7,.85,1.0);return .06+.28*(1-Math.exp(-d*1.5))+mount*(1+noise(x*1.5,z*1.3)*.16)+noise(x,z)*.045*smooth(.05,.65,d)}
const sites=[[2.6,.57,.45,.88],[-1.3,-.7,.29,.56],[-.35,-1.08,.34,.4]];
function height(x,z){let h=rawH(x,z);for(const [a,b,y,r] of sites){const d=Math.hypot(x-a,z-b);h=h+(y-h)*(1-smooth(r,r+.3,d))}return h}
const meshes=[];let terrainTriangles=0,vertexTotal=0;
function upload(builder,name,kind=0,animate=null){const data=new Float32Array(builder.data);vertexTotal+=data.length/13;const vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const sizes=[3,3,3,3,1];let offset=0;sizes.forEach((s,i)=>{gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,s,gl.FLOAT,false,52,offset*4);offset+=s});gl.bindVertexArray(null);const mesh={name,vao,buffer,count:data.length/13,kind,animate,model:I()};meshes.push(mesh);return mesh}
function terrain(){const b=new Builder(),nx=112,nz=78,x0=-5.2,z0=-3.4,w=10.4,d=6.8,grid=[];for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=x0+w*i/nx,z=z0+d*j/nz,h=height(x,z),eps=.024,n=V.norm([height(x-eps,z)-height(x+eps,z),2*eps,height(x,z-eps)-height(x,z+eps)]);let color;if(h<0)color=V.mix(C('#567778'),C('#3d5053'),smooth(-.1,-1.5,h));else if(h<.22)color=V.mix(C('#aca58b'),C('#778078'),smooth(.03,.22,h));else{const low=C('#536a5a'),rock=C('#777d75');color=V.mix(low,rock,clamp((h-.55)/1.5+(1-n[1])*.85,0,1))}color=color.map(v=>v*(.94+noise(x*3,z*3)*.075));grid.push({p:[x,h,z],n,m:{c:color,p:[.86,0,0],realm:h<0?2:3}})}const get=(i,j)=>grid[i+j*(nx+1)];function put(a,c,d){b.push(a.p,a.n,a.m);b.push(c.p,c.n,c.m);b.push(d.p,d.n,d.m)}for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=get(i,j),c=get(i,j+1),d=get(i+1,j),e=get(i+1,j+1);put(a,c,d);put(d,c,e)}terrainTriangles=nx*nz*2;
 const boundary=[];for(let i=0;i<=nx;i++)boundary.push(get(i,0).p);for(let j=1;j<=nz;j++)boundary.push(get(nx,j).p);for(let i=nx-1;i>=0;i--)boundary.push(get(i,nz).p);for(let j=nz-1;j>0;j--)boundary.push(get(0,j).p);
 for(let i=0;i<boundary.length;i++){const a=boundary[i],c=boundary[(i+1)%boundary.length];for(let k=0;k<6;k++){const ya=-1.98+(a[1]+1.98)*k/6,yb=-1.98+(c[1]+1.98)*k/6,za=-1.98+(a[1]+1.98)*(k+1)/6,zb=-1.98+(c[1]+1.98)*(k+1)/6,m=mat(k%2?'#535953':'#4a514d',.94,0,-1,3);b.quad([a[0],ya,a[2]],[a[0],za,a[2]],[c[0],zb,c[2]],[c[0],yb,c[2]],m)}}
 b.box([0,-2.07,0],[10.48,.2,6.88],mat('#29353b',.5,.35),.08);b.box([0,-2.185,0],[10.36,.045,6.76],mat('#778880',.33,.55),.016);upload(b,'terrain');
 const water=new Builder(),wm=mat('#3d8386',.14,.2,0,2);for(let j=0;j<42;j++)for(let i=0;i<64;i++){const a=-5.2+i/64*10.4,c=a+10.4/64,z=-3.4+j/42*6.8,q=z+6.8/42;water.quad([a,0,z],[a,0,q],[c,0,q],[c,0,z],wm,[0,1,0])}upload(water,'water-surface',1);
 const sides=new Builder();for(let i=0;i<boundary.length;i++){const a=boundary[i],c=boundary[(i+1)%boundary.length];if(a[1]>=0||c[1]>=0)continue;sides.quad([a[0],-.003,a[2]],[c[0],-.003,c[2]],[c[0],c[1]+.015,c[2]],[a[0],a[1]+.015,a[2]],wm)}upload(sides,'water-volume',2);
 const shoreB=new Builder(),foam=mat('#a4c2b9',.85,0,.08,2);let path=[];for(let i=0;i<=180;i++){const x=-5.15+i/180*10.3,z=shore(x)+.09;if(z<-3.38||z>3.38)continue;path.push([x,.018,z])}shoreB.tube(path,.013,foam);upload(shoreB,'shoreline',4);
}
function groundDetails(){const b=new Builder();
 // Low modern coastal landing station; actual foundations and roof edges.
 const c=[2.6,.45,.57];b.box([c[0],c[1]+.065,c[2]],[1.55,.13,1.16],material.concrete,.035);b.box([c[0],c[1]+.42,c[2]],[1.34,.62,.95],material.concrete,.05);b.box([c[0],c[1]+.65,c[2]+.025],[1.39,.12,1.0],material.roof,.02);b.box([c[0],c[1]+.73,c[2]+.025],[1.32,.025,.93],material.concrete,.013);
 b.box([c[0],c[1]+.43,c[2]+.479],[1.16,.24,.015],material.glass,.006);
 for(let i=0;i<7;i++){b.box([c[0]-.51+i*.17,c[1]+.425,c[2]+.49],[.018,.255,.025],material.steel,.006);b.box([c[0]-.455+i*.15,c[1]+.413,c[2]+.492],[.025,.15,.006],material.warm,.002)}
 b.box([c[0]+.679,c[1]+.41,c[2]],[.012,.23,.74],material.glass,.004);b.box([c[0]-.37,c[1]+.79,c[2]-.07],[.4,.13,.3],material.dark,.015);
 for(let i=0;i<8;i++)b.box([c[0]-.55+i*.052,c[1]+.86,c[2]-.07],[.015,.006,.26],material.steel,.002);
 b.box([c[0]+.23,c[1]+.78,c[2]-.17],[.25,.10,.23],material.steel,.01);
 b.beam([c[0]+.39,c[1]+.74,c[2]+.14],[c[0]+.39,c[1]+1.01,c[2]+.14],.031,material.steel);b.dish([c[0]+.39,c[1]+1.02,c[2]+.14],.245,[.05,.73,.85],material.concrete);
 for(let i=0;i<3;i++)b.box([c[0]-.3,c[1]+.025*(i+1),c[2]+.63+.11*i],[.48,.025*(i+1),.24],material.concrete,.014);
 b.box([c[0]-.28,c[1]+.27,c[2]+.515],[.22,.34,.035],material.glass,.006);
 // Grounded lattice communication tower beside, not through, the mountain.
 const tx=-1.32,tz=-.67,ty=height(tx,tz);b.box([tx,ty+.035,tz],[.66,.07,.62],material.concrete,.025);const bottom=[[-.2,0,-.2],[.2,0,-.2],[.2,0,.2],[-.2,0,.2]];
 for(let i=0;i<4;i++){const a=bottom[i],c=bottom[(i+1)%4];b.beam([tx+a[0],ty+.07,tz+a[2]],[tx+a[0]*.3,ty+1.55,tz+a[2]*.3],.025,material.steel,7);for(let k=0;k<4;k++){const p=k/4,q=(k+1)/4,wa=1-p*.7,wb=1-q*.7;b.beam([tx+a[0]*wa,ty+.08+p*1.46,tz+a[2]*wa],[tx+c[0]*wb,ty+.08+q*1.46,tz+c[2]*wb],.012,material.steel,6)}}
 b.beam([tx,ty+1.5,tz],[tx,ty+2.12,tz],.027,material.steel,8);for(let i=0;i<3;i++){const r=i*2.094;b.box([tx+Math.cos(r)*.135,ty+1.77,tz+Math.sin(r)*.135],[.13,.43,.065],material.concrete,.025,[0,-r,0])}
 b.sphere([tx,ty+2.135,tz],.035,material.signal,[1,1,1],8,5);
 // A few subordinate service buildings: no skyline or unrelated objects.
 const buildings=[[-.35,-1.08,.36,.4,.32],[-2.1,-1.9,.40,.58,.39],[-3.25,-2.05,.52,.40,.42],[-3.7,-2.6,.46,.49,.5]];
 for(const [x,z,w,h,d] of buildings){const y=height(x,z);b.box([x,y+.025,z],[w+.15,.1,d+.15],material.concrete,.018);b.box([x,y+h/2+.065,z],[w,h,d],mat('#929e94',.78),.025);b.box([x,y+h+.08,z],[w+.04,.05,d+.04],material.roof,.012);for(let j=0;j<2;j++)b.box([x-w*.24+j*w*.43,y+h*.57,z+d/2+.007],[w*.23,.13,.01],material.glass,.002)}
 // Terrain-following paths stay on the ground.
 const road=(a,z0,c,z1)=>{const p=[];for(let i=0;i<70;i++){const t=i/69,x=a+(c-a)*t,z=z0+(z1-z0)*t+.08*Math.sin(t*Math.PI*2);p.push([x,height(x,z)+.021,z])}b.tube(p,.035,mat('#87928a',.92))};road(-3.65,-2.65,-1.55,-1.12);road(-1.15,-.96,1.6,-.45);road(1.6,-.45,2.65,.22);
 // Restrained vegetation and weathered rocks; deterministic geometry.
 for(let i=0;i<70;i++){const x=-4.6+random()*9.2,z=-3.15+random()*3.85,y=height(x,z);if(y<.3||y>1.6||sites.some(p=>Math.hypot(x-p[0],z-p[1])<p[3]+.2))continue;const r=.07+random()*.07,leaf=mat(i%3?'#546756':'#6e7863',.92);b.sphere([x,y+r*.6,z],r,leaf,[1,1.3,.8],8,5);b.sphere([x+.03,y+r*1.9,z],r*.6,leaf,[.9,1.3,.85],8,5)}
 for(let i=0;i<32;i++){const x=-4.7+random()*9.4,z=shore(x)-.055-random()*.17,y=height(x,z);if(z<-3.2||z>3.2)continue;b.sphere([x,y+.015,z],.04+random()*.06,material.stone,[1.4,.72,.9],8,5)}
 upload(b,'ground-detail');
}
function seabed(){const b=new Builder(),points=[];for(let i=0;i<=100;i++){const t=i/100,x=-5.16+7.76*t,z=2.80-2.23*t+.25*Math.sin(Math.PI*t);points.push([x,height(x,z)+.044,z])}b.tube(points,.044,mat('#545c55',.62,.45,0,2));const marker=points.map(p=>[p[0],p[1]+.048,p[2]]);b.tube(marker,.009,mat('#90bcbc',.5,.1,.7,2));
 for(const idx of [22,50,73]){const a=points[idx-1],c=points[idx+1],mid=points[idx];b.beam(a,c,.091,mat('#aeb9ae',.35,.65,0,2),12);b.beam(V.mix(a,c,.3),V.mix(a,c,.4),.094,mat('#3c5c5c',.7,.25,0,2),10)}
 const end=points[100];b.box([2.6,.5,.97],[.2,.17,.26],material.dark,.025);b.beam(end,[2.6,.51,.94],.045,mat('#4d5552',.5,.4,0,2),8);
 for(let i=0;i<22;i++){const x=-4.9+random()*8,z=1.5+random()*1.65,y=height(x,z);if(y>-.25)continue;b.sphere([x,y+.02,z],.04+random()*.12,material.seaFloor,[1.5,.5,.95],8,5)}upload(b,'submarine-cable');
}
const satelliteOrigin=[-2.10,4.68,-1.03];
function satellite(){const b=new Builder(),metal=mat('#c0c6bf',.25,.65,0,1),gold=mat('#af9b6b',.44,.55,0,1),dark=mat('#283440',.37,.55,0,1),cell=mat('#35526a',.19,.48,0,1),frame=mat('#a6b9bd',.26,.66,0,1);
 b.box([0,0,0],[.67,.53,.58],gold,.05);b.box([0,.285,0],[.67,.065,.59],metal,.022);b.box([0,-.288,0],[.66,.055,.58],metal,.02);b.box([0,0,.305],[.54,.39,.024],metal,.014);
 for(let i=0;i<9;i++)b.box([-.26+i*.065,.017,-.3],[.017,.36,.025],gold,.003);
 b.beam([-.38,0,0],[.38,0,0],.065,metal,12);for(const sign of [-1,1]){
  b.beam([sign*.32,0,0],[sign*.65,0,0],.045,frame,10);
  b.box([sign*1.24,0,0],[1.28,.07,.8],frame,.018);b.box([sign*1.24,.040,0],[1.21,.008,.73],dark,.002);
  for(let i=0;i<6;i++)for(let j=0;j<4;j++){const x=sign*(.65+i*.201+.085),z=-.277+j*.185;b.box([x,.048,z],[.186,.009,.164],cell,.006);for(let k=0;k<2;k++)b.box([x-.039+k*.079,.054,z],[.002,.002,.154],frame,.0005)}
  b.box([sign*1.24,-.045,0],[.026,.03,.8],metal,.005);
 }
 b.beam([0,-.25,.22],[0,-.37,.40],.045,metal);b.dish([0,-.34,.44],.24,[0,-.5,.85],metal);
 b.beam([-.20,.29,-.16],[-.21,.59,-.19],.018,metal,7);b.sphere([-.21,.60,-.19],.023,dark,[1,1,1],8,5);
 upload(b,'satellite',0,()=>pose(satelliteOrigin,[.18,-.33,-.13],1.07));
 // A single partial orbit, thin and subordinate. Altitude is intentionally schematic.
 const orbit=new Builder(),p=[];for(let i=0;i<=90;i++){const phase=Math.acos(satelliteOrigin[0]/4.7),t=phase-.76+i/90*1.47;p.push([Math.cos(t)*4.7,4.68+.10*(Math.sin(t)-Math.sin(phase)),Math.sin(t)*2.15-1.03-Math.sin(phase)*2.15])}orbit.tube(p,.008,mat('#4c686c',.8,0,.18,1),4);upload(orbit,'orbit',4);
}
const droneDefs=[{p:[-1.7,2.65,1.42],r:[0,.43,0],s:.78},{p:[3.5,2.8,1.80],r:[0,-.65,0],s:.64}];
function drone(def,index){const b=new Builder(),shell=mat('#c1c7bf',.48,.22,0,4),carbon=mat('#243134',.5,.32,0,4),metal=mat('#8eaaa8',.26,.64,0,4),lens=mat('#224554',.1,.65,0,4),led=mat('#99cdc9',.35,.15,.8,4);b.box([0,0,0],[.59,.22,.43],shell,.10);b.box([0,.125,0],[.39,.07,.3],carbon,.035);b.box([0,.162,-.02],[.25,.012,.16],shell,.01);
 const motors=[];for(const sx of [-1,1])for(const sz of [-1,1]){const p=[sx*.59,0,sz*.48];motors.push(p);b.beam([sx*.2,-.035,sz*.12],p,.047,carbon,10);b.beam([sx*.2,.00,sz*.12],[sx*.55,.01,sz*.44],.012,shell,7);b.beam([p[0],-.07,p[2]],[p[0],.10,p[2]],.068,metal,12);b.beam([p[0],.09,p[2]],[p[0],.17,p[2]],.033,carbon,10);b.sphere([p[0],.18,p[2]],.034,shell,[1,.6,1],8,5)}
 for(const sx of [-1,1]){b.beam([sx*.2,-.07,-.13],[sx*.27,-.34,-.22],.018,metal,7);b.beam([sx*.2,-.07,.13],[sx*.27,-.34,.22],.018,metal,7);b.beam([sx*.27,-.34,-.3],[sx*.27,-.34,.32],.022,carbon,8)}
 b.sphere([0,-.18,.17],.112,carbon,[1,.86,1],12,8);b.beam([0,-.18,.22],[0,-.18,.30],.071,lens,14);b.box([0,-.02,.224],[.13,.045,.014],carbon,.015);b.box([-.13,.025,.222],[.053,.019,.018],led,.006);b.beam([.21,.075,-.08],[.23,.30,-.11],.009,carbon,7);
 const transform=t=>pose([def.p[0],def.p[1]+Math.sin(t*.7+index)*.027,def.p[2]],def.r,def.s);upload(b,'drone-'+index,0,transform);
 for(let k=0;k<motors.length;k++){const r=new Builder();r.sphere([0,0,0],1,mat('#546466',.38,.32,0,4),[.25,.0065,.026],16,5);upload(r,'rotor-'+index+'-'+k,0,t=>M.mul(transform(t),M.mul(M.translate([motors[k][0],.143,motors[k][2]]),M.ry(t*11*(k%2?1:-1)+k))))}
}
function quadratic(a,c,b,n=64){const p=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t;p.push(a.map((x,j)=>u*u*x+2*u*t*c[j]+t*t*b[j]))}return p}
let pulsePaths=[];
function links(){const b=new Builder(),lm=mat('#6b9699',.7,0,.38,0);const a=[-1.32,height(-1.32,-.67)+2.14,-.67],d=M.point(pose(droneDefs[0].p,droneDefs[0].r,droneDefs[0].s),[0,-.18,.30]),s=M.point(pose(satelliteOrigin,[.18,-.33,-.13],1.07),[0,-.34,.44]);pulsePaths=[quadratic(a,[-1.55,2.68,.1],d,48),quadratic(d,[.45,3.05,1.1],[2.99,1.47,.71],64),quadratic([2.99,1.47,.71],[.3,4.4,-.1],s,64),quadratic(droneDefs[1].p,[3.3,2.1,1.25],[2.99,1.47,.71],36)];for(const p of pulsePaths)b.tube(p,.012,lm,4);upload(b,'schematic-links',5);for(let i=0;i<pulsePaths.length;i++){const dot=new Builder();dot.sphere([0,0,0],.036,mat('#bdd2c4',.4,0,.9,0),[1,1,1],8,6);const p=pulsePaths[i];upload(dot,'signal-'+i,5,t=>{const u=((t*.095+i*.34)%1)*(p.length-1),j=Math.floor(u);return M.translate(V.mix(p[j],p[Math.min(j+1,p.length-1)],u-j))})}}
const vertexShader=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;layout(location=1) in vec3 aNormal;layout(location=2) in vec3 aColor;layout(location=3) in vec3 aProperties;layout(location=4) in float aRealm;
uniform mat4 uModel,uVP,uLightVP;uniform float uTime,uKind;
out vec3 vWorld,vNormal,vColor,vProperties;out vec4 vShadow;out float vRealm;
void main(){vec3 p=aPosition,n=aNormal;if(uKind>.5&&uKind<1.5){float s=sin(p.x*2.7+p.z*1.8+uTime*.55),t=cos(p.x*5.1-p.z*3.8+uTime*.39);p.y+=s*.008+t*.003;n=normalize(vec3(-.0216*cos(p.x*2.7+p.z*1.8+uTime*.55)+.0153*sin(p.x*5.1-p.z*3.8+uTime*.39),1.,-.0144*cos(p.x*2.7+p.z*1.8+uTime*.55)-.0114*sin(p.x*5.1-p.z*3.8+uTime*.39)));}vec4 w=uModel*vec4(p,1.);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*n);vColor=aColor;vProperties=aProperties;vRealm=aRealm;vShadow=uLightVP*w;gl_Position=uVP*w;}`;
const fragmentShader=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal,vColor,vProperties;in vec4 vShadow;in float vRealm;out vec4 outColor;
uniform vec3 uEye;uniform sampler2D uShadowMap;uniform float uLightMode,uKind,uRealm,uTime,uSeaReveal;
float shade(vec3 n,vec3 light){vec3 p=vShadow.xyz/vShadow.w*.5+.5;if(p.x<=0.||p.x>=1.||p.y<=0.||p.y>=1.||p.z>=1.)return 1.;float bias=max(.00035,.0013*(1.-max(dot(n,light),0.)));float s=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float d=texture(uShadowMap,p.xy+vec2(float(x),float(y))/1024.).r;s+=p.z-bias>d?.25:1.;}return s/9.;}
vec3 tone(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){vec3 n=normalize(vNormal),view=normalize(uEye-vWorld);if(((uKind>1.5&&uKind<2.5)||vProperties.z<-.5)&&dot(n,view)<0.)discard;if(dot(n,view)<0.)n=-n;vec3 l=normalize(vec3(-5.,9.,6.));vec3 rim=normalize(vec3(5.,4.,-5.));vec3 color=vColor;float diff=max(dot(n,l),0.),sh=shade(n,l);float hemi=n.y*.5+.5;vec3 ambient=mix(vec3(.09,.13,.15),vec3(.33,.42,.44),hemi)*(uLightMode>.5?1.12:.68);vec3 key=uLightMode>.5?vec3(1.45,1.5,1.43):vec3(1.38,1.16,.89);vec3 fill=vec3(.33,.49,.64)*max(dot(n,rim),0.)*(uLightMode>.5?.5:.74);float rough=vProperties.x,metal=vProperties.y;vec3 h=normalize(l+view);float exponent=mix(115.,5.,rough);float spec=pow(max(dot(n,h),0.),exponent)*(.24+pow(1.-rough,2.)*2.5)*sh;vec3 f0=mix(vec3(.055),color,metal);float shadowAo=clamp((vWorld.y+2.5)*.22,.64,1.);vec3 c=color*(ambient*shadowAo+key*diff*sh*(1.-metal*.45)+fill)+f0*spec*key+color*max(vProperties.z,0.)*(uLightMode>.5?.55:.85);float alpha=1.;if(uRealm>.5&&vRealm>.5&&abs(vRealm-uRealm)>.5)c*=.82;
 if(uKind>.5&&uKind<2.5){float fres=pow(1.-max(dot(view,n),0.),3.);vec3 deep=vec3(.012,.065,.084),shallow=vec3(.035,.19,.20);float w=(sin(vWorld.x*5.2+vWorld.z*3.1+uTime*.43)*.5+.5);c=mix(deep,shallow,.3+fres*.38)+vec3(.13,.20,.21)*fres+spec*vec3(.48,.6,.6);c+=vec3(.03,.075,.075)*pow(w,14.)*.24;alpha=uKind<1.5?mix(.52,.24,uSeaReveal):mix(.23,.12,uSeaReveal);alpha+=fres*.10;}
 if(uKind>3.5&&uKind<4.5)c*=.72;
 outColor=vec4(srgb(tone(c*1.07)),alpha);
}`;
const depthVS=`#version 300 es
precision highp float;layout(location=0) in vec3 aPosition;uniform mat4 uModel,uLightVP;void main(){gl_Position=uLightVP*uModel*vec4(aPosition,1.);}`;
const depthFS=`#version 300 es
precision highp float;void main(){}`;
const shaders=new Set(),programs=new Set();
function shader(type,src){const s=gl.createShader(type);shaders.add(s);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function program(v,f){const p=gl.createProgram();programs.add(p);const vs=shader(gl.VERTEX_SHADER,v),fs=shader(gl.FRAGMENT_SHADER,f);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);shaders.delete(vs);shaders.delete(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p}
let frame=0,disposed=false,visible=true,time=0,previous=0,needs=true,seaReveal=0,shadowTex,shadowFB,mainProgram,shadowProgram,uniforms={},depthUniforms={},vp=I(),eye=[0,0,0],lightVP;
const current={yaw:.65,pitch:.47,distance:19.7,target:[0,1.05,0]},desired={...current,target:[...current.target]};
function focusPreset(name){const mobile=stage.clientWidth<650;const presets={all:{yaw:.62,pitch:.48,distance:mobile?22.6:19.1,target:[0,.48,0]},space:{yaw:.34,pitch:.38,distance:mobile?13.5:11.2,target:[-1.40,3.58,-.45]},sea:{yaw:.3,pitch:.32,distance:mobile?15.5:13.5,target:[-.75,-.3,1.05]},land:{yaw:.86,pitch:.55,distance:mobile?13.9:11.8,target:[1.17,.88,-.35]},air:{yaw:.58,pitch:.36,distance:mobile?13.2:11.2,target:[-.6,2.04,.74]}};Object.assign(desired,presets[name]);desired.target=[...presets[name].target];if(media.matches){Object.assign(current,desired);current.target=[...desired.target]}needs=true;queue()}
function doZoom(f){desired.distance=clamp(desired.distance*f,6.5,29);needs=true;queue()}
function project(p){const w=vp[3]*p[0]+vp[7]*p[1]+vp[11]*p[2]+vp[15];return[(vp[0]*p[0]+vp[4]*p[1]+vp[8]*p[2]+vp[12])/w,(vp[1]*p[0]+vp[5]*p[1]+vp[9]*p[2]+vp[13])/w,w]}
const hotspots=[{p:satelliteOrigin,r:1.70,key:'space',label:'星｜衛星通訊節點'},{p:droneDefs[0].p,r:.65,key:'air',label:'空｜多旋翼中繼節點'},{p:droneDefs[1].p,r:.60,key:'air',label:'空｜多旋翼中繼節點'},{p:[2.6,.99,.57],r:.85,key:'land',label:'地｜登陸岸站與地面網路'},{p:[-1.32,1.4,-.67],r:.55,key:'land',label:'地｜格構式通訊塔'},{p:[-1.0,-.69,1.84],r:1.25,key:'sea',label:'海｜海床纜線與接續器'}];
function hit(x,y){const rect=canvas.getBoundingClientRect(),nx=(x-rect.left)/rect.width*2-1,ny=1-(y-rect.top)/rect.height*2;const forward=V.norm(V.sub(current.target,eye)),right=V.norm(V.cross(forward,[0,1,0])),up=V.cross(right,forward),half=Math.tan(37*Math.PI/360),dir=V.norm(V.add(forward,V.add(V.mul(right,nx*half*rect.width/rect.height),V.mul(up,ny*half))));let best=null,dist=Infinity;for(const h of hotspots){const oc=V.sub(eye,h.p),b=V.dot(oc,dir),c=V.dot(oc,oc)-h.r*h.r,disc=b*b-c;if(disc<0)continue;const t=-b-Math.sqrt(disc);if(t>0&&t<dist){dist=t;best=h}}return best}
let touchActive=false;listen($('#touch-mode'),'click',()=>{touchActive=!touchActive;canvas.style.touchAction=touchActive?'none':'pan-y';$('#touch-mode').textContent=touchActive?'返回頁面滑動':'啟用模型操作';$('#touch-mode').setAttribute('aria-pressed',String(touchActive));pointers.clear()});const pointers=new Map();let dragDistance=0,lastPinch=0,lastTouch=null;
function pointerDown(e){if(!state.ready||(e.pointerType==='touch'&&!touchActive))return;Object.assign(desired,current);desired.target=[...current.target];canvas.focus({preventScroll:true});pointers.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);if(e.pointerType==='touch')lastTouch=[e.clientX,e.clientY];dragDistance=0;$('#model-label').hidden=true;if(pointers.size===2){const a=[...pointers.values()];lastPinch=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1])}}
function pointerMove(e){if(!state.ready)return;if(!pointers.has(e.pointerId)){if(e.pointerType!=='mouse')return;const h=hit(e.clientX,e.clientY),el=$('#model-label');canvas.style.cursor=h?'pointer':'grab';el.hidden=!h;if(h){el.textContent=h.label;const r=stage.getBoundingClientRect();el.style.left=clamp(e.clientX-r.left+14,8,r.width-200)+'px';el.style.top=clamp(e.clientY-r.top-42,55,r.height-75)+'px'}return}const old=pointers.get(e.pointerId),dx=e.clientX-old[0],dy=e.clientY-old[1];pointers.set(e.pointerId,[e.clientX,e.clientY]);dragDistance+=Math.hypot(dx,dy);if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(lastPinch>0&&d>0)doZoom(lastPinch/d);lastPinch=d;e.preventDefault()}else{desired.yaw-=dx*.006;desired.pitch=clamp(desired.pitch+dy*.004,.13,1.15);needs=true;queue()}}
function pointerUp(e){const had=pointers.has(e.pointerId);pointers.delete(e.pointerId);if(e.type!=='pointercancel'&&had&&dragDistance<7){const h=hit(e.clientX,e.clientY);if(h)setRealm(h.key)}if(pointers.size<2)lastPinch=0}
listen(canvas,'pointerdown',pointerDown);listen(canvas,'pointermove',pointerMove,{passive:false});listen(canvas,'pointerup',pointerUp);listen(canvas,'pointercancel',pointerUp);listen(canvas,'pointerleave',()=>$('#model-label').hidden=true);
listen(canvas,'wheel',e=>{if(!state.ready)return;e.preventDefault();doZoom(Math.exp(clamp(e.deltaY,-90,90)*.0015))},{passive:false});
listen(canvas,'keydown',e=>{if(!state.ready)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Escape','0'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')desired.yaw-=.15;if(e.key==='ArrowRight')desired.yaw+=.15;if(e.key==='ArrowUp')desired.pitch=clamp(desired.pitch+.10,.13,1.15);if(e.key==='ArrowDown')desired.pitch=clamp(desired.pitch-.10,.13,1.15);if(e.key==='+'||e.key==='=')doZoom(.87);if(e.key==='-')doZoom(1.15);if(e.key==='Escape'||e.key==='0')setRealm('all');needs=true;queue()}});
function resize(){const r=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,r.width<650?1.25:1.5),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;needs=true;queue()}}
function fail(error){state.ready=false;state.error=String(error?.message||error);$('#fallback').hidden=false;canvas.style.visibility='hidden';for(const s of ['#zoom-in','#zoom-out','#pause','#reset','#routes'])$(s).disabled=true;root.dataset.renderReady='false';root.dataset.renderError=state.error}
function init(){gl=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:false});if(!gl)throw new Error('WebGL2 unavailable');mainProgram=program(vertexShader,fragmentShader);shadowProgram=program(depthVS,depthFS);for(const name of ['uModel','uVP','uLightVP','uTime','uKind','uEye','uShadowMap','uLightMode','uRealm','uSeaReveal'])uniforms[name]=gl.getUniformLocation(mainProgram,name);for(const name of ['uModel','uLightVP'])depthUniforms[name]=gl.getUniformLocation(shadowProgram,name);
 shadowTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,shadowTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,1024,1024,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);shadowFB=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,shadowTex,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Shadow framebuffer incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 lightVP=M.mul(M.ortho(-9,9,-8,8,.1,35),M.look([-9,15,11],[0,.8,0]));
 terrain();groundDetails();seabed();satellite();droneDefs.forEach(drone);links();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);state.ready=true;controls={focus:focusPreset,zoom:doZoom};queue=()=>{needs=true;if(!frame&&!disposed&&visible&&!document.hidden)frame=requestAnimationFrame(render)};focusPreset('all');Object.assign(current,desired);current.target=[...desired.target];resize();queue();
}
let lastDraw=0;
function render(stamp){frame=0;if(disposed||!state.ready||!visible||document.hidden)return;const dt=Math.min((stamp-(previous||stamp))/1000,.05);previous=stamp;if(!state.paused)time+=dt;const k=media.matches?1:1-Math.exp(-Math.max(dt,1/60)*8.5),before=[current.yaw,current.pitch,current.distance,...current.target];for(const key of ['yaw','pitch','distance'])current[key]+=(desired[key]-current[key])*k;current.target=V.mix(current.target,desired.target,k);seaReveal+=(Number(state.realm==='sea')-seaReveal)*k;const moving=before.some((v,i)=>Math.abs(v-[current.yaw,current.pitch,current.distance,...current.target][i])>.00002)||Math.abs(seaReveal-Number(state.realm==='sea'))>.002;
 if(needs||moving||!state.paused){draw();needs=false;lastDraw=stamp}if(!state.paused||moving)frame=requestAnimationFrame(render)}
function draw(){const t=time;for(const mesh of meshes)mesh.model=mesh.animate?mesh.animate(t):I();const cp=Math.cos(current.pitch);eye=V.add(current.target,[Math.sin(current.yaw)*cp*current.distance,Math.sin(current.pitch)*current.distance,Math.cos(current.yaw)*cp*current.distance]);vp=M.mul(M.perspective(37*Math.PI/180,canvas.width/canvas.height,.15,65),M.look(eye,current.target));
 gl.disable(gl.BLEND);gl.depthMask(true);gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFB);gl.viewport(0,0,1024,1024);gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.7,4.);gl.useProgram(shadowProgram);gl.uniformMatrix4fv(depthUniforms.uLightVP,false,lightVP);for(const mesh of meshes){if(mesh.kind!==0||mesh.name.startsWith('rotor-'))continue;gl.uniformMatrix4fv(depthUniforms.uModel,false,mesh.model);gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count)}
 gl.disable(gl.POLYGON_OFFSET_FILL);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(mainProgram);gl.uniformMatrix4fv(uniforms.uVP,false,vp);gl.uniformMatrix4fv(uniforms.uLightVP,false,lightVP);gl.uniform3fv(uniforms.uEye,eye);gl.uniform1f(uniforms.uTime,t);gl.uniform1f(uniforms.uLightMode,state.light==='studio'?1:0);gl.uniform1f(uniforms.uRealm,realmId[state.realm]);gl.uniform1f(uniforms.uSeaReveal,seaReveal);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,shadowTex);gl.uniform1i(uniforms.uShadowMap,0);
 function one(mesh){gl.uniformMatrix4fv(uniforms.uModel,false,mesh.model);gl.uniform1f(uniforms.uKind,mesh.kind);gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count)}
 for(const mesh of meshes)if(mesh.kind===0||(mesh.kind===4)||(mesh.kind===5&&state.routes))one(mesh);
 gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);for(const mesh of meshes)if(mesh.kind===2)one(mesh);for(const mesh of meshes)if(mesh.kind===1)one(mesh);gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);state.renderCount++;root.dataset.renderReady='true';
}
const ro=new ResizeObserver(()=>resize());ro.observe(stage);const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;state.active=visible;if(visible){previous=0;queue()}else if(frame){cancelAnimationFrame(frame);frame=0}},{threshold:.01});io.observe(stage);listen(document,'visibilitychange',()=>{if(!document.hidden){previous=0;queue()}else if(frame){cancelAnimationFrame(frame);frame=0}});
listen(canvas,'webglcontextlost',e=>{e.preventDefault();if(frame)cancelAnimationFrame(frame);frame=0;fail(new Error('圖形環境已中斷；可閱讀下方架構，或返回首頁後重新進入'))});
function releaseGraphics(){if(!gl)return;for(const m of meshes){gl.deleteBuffer(m.buffer);gl.deleteVertexArray(m.vao)}meshes.length=0;for(const p of programs)gl.deleteProgram(p);programs.clear();for(const s of shaders)gl.deleteShader(s);shaders.clear();if(shadowTex)gl.deleteTexture(shadowTex);if(shadowFB)gl.deleteFramebuffer(shadowFB);shadowTex=null;shadowFB=null;}
function dispose(){if(disposed)return;disposed=true;state.ready=false;state.active=false;events.abort();cancelAnimationFrame(frame);frame=0;ro.disconnect();io.disconnect();pointers.clear();if(about.open)about.close();releaseGraphics();gl?.getExtension('WEBGL_lose_context')?.loseContext();controls=null;queue=()=>{};canvas.remove();}
listen(window,'resize',resize);
let dprMedia;const watchDpr=()=>{dprMedia?.removeEventListener('change',onDpr);dprMedia=matchMedia(`(resolution: ${devicePixelRatio}dppx)`);dprMedia.addEventListener('change',onDpr,{once:true,signal:events.signal});};
function onDpr(){resize();watchDpr()}watchDpr();
const api={setRealm,setLight,setPaused,reset:()=>setRealm('all'),snapshot:()=>({...state,camera:{...current,target:[...current.target]},vertices:vertexTotal,triangles:vertexTotal/3,terrainTriangles,drawBatches:meshes.length,viewport:[canvas.width,canvas.height],meshNames:meshes.map(m=>m.name),webglError:gl?.getError()??null}),projectWorld:p=>{const v=project(p);return{x:(v[0]*.5+.5)*stage.clientWidth,y:(1-(v[1]*.5+.5))*stage.clientHeight,depth:v[2]}},dispose};
try{init()}catch(error){releaseGraphics();fail(error)}
return api;
}
