const SCALE=2;
const FIELD=18;
const OVERLAP_CACHE=new Map();

function intersects(a,b){
  return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
}
function overlapsAny(rect,placed){for(const p of placed)if(intersects(rect,p.rect||p))return true;return false;}
function rectKey(r){return `${r.x},${r.y},${r.w},${r.h}`;}
function envClassFor(mode,env){
  if(mode==='hot')return env==='Scorching'?'H':env==='Warm'?'I':env==='Cool'?'C':null;
  if(mode==='cold')return env==='Freeze'?'C':env==='Cool'?'I':env==='Warm'?'H':null;
  return null;
}
function signature(d){return `${d.facility}|${d.env}|${d.w}|${d.h}|${d.canRotate?1:0}`;}

/**
 * Exact climate availability from utility settings.
 * Cooling+Heat can create one intermediate tier only in the two useful extreme pairings.
 */
export function climateAllows(required,scenario={}){
  if(!required)return true;
  if(required==='Adequate')return !!scenario.sunlamp;
  if(required===scenario.cooling||required===scenario.heat)return true;
  if(required==='Cool'&&scenario.cooling==='Freeze'&&scenario.heat==='Warm')return true;
  if(required==='Warm'&&scenario.cooling==='Cool'&&scenario.heat==='Scorching')return true;
  return false;
}

export function productionPlacementCounts(facility,rows,state,data){
  const fac=data.facilities.find(f=>f.slug===facility);if(fac?.kind!=='production')return new Map();
  const active=[...(rows||[])].filter(r=>r?.facility===facility&&Number(r.units||0)>1e-8).sort((a,b)=>Number(b.perHour||0)-Number(a.perHour||0)||Number(b.units||0)-Number(a.units||0)||Number(a.recipe?.id||0)-Number(b.recipe?.id||0));
  if(!active.length)return new Map();
  const cap=Math.max(0,Number(state.facilities?.[facility]?.count||0)),total=active.reduce((s,r)=>s+Math.max(0,Number(r.units||0)),0),target=Math.min(cap,Math.max(active.length,Math.ceil(total-1e-7))),counts=new Map(active.map(r=>[r,0]));
  if(target<=0)return counts;
  if(target<active.length){
    for(const row of [...active].sort((a,b)=>Number(b.units||0)-Number(a.units||0)||Number(b.perHour||0)-Number(a.perHour||0)).slice(0,target))counts.set(row,1);
    return counts;
  }
  for(const row of active)counts.set(row,1);
  let left=target-active.length;
  while(left-->0){
    let pick=active[0],best=-Infinity;
    for(const row of active){const deficit=Math.max(0,Number(row.units||0))-Number(counts.get(row)||0);if(deficit>best+1e-12){best=deficit;pick=row;}}
    counts.set(pick,Number(counts.get(pick)||0)+1);
  }
  return counts;
}

export function climateDemands(plan,state,data){
  const groups=new Map(),rows=[...(plan?.rows||[])],byFacility=new Map();
  for(const row of rows){const fac=data.facilities.find(f=>f.slug===row.facility);if(fac?.kind!=='production')continue;if(!byFacility.has(row.facility))byFacility.set(row.facility,[]);byFacility.get(row.facility).push(row);}
  const placements=new Map();
  for(const[facility,facilityRows]of byFacility)for(const[row,count]of productionPlacementCounts(facility,facilityRows,state,data))placements.set(row,count);
  for(const row of rows){
    const env=row?.recipe?.env;if(!env)continue;
    const fac=data.facilities.find(f=>f.slug===row.facility);if(fac?.kind!=='production')continue;
    const fp=fac.footprint||{};if(!(Number(fp.w)>0&&Number(fp.h)>0))continue;
    const count=Math.max(0,Number(placements.get(row)||0));if(count<=0)continue;
    const key=`${row.facility}|${env}`,rec=groups.get(key)||{
      key,facility:row.facility,name:fac.name||row.facility,env,units:0,count:0,
      w:Number(fp.w),h:Number(fp.h),canRotate:fac.canRotate!==false
    };
    rec.units+=Math.max(0,Number(row.units||0));rec.count+=count;groups.set(key,rec);
  }
  return[...groups.values()].filter(d=>d.count>0);
}

