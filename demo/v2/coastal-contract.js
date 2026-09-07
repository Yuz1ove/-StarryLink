// Shared CPU geometry contract. All distances below are fictional local metres.
export function terrainHeight(layout,x,z){
 const t=layout.terrain,coast=t.coastX+t.coastAmplitude*Math.sin(z/210);
 if(x<coast)return Math.max(-22,(x-coast)*.12);
 let h=8+2*Math.sin(x/140)*Math.sin(z/170);
 for(const p of t.hills)h+=p.height*Math.exp(-(((x-p.x)/p.sx)**2+((z-p.z)/p.sz)**2));
 h+=Math.max(0,Math.min(1,(x-450)/350))*Math.max(0,Math.min(1,(h-8)/80))*(11*Math.sin(x/34+z/60)*Math.sin(z/42)+6*Math.sin(x/16+z/31));
 const valley=Math.max(0,Math.min(1,(Math.abs(z-t.riverBaseZ-t.riverAmplitude*Math.sin(x/180))-18)/85));
 return (-1.5+(h+1.5)*valley)*Math.max(0,Math.min(1,(x-coast)/50));
}
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
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
