import {validateTimeline} from './timeline.js';
import {validateCoastal} from './coastal-contract.js';
/** The sole data boundary. Never silently fall back to fabricated local success. */
export class ScenarioAdapter {
  async load(input, signal) {
    const response = await fetch('/api/v2/scenario', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(input), signal, cache:'no-store'});
    let state;
    try { state = await response.json(); }
    catch { throw new Error(`Scenario source unavailable / HTTP ${response.status}`); }
    if (!response.ok) throw new Error(state.error || `HTTP ${response.status}`);
    if(state.scenarioId!==input.scenarioId)throw new Error('Stale scenario response');
    if(input.sceneProfile&&state.sceneProfile!==input.sceneProfile)throw new Error('Scene profile mismatch');
    if(input.testFault&&state.testFault!==input.testFault||input.seed&&state.seed!==input.seed)throw new Error('Stale scenario parameters');
    validateProjection(state);
    return state;
  }
}
export function validateProjection(state) {
  if (state.contractVersion !== '2.0' || state.mode !== 'simulation' || !Array.isArray(state.candidates) || !state.networkState || !state.deliveryStatus) throw new Error('Unsupported scenario contract');
  for (const route of state.candidates) {
    if (!Number.isFinite(route.finalScore) || Object.values(route.metrics).some(v=>!Number.isFinite(v))) throw new Error('Unavailable route metric');
    const sum = Object.values(route.weightedContributions).reduce((a,b)=>a+b,0);
    if (Math.abs(sum-route.finalScore)>0.00001) throw new Error('Score contribution mismatch');
  }
  if(state.sceneProfile==='coastal-v1')validateCoastal(state);else validateTimeline(state);
  const selected = state.candidates.find(c=>c.id===state.recommendation.routeId);
  if (state.recommendation.routeId && !selected?.eligible) throw new Error('Recommendation failed eligibility');
  const d = state.deliveryStatus;
  if (d.confirmed && (!d.ack || d.ack.messageId !== d.messageId || d.ack.routeId !== selected?.id || d.ack.sequence !== d.sequence || d.ack.packetHash !== d.packetHash || !d.crcVerified)) throw new Error('ACK identity mismatch');
}