function utilityGeometry(dx=0,dy=0){
  const coolingField={x:0,y:0,w:FIELD,h:FIELD};
  const heatField={x:dx,y:dy,w:FIELD,h:FIELD};
  const coolingUnit={x:7,y:7,w:4,h:4,facility:'cooling-unit'};
  const heatUnit={x:dx+8,y:dy+8,w:2,h:2,facility:'heat-furnace'};
  return{coolingField,heatField,coolingUnit,heatUnit};
}
function validUtilityOffset(dx,dy){
  const g=utilityGeometry(dx,dy);return !intersects(g.coolingUnit,g.heatUnit);
}
function candidateRectsForDemand(d,mode,dx,dy){
  const g=utilityGeometry(dx,dy),want=envClassFor(mode,d.env);if(!want)return[];
  const dims=[[Math.round(d.w*SCALE),Math.round(d.h*SCALE)]];
  if(d.canRotate&&Math.abs(d.w-d.h)>1e-9)dims.push([Math.round(d.h*SCALE),Math.round(d.w*SCALE)]);
  const seen=new Set(),out=[];
  for(const [w,h] of dims){
    const xmin=Math.min(g.coolingField.x,g.heatField.x)-w+1,xmax=Math.max(g.coolingField.x+FIELD,g.heatField.x+FIELD)-1;
    const ymin=Math.min(g.coolingField.y,g.heatField.y)-h+1,ymax=Math.max(g.coolingField.y+FIELD,g.heatField.y+FIELD)-1;
    for(let x=xmin;x<=xmax;x++)for(let y=ymin;y<=ymax;y++){
      const r={x,y,w,h},c=intersects(r,g.coolingField),hHit=intersects(r,g.heatField),cls=c&&hHit?'I':c?'C':hHit?'H':'N';
      if(cls!==want||intersects(r,g.coolingUnit)||intersects(r,g.heatUnit))continue;
      const k=rectKey(r);if(seen.has(k))continue;seen.add(k);out.push(r);
    }
  }
  return out;
}
function candidateOrder(rect,variant,dx,dy){
  const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2,mx=(Math.min(0,dx)+Math.max(FIELD,dx+FIELD))/2,my=(Math.min(0,dy)+Math.max(FIELD,dy+FIELD))/2;
  switch(variant%12){
    case 0:return[rect.y,rect.x];
    case 1:return[rect.x,rect.y];
    case 2:return[-rect.y,rect.x];
    case 3:return[-rect.x,rect.y];
    case 4:return[rect.x+rect.y,rect.x];
    case 5:return[rect.x-rect.y,rect.x];
    case 6:return[-rect.x+rect.y,rect.x];
    case 7:return[-rect.x-rect.y,rect.x];
    case 8:return[Math.abs(cx-mx)+Math.abs(cy-my),rect.y,rect.x];
    case 9:return[-Math.abs(cx-mx)-Math.abs(cy-my),rect.y,rect.x];
    case 10:return[Math.abs(cx-mx),Math.abs(cy-my),rect.y];
    default:return[Math.abs(cy-my),Math.abs(cx-mx),rect.x];
  }
}
function cmpTuple(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const d=Number(a[i]||0)-Number(b[i]||0);if(Math.abs(d)>1e-12)return d;}return 0;}
function expandedObjects(demands){
  const out=[];for(const d of demands)for(let i=0;i<d.count;i++)out.push({...d,copy:i+1});return out;
}
function tryGreedyOffset(demands,mode,dx,dy){
  if(!validUtilityOffset(dx,dy))return null;
  const objects=expandedObjects(demands),cache=new Map();
  const candidates=d=>{const k=signature(d);if(!cache.has(k))cache.set(k,candidateRectsForDemand(d,mode,dx,dy));return cache.get(k);};
  for(const d of demands)if(candidates(d).length<d.count)return null;
  const orders=[
    [...objects].sort((a,b)=>b.w*b.h-a.w*a.h||candidates(a).length-candidates(b).length||a.env.localeCompare(b.env)),
    [...objects].sort((a,b)=>candidates(a).length-candidates(b).length||b.w*b.h-a.w*a.h||a.env.localeCompare(b.env)),
    [...objects].sort((a,b)=>(envClassFor(mode,a.env)==='I'?0:1)-(envClassFor(mode,b.env)==='I'?0:1)||b.w*b.h-a.w*a.h),
    [...objects].sort((a,b)=>(envClassFor(mode,a.env)==='I'?1:0)-(envClassFor(mode,b.env)==='I'?1:0)||candidates(a).length-candidates(b).length)
  ];
  for(const order of orders)for(let variant=0;variant<12;variant++){
    const placed=[],sorted=new Map();
    let ok=true;
    for(const obj of order){
      const k=signature(obj);
      if(!sorted.has(k))sorted.set(k,[...candidates(obj)].sort((a,b)=>cmpTuple(candidateOrder(a,variant,dx,dy),candidateOrder(b,variant,dx,dy))));
      const rect=sorted.get(k).find(r=>!overlapsAny(r,placed));
      if(!rect){ok=false;break;}
      placed.push({rect,...obj});
    }
    if(ok)return placed;
  }
  return null;
}

