import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {validateProjection} from './scenario-adapter.js';
import {terrainHeight,flightPosition} from './coastal-contract.js';
const d=JSON.parse(execFileSync('python3',['-c',"import json;from engine.mission_engine import run_mission;print(json.dumps(run_mission({'sceneProfile':'coastal-v1'})))"],{cwd:new URL('../',import.meta.url),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}));
validateProjection(d);
const reject=mutate=>{const copy=structuredClone(d);mutate(copy);assert.throws(()=>validateProjection(copy));};
reject(d=>d.timeline.frames[8].candidates=d.timeline.frames[7].candidates);
reject(d=>d.timeline.frames[0].networkState.nodes[0].scenePositionM=[0,NaN,0]);
reject(d=>d.timeline.frames[6].runId='old-run');
reject(d=>d.timeline.frames[10].decision.inputSnapshotId='previous');
reject(d=>d.timeline.frames[0].confirmed=true);
reject(d=>d.timeline.frames[11].ack.runId='old');
reject(d=>d.timeline.frames[11].ack.received=false);
reject(d=>d.timeline.frames[11].ack.executionId='other-execution');
reject(d=>d.timeline.frames[11].events.push(d.timeline.frames[11].events[0]));
reject(d=>d.timeline.frames[7].networkState.links.find(l=>l.id==='a-primary-mesh').qualification='UNVERIFIED');
for(const f of d.timeline.frames)for(const n of f.networkState.nodes){
 const p=flightPosition(n,f.seconds);assert.deepEqual(p,n.scenePositionM);
 if(n.layer==='air')assert(p[1]>terrainHeight(d.sceneContract.layout,p[0],p[2]));
}
const samples=JSON.parse(execFileSync('python3',['-c','import json;from engine.coastal_scene import height;print(json.dumps([[x,z,height(x,z)] for x in range(-500,1500,100) for z in range(-900,900,100)]))'],{cwd:new URL('../',import.meta.url),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}));
for(const [x,z,y] of samples)assert(Math.abs(terrainHeight(d.sceneContract.layout,x,z)-y)<1e-8);
console.log('Coastal: 10 malformed projections rejected; Python/JS terrain, flight and frame contracts agree.');
