// Shared CPU geometry contract. All distances below are fictional local metres.
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
function landNoise(x,z){
 const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix),v=smooth(z-iz);
 const hash=(a,b)=>{let n=(Math.imul(a,374761393)+Math.imul(b,668265263))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);
 return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
export const coastPosition=(layout,z)=>layout.terrain.coastX+layout.terrain.coastAmplitude*Math.sin(z/210)+9*Math.sin(z/57)+5*Math.sin(z/23)-22*Math.exp(-(((z-35)/105)**2));
export function terrainHeight(layout,x,z){
 const t=layout.terrain,coast=coastPosition(layout,z),shore=x-coast;
 if(shore<0){
  // A gently shelving tidal apron precedes the deeper seabed; sand bars vary
  // with the headlands, with no abrupt vertical lip at the waterline.
  return Math.max(-24,shore*(.055+.065*smooth((-shore-48)/210))+.48*Math.sin(z/81+shore/39)*smooth(-shore/18)*(1-smooth(-shore/190)));
 }
 let foothill=8+2*Math.sin(x/140)*Math.sin(z/170),massif=8;
 for(const p of t.hills){
  foothill+=p.height*Math.exp(-(((x-p.x)/p.sx)**2+((z-p.z)/p.sz)**2));
  const warp=66*Math.sin(z/257)+28*Math.sin(z/103+.4),rx=(x-p.x-warp)/(p.sx*1.08),rz=(z-p.z)/(p.sz*1.24);
  // Broad asymmetrical summit shoulders replace the pointed Gaussian peaks.
  // Long axes overlap into a folded massif before the river cuts through it.
  massif+=p.height*.73*Math.exp(-(Math.abs(rx)**2.7+Math.abs(rz)**3.2));
 }
 const inland=smooth((x-430)/300),spine=1020+105*Math.sin(z/410)+50*Math.sin(z/173),flank=smooth((spine-x+180)/480);
 const drainage=Math.sin(z/143+(x-spine)/290+.67*Math.sin(z/329));
 const ravine=Math.exp(-(((drainage+.16*Math.sin(x/163))/.19)**2));
 const ribs=.5+.5*Math.sin(z/79+(x-spine)/173+.4*Math.cos(z/241));
 const rockRoughness=(landNoise(x/92,z/92)-.5)*52+(landNoise(x/37,z/37)-.5)*21+3.2*Math.sin(x/43+z/71)*Math.sin(z/61);
 massif=massif*(1-.23*ravine*flank-.085*ribs)+rockRoughness*smooth((massif-35)/130);
 let h=foothill*(1-inland)+massif*inland;
 // A low, irregular colluvial apron joins the populated plain to the scarps.
 const apron=Math.exp(-(((x-545-64*Math.sin(z/187))/165)**2))*smooth((h-18)/90);
 h+=apron*(7+5*Math.sin(z/96+x/190))*smooth((x-340)/190);
 // Far hills are real landforms, creating successive silhouettes beyond the
 // inhabited massif instead of revealing a flat rectangular ground apron.
 const distant=smooth((x-1530)/670);
 h+=distant*(80*Math.exp(-(((x-2500)/950)**2+((z+450)/2050)**2))+110*Math.exp(-(((x-3600)/1050)**2+((z-850)/2450)**2))+150*Math.exp(-(((x-5100)/1400)**2+((z+850)/2900)**2)))*(.73+.27*Math.sin(z/381+.6*Math.sin(x/317))**2);
 const riverSide=z-t.riverBaseZ-t.riverAmplitude*Math.sin(x/180),river=Math.abs(riverSide),lowland=1-inland;
 const estuary=(1-smooth((shore-20)/230))*lowland;
 const innerBend=.5-.5*(riverSide/(river+.001))*Math.sin(x/180);
 const channelHalf=18+lowland*(4.5*Math.sin(x/97+.8)+3*Math.sin(x/43))+estuary*15;
 const valleyWidth=(85+inland*(64+22*Math.sin(x/217)))*(1+lowland*((innerBend-.5)*.52+.10*Math.sin(x/119)))+estuary*22;
 // Rounded floodplain, inset channel, and broad upper valley shoulders are
 // actual shared geometry. This avoids a blue ribbon pasted over two hills.
 const bank=smooth((river-channelHalf)/valleyWidth),valley=bank*.84+smooth((river-channelHalf)/(valleyWidth*1.8))*.16;
 // Two inner-bend sand/gravel deposits are in the shared terrain itself. The
 // outer bank remains a cut bank, while these shallow tongues divert the flow.
 const deposition=lowland*(1.15*Math.exp(-(((x+190)/92)**2+((riverSide-channelHalf-3)/13)**2))+1.05*Math.exp(-(((x-255)/86)**2+((riverSide+channelHalf+4)/12)**2)));
 const beach=smooth(shore/54),dune=.8*Math.exp(-(((shore-32)/18)**2))*(.5+.5*Math.sin(z/63));
 return (-1.5+(h+1.5)*valley+deposition)*beach+dune*beach*(1-smooth((90-river)/55));
}
export function flightPosition(n,t){
 if(!n.flight)return n.anchorM.slice();
 const f=n.flight,a=f.launchSeconds,b=f.arrivalSeconds,s=f.startM,e=n.anchorM;
 if(t<=a)return s.slice();
 if(t<a+2)return [s[0],s[1]+(e[1]-s[1])*smooth((t-a)/2),s[2]];
 const p=smooth((t-a-2)/(b-a-2));return [s[0]+(e[0]-s[0])*p,e[1],s[2]+(e[2]-s[2])*p];
}
export const frameAtTime=(state,t)=>state.timeline.frames.findLast(f=>f.seconds<=t)||state.timeline.frames[0];
export function validateCoastal(state){
 const t=state.timeline,contract=state.sceneContract;
 if(t?.version!=='coastal-timeline-1'||t.frames?.length!==12||contract?.version!=='coastal-scene-1'||!state.runId)throw Error('Invalid coastal contract');
 if(contract.arciProvider!=='fixture'||contract.arciMode!=='UNCONNECTED'||contract.actuation!=='simulation')throw Error('Unsupported coastal authority');
 const ids=state.baselineNetwork.nodes.map(n=>n.id),linkIds=state.baselineNetwork.links.map(l=>l.id);
 if(new Set(ids).size!==ids.length||new Set(linkIds).size!==linkIds.length)throw Error('Duplicate scene ID');
 for(const [i,f] of t.frames.entries()){
  if(f.phase!==i||f.runId!==state.runId||f.scenarioId!==state.scenarioId||!Number.isFinite(f.seconds)||i&&f.seconds<=t.frames[i-1].seconds)throw Error('Stale or malformed scene frame');
  const nodes=new Map(f.networkState.nodes.map(n=>[n.id,n])),links=new Map(f.networkState.links.map(l=>[l.id,l]));
  if(ids.some(id=>!nodes.has(id))||nodes.size!==ids.length||linkIds.some(id=>!links.has(id))||links.size!==linkIds.length)throw Error('Scene identity drift');
  for(const n of nodes.values())if(n.scenePositionM.length!==3||!n.scenePositionM.every(Number.isFinite))throw Error('Missing scene coordinates');
  for(const l of links.values()){
   if(!nodes.has(l.source)||!nodes.has(l.target))throw Error('Missing link endpoint');
   if(l.qualification==='QUALIFIED'&&[nodes.get(l.source),nodes.get(l.target)].some(n=>n.operation!=='serving'||n.status==='failed'))throw Error('Unqualified endpoint');
  }
  for(const r of f.candidates){
   if(!Number.isFinite(r.finalScore))throw Error('Missing route score');
   for(const [j,id] of r.links.entries()){
    const l=links.get(id);if(!l||l.qualification!=='QUALIFIED')throw Error('Route uses unqualified link');
    if(![l.source,l.target].includes(r.nodes[j])||![l.source,l.target].includes(r.nodes[j+1]))throw Error('Route endpoint mismatch');
   }
  }
  if(f.routeId&&!f.candidates.some(c=>c.id===f.routeId&&c.eligible))throw Error('Ineligible scene decision');
  if(f.decision.runId!==state.runId||f.decision.inputSnapshotId!==f.snapshotId)throw Error('Decision snapshot mismatch');
  if(f.events.some(e=>e.seconds>f.seconds)||new Set(f.events.map(e=>e.id)).size!==f.events.length)throw Error('Premature or duplicate event');
  if(i<11&&(f.confirmed||f.ack||f.delivery.confirmed))throw Error('Premature ACK');
  if(f.confirmed){const a=f.ack,d=state.deliveryStatus;
   if(!d.confirmed||!a?.received||a.runId!==state.runId||a.scenarioId!==state.scenarioId||a.receiverNodeId!=='emergency-center'||a.messageId!==d.messageId||a.packetHash!==d.packetHash||a.sequence!==d.sequence||a.routeId!==f.routeId)throw Error('Scene ACK identity mismatch');
   if(!a.executionId||a.executionId!==d.executionId||a.decisionId!==d.decisionId||a.executionSnapshotId!==f.snapshotId)throw Error('Scene ACK execution mismatch');
  }
 }
 if(JSON.stringify(t.frames[11].networkState)!==JSON.stringify(state.networkState))throw Error('Final scene mismatch');
}
