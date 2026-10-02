import {productionPlacementCounts} from './climate.js';
import {stableStringify} from './plan-cache.js';
import {
  configuredFacilityLevel,
  electricDemandForFacility,
  gridPowerEfficiency,
  totalGeneratorPower
} from './utility-system.js';

export const FULL_LAYOUT_VERSION=12;
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
const STORAGE_UNIT_GLYPH=new URL('../assets/storage-unit-glyph.webp',import.meta.url).href;

export function plotRect(number){
  for(let row=0;row<PLOT_MATRIX.length;row++)for(let col=0;col<PLOT_MATRIX[row].length;col++)if(PLOT_MATRIX[row][col]===Number(number))return{plot:Number(number),x:col*PLOT_WIDTH,y:row*PLOT_HEIGHT,w:PLOT_WIDTH,h:PLOT_HEIGHT};
  return null;
}
export function unlockedPlotNumbers(homelandLevel){
  const n=Math.max(1,Math.min(16,Math.floor(Number(homelandLevel)||1)));return Array.from({length:n},(_,i)=>i+1);
}
export function normalizeLayoutSettings(raw={},homelandLevel=1){
  const disabled=[...new Set((raw.disabledPlots||[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=16))].sort((a,b)=>a-b),storageRaw=raw.storageUnits==null?0:Number(raw.storageUnits),storageCount=Number.isFinite(storageRaw)?Math.floor(storageRaw):0;
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
      const output=row.recipe?.outputs?.[0]?.item??null,n=Math.max(0,Number(count||0));
      for(let copy=1;copy<=n;copy++)items.push({
        id:`${facility}:${row.recipe?.id??'job'}:${copy}`,facility,name:fac.name||facility,kind:'plan',recipeId:row.recipe?.id??null,
        outputItem:output,env:Object.prototype.hasOwnProperty.call(row,'effectiveEnv')?row.effectiveEnv:(row.recipe?.env||null),avoidClimate:row.executionMode==='uncovered',
        electric:Boolean(row.recipe?.electric),facilityLevel:configuredFacilityLevel(state,facility,Number(row.recipe?.level||1)),
        powerDemand:Boolean(row.recipe?.electric)?electricDemandForFacility(fac,configuredFacilityLevel(state,facility,Number(row.recipe?.level||1))):0,
        w:Number(fac.footprint.w),h:Number(fac.footprint.h),canRotate:fac.canRotate!==false,copy
      });
    }
  }
  // The layout follows the chosen production plan. Unused configured facilities
  // stay off-map; only utilities needed by the chosen scenario are added.
  const scenario=plan?.scenario||{},addUtility=(slug,count=1)=>{const fac=data.facilities.find(f=>f.slug===slug);if(!fac?.footprint)return;for(let copy=1;copy<=count;copy++)items.push({id:`utility:${slug}:${copy}`,facility:slug,name:fac.name||slug,kind:'utility',outputItem:null,env:null,w:Number(fac.footprint.w),h:Number(fac.footprint.h),canRotate:fac.canRotate!==false,copy});};
  const coolingCount=scenario.cooling?Math.max(1,Number(scenario.coolingCount||1)):0,
    heatCount=scenario.heat?Math.max(1,Number(scenario.heatCount||1)):0,
    sunlampCount=scenario.sunlamp?Math.max(1,Number(scenario.sunlampCount||1)):0;
  if(scenario.cooling)addUtility('cooling-unit',coolingCount);
  if(scenario.heat)addUtility('heat-furnace',heatCount);
  if(scenario.sunlamp)addUtility('sunlamp',sunlampCount);
  // Crackle Generator / Power Poles are placed after production structures so
  // the power network can minimize relays instead of becoming arbitrary clutter.
  const normalized=normalizeLayoutSettings(settings,state.homelandLevel);
  for(let i=0;i<normalized.storageUnits;i++)items.push({id:`storage-unit:${i+1}`,facility:'storage-unit',name:'Storage Unit',kind:'storage',outputItem:null,env:null,w:2,h:2,canRotate:false,copy:i+1,icon:STORAGE_UNIT_GLYPH});
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
function balancedDemandCentroids(points,count){
  const k=Math.max(1,Math.min(Math.floor(Number(count)||1),points.length||1));
  if(!points.length)return[];
  const mean={x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length};
  const first=[...points].sort((a,b)=>pointDistance(a,mean)-pointDistance(b,mean)||a.y-b.y||a.x-b.x)[0],centers=[{...first}];
  while(centers.length<k){
    let pick=points[0],best=-Infinity;
    for(const p of points){
      const d=Math.min(...centers.map(c=>pointDistance(p,c)));
      if(d>best+1e-9){best=d;pick=p;}
    }
    centers.push({...pick});
  }
  const target=points.length/k;
  for(let pass=0;pass<10;pass++){
    const groups=Array.from({length:k},()=>[]);
    const ordered=[...points].sort((a,b)=>{
      const ad=Math.min(...centers.map(c=>pointDistance(a,c))),bd=Math.min(...centers.map(c=>pointDistance(b,c)));
      return bd-ad||a.y-b.y||a.x-b.x;
    });
    for(const p of ordered){
      let pick=0,best=Infinity;
      for(let i=0;i<k;i++){
        const load=groups[i].length/Math.max(1,target),score=pointDistance(p,centers[i])*(1+Math.max(0,load-.7)*.42);
        if(score<best-1e-9){best=score;pick=i;}
      }
      groups[pick].push(p);
    }
    for(let i=0;i<k;i++)if(groups[i].length)centers[i]={
      x:groups[i].reduce((sum,p)=>sum+p.x,0)/groups[i].length,
      y:groups[i].reduce((sum,p)=>sum+p.y,0)/groups[i].length
    };
  }
  return centers;
}
function placeStorageAnchors(items,fixedPlaced,plots,demandPlaced,settings){
  if(!items.length)return[];
  const candidates=storageCandidates(plots,items[0].w,items[0].h,fixedPlaced);if(!candidates.length)return null;
  const demandRects=(demandPlaced||[]).filter(p=>p.kind!=='storage'&&p.kind!=='utility'),fallback=bboxOf(plots),
    demandPoints=demandRects.length?demandRects.map(rectCenter):[{x:fallback.x+fallback.w/2,y:fallback.y+fallback.h/2}],
    targets=balancedDemandCentroids(demandPoints,items.length),chosen=[];
  // Solve the service territories first; only then snap Storage Units onto legal
  // grid cells. This makes N storages divide the actual building mass into N
  // spatial regions instead of greedily reacting to whatever storage came first.
  const targetOrder=[...targets].sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const target of targetOrder){
    let best=null,bestScore=Infinity;
    for(const c of candidates){
      if(chosen.some(s=>intersects(c,s)))continue;
      const cc=rectCenter(c),nearestDemand=Math.min(...demandPoints.map(p=>pointDistance(cc,p))),
        centroidDistance=pointDistance(cc,target),
        expansion=settings.compact?Math.max(0,nearestDemand-5):0,
        score=centroidDistance*12+nearestDemand*.7+expansion*2;
      if(score<bestScore-1e-9){best=c;bestScore=score;}
    }
    if(!best)return null;chosen.push(best);
  }
  return chosen.map((r,i)=>({...items[i],...r,storageAnchor:true,serviceTarget:targetOrder[i]}));
}
function candidateScore(rect,placed,settings,item){
  if(!placed.length)return rect.y*1000+rect.x;
  const shape=settings.shape==='auto'?(settings.compact?'compact':'clusters'):settings.shape,before=bboxOf(placed),after=bboxOf([...placed,rect]),bboxPenalty=after.w*after.h-before.w*before.h,storagePenalty=item?.kind==='storage'?0:storagePlacementPenalty(rect,placed);
  if(shape==='rows')return rect.y*10000+rect.x+storagePenalty*5;
  if(shape==='spread'){const min=Math.min(...placed.map(p=>Math.hypot(rect.x+rect.w/2-(p.x+p.w/2),rect.y+rect.h/2-(p.y+p.h/2))));return-min+storagePenalty*2;}
  if(shape==='clusters'){const anchor=facilityAnchor(placed,item.facility);if(anchor)return Math.hypot(rect.x+rect.w/2-anchor.x,rect.y+rect.h/2-anchor.y)*20+bboxPenalty+storagePenalty*5;}
  return bboxPenalty*50+Math.hypot(rect.x+rect.w/2-(before.x+before.w/2),rect.y+rect.h/2-(before.y+before.h/2))+storagePenalty*6;
}
function placeOne(item,placed,plots,settings,forbiddenFields=[]){
  const shape=settings.shape==='auto'?(settings.compact?'compact':'clusters'):settings.shape,plotOrder=plotDistanceOrder(plots,shape),dims=[[item.w,item.h]],
    firstFit=shape==='rows'||(!settings.compact&&shape!=='spread');
  if(settings.allowRotate&&item.canRotate&&Math.abs(item.w-item.h)>EPS)dims.push([item.h,item.w]);

  const evaluate=(plot,w,h,x,y)=>{
    const rect={...item,x:roundStep(x),y:roundStep(y),w,h,rotated:Math.abs(w-item.w)>EPS};
    if(overlapsPlaced(rect,placed)||(item.avoidClimate&&forbiddenFields.some(field=>intersects(rect,field))))return null;
    return{rect,score:candidateScore(rect,placed,settings,item),plot};
  };

  if(firstFit){
    for(const[w,h]of dims)for(const plot of plotOrder)for(const pos of scanPositions(plot,w,h,shape)){
      const result=evaluate(plot,w,h,pos.x,pos.y);if(result)return result.rect;
    }
    return null;
  }

  // Most items do not need quarter-cell exhaustive search across every plot.
  // Find the best integer anchors, then refine only around the strongest few.
  const coarse=[];
  for(const[w,h]of dims)for(const plot of plotOrder){
    const x1=plot.x+plot.w-w,y1=plot.y+plot.h-h;if(x1<plot.x-EPS||y1<plot.y-EPS)continue;
    for(let y=plot.y;y<=y1+EPS;y+=1)for(let x=plot.x;x<=x1+EPS;x+=1){
      const result=evaluate(plot,w,h,x,y);if(result)coarse.push(result);
    }
  }

  if(!coarse.length){
    let best=null;
    for(const[w,h]of dims)for(const plot of plotOrder)for(const pos of scanPositions(plot,w,h,shape)){
      const result=evaluate(plot,w,h,pos.x,pos.y);if(result&&(!best||result.score<best.score))best=result;
    }
    return best?.rect||null;
  }

  coarse.sort((a,b)=>a.score-b.score);
  let best=coarse[0];
  for(const seed of coarse.slice(0,Math.min(8,coarse.length))){
    const plot=seed.plot,w=seed.rect.w,h=seed.rect.h,x1=plot.x+plot.w-w,y1=plot.y+plot.h-h;
    for(let dy=-1;dy<=1+EPS;dy+=STEP)for(let dx=-1;dx<=1+EPS;dx+=STEP){
      const x=seed.rect.x+dx,y=seed.rect.y+dy;
      if(x<plot.x-EPS||x>x1+EPS||y<plot.y-EPS||y>y1+EPS)continue;
      const result=evaluate(plot,w,h,x,y);if(result&&result.score<best.score)best=result;
    }
  }
  return best.rect;
}
function utilityClimateTemperature(facility,fields=[],plan=null){
  const scenario=plan?.scenario||{};
  if(facility==='cooling-unit'){
    const field=fields.find(f=>f.type==='cooling');
    return field?.temperature||scenario.cooling||null;
  }
  if(facility==='heat-furnace'){
    const field=fields.find(f=>f.type==='heating');
    return field?.temperature||scenario.heat||null;
  }
  if(facility==='sunlamp')return'Adequate';
  return null;
}
function clusterMembersFromClimate(plan,items){
  const layout=plan?.climateLayout;if(!layout?.feasible)return[];
  const available=[...items],take=(facility,env=null)=>{
    let i=available.findIndex(x=>x.facility===facility&&(env==null||x.env===env));if(i<0)i=available.findIndex(x=>x.facility===facility);if(i<0)return null;return available.splice(i,1)[0];
  },clusters=[];
  if(Array.isArray(layout.clusters)&&layout.clusters.length){
    for(const source of layout.clusters){
      const members=[];
      for(const p of source.placements||[]){const item=take(p.facility,p.env);if(item)members.push({...item,lx:p.x,ly:p.y,w:p.w,h:p.h});}
      const sourceFields=(source.fields||[]).map(field=>({...field}));
      for(const u of source.utilities||[]){const item=take(u.facility);if(item)members.push({...item,env:utilityClimateTemperature(u.facility,sourceFields,plan),lx:u.x,ly:u.y,w:u.w,h:u.h});}
      clusters.push({id:source.id||`climate-${clusters.length+1}`,members,fields:sourceFields});
    }
    return{clusters,remaining:available};
  }
  if(layout.status==='overlap'&&layout.placements?.length){
    const members=[];
    for(const p of layout.placements||[]){const item=take(p.facility,p.env);if(item)members.push({...item,lx:p.x,ly:p.y,w:p.w,h:p.h});}
    const fields=[];if(layout.coolingField)fields.push({type:'cooling',temperature:plan?.scenario?.cooling||null,...layout.coolingField});if(layout.heatField)fields.push({type:'heating',temperature:plan?.scenario?.heat||null,...layout.heatField});
    for(const u of layout.utilities||[]){const item=take(u.facility);if(item)members.push({...item,env:utilityClimateTemperature(u.facility,fields,plan),lx:u.x,ly:u.y,w:u.w,h:u.h});}
    clusters.push({id:'temperature-overlap',members,fields});
  }
  if(layout.adequateLayout?.feasible&&layout.adequateLayout.placements?.length){
    const members=[];
    for(const p of layout.adequateLayout.placements||[]){const item=take(p.facility,p.env||'Adequate');if(item)members.push({...item,lx:p.x,ly:p.y,w:p.w,h:p.h});}
    const u=layout.adequateLayout.utility;if(u){const item=take(u.facility);if(item)members.push({...item,env:'Adequate',lx:u.x,ly:u.y,w:u.w,h:u.h});}
    const fields=layout.adequateLayout.field?[{type:'adequate',temperature:'Adequate',...layout.adequateLayout.field}]:[];
    clusters.push({id:'adequate',members,fields});
  }
  return{clusters,remaining:available};
}
function placeCluster(cluster,placed,plots,settings,occupiedFields=[]){
  if(!cluster.members.length)return{placements:[],fields:[]};
  for(let i=0;i<cluster.members.length;i++)for(let j=i+1;j<cluster.members.length;j++)if(intersects({x:cluster.members[i].lx,y:cluster.members[i].ly,w:cluster.members[i].w,h:cluster.members[i].h},{x:cluster.members[j].lx,y:cluster.members[j].ly,w:cluster.members[j].w,h:cluster.members[j].h}))return null;
  const localBox=bboxOf(cluster.members.map(m=>({x:m.lx,y:m.ly,w:m.w,h:m.h}))),board=bboxOf(plots),shape=settings.shape==='auto'?(settings.compact?'compact':'clusters'):settings.shape;
  let best=null,bestScore=Infinity;
  for(let ty=board.y-localBox.y;ty<=board.y+board.h-(localBox.y+localBox.h)+EPS;ty+=STEP)for(let tx=board.x-localBox.x;tx<=board.x+board.w-(localBox.x+localBox.w)+EPS;tx+=STEP){
    const members=cluster.members.map(m=>({...m,x:roundStep(m.lx+tx),y:roundStep(m.ly+ty)})),clusterFields=(cluster.fields||[]).map(f=>({...f,x:f.x+tx,y:f.y+ty}));
    if(members.some(m=>!coveredByPlots(m,plots)||overlapsPlaced(m,placed)))continue;
    // Separate climate clusters must remain genuinely separate. An accidental
    // field overlap changes the produced climate, and a structure from one
    // cluster must not drift into another cluster's influence area either.
    if(clusterFields.some(f=>occupiedFields.some(o=>intersects(f,o))||placed.some(p=>intersects(f,p))))continue;
    if(members.some(m=>occupiedFields.some(f=>intersects(m,f))))continue;
    const bb=bboxOf(members),score=shape==='rows'?bb.y*10000+bb.x:settings.compact?candidateScore(bb,placed,settings,{facility:cluster.id}):bb.y*1000+bb.x;
    if(score<bestScore){best={placements:members,fields:clusterFields};bestScore=score;}
  }
  return best;
}
function singleFieldCandidateRects(item,field,utilityRect){
  const dims=[[item.w,item.h]],out=[],seen=new Set();
  if(item.canRotate&&Math.abs(item.w-item.h)>EPS)dims.push([item.h,item.w]);
  for(const[w,h]of dims)for(let y=-h+STEP;y<field.h-EPS;y+=STEP)for(let x=-w+STEP;x<field.w-EPS;x+=STEP){
    const r={x:roundStep(x),y:roundStep(y),w,h},k=`${r.x},${r.y},${r.w},${r.h}`;
    if(seen.has(k)||intersectionArea(r,field)<=EPS||intersects(r,utilityRect))continue;
    seen.add(k);out.push(r);
  }
  return out;
}
function singleFieldCandidateTuple(r,field,variant){
  const cx=r.x+r.w/2,cy=r.y+r.h/2,fx=field.x+field.w/2,fy=field.y+field.h/2,
    inside=intersectionArea(r,field),dist=Math.abs(cx-fx)+Math.abs(cy-fy),bbArea=(Math.max(field.x+field.w,r.x+r.w)-Math.min(field.x,r.x))*(Math.max(field.y+field.h,r.y+r.h)-Math.min(field.y,r.y));
  switch(variant%12){
    // Climate only needs the structure to intersect the field. Prefer using the
    // perimeter first so large structures do not consume the scarce 9x9 core.
    case 0:return[inside,-dist,bbArea,r.y,r.x];
    case 1:return[inside,-dist,bbArea,r.x,r.y];
    case 2:return[inside,r.y,r.x];
    case 3:return[inside,-r.y,r.x];
    case 4:return[inside,r.x,r.y];
    case 5:return[inside,-r.x,r.y];
    // Keep a few inward/compact variants: small groups often look better there.
    case 6:return[-inside,dist,bbArea,r.y,r.x];
    case 7:return[-inside,dist,bbArea,r.x,r.y];
    case 8:return[dist,inside,r.y,r.x];
    case 9:return[-dist,inside,r.y,r.x];
    case 10:return[bbArea,inside,-dist,r.y,r.x];
    default:return[inside,bbArea,Math.abs(cx-fx),Math.abs(cy-fy),r.y,r.x];
  }
}
function singleFieldMembers(matching,utility){
  const field={x:0,y:0,w:9,h:9},ux=roundStep((field.w-utility.w)/2),uy=roundStep((field.h-utility.h)/2),
    utilityRect={x:ux,y:uy,w:utility.w,h:utility.h},utilityPlaced={...utility,lx:ux,ly:uy},
    cache=new Map(),get=item=>{if(!cache.has(item))cache.set(item,singleFieldCandidateRects(item,field,utilityRect));return cache.get(item);};
  const orders=[
    [...matching].sort((a,b)=>area(b)-area(a)||get(a).length-get(b).length||a.facility.localeCompare(b.facility)),
    [...matching].sort((a,b)=>get(a).length-get(b).length||area(b)-area(a)||a.facility.localeCompare(b.facility)),
    [...matching].sort((a,b)=>area(a)-area(b)||get(a).length-get(b).length||a.facility.localeCompare(b.facility))
  ];
  for(const ordered of orders)for(let variant=0;variant<12;variant++){
    const placed=[utilityPlaced],occupied=[utilityRect],sorted=new Map();let ok=true;
    for(const item of ordered){
      if(!sorted.has(item))sorted.set(item,[...get(item)].sort((a,b)=>{
        const aa=singleFieldCandidateTuple(a,field,variant),bb=singleFieldCandidateTuple(b,field,variant);
        for(let i=0;i<Math.max(aa.length,bb.length);i++){const d=Number(aa[i]||0)-Number(bb[i]||0);if(Math.abs(d)>1e-9)return d;}return 0;
      }));
      const pick=sorted.get(item).find(r=>!occupied.some(o=>intersects(r,o)));
      if(!pick){ok=false;break;}
      placed.push({...item,lx:pick.x,ly:pick.y,w:pick.w,h:pick.h,rotated:Math.abs(pick.w-item.w)>EPS});occupied.push(pick);
    }
    if(ok)return placed;
  }
  return null;
}
function directClimateClusters(plan,items){
  const layout=plan?.climateLayout,scenario=plan?.scenario||{};if(!layout?.feasible||layout.status==='overlap')return{clusters:[],used:new Set(),failures:[]};
  const demands=layout.demands||[],out=[],used=new Set(),failures=[];
  const add=(type,facility,env)=>{
    const group=demands.filter(d=>d.env===env);if(!group.length)return;
    const matching=items.filter((x,i)=>!used.has(i)&&group.some(d=>d.facility===x.facility&&x.env===d.env)),utilityIndex=items.findIndex((x,i)=>!used.has(i)&&x.facility===facility);
    if(!matching.length)return;
    if(utilityIndex<0){failures.push(`${type} zone is missing ${facility}`);return;}
    const utility={...items[utilityIndex],env},members=singleFieldMembers(matching,utility);
    if(!members){failures.push(`${type} 9×9 field could not cover ${matching.length} required structure${matching.length===1?'':'s'}`);return;}
    used.add(utilityIndex);for(const item of matching)used.add(items.indexOf(item));
    out.push({id:`direct-${type}`,members,fields:[{type,temperature:env,x:0,y:0,w:9,h:9}]});
  };
  if(scenario.cooling)add('cooling','cooling-unit',scenario.cooling);
  if(scenario.heat)add('heating','heat-furnace',scenario.heat);
  return{clusters:out,used,failures};
}


