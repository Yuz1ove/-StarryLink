/** Pure projection: seeking never synthesizes success or changes backend metrics. */
export function frameAt(state,phase){return state?.timeline?.frames?.[Math.min(11,Math.max(0,Math.trunc(phase)))]||null;}
export function validateTimeline(state){
 const t=state.timeline;
 if(t?.version!=='cinematic-timeline-2'||t.frames?.length!==12)throw new Error('Unavailable cinematic timeline');
 for(const [i,f] of t.frames.entries()){
  if(f.phase!==i||!Number.isFinite(f.seconds)||(i>0&&f.seconds<=t.frames[i-1].seconds)||!Array.isArray(f.failures)||!Array.isArray(f.networkState?.nodes)||!Array.isArray(f.networkState?.links)||!Array.isArray(f.candidates))throw new Error('Invalid timeline frame');
  if(i<(state.scenarioId==='conflict'?3:2)&&f.failures.length)throw new Error('Failure before impact');
  if(i<5&&f.candidates.length||i<7&&f.routeId||i<11&&(f.confirmed||f.ack))throw new Error('Premature timeline evidence');
  if(f.routeId&&!f.candidates.some(c=>c.id===f.routeId&&c.eligible))throw new Error('Timeline route not eligible');
  if(f.routeStatus==='LOCKED'&&!f.confirmed)throw new Error('Lock without ACK');
  if(i>=5&&JSON.stringify(f.candidates)!==JSON.stringify(state.candidates))throw new Error('Timeline score mismatch');
  if(i>=7&&f.routeId!==state.recommendation.routeId)throw new Error('Timeline recommendation mismatch');
  if(f.confirmed&&(!state.deliveryStatus.confirmed||JSON.stringify(f.ack)!==JSON.stringify(state.deliveryStatus.ack)))throw new Error('Timeline ACK mismatch');
  for(const failure of f.failures){const n=f.networkState.nodes.find(n=>n.id===failure.nodeId);if(!n||n.status!==failure.status)throw new Error('Effect does not match asset state');}
 }
 if(JSON.stringify(t.frames[11].networkState)!==JSON.stringify(state.networkState))throw new Error('Final network mismatch');
}