export function searchOverlapLayout(demands,mode,{maxOffset=9,onProgress=null}={}){
  const cacheKey=mode+'|'+[...(demands||[])].map(d=>[d.facility,d.env,d.count,d.w,d.h,d.canRotate?1:0].join(':')).sort().join(';')+'|'+maxOffset;
  if(OVERLAP_CACHE.has(cacheKey)){const cached=OVERLAP_CACHE.get(cacheKey);onProgress?.({testedOffsets:cached.triedOffsets||0,totalOffsets:cached.triedOffsets||0,delta:0,cached:true});return cached;}
  const halfMax=Math.round(maxOffset*SCALE),attempts=[];
  for(let dx=0;dx<=halfMax;dx++)for(let dy=0;dy<=dx;dy++){
    if(!validUtilityOffset(dx,dy))continue;
    attempts.push([dx,dy]);
  }
  // Compact layouts first; this also makes the visual result nicer.
  attempts.sort((a,b)=>(a[0]*a[0]+a[1]*a[1])-(b[0]*b[0]+b[1]*b[1])||a[0]-b[0]||a[1]-b[1]);
  let tried=0,lastReported=0;
  for(const[dx,dy]of attempts){
    tried++;if(onProgress&&(tried===1||tried%4===0)){onProgress({testedOffsets:tried,totalOffsets:attempts.length,delta:tried-lastReported});lastReported=tried;}
    const placed=tryGreedyOffset(demands,mode,dx,dy);
    if(!placed)continue;
    const g=utilityGeometry(dx,dy),convert=r=>({x:r.x/SCALE,y:r.y/SCALE,w:r.w/SCALE,h:r.h/SCALE});
    if(onProgress&&tried>lastReported)onProgress({testedOffsets:tried,totalOffsets:attempts.length,delta:tried-lastReported});
    const result={
      feasible:true,mode,triedOffsets:tried,offset:{x:dx/SCALE,y:dy/SCALE},
      coolingField:convert(g.coolingField),heatField:convert(g.heatField),
      utilities:[
        {facility:'cooling-unit',...convert(g.coolingUnit)},
        {facility:'heat-furnace',...convert(g.heatUnit)}
      ],
      placements:placed.map(p=>({facility:p.facility,name:p.name,env:p.env,copy:p.copy,...convert(p.rect)}))
    };OVERLAP_CACHE.set(cacheKey,result);return result;
  }
  if(onProgress&&tried>lastReported)onProgress({testedOffsets:tried,totalOffsets:attempts.length,delta:tried-lastReported});const result={feasible:false,mode,triedOffsets:tried,placements:[]};OVERLAP_CACHE.set(cacheKey,result);return result;
}

function singleZoneCandidates(d){
  const field={x:0,y:0,w:FIELD,h:FIELD},lamp={x:8,y:8,w:2,h:2};
  const dims=[[Math.round(d.w*SCALE),Math.round(d.h*SCALE)]];
  if(d.canRotate&&Math.abs(d.w-d.h)>1e-9)dims.push([Math.round(d.h*SCALE),Math.round(d.w*SCALE)]);
  const out=[],seen=new Set();
  for(const[w,h]of dims)for(let x=-w+1;x<=FIELD-1;x++)for(let y=-h+1;y<=FIELD-1;y++){
    const r={x,y,w,h};if(!intersects(r,field)||intersects(r,lamp))continue;const k=rectKey(r);if(!seen.has(k)){seen.add(k);out.push(r);}
  }
  return out;
}
function searchAdequateLayout(demands){
  if(!demands.length)return{feasible:true,placements:[]};
  const objects=expandedObjects(demands),cache=new Map(),get=d=>{const k=signature(d);if(!cache.has(k))cache.set(k,singleZoneCandidates(d));return cache.get(k);};
  const orders=[
    [...objects].sort((a,b)=>b.w*b.h-a.w*a.h||get(a).length-get(b).length),
    [...objects].sort((a,b)=>get(a).length-get(b).length||b.w*b.h-a.w*a.h)
  ];
  for(const order of orders)for(let variant=0;variant<8;variant++){
    const placed=[],sorted=new Map();let ok=true;
    for(const obj of order){
      const k=signature(obj);if(!sorted.has(k))sorted.set(k,[...get(obj)].sort((a,b)=>cmpTuple(candidateOrder(a,variant,0,0),candidateOrder(b,variant,0,0))));
      const rect=sorted.get(k).find(r=>!overlapsAny(r,placed));if(!rect){ok=false;break;}placed.push({rect,...obj});
    }
    if(ok)return{feasible:true,field:{x:0,y:0,w:9,h:9},utility:{facility:'sunlamp',x:4,y:4,w:1,h:1},placements:placed.map(p=>({facility:p.facility,name:p.name,env:p.env,copy:p.copy,x:p.rect.x/SCALE,y:p.rect.y/SCALE,w:p.rect.w/SCALE,h:p.rect.h/SCALE}))};
  }
  return{feasible:false,placements:[]};
}

