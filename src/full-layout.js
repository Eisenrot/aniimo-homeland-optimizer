import {productionPlacementCounts} from './climate.js';
import {stableStringify} from './plan-cache.js';

export const FULL_LAYOUT_VERSION=3;
export const FULL_LAYOUT_STORE='aniimoOptimizerFullLayoutV1';
export const LAYOUT_SETTINGS_STORE='aniimoOptimizerLayoutSettingsV1';
export const PLOT_WIDTH=20;
export const PLOT_HEIGHT=15;
export const PLOT_MATRIX=[
  [13,14,15,16],
  [12,7,8,9],
  [11,4,3,6],
  [10,2,1,5]
];

const EPS=1e-7;
const STEP=.25;
const SHAPES=new Set(['auto','compact','rows','clusters','spread']);

export function plotRect(number){
  for(let row=0;row<PLOT_MATRIX.length;row++)for(let col=0;col<PLOT_MATRIX[row].length;col++)if(PLOT_MATRIX[row][col]===Number(number))return{plot:Number(number),x:col*PLOT_WIDTH,y:row*PLOT_HEIGHT,w:PLOT_WIDTH,h:PLOT_HEIGHT};
  return null;
}
export function unlockedPlotNumbers(homelandLevel){
  const n=Math.max(1,Math.min(16,Math.floor(Number(homelandLevel)||1)));return Array.from({length:n},(_,i)=>i+1);
}
export function normalizeLayoutSettings(raw={},homelandLevel=1){
  const disabled=[...new Set((raw.disabledPlots||[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=16))].sort((a,b)=>a-b),storageRaw=raw.storageUnits==null?1:Number(raw.storageUnits),storageCount=Number.isFinite(storageRaw)?Math.floor(storageRaw):1;
  return{
    compact:raw.compact!==false,
    shape:SHAPES.has(raw.shape)?raw.shape:'auto',
    allowRotate:raw.allowRotate!==false,
    storageUnits:homelandLevel>=2?Math.max(0,Math.min(24,storageCount)):0,
    disabledPlots:disabled
  };
}
export function enabledPlotNumbers(settings,homelandLevel){
  const s=normalizeLayoutSettings(settings,homelandLevel),disabled=new Set(s.disabledPlots);return unlockedPlotNumbers(homelandLevel).filter(n=>!disabled.has(n));
}
export function enabledPlotRects(settings,homelandLevel){return enabledPlotNumbers(settings,homelandLevel).map(plotRect).filter(Boolean);}

function genericPlacementCounts(facility,rows,state,data){
  const fac=data.facilities.find(f=>f.slug===facility),active=[...(rows||[])].filter(r=>Number(r.units||0)>EPS).sort((a,b)=>Number(b.perHour||0)-Number(a.perHour||0)||Number(b.units||0)-Number(a.units||0)||Number(a.recipe?.id||0)-Number(b.recipe?.id||0));
  if(!fac||!active.length)return new Map();
  if(fac.kind==='production')return productionPlacementCounts(facility,active,state,data);
  const cap=Math.max(0,Number(state.facilities?.[facility]?.count||0)),total=active.reduce((s,r)=>s+Math.max(0,Number(r.units||0)),0),wanted=Math.max(1,Math.ceil(total-EPS)),target=Math.min(cap||wanted,state.oneRecipePerFacility?Math.max(wanted,active.length):wanted),counts=new Map(active.map(r=>[r,0]));
  if(target<=0)return counts;
  const first=[...active].sort((a,b)=>Number(b.units||0)-Number(a.units||0)||Number(b.perHour||0)-Number(a.perHour||0));
  for(let i=0;i<Math.min(target,first.length);i++)counts.set(first[i],1);
  let left=target-Math.min(target,first.length);
  while(left-->0){
    let pick=active[0],best=-Infinity;
    for(const row of active){const deficit=Math.max(0,Number(row.units||0))-Number(counts.get(row)||0);if(deficit>best+1e-12){best=deficit;pick=row;}}
    counts.set(pick,Number(counts.get(pick)||0)+1);
  }
  return counts;
}

export function planPhysicalItems(plan,state,data,settings={}){
  const rows=[...(plan?.rows||[])],byFacility=new Map(),items=[];
  for(const row of rows){if(!byFacility.has(row.facility))byFacility.set(row.facility,[]);byFacility.get(row.facility).push(row);}
  for(const[facility,facilityRows]of byFacility){
    const fac=data.facilities.find(f=>f.slug===facility);if(!fac?.footprint)continue;
    const counts=genericPlacementCounts(facility,facilityRows,state,data);
    for(const[row,count]of counts){
      const output=row.recipe?.outputs?.[0]?.item??null;
      for(let copy=1;copy<=Number(count||0);copy++)items.push({
        id:`${facility}:${row.recipe?.id??'job'}:${copy}`,facility,name:fac.name||facility,kind:'plan',recipeId:row.recipe?.id??null,
        outputItem:output,env:row.recipe?.env||null,w:Number(fac.footprint.w),h:Number(fac.footprint.h),canRotate:fac.canRotate!==false,copy
      });
    }
  }
  const scenario=plan?.scenario||{},addUtility=slug=>{const fac=data.facilities.find(f=>f.slug===slug);if(fac?.footprint)items.push({id:`utility:${slug}`,facility:slug,name:fac.name||slug,kind:'utility',outputItem:null,env:null,w:Number(fac.footprint.w),h:Number(fac.footprint.h),canRotate:fac.canRotate!==false,copy:1});};
  if(scenario.cooling)addUtility('cooling-unit');if(scenario.heat)addUtility('heat-furnace');if(scenario.sunlamp)addUtility('sunlamp');
  if(scenario.generator)items.push({id:'utility:crackle-generator',facility:'crackle-generator',name:'Crackle Generator',kind:'utility',outputItem:null,env:null,w:1,h:1,canRotate:false,copy:1,icon:'https://aniipedia.com/items/10400021.webp'});
  const normalized=normalizeLayoutSettings(settings,state.homelandLevel);
  for(let i=0;i<normalized.storageUnits;i++)items.push({id:`storage-unit:${i+1}`,facility:'storage-unit',name:'Storage Unit',kind:'storage',outputItem:null,env:null,w:2,h:2,canRotate:false,copy:i+1,icon:'https://aniipedia.com/items/10400001.webp'});
  return items;
}

function area(r){return Math.max(0,Number(r.w||0))*Math.max(0,Number(r.h||0));}
function intersects(a,b){return a.x<b.x+b.w-EPS&&b.x<a.x+a.w-EPS&&a.y<b.y+b.h-EPS&&b.y<a.y+a.h-EPS;}
function intersectionArea(a,b){const w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return w*h;}
function coveredByPlots(rect,plots){return plots.reduce((s,p)=>s+intersectionArea(rect,p),0)>=area(rect)-1e-5;}
function overlapsPlaced(rect,placed){return placed.some(p=>intersects(rect,p));}
function roundStep(v){return Math.round(v/STEP)*STEP;}
function bboxOf(rects){if(!rects.length)return{x:0,y:0,w:0,h:0};const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y)),right=Math.max(...rects.map(r=>r.x+r.w)),bottom=Math.max(...rects.map(r=>r.y+r.h));return{x,y,w:right-x,h:bottom-y};}
function plotDistanceOrder(plots,shape){
  const p1=plotRect(1),cx=p1.x+p1.w/2,cy=p1.y+p1.h/2;
  return [...plots].sort((a,b)=>{
    if(shape==='rows')return a.y-b.y||a.x-b.x;
    const da=Math.hypot(a.x+a.w/2-cx,a.y+a.h/2-cy),db=Math.hypot(b.x+b.w/2-cx,b.y+b.h/2-cy);
    if(shape==='spread')return db-da||a.plot-b.plot;
    return da-db||a.plot-b.plot;
  });
}
function scanPositions(plot,w,h,shape){
  const out=[];
  const x0=plot.x,x1=plot.x+plot.w-w,y0=plot.y,y1=plot.y+plot.h-h;
  if(x1<x0-EPS||y1<y0-EPS)return out;
  for(let y=y0;y<=y1+EPS;y+=STEP)for(let x=x0;x<=x1+EPS;x+=STEP)out.push({x:roundStep(x),y:roundStep(y)});
  if(shape==='compact'||shape==='auto'||shape==='clusters'){
    const cx=plot.x+plot.w/2,cy=plot.y+plot.h/2;out.sort((a,b)=>(Math.abs(a.x+w/2-cx)+Math.abs(a.y+h/2-cy))-(Math.abs(b.x+w/2-cx)+Math.abs(b.y+h/2-cy))||a.y-b.y||a.x-b.x);
  }
  if(shape==='spread')out.reverse();
  return out;
}
function facilityAnchor(placed,facility){
  const same=placed.filter(p=>p.facility===facility);if(!same.length)return null;return{x:same.reduce((s,p)=>s+p.x+p.w/2,0)/same.length,y:same.reduce((s,p)=>s+p.y+p.h/2,0)/same.length};
}
function rectCenter(r){return{x:r.x+r.w/2,y:r.y+r.h/2};}
function pointDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function storageAssignments(placed){
  const storages=placed.filter(p=>p.kind==='storage'),loads=Array(storages.length).fill(0);if(!storages.length)return{storages,loads};
  for(const p of placed){if(p.kind==='storage'||p.kind==='utility')continue;const pc=rectCenter(p);let pick=0,best=Infinity;for(let i=0;i<storages.length;i++){const d=pointDistance(pc,rectCenter(storages[i]));if(d<best){best=d;pick=i;}}loads[pick]++;}
  return{storages,loads};
}
function storagePlacementPenalty(rect,placed){
  const{storages,loads}=storageAssignments(placed);if(!storages.length)return 0;const c=rectCenter(rect);let pick=0,best=Infinity;for(let i=0;i<storages.length;i++){const d=pointDistance(c,rectCenter(storages[i]));if(d<best){best=d;pick=i;}}
  const minLoad=Math.min(...loads,0),loadPenalty=Math.max(0,(loads[pick]||0)-minLoad);return best*3+loadPenalty*5;
}
function storageCandidates(plots,w=2,h=2,fixed=[]){
  const out=[],step=1;
  for(const plot of plots)for(let y=plot.y;y<=plot.y+plot.h-h+EPS;y+=step)for(let x=plot.x;x<=plot.x+plot.w-w+EPS;x+=step){const rect={x:roundStep(x),y:roundStep(y),w,h};if(overlapsPlaced(rect,fixed))continue;out.push(rect);}
  return out;
}
function preliminaryOrdinaryLayout(items,fixedPlaced,plots,settings){
  const preview=[...fixedPlaced],ordered=[...items].sort((a,b)=>area(b)-area(a)||a.facility.localeCompare(b.facility));
  for(const item of ordered){const p=placeOne(item,preview,plots,{...settings,compact:true,shape:settings.shape==='spread'?'clusters':settings.shape});if(!p)return preview;preview.push(p);}
  return preview;
}
function storageSetScore(rects,demandPoints,demandBounds,compact){
  if(!rects.length)return Infinity;
  const centers=rects.map(rectCenter),loads=Array(centers.length).fill(0),distances=[];
  for(const p of demandPoints){let pick=0,best=Infinity;for(let i=0;i<centers.length;i++){const d=pointDistance(p,centers[i]);if(d<best){best=d;pick=i;}}loads[pick]++;distances.push(best);}
  const avg=distances.length?distances.reduce((s,d)=>s+d,0)/distances.length:0,max=distances.length?Math.max(...distances):0,loadSpread=loads.length?Math.max(...loads)-Math.min(...loads):0;
  let minPair=0;if(centers.length>1){minPair=Infinity;for(let i=0;i<centers.length;i++)for(let j=i+1;j<centers.length;j++)minPair=Math.min(minPair,pointDistance(centers[i],centers[j]));}
  const dbCenter={x:demandBounds.x+demandBounds.w/2,y:demandBounds.y+demandBounds.h/2},anchorCenter={x:centers.reduce((s,p)=>s+p.x,0)/centers.length,y:centers.reduce((s,p)=>s+p.y,0)/centers.length},centerDrift=pointDistance(dbCenter,anchorCenter),storageBounds=bboxOf(rects),union=bboxOf([{x:demandBounds.x,y:demandBounds.y,w:demandBounds.w,h:demandBounds.h},...rects]),expansion=Math.max(0,union.w*union.h-demandBounds.w*demandBounds.h);
  return max*2.1+avg*1.25+loadSpread*2.8+centerDrift*.28-minPair*.18+(compact?expansion*.24:expansion*.05);
}
function placeStorageAnchors(items,fixedPlaced,plots,demandPlaced,settings){
  if(!items.length)return[];const candidates=storageCandidates(plots,items[0].w,items[0].h,fixedPlaced);if(!candidates.length)return null;
  const demandRects=(demandPlaced||[]).filter(p=>p.kind!=='storage'&&p.kind!=='utility'),fallback=bboxOf(plots),demandBounds=demandRects.length?bboxOf(demandRects):fallback,demandPoints=demandRects.length?demandRects.map(rectCenter):[{x:fallback.x+fallback.w/2,y:fallback.y+fallback.h/2}],chosen=[];
  const margin=settings.compact?6:Infinity,nearDemand=candidates.filter(c=>{if(!Number.isFinite(margin))return true;const cc=rectCenter(c);return cc.x>=demandBounds.x-margin&&cc.x<=demandBounds.x+demandBounds.w+margin&&cc.y>=demandBounds.y-margin&&cc.y<=demandBounds.y+demandBounds.h+margin;}),pool=nearDemand.length>=items.length?nearDemand:candidates;
  for(let n=0;n<items.length;n++){
    let best=null,bestScore=Infinity;
    for(const c of pool){
      if(chosen.some(s=>intersects(c,s)))continue;
      const trial=[...chosen,c],score=storageSetScore(trial,demandPoints,demandBounds,settings.compact);
      if(score<bestScore-1e-9){best=c;bestScore=score;}
    }
    if(!best)return null;chosen.push(best);
  }
  return chosen.map((r,i)=>({...items[i],...r,storageAnchor:true}));
}
function candidateScore(rect,placed,settings,item){
  if(!placed.length)return rect.y*1000+rect.x;
  const shape=settings.shape==='auto'?(settings.compact?'compact':'clusters'):settings.shape,before=bboxOf(placed),after=bboxOf([...placed,rect]),bboxPenalty=after.w*after.h-before.w*before.h,storagePenalty=item?.kind==='storage'?0:storagePlacementPenalty(rect,placed);
  if(shape==='rows')return rect.y*10000+rect.x+storagePenalty*5;
  if(shape==='spread'){const min=Math.min(...placed.map(p=>Math.hypot(rect.x+rect.w/2-(p.x+p.w/2),rect.y+rect.h/2-(p.y+p.h/2))));return-min+storagePenalty*2;}
  if(shape==='clusters'){const anchor=facilityAnchor(placed,item.facility);if(anchor)return Math.hypot(rect.x+rect.w/2-anchor.x,rect.y+rect.h/2-anchor.y)*20+bboxPenalty+storagePenalty*5;}
  return bboxPenalty*50+Math.hypot(rect.x+rect.w/2-(before.x+before.w/2),rect.y+rect.h/2-(before.y+before.h/2))+storagePenalty*6;
}
function placeOne(item,placed,plots,settings){
  const shape=settings.shape==='auto'?(settings.compact?'compact':'clusters'):settings.shape,plotOrder=plotDistanceOrder(plots,shape),dims=[[item.w,item.h]];
  if(settings.allowRotate&&item.canRotate&&Math.abs(item.w-item.h)>EPS)dims.push([item.h,item.w]);
  let best=null,bestScore=Infinity;
  for(const[w,h]of dims)for(const plot of plotOrder){
    const positions=scanPositions(plot,w,h,shape);
    for(const pos of positions){const rect={...item,x:pos.x,y:pos.y,w,h,rotated:Math.abs(w-item.w)>EPS};if(overlapsPlaced(rect,placed))continue;const score=candidateScore(rect,placed,settings,item);if(score<bestScore){best=rect;bestScore=score;if(shape==='rows'||(!settings.compact&&shape!=='spread'))break;}}
    if(best&&(shape==='rows'||(!settings.compact&&shape!=='spread')))break;
  }
  return best;
}
function clusterMembersFromClimate(plan,items){
  const layout=plan?.climateLayout;if(!layout?.feasible)return[];
  const available=[...items],take=(facility,env=null)=>{
    let i=available.findIndex(x=>x.facility===facility&&(env==null||x.env===env));if(i<0)i=available.findIndex(x=>x.facility===facility);if(i<0)return null;return available.splice(i,1)[0];
  },clusters=[];
  if(layout.status==='overlap'&&layout.placements?.length){
    const members=[];
    for(const p of layout.placements||[]){const item=take(p.facility,p.env);if(item)members.push({...item,lx:p.x,ly:p.y,w:p.w,h:p.h});}
    for(const u of layout.utilities||[]){const item=take(u.facility);if(item)members.push({...item,lx:u.x,ly:u.y,w:u.w,h:u.h});}
    const fields=[];if(layout.coolingField)fields.push({type:'cooling',...layout.coolingField});if(layout.heatField)fields.push({type:'heating',...layout.heatField});
    clusters.push({id:'temperature-overlap',members,fields});
  }
  if(layout.adequateLayout?.feasible&&layout.adequateLayout.placements?.length){
    const members=[];
    for(const p of layout.adequateLayout.placements||[]){const item=take(p.facility,p.env||'Adequate');if(item)members.push({...item,lx:p.x,ly:p.y,w:p.w,h:p.h});}
    const u=layout.adequateLayout.utility;if(u){const item=take(u.facility);if(item)members.push({...item,lx:u.x,ly:u.y,w:u.w,h:u.h});}
    const fields=layout.adequateLayout.field?[{type:'adequate',...layout.adequateLayout.field}]:[];
    clusters.push({id:'adequate',members,fields});
  }
  return{clusters,remaining:available};
}
function placeCluster(cluster,placed,plots,settings){
  if(!cluster.members.length)return{placements:[],fields:[]};
  for(let i=0;i<cluster.members.length;i++)for(let j=i+1;j<cluster.members.length;j++)if(intersects({x:cluster.members[i].lx,y:cluster.members[i].ly,w:cluster.members[i].w,h:cluster.members[i].h},{x:cluster.members[j].lx,y:cluster.members[j].ly,w:cluster.members[j].w,h:cluster.members[j].h}))return null;
  const localBox=bboxOf(cluster.members.map(m=>({x:m.lx,y:m.ly,w:m.w,h:m.h}))),board=bboxOf(plots),shape=settings.shape==='auto'?(settings.compact?'compact':'clusters'):settings.shape;
  let best=null,bestScore=Infinity;
  for(let ty=board.y-localBox.y;ty<=board.y+board.h-(localBox.y+localBox.h)+EPS;ty+=STEP)for(let tx=board.x-localBox.x;tx<=board.x+board.w-(localBox.x+localBox.w)+EPS;tx+=STEP){
    const members=cluster.members.map(m=>({...m,x:roundStep(m.lx+tx),y:roundStep(m.ly+ty)}));
    if(members.some(m=>!coveredByPlots(m,plots)||overlapsPlaced(m,placed)))continue;
    const bb=bboxOf(members),score=shape==='rows'?bb.y*10000+bb.x:settings.compact?candidateScore(bb,placed,settings,{facility:cluster.id}):bb.y*1000+bb.x;
    if(score<bestScore){best={placements:members,fields:(cluster.fields||[]).map(f=>({...f,x:f.x+tx,y:f.y+ty}))};bestScore=score;}
  }
  return best;
}
function singleFieldMembers(matching,utility){
  const field={x:0,y:0,w:9,h:9},placed=[{...utility,lx:4,ly:4}],occupied=[{x:4,y:4,w:utility.w,h:utility.h}];
  const ordered=[...matching].sort((a,b)=>area(b)-area(a)||a.facility.localeCompare(b.facility));
  for(const item of ordered){
    const dims=[[item.w,item.h]],candidates=[];
    if(item.canRotate&&Math.abs(item.w-item.h)>EPS)dims.push([item.h,item.w]);
    for(const[w,h]of dims)for(let y=-h+STEP;y<9-EPS;y+=STEP)for(let x=-w+STEP;x<9-EPS;x+=STEP){
      const r={x:roundStep(x),y:roundStep(y),w,h};
      if(intersectionArea(r,field)<=EPS||occupied.some(o=>intersects(r,o)))continue;
      candidates.push(r);
    }
    candidates.sort((a,b)=>(Math.abs(a.x+a.w/2-4.5)+Math.abs(a.y+a.h/2-4.5))-(Math.abs(b.x+b.w/2-4.5)+Math.abs(b.y+b.h/2-4.5))||a.y-b.y||a.x-b.x);
    const pick=candidates[0];if(!pick)return null;
    placed.push({...item,lx:pick.x,ly:pick.y,w:pick.w,h:pick.h,rotated:Math.abs(pick.w-item.w)>EPS});occupied.push(pick);
  }
  return placed;
}
function directClimateClusters(plan,items){
  const layout=plan?.climateLayout,scenario=plan?.scenario||{};if(!layout?.feasible||layout.status==='overlap')return[];
  const demands=layout.demands||[],out=[],used=new Set();
  const add=(type,facility,env)=>{
    const group=demands.filter(d=>d.env===env);if(!group.length)return;
    const matching=items.filter((x,i)=>!used.has(i)&&group.some(d=>d.facility===x.facility&&x.env===d.env)),utilityIndex=items.findIndex((x,i)=>!used.has(i)&&x.facility===facility);
    if(!matching.length||utilityIndex<0)return;
    const utility=items[utilityIndex],members=singleFieldMembers(matching,utility);if(!members)return;
    used.add(utilityIndex);for(const item of matching)used.add(items.indexOf(item));
    out.push({id:`direct-${type}`,members,fields:[{type,x:0,y:0,w:9,h:9}]});
  };
  if(scenario.cooling)add('cooling','cooling-unit',scenario.cooling);
  if(scenario.heat)add('heating','heat-furnace',scenario.heat);
  return{clusters:out,used};
}

