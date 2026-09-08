import {terrainHeight} from './coastal-contract.js';

// Two explicitly bounded scan locations: fault-area foothill and foreground
// civic edge. The renderer passes the complete visible town footprint here.
export function planHeroTrees(layout){
 const candidates=[[[390,-535],[430,-585],[520,-545],[300,-470]],[[400,745],[320,765],[475,735],[550,690]]],chosen=[];
 const roads=(x,z)=>{
  let d=Infinity;
  for(const road of layout.roads)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
   d=Math.min(d,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)-road.widthM/2);
  }
  return d;
 };
 for(const [i,options]of candidates.entries())for(const [x,z]of options){
  const h=terrainHeight(layout,x,z),slope=Math.hypot(terrainHeight(layout,x+3,z)-terrainHeight(layout,x-3,z),terrainHeight(layout,x,z+3)-terrainHeight(layout,x,z-3))/6;
  if(h<6||h>170||slope>.78||roads(x,z)<20)continue;
  if(layout.buildings.some(b=>Math.hypot(Math.max(0,Math.abs(b.x-x)-b.width/2),Math.max(0,Math.abs(b.z-z)-b.depth/2))<18))continue;
  if([[480,-450],[420,-295],[90,400]].some(([a,b])=>Math.hypot(a-x,b-z)<52))continue;
  chosen.push({id:'r3-hero-tree-'+i,x,z,heightM:i===0?12.2:13.1,rotation:.37+i*1.82,source:'existing local CC0 jacaranda_tree_r2',crownRadiusM:10,nearLODWorldDistance:17});break;
 }
 return chosen;
}