export function evaluateClimateLayout(plan,state,data,options={}){
  const demands=climateDemands(plan,state,data),scenario=plan?.scenario||{};
  if(!demands.length)return{feasible:true,status:'none',demands:[],branchDemands:[],message:'No climate-sensitive production is active.'};

  for(const d of demands)if(!climateAllows(d.env,scenario))return{
    feasible:false,status:'logical',demands,branchDemands:[d],
    message:`${d.name} needs ${d.env}, but the selected utility settings cannot produce that climate.`
  };

  const byFacility=new Map();
  for(const d of demands){const rec=byFacility.get(d.facility)||{count:0,demands:[]};rec.count+=d.count;rec.demands.push(d);byFacility.set(d.facility,rec);}
  for(const[facility,rec]of byFacility){
    const cap=Number(state.facilities?.[facility]?.count||0);
    if(cap>0&&rec.count>cap)return{
      feasible:false,status:'facility-cap',demands,branchDemands:rec.demands,
      message:`${rec.demands[0]?.name||facility} needs ${rec.count} fixed climate placements across its active recipes, but only ${cap} copies are placed.`
    };
  }

  const adequate=demands.filter(d=>d.env==='Adequate');
  let adequateLayout=null;
  if(adequate.length){
    if(!scenario.sunlamp)return{feasible:false,status:'logical',demands,branchDemands:adequate,message:'Adequate production is active, but Sunlamp is not selected.'};
    adequateLayout=searchAdequateLayout(adequate);
    if(!adequateLayout.feasible)return{feasible:false,status:'adequate-pack',demands,branchDemands:adequate,message:'The Adequate structures do not fit around one isolated 9×9 Sunlamp field.'};
  }

  const nonAdequate=demands.filter(d=>d.env!=='Adequate');
  let mode=null,overlapEnv=null;
  if(scenario.cooling==='Freeze'&&scenario.heat==='Warm'&&nonAdequate.some(d=>d.env==='Cool')){mode='cold';overlapEnv='Cool';}
  if(scenario.cooling==='Cool'&&scenario.heat==='Scorching'&&nonAdequate.some(d=>d.env==='Warm')){mode='hot';overlapEnv='Warm';}
  if(!mode)return{
    feasible:true,status:'separate',mode:null,demands,branchDemands:[],adequateLayout,
    message:'No Cooling/Heat overlap is required; the active climate zones can be placed independently.'
  };

  const relevant=nonAdequate.filter(d=>envClassFor(mode,d.env));
  const overlap=searchOverlapLayout(relevant,mode,{maxOffset:Math.max(1,Number(options.maxOffset||9)),onProgress:options.onProgress});
  if(!overlap.feasible)return{
    feasible:false,status:'overlap-pack',mode,demands,branchDemands:relevant,adequateLayout,
    triedOffsets:overlap.triedOffsets,
    message:`No valid ${mode==='hot'?'Cool + Scorching → Warm':'Freeze + Warm → Cool'} placement was found for the required structure counts.`
  };
  return{
    feasible:true,status:'overlap',mode,overlapEnv,demands,branchDemands:[],adequateLayout,
    ...overlap,
    message:`${mode==='hot'?'Cool + Scorching overlap creates Warm':'Freeze + Warm overlap creates Cool'}; a buildable placement was found.`
  };
}