function buildFullBaseLayoutVariant(plan,state,data,settings){
  const plots=enabledPlotRects(settings,state.homelandLevel);
  if(!plots.length)return{feasible:false,reason:'No unlocked plots are enabled.',placements:[],fields:[],plots:[],settings};
  const allItems=planPhysicalItems(plan,state,data,settings),placed=[],fields=[];
  const climate=clusterMembersFromClimate(plan,allItems),clusters=[...(climate.clusters||[])];let remaining=climate.remaining||allItems;
  if(!clusters.length){
    const direct=directClimateClusters(plan,remaining);
    if(direct?.clusters?.length){clusters.push(...direct.clusters);remaining=remaining.filter((_,i)=>!direct.used.has(i));}
  }
  for(const cluster of clusters){
    const result=placeCluster(cluster,placed,plots,settings);
    if(!result)return{feasible:false,reason:`Climate cluster ${cluster.id} does not fit inside the enabled plots.`,placements:placed,fields,plots,settings,unplaced:[...cluster.members,...remaining]};
    placed.push(...result.placements);fields.push(...result.fields);
  }
  const storageItems=remaining.filter(x=>x.kind==='storage'),ordinary=remaining.filter(x=>x.kind!=='storage'),preview=preliminaryOrdinaryLayout(ordinary,placed,plots,settings),storagePlacements=placeStorageAnchors(storageItems,placed,plots,preview,settings);
  if(storageItems.length&&!storagePlacements)return{feasible:false,reason:'The requested Storage Units cannot be distributed inside the enabled plots.',placements:placed,fields,plots,settings,unplaced:[...storageItems,...ordinary]};
  if(storagePlacements?.length)placed.push(...storagePlacements);
  remaining=[...ordinary].sort((a,b)=>area(b)-area(a)||a.facility.localeCompare(b.facility));
  for(let index=0;index<remaining.length;index++){
    const item=remaining[index],p=placeOne(item,placed,plots,settings);
    if(!p)return{feasible:false,reason:`${item.name} does not fit inside the enabled plots.`,placements:placed,fields,plots,settings,unplaced:[item,...remaining.slice(index+1)]};
    placed.push(p);
  }
  const usedPlots=plots.filter(plot=>placed.some(p=>intersectionArea(p,plot)>EPS)).map(p=>p.plot),bounds=bboxOf(placed);
  return{feasible:true,placements:placed,fields,plots,settings,usedPlots,bounds,itemCount:placed.length};
}
function layoutScore(layout,compact){
  if(!layout?.feasible)return Infinity;const b=layout.bounds||bboxOf(layout.placements||[]),areaScore=b.w*b.h,perimeter=b.w+b.h,plots=layout.usedPlots?.length||99;
  return compact?areaScore*10000+plots*100+perimeter:plots*10000+areaScore*10+perimeter;
}
export function buildFullBaseLayout(plan,state,data,rawSettings={}){
  const settings=normalizeLayoutSettings(rawSettings,state.homelandLevel);
  if(settings.shape!=='auto')return buildFullBaseLayoutVariant(plan,state,data,settings);
  const candidates=(settings.compact?['compact','clusters','rows']:['clusters','rows','spread','compact']).map(shape=>buildFullBaseLayoutVariant(plan,state,data,{...settings,shape}));
  const feasible=candidates.filter(x=>x.feasible).sort((a,b)=>layoutScore(a,settings.compact)-layoutScore(b,settings.compact));
  if(feasible.length){const best=feasible[0];return{...best,settings:{...settings,resolvedShape:best.settings.shape}};}
  const failed=candidates.sort((a,b)=>(b.placements?.length||0)-(a.placements?.length||0))[0];
  return{...failed,settings:{...settings,resolvedShape:failed?.settings?.shape||'compact'}};
}