function tupleCompare(a,b){
  for(let i=0;i<Math.max(a.length,b.length);i++){const d=Number(a[i]||0)-Number(b[i]||0);if(Math.abs(d)>1e-9)return d;}
  return 0;
}
function powerUtilityInField(facility,field,copy){
  const w=Number(facility?.footprint?.w||1),h=Number(facility?.footprint?.h||1);
  return{
    id:`utility:${facility.slug}:${copy}`,facility:facility.slug,name:facility.name||facility.slug,kind:'utility',
    outputItem:null,env:null,copy,level:facility.slug==='crackle-generator'?null:1,
    x:roundStep(field.x+(field.w-w)/2),y:roundStep(field.y+(field.h-h)/2),w,h,
    canRotate:false
  };
}
function poweredCandidateRects(item,fields,utilityRects,step=STEP){
  const bounds=bboxOf(fields),dims=[[item.w,item.h]],out=[],seen=new Set();
  if(item.canRotate&&Math.abs(item.w-item.h)>EPS)dims.push([item.h,item.w]);
  for(const[w,h]of dims){
    for(let y=bounds.y-h+step;y<bounds.y+bounds.h-EPS;y+=step)for(let x=bounds.x-w+step;x<bounds.x+bounds.w-EPS;x+=step){
      const rect={x:roundStep(x),y:roundStep(y),w,h},key=`${rect.x},${rect.y},${w},${h}`;
      if(seen.has(key)||!fields.some(field=>intersectionArea(rect,field)>EPS)||utilityRects.some(u=>intersects(rect,u)))continue;
      seen.add(key);out.push(rect);
    }
  }
  return out;
}
function poweredCandidateTuple(rect,fields,variant){
  const inside=fields.reduce((sum,field)=>sum+intersectionArea(rect,field),0),
    centers=fields.map(rectCenter),center=rectCenter(rect),nearest=Math.min(...centers.map(point=>pointDistance(center,point))),
    fb=bboxOf(fields),union=bboxOf([...fields,rect]),expansion=Math.max(0,union.w*union.h-fb.w*fb.h);
  switch(variant%6){
    case 0:return[inside,expansion,-nearest,rect.y,rect.x];
    case 1:return[inside,expansion,-nearest,rect.x,rect.y];
    case 2:return[expansion,inside,-nearest,rect.y,rect.x];
    case 3:return[-inside,expansion,nearest,rect.y,rect.x];
    case 4:return[inside,rect.y,rect.x];
    default:return[inside,rect.x,rect.y];
  }
}
function packPoweredItemsAtStep(items,utilities,fields,step){
  if(!items.length)return{complete:true,placements:[],unplaced:[]};
  const utilityRects=utilities.map(u=>({x:u.x,y:u.y,w:u.w,h:u.h})),candidateCache=new Map(),
    get=item=>{if(!candidateCache.has(item))candidateCache.set(item,poweredCandidateRects(item,fields,utilityRects,step));return candidateCache.get(item);};
  const orders=[
    [...items].sort((a,b)=>get(a).length-get(b).length||area(b)-area(a)||Number(b.powerDemand||0)-Number(a.powerDemand||0)),
    [...items].sort((a,b)=>area(b)-area(a)||get(a).length-get(b).length),
    [...items].sort((a,b)=>Number(b.powerDemand||0)-Number(a.powerDemand||0)||area(b)-area(a)),
    [...items].sort((a,b)=>area(a)-area(b)||get(a).length-get(b).length)
  ];
  let best={complete:false,placements:[],unplaced:[...items]},bestScore=-Infinity;
  for(const ordered of orders)for(let variant=0;variant<6;variant++){
    const placed=[],sorted=new Map(),missing=[];
    for(const item of ordered){
      if(!sorted.has(item))sorted.set(item,[...get(item)].sort((a,b)=>tupleCompare(poweredCandidateTuple(a,fields,variant),poweredCandidateTuple(b,fields,variant))));
      const pick=sorted.get(item).find(rect=>!placed.some(p=>intersects(rect,p)));
      if(!pick){missing.push(item);continue;}
      placed.push({...item,x:pick.x,y:pick.y,w:pick.w,h:pick.h,rotated:Math.abs(pick.w-item.w)>EPS});
    }
    const bb=placed.length?bboxOf([...utilities,...placed]):bboxOf(utilities),score=placed.length*1000000-bb.w*bb.h*100-(bb.w+bb.h);
    const result={complete:missing.length===0,placements:placed,unplaced:missing};
    if(result.complete)return result;
    if(score>bestScore){bestScore=score;best=result;}
  }
  return best;
}
function packPoweredItems(items,utilities,fields){
  let best=null;
  for(const step of [1,.5,STEP]){
    const result=packPoweredItemsAtStep(items,utilities,fields,step);
    if(result.complete)return result;
    if(!best||result.placements.length>best.placements.length)best=result;
  }
  return best||{complete:false,placements:[],unplaced:[...items]};
}
function powerPoleFieldCandidates(fields,pole,utilities){
  const w=Number(pole?.influence?.w||7),h=Number(pole?.influence?.h||7),overlap=1,out=[],seen=new Set();
  for(const field of fields){
    const positions=[
      {x:field.x+field.w-overlap,y:field.y+(field.h-h)/2},
      {x:field.x-w+overlap,y:field.y+(field.h-h)/2},
      {x:field.x+(field.w-w)/2,y:field.y+field.h-overlap},
      {x:field.x+(field.w-w)/2,y:field.y-h+overlap},
      {x:field.x+field.w-overlap,y:field.y+field.h-overlap},
      {x:field.x-w+overlap,y:field.y+field.h-overlap},
      {x:field.x+field.w-overlap,y:field.y-h+overlap},
      {x:field.x-w+overlap,y:field.y-h+overlap}
    ];
    for(const pos of positions){
      const candidate={x:roundStep(pos.x),y:roundStep(pos.y),w,h},key=`${candidate.x},${candidate.y},${w},${h}`;
      if(seen.has(key))continue;seen.add(key);
      const newArea=area(candidate)-fields.reduce((sum,f)=>sum+intersectionArea(candidate,f),0);
      if(newArea<=EPS)continue;
      const utility=powerUtilityInField(pole,candidate,utilities.filter(u=>u.facility==='crackle-power-pole').length+1);
      if(utilities.some(u=>intersects(utility,u)))continue;
      out.push({field:candidate,utility});
    }
  }
  return out;
}
function buildPoweredCluster(plan,state,data,electricItems){
  if(!electricItems.length)return{ok:true,placements:[],fields:[],power:{generators:0,poles:0,supply:0,demand:0,efficiency:0,unpowered:0}};
  const scenario=plan?.scenario||{},generator=data.facilities.find(f=>f.slug==='crackle-generator'),pole=data.facilities.find(f=>f.slug==='crackle-power-pole'),
    availableGenerators=Math.max(0,Number(state.utilityCounts?.generator??(state.generatorAvailable?1:0))||0),
    requested=Math.max(0,Number(scenario.generatorCount??(scenario.generator?1:0))||0),generatorCount=Math.min(availableGenerators,requested),
    poleLimit=Math.max(0,Number(state.utilityCounts?.powerPole||0)||0);
  if(!generatorCount||!generator?.footprint||!generator?.influence)return{ok:false,reason:'E-mode structures are active, but no Crackle Generator is available.',placements:[],fields:[],power:null};

  const fields=[],utilities=[],gw=Number(generator.influence.w||11),gh=Number(generator.influence.h||11),rootPositions=[
    {x:0,y:0},{x:gw-1,y:0},{x:0,y:gh-1}
  ];
  for(let copy=1;copy<=generatorCount;copy++){
    const root=rootPositions[(copy-1)%rootPositions.length]||{x:(copy-1)*(gw-1),y:0},field={x:root.x,y:root.y,w:gw,h:gh};
    fields.push({...field,type:'power-generator',source:'generator',copy});
    const utility=powerUtilityInField(generator,field,copy);utility.level=Number(state.generatorLevel||1);utilities.push(utility);
  }

  let packed=packPoweredItems(electricItems,utilities,fields),poles=0;
  while(!packed.complete&&poles<poleLimit&&pole?.footprint&&pole?.influence){
    let best=null,bestScore=-Infinity;
    for(const candidate of powerPoleFieldCandidates(fields,pole,utilities)){
      const trialFields=[...fields,{...candidate.field,type:'power-pole',source:'pole',copy:poles+1}],
        trialUtilities=[...utilities,{...candidate.utility,copy:poles+1}],trial=packPoweredItems(electricItems,trialUtilities,trialFields),
        bb=bboxOf([...trialUtilities,...trial.placements]),score=trial.placements.length*1000000-bb.w*bb.h*100-(bb.w+bb.h);
      if(score>bestScore){bestScore=score;best={candidate,fields:trialFields,utilities:trialUtilities,packed:trial};}
    }
    if(!best)break;
    const previousCount=packed.placements.length;
    fields.splice(0,fields.length,...best.fields);utilities.splice(0,utilities.length,...best.utilities);packed=best.packed;poles++;
    // An extension that cannot power room for even one additional machine is
    // not useful here; don't spend the rest of the pole cap building a necklace.
    if(packed.placements.length<=previousCount&&!packed.complete)break;
  }

  const demand=electricItems.reduce((sum,item)=>sum+Math.max(0,Number(item.powerDemand||0)),0),
    supply=totalGeneratorPower(generatorCount,Number(state.generatorLevel||1)),efficiency=gridPowerEfficiency(supply,demand),
    power={generators:generatorCount,poles,supply,demand,efficiency,unpowered:packed.unplaced.length};
  if(!packed.complete)return{ok:false,reason:`${packed.unplaced.length} E-mode structure${packed.unplaced.length===1?' is':'s are'} outside the Crackle power network; increase Power Pole availability or free space around the grid.`,placements:[...utilities,...packed.placements],fields,power,unplaced:packed.unplaced};
  return{ok:true,placements:[...utilities,...packed.placements],fields,power,unplaced:[]};
}
function placePoweredCluster(cluster,placed,plots,settings){
  if(!cluster?.placements?.length)return{placements:[],fields:[]};
  const localBox=bboxOf(cluster.placements),board=bboxOf(plots),shape=settings.shape==='auto'?(settings.compact?'compact':'clusters'):settings.shape,
    minTx=board.x-localBox.x,maxTx=board.x+board.w-(localBox.x+localBox.w),
    minTy=board.y-localBox.y,maxTy=board.y+board.h-(localBox.y+localBox.h);

  const evaluate=(tx,ty)=>{
    const members=cluster.placements.map(m=>({...m,x:roundStep(m.x+tx),y:roundStep(m.y+ty)}));
    if(members.some(m=>!coveredByPlots(m,plots)||overlapsPlaced(m,placed)))return null;
    const translatedFields=(cluster.fields||[]).map(f=>({...f,x:roundStep(f.x+tx),y:roundStep(f.y+ty)})),bb=bboxOf(members),
      score=shape==='rows'?bb.y*10000+bb.x:settings.compact?candidateScore(bb,placed,settings,{facility:'power-network'}):bb.y*1000+bb.x;
    return{placements:members,fields:translatedFields,score,tx,ty};
  };

  // Coarse-to-fine search. The powered cluster's internal geometry is already
  // solved; scanning every quarter-cell across the full 80x60 board is pure
  // repetition. Find good 1-cell anchors first, then refine locally.
  const coarse=[],seen=new Set(),push=result=>{
    if(!result)return;const key=`${result.tx.toFixed(2)},${result.ty.toFixed(2)}`;if(seen.has(key))return;seen.add(key);coarse.push(result);
  };
  for(let ty=minTy;ty<=maxTy+EPS;ty+=1)for(let tx=minTx;tx<=maxTx+EPS;tx+=1)push(evaluate(tx,ty));

  // A tight disabled-plot arrangement can occasionally require quarter-cell
  // alignment with no feasible integer anchor. Preserve correctness with an
  // exhaustive fallback only in that exceptional case.
  if(!coarse.length){
    let best=null;
    for(let ty=minTy;ty<=maxTy+EPS;ty+=STEP)for(let tx=minTx;tx<=maxTx+EPS;tx+=STEP){
      const result=evaluate(tx,ty);if(result&&(!best||result.score<best.score))best=result;
    }
    return best?{placements:best.placements,fields:best.fields}:null;
  }

  coarse.sort((a,b)=>a.score-b.score);
  let best=coarse[0];
  const seeds=coarse.slice(0,Math.min(12,coarse.length));
  for(const seed of seeds)for(let dy=-1;dy<=1+EPS;dy+=STEP)for(let dx=-1;dx<=1+EPS;dx+=STEP){
    const tx=roundStep(seed.tx+dx),ty=roundStep(seed.ty+dy);
    if(tx<minTx-EPS||tx>maxTx+EPS||ty<minTy-EPS||ty>maxTy+EPS)continue;
    const result=evaluate(tx,ty);if(result&&result.score<best.score)best=result;
  }
  return{placements:best.placements,fields:best.fields};
}