export function layoutStillFitsPlots(layout,rawSettings,homelandLevel){
  if(!layout?.feasible)return false;const plots=enabledPlotRects(rawSettings,homelandLevel);
  return!!plots.length&&(layout.placements||[]).every(p=>coveredByPlots(p,plots));
}
export function fullLayoutSignature(plan,state,settings,buildId='dev'){
  const rows=(plan?.rows||[]).map(r=>({facility:r.facility,recipeId:r.recipe?.id??null,units:Number(r.units||0),perHour:Number(r.perHour||0),env:r.recipe?.env||null})).sort((a,b)=>(a.facility+':'+a.recipeId).localeCompare(b.facility+':'+b.recipeId));
  return stableStringify({version:FULL_LAYOUT_VERSION,build:String(buildId||'dev'),homelandLevel:Number(state.homelandLevel||1),facilities:state.facilities,scenario:plan?.scenario||{},rows,settings:normalizeLayoutSettings(settings,state.homelandLevel)});
}
export function readFullLayoutCache(storage,plan,state,settings,buildId='dev'){
  try{const raw=storage?.getItem?.(FULL_LAYOUT_STORE);if(!raw)return null;const entry=JSON.parse(raw);if(entry?.version!==FULL_LAYOUT_VERSION||entry.signature!==fullLayoutSignature(plan,state,settings,buildId))return null;return entry.layout||null;}catch{return null;}
}
export function writeFullLayoutCache(storage,plan,state,settings,buildId='dev',layout){
  if(!layout)return false;try{storage?.setItem?.(FULL_LAYOUT_STORE,JSON.stringify({version:FULL_LAYOUT_VERSION,signature:fullLayoutSignature(plan,state,settings,buildId),layout,createdAt:Date.now()}));return true;}catch{return false;}
}