function buildFullBaseLayoutVariant(plan,state,data,settings){
  const plots=enabledPlotRects(settings,state.homelandLevel);
  if(!plots.length)return{feasible:false,reason:'No unlocked plots are enabled.',placements:[],fields:[],plots:[],settings};
  const allItems=planPhysicalItems(plan,state,data,settings),placed=[],fields=[];
  const climate=clusterMembersFromClimate(plan,allItems),clusters=[...(climate.clusters||[])];let remaining=climate.remaining||allItems;
  const direct=directClimateClusters(plan,remaining);
  if(direct?.clusters?.length){clusters.push(...direct.clusters);remaining=remaining.filter((_,i)=>!direct.used.has(i));}

  const strandedClimate=remaining.filter(x=>x.kind==='plan'&&x.env);
  if(strandedClimate.length){
    const detail=direct?.failures?.length?` ${direct.failures.join('; ')}.`:'';
    return{feasible:false,reason:`Climate zone packing failed for: ${[...new Set(strandedClimate.map(x=>x.env+' '+x.name))].join(', ')}.${detail}`,placements:placed,fields,plots,settings,unplaced:remaining};
  }

  // 1. Climate-sensitive production has first claim on geometry.
  clusters.sort((a,b)=>b.members.reduce((sum,x)=>sum+area(x),0)-a.members.reduce((sum,x)=>sum+area(x),0)||a.id.localeCompare(b.id));
  for(const cluster of clusters){
    const result=placeCluster(cluster,placed,plots,settings,fields);
    if(!result)return{feasible:false,reason:`Climate cluster ${cluster.id} does not fit inside the enabled plots without corrupting another climate zone.`,placements:placed,fields,plots,settings,unplaced:[...cluster.members,...remaining]};
    placed.push(...result.placements);fields.push(...result.fields);
  }

  // 2. Electricity is a spatial cluster, not an after-the-fact overlay.
  //    Pack E-mode machines around the Generator first; add a Pole only when
  //    the extra powered area actually accommodates another E-mode machine.
  const electricItems=remaining.filter(x=>x.kind==='plan'&&x.electric),storageItems=remaining.filter(x=>x.kind==='storage'),
    ordinary=remaining.filter(x=>x.kind!=='storage'&&!(x.kind==='plan'&&x.electric));
  const powerCluster=buildPoweredCluster(plan,state,data,electricItems);
  if(!powerCluster.ok)return{feasible:false,reason:powerCluster.reason,placements:[...placed,...(powerCluster.placements||[])],fields:[...fields,...(powerCluster.fields||[])],plots,settings,unplaced:powerCluster.unplaced||electricItems,powerNetwork:powerCluster.power};
  if(powerCluster.placements.length){
    const powered=placePoweredCluster(powerCluster,placed,plots,settings);
    if(!powered)return{feasible:false,reason:'The powered production cluster cannot fit inside the enabled plots around the climate zones.',placements:placed,fields,plots,settings,unplaced:electricItems,powerNetwork:powerCluster.power};
    placed.push(...powered.placements);fields.push(...powered.fields);
  }

  // 3. Storage anchors can now react to the high-priority climate + power
  //    geometry. Ordinary resource generation gets the remaining space.
  const preview=preliminaryOrdinaryLayout(ordinary,placed,plots,settings),storagePlacements=placeStorageAnchors(storageItems,placed,plots,preview,settings);
  if(storageItems.length&&!storagePlacements)return{feasible:false,reason:'The requested Storage Units cannot be distributed inside the enabled plots.',placements:placed,fields,plots,settings,unplaced:[...storageItems,...ordinary],powerNetwork:powerCluster.power};
  if(storagePlacements?.length)placed.push(...storagePlacements);

  remaining=[...ordinary].sort((a,b)=>area(b)-area(a)||a.facility.localeCompare(b.facility));
  for(let index=0;index<remaining.length;index++){
    const item=remaining[index],p=placeOne(item,placed,plots,settings,fields);
    if(!p)return{feasible:false,reason:`${item.name} does not fit inside the enabled plots.`,placements:placed,fields,plots,settings,unplaced:[item,...remaining.slice(index+1)],powerNetwork:powerCluster.power};
    placed.push(p);
  }

  const usedPlots=plots.filter(plot=>placed.some(p=>intersectionArea(p,plot)>EPS)).map(p=>p.plot),bounds=bboxOf(placed);
  return{feasible:true,placements:placed,fields,plots,settings,usedPlots,bounds,itemCount:placed.length,powerNetwork:powerCluster.power};
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
  const rows=(plan?.rows||[]).map(r=>({facility:r.facility,recipeId:r.recipe?.id??null,baseRecipeId:r.recipe?.baseRecipeId??r.recipe?.id??null,units:Number(r.units||0),perHour:Number(r.perHour||0),env:Object.prototype.hasOwnProperty.call(r,'effectiveEnv')?r.effectiveEnv:(r.recipe?.env||null),mode:r.executionMode||'normal'})).sort((a,b)=>(a.facility+':'+a.recipeId).localeCompare(b.facility+':'+b.recipeId));
  return stableStringify({version:FULL_LAYOUT_VERSION,build:String(buildId||'dev'),homelandLevel:Number(state.homelandLevel||1),facilities:state.facilities,utilityCounts:state.utilityCounts||null,generatorLevel:Number(state.generatorLevel||1),scenario:plan?.scenario||{},rows,settings:normalizeLayoutSettings(settings,state.homelandLevel)});
}
export function readFullLayoutCache(storage,plan,state,settings,buildId='dev'){
  try{const raw=storage?.getItem?.(FULL_LAYOUT_STORE);if(!raw)return null;const entry=JSON.parse(raw);if(entry?.version!==FULL_LAYOUT_VERSION||entry.signature!==fullLayoutSignature(plan,state,settings,buildId))return null;return entry.layout||null;}catch{return null;}
}
export function writeFullLayoutCache(storage,plan,state,settings,buildId='dev',layout){
  if(!layout)return false;try{storage?.setItem?.(FULL_LAYOUT_STORE,JSON.stringify({version:FULL_LAYOUT_VERSION,signature:fullLayoutSignature(plan,state,settings,buildId),layout,createdAt:Date.now()}));return true;}catch{return false;}
}