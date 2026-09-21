const MODULE_SLUGS = {
  'Ecological Module': 'ecological-module',
  'Resource Detector': 'resource-detector',
  'Kitchen Module': 'kitchen-module',
  'Crafting Module': 'crafting-module',
};

export const PERSONALITY_PAIRS = [['E','I'],['N','S'],['F','T'],['J','P']];
export const PERSONALITY_NAMES = {
  E:'Energetic', I:'Instinctive', N:'Nimble', S:'Practical',
  F:'Faithful', T:'Tenacious', J:'Judicious', P:'Playful',
};
export const FACILITY_PERSONALITY = {
  'bouncy-brew-keg':'E','woodworking-bench':'E',
  'phonolfactory-table':'I','dewy-house':'I',
  'blazing-stove':'N','jukebox-dryer':'N','floral-windmill':'N',
  'chimney-kiln':'S','claw-game-cooker':'S',
  'joy-wheel-loom':'F','starfall-hammock':'F','well':'F',
  'carousel-mill':'T','simmering-pot':'T',
  'crafting-table':'J','nimbus-bed':'J','tidewhisper-sandcastle':'J',
  'pickling-jar':'P','mine':'P',
};
export const PERSONALITY_PROFILES = (() => {
  const out=[];
  for(const a of PERSONALITY_PAIRS[0]) for(const b of PERSONALITY_PAIRS[1])
  for(const c of PERSONALITY_PAIRS[2]) for(const d of PERSONALITY_PAIRS[3]) out.push(a+b+c+d);
  return out;
})();

export function familyId(id){
  const n=Number(id); return Number.isFinite(n)?Math.floor(n/1000):null;
}
export function itemValue(data,id){return Number(data.items?.[String(id)]?.value??0)||0;}
export function itemName(data,id){return data.items?.[String(id)]?.name??String(id);}
export function recipeNetValue(recipe,data){
  let v=0;
  for(const o of recipe.outputs||[]) v+=itemValue(data,o.item)*Number(o.qty||0);
  for(const i of recipe.inputs||[]) v-=itemValue(data,i.item)*Number(i.qty||0);
  return v;
}
export function recipeGrossValue(recipe,data){
  return (recipe.outputs||[]).reduce((s,o)=>s+itemValue(data,o.item)*Number(o.qty||0),0);
}
export function manualWorkload(recipe){
  return Number(recipe.workload||0)+(recipe.steps||[]).reduce((s,x)=>s+Number(x.workload||0),0);
}
export function cycleSeconds(recipe,state,personalityMultiplier=1){
  if(recipe.electric) return Number(recipe.growSeconds||0);
  const pct=Math.max(1,Number(state.speeds?.[recipe.facility]??100));
  const speed=(pct/100)*Math.max(.01,personalityMultiplier);
  const work=manualWorkload(recipe);
  let seconds=Number(recipe.growSeconds||0)+(work>0?work/speed:0);
  if(recipe.env&&state.climate?.enabled){
    const ratio=climateRatio(recipe.env,state.climate.temperature);
    if(ratio>0) seconds/=ratio;
  }
  return seconds;
}

function enabledFamilySet(state,data){
  const out=new Set();
  for(const p of data.pals){
    const rec=state.owned?.[String(p.id)] ?? state.owned?.[p.name];
    if(rec?.enabled && Number(rec.count||0)>0) out.add(familyId(p.id));
  }
  return out;
}

const TEMP_ORDER=['Freeze','Cool','Adequate','Warm','Scorching'];
function climateRatio(required,current){
  if(!required) return 1;
  if(!current) return 0;
  const a=TEMP_ORDER.indexOf(required), b=TEMP_ORDER.indexOf(current);
  if(a<0||b<0) return 0;
  return [1,.8,.5,.2,.2][Math.min(Math.abs(a-b),4)];
}

export function recipeRunnable(recipe,state,data){
  const cfg=state.facilities?.[recipe.facility];
  if(!cfg || Number(cfg.count||0)<=0 || Number(recipe.level||1)>Number(cfg.level||1)) return false;
  if(recipe.electric) return false; // electric mode comes after the core browser version is stable.
  if(recipe.note && !state.allNotes && !state.recipeNotes?.[String(recipe.note.item)]) return false;
  if(recipe.module){
    const slug=MODULE_SLUGS[recipe.module.name];
    if(!slug || Number(state.modules?.[slug]||0)<Number(recipe.module.level||0)) return false;
  }
  if(recipe.env){
    if(!state.climate?.enabled) return false;
    if(climateRatio(recipe.env,state.climate.temperature)<=0) return false;
  }
  const ability=Number(state.abilityLevel||1);
  for(const step of recipe.steps||[]) if(Number(step.level||0)>ability) return false;
  if(recipe.pet){
    const fams=enabledFamilySet(state,data);
    if(!fams.has(familyId(recipe.pet))) return false;
  }
  return true;
}

// Compact two-phase simplex. It accepts max c*x subject to A*x <= b, x>=0.
export function solveLp(objective,A,b){
  const m=A.length,n=objective.length;
  if(!m) return {x:Array(n).fill(0),duals:[]};
  const neg=b.map(v=>v<-1e-9), artificialCount=neg.reduce((s,x)=>s+(x?1:0),0);
  const cols=n+m+artificialCount+1, rhs=cols-1;
  const tab=Array.from({length:m+1},()=>Array(cols).fill(0));
  const basis=Array(m).fill(0), artificial=[];
  let next=n+m;
  for(let r=0;r<m;r++){
    const sign=neg[r]?-1:1;
    for(let c=0;c<n;c++) tab[r][c]=sign*Number(A[r][c]||0);
    tab[r][n+r]=sign; tab[r][rhs]=sign*Number(b[r]||0);
    if(neg[r]){tab[r][next]=1;basis[r]=next;artificial.push(next++);} else basis[r]=n+r;
  }
  const limit=20*(n+m)+2000;
  function pivot(forbidden){
    let bland=false;
    for(let iter=0;iter<limit;iter++){
      let enter=-1;
      if(bland){for(let c=0;c<cols-1;c++) if(!forbidden.has(c)&&tab[m][c]<-1e-9){enter=c;break;}}
      else {let best=-1e-9;for(let c=0;c<cols-1;c++) if(!forbidden.has(c)&&tab[m][c]<best){best=tab[m][c];enter=c;}}
      if(enter<0) return;
      let leave=-1,ratio=Infinity;
      for(let r=0;r<m;r++){
        if(tab[r][enter]<=1e-9) continue;
        const q=tab[r][rhs]/tab[r][enter];
        if(q<ratio-1e-9 || (bland&&Math.abs(q-ratio)<=1e-9&&(leave<0||basis[r]<basis[leave]))){ratio=q;leave=r;}
      }
      if(leave<0) return;
      const pv=tab[leave][enter];
      for(let c=0;c<cols;c++) tab[leave][c]/=pv;
      for(let r=0;r<=m;r++) if(r!==leave){
        const f=tab[r][enter]; if(Math.abs(f)<=1e-9) continue;
        for(let c=0;c<cols;c++) tab[r][c]-=f*tab[leave][c];
      }
      basis[leave]=enter;
      if(!bland&&iter>4*(n+m)+500) bland=true;
    }
  }
  function setObjective(coef){
    tab[m].fill(0);
    for(let c=0;c<cols-1;c++) tab[m][c]=-coef(c);
    for(let r=0;r<m;r++){
      const f=tab[m][basis[r]]; if(Math.abs(f)<=1e-9) continue;
      for(let c=0;c<cols;c++) tab[m][c]-=f*tab[r][c];
    }
  }
  if(artificialCount){
    const aset=new Set(artificial);
    setObjective(c=>aset.has(c)?-1:0); pivot(new Set());
    if(tab[m][rhs]<-1e-7) return null;
    for(let r=0;r<m;r++) if(aset.has(basis[r])){
      let enter=-1;for(let c=0;c<n+m&&enter<0;c++) if(Math.abs(tab[r][c])>1e-9) enter=c;
      if(enter<0) continue;
      const pv=tab[r][enter];for(let c=0;c<cols;c++) tab[r][c]/=pv;
      for(let rr=0;rr<=m;rr++) if(rr!==r){const f=tab[rr][enter];if(Math.abs(f)<=1e-9) continue;for(let c=0;c<cols;c++) tab[rr][c]-=f*tab[r][c];}
      basis[r]=enter;
    }
    setObjective(c=>c<n?Number(objective[c]||0):0); pivot(aset);
  } else {setObjective(c=>c<n?Number(objective[c]||0):0);pivot(new Set());}
  const x=Array(n).fill(0);
  for(let r=0;r<m;r++) if(basis[r]<n) x[basis[r]]=Math.max(0,tab[r][rhs]);
  return {x,duals:Array(m).fill(0)};
}

function globalProducedItems(data){
  if(!data.__produced){data.__produced=new Set(data.recipes.flatMap(r=>(r.outputs||[]).map(x=>Number(x.item))));}
  return data.__produced;
}

function rawOptimize(state,data,allowRecipes=null){
  let recipes=data.recipes.filter(r=>recipeRunnable(r,state,data));
  if(allowRecipes) recipes=recipes.filter(r=>allowRecipes.has(r.id));
  if(!recipes.length) return {ratePerHour:0,rows:[],runnable:[]};
  const n=recipes.length, objective=recipes.map(r=>recipeNetValue(r,data));
  const A=[],b=[];
  for(const [slug,cfg] of Object.entries(state.facilities||{})){
    if(Number(cfg.count||0)<=0) continue;
    const row=Array(n).fill(0); let used=false;
    recipes.forEach((r,i)=>{if(r.facility===slug){row[i]=cycleSeconds(r,state)/3600;used=true;}});
    if(used){A.push(row);b.push(Number(cfg.count||0));}
  }
  const climateWorkers=state.climate?.enabled?1:0;
  const workerCap=Math.max(0,Number(state.workerSlots||0)-climateWorkers);
  A.push(recipes.map(r=>r.electric?0:Math.max(0,cycleSeconds(r,state)-Number(r.growSeconds||0))/3600));b.push(workerCap);

  const globallyProduced=globalProducedItems(data);
  const consumed=new Set(recipes.flatMap(r=>(r.inputs||[]).map(x=>Number(x.item))));
  for(const item of consumed){
    if(!globallyProduced.has(item)) continue;
    const row=recipes.map(r=>{
      const cons=(r.inputs||[]).filter(x=>Number(x.item)===item).reduce((s,x)=>s+Number(x.qty||0),0);
      const prod=(r.outputs||[]).filter(x=>Number(x.item)===item).reduce((s,x)=>s+Number(x.qty||0),0);
      return cons-prod;
    });
    A.push(row);b.push(0);
  }

  const solved=solveLp(objective,A,b); if(!solved) return {ratePerHour:0,rows:[],runnable:recipes.map(r=>r.id)};
  const rows=[];let rate=0;
  recipes.forEach((recipe,i)=>{
    const batches=Math.max(0,Number(solved.x[i]||0)); if(batches<=1e-8) return;
    const cyc=cycleSeconds(recipe,state), units=batches*cyc/3600, perHour=objective[i]*batches;
    rate+=perHour; rows.push({facility:recipe.facility,recipe,batchesPerHour:batches,units,perHour,cycleSeconds:cyc,netValue:objective[i]});
  });
  return {ratePerHour:rate,rows,runnable:recipes.map(r=>r.id)};
}

export function optimizePlan(state,data){
  const first=rawOptimize(state,data,null);
  const groups=new Map();
  for(const row of first.rows){const arr=groups.get(row.facility)||[];arr.push(row);groups.set(row.facility,arr);}
  if([...groups.values()].every(rows=>rows.length<=1)) return first;
  const multi=new Map([...groups].filter(([,rows])=>rows.length>1));
  const runnableSet=new Set(first.runnable);
  const options=new Map();
  for(const facility of multi.keys()) options.set(facility,data.recipes.filter(r=>r.facility===facility&&runnableSet.has(r.id)).map(r=>r.id));
  const fixed=data.recipes.filter(r=>runnableSet.has(r.id)&&!multi.has(r.facility)).map(r=>r.id);
  const solveSelected=sel=>rawOptimize(state,data,new Set([...fixed,...sel.values()]));
  function localSearch(seed,budget=400){
    const sel=new Map(seed);let best=solveSelected(sel),left=budget;
    for(let pass=0;pass<4;pass++){
      let improved=false;
      for(const [facility,ids] of options){
        let current=sel.get(facility);
        for(const id of ids){
          if(id===current||left--<=0) continue;
          sel.set(facility,id);const test=solveSelected(sel);
          if(test.ratePerHour>best.ratePerHour+1e-9){best=test;improved=true;current=id;} else sel.set(facility,current);
        }
      }
      if(!improved||left<=0) break;
    }
    return best;
  }
  const seeds=[];
  seeds.push(new Map([...multi].map(([f,rows])=>[f,[...rows].sort((a,b)=>b.perHour-a.perHour)[0].recipe.id])));
  seeds.push(new Map([...multi].map(([f,rows])=>[f,[...rows].sort((a,b)=>b.units-a.units)[0].recipe.id])));
  seeds.push(new Map([...multi].map(([f])=>{
    const rs=data.recipes.filter(r=>r.facility===f&&runnableSet.has(r.id));
    rs.sort((a,b)=>recipeGrossValue(b,data)-recipeGrossValue(a,data));return [f,rs[0]?.id];
  })));
  let best=null;
  for(const seed of seeds){const test=localSearch(seed);if(!best||test.ratePerHour>best.ratePerHour+1e-9) best=test;}
  return best||first;
}

export function requiredAbilities(plan){
  const map=new Map();
  for(const row of plan.rows){
    const local=new Map();
    for(const s of row.recipe.steps||[]) local.set(s.ability,Math.max(local.get(s.ability)||0,Number(s.level||0)));
    for(const [ability,level] of local){
      const rec=map.get(ability)||{ability,level:0,jobs:new Set(),units:0};rec.level=Math.max(rec.level,level);rec.units+=row.units;map.set(ability,rec);
    }
    for(const s of row.recipe.steps||[]) map.get(s.ability)?.jobs.add(s.name);
  }
  return [...map.values()].map(x=>({...x,jobs:[...x.jobs].sort(),count:Math.max(1,Math.ceil(x.units-1e-9))})).sort((a,b)=>b.level-a.level||a.ability.localeCompare(b.ability));
}

export function pickCoverageCore(demands,stationCap,pals){
  const req=new Map();for(const d of demands) req.set(d.ability,Math.max(req.get(d.ability)||0,d.level));
  const covered=[],uncovered=[];
  for(const [ability,level] of [...req].sort((a,b)=>a[0].localeCompare(b[0]))) (pals.some(p=>Number(p.abilities?.[ability]||0)>=level)?covered:uncovered).push({ability,level});
  if(!covered.length) return {core:[],uncovered,spare:stationCap,shortStations:0};
  const dims=covered.slice(0,16),mask=p=>dims.reduce((m,d,i)=>Number(p.abilities?.[d.ability]||0)>=d.level?m|(1<<i):m,0);
  const score=p=>dims.reduce((s,d)=>Number(p.abilities?.[d.ability]||0)>=d.level?s+Number(p.abilities[d.ability]):s,0);
  const target=(1<<dims.length)-1,dp=new Map([[0,{count:0,score:0,key:'',pals:[]}]]);
  const better=(a,b)=>a.count!==b.count?a.count<b.count:a.score!==b.score?a.score>b.score:a.key<b.key;
  for(const pal of pals.filter(p=>mask(p)).sort((a,b)=>a.name.localeCompare(b.name))){
    const pm=mask(pal);for(const [m,cur] of [...dp]){const nm=m|pm;if(nm===m) continue;const cand={count:cur.count+1,score:cur.score+score(pal),key:cur.key?`${cur.key},${pal.name}`:pal.name,pals:[...cur.pals,pal]};const old=dp.get(nm);if(!old||better(cand,old)) dp.set(nm,cand);}
  }
  const best=dp.get(target),core=best?.pals||[];return {core,uncovered,spare:Math.max(0,stationCap-core.length),shortStations:Math.max(0,core.length-stationCap)};
}

function taskKey(ability,level,family=''){return `${ability}|${level}|${family||''}`;}
function splitManualWork(row){
  const recipe=row.recipe;if(!recipe||recipe.electric) return new Map();
  const manual=Math.max(0,Number(row.cycleSeconds||0)-Number(recipe.growSeconds||0));if(manual<=1e-9) return new Map();
  const steps=recipe.steps||[],rawTotal=Number(recipe.workload||0)+steps.reduce((s,x)=>s+Number(x.workload||0),0);if(rawTotal<=0||!steps.length) return new Map();
  const raw=new Map(),fam=recipe.pet?familyId(recipe.pet):'';
  if(Number(recipe.workload||0)>0){const s=steps[0],k=taskKey(s.ability,s.level,fam);raw.set(k,(raw.get(k)||0)+Number(recipe.workload||0));}
  for(const s of steps){const w=Number(s.workload||0);if(w<=0) continue;const k=taskKey(s.ability,s.level,fam);raw.set(k,(raw.get(k)||0)+w);}
  const out=new Map();for(const [k,v] of raw) out.set(k,manual*v/rawTotal);return out;
}

export function buildTeamModel(plan,state,data){
  const rows=plan.rows.map(row=>({...row,work:splitManualWork(row),netValue:recipeNetValue(row.recipe,data)}));
  const tasks=new Map(),demand=new Map();
  for(const row of rows) for(const [key,sec] of row.work){
    const [ability,lvl,fam]=key.split('|');tasks.set(key,{key,ability,level:Number(lvl),family:fam?Number(fam):null});demand.set(key,(demand.get(key)||0)+sec*row.batchesPerHour);
  }
  const globallyProduced=globalProducedItems(data),consumed=new Set(rows.flatMap(r=>(r.recipe.inputs||[]).map(x=>Number(x.item))));
  const internal=[...consumed].filter(x=>globallyProduced.has(x));
  const caps=new Map(Object.entries(state.facilities||{}).filter(([,x])=>Number(x.count||0)>0).map(([k,x])=>[k,Number(x.count)]));
  return {rows,tasks:[...tasks.values()],baselineDemandSeconds:demand,internalItems:internal,caps,baselineRate:plan.ratePerHour,state,data};
}

export function palCanDo(pal,task){
  if(Number(pal?.abilities?.[task.ability]||0)<Number(task.level||0)) return false;
  if(task.family&&familyId(pal.id)!==task.family) return false;return true;
}

export function evaluateConcreteTeam(model,team){
  const R=model.rows.length,Q=model.tasks.length,edges=[];
  for(let w=0;w<team.length;w++) for(let q=0;q<Q;q++) if(palCanDo(team[w].pal,model.tasks[q])) edges.push({w,q,idx:R+edges.length});
  const N=R+edges.length,objective=Array(N).fill(0);for(let r=0;r<R;r++) objective[r]=model.rows[r].netValue;
  const A=[],b=[];
  for(const [facility,cap] of model.caps){const row=Array(N).fill(0);let used=false;for(let r=0;r<R;r++) if(model.rows[r].facility===facility){row[r]=model.rows[r].cycleSeconds/3600;used=true;}if(used){A.push(row);b.push(cap);}}
  // This model answers how much of the current optimum a concrete team can sustain.
  for(let r=0;r<R;r++){const row=Array(N).fill(0);row[r]=1;A.push(row);b.push(model.rows[r].batchesPerHour);}
  for(const item of model.internalItems){const row=Array(N).fill(0);for(let r=0;r<R;r++){const rec=model.rows[r].recipe;const cons=(rec.inputs||[]).filter(x=>Number(x.item)===item).reduce((s,x)=>s+Number(x.qty||0),0);const prod=(rec.outputs||[]).filter(x=>Number(x.item)===item).reduce((s,x)=>s+Number(x.qty||0),0);row[r]=cons-prod;}A.push(row);b.push(0);}
  for(let w=0;w<team.length;w++){const row=Array(N).fill(0);for(const e of edges) if(e.w===w) row[e.idx]=1;A.push(row);b.push(3600);}
  for(let q=0;q<Q;q++){const row=Array(N).fill(0),key=model.tasks[q].key;for(let r=0;r<R;r++) row[r]=Number(model.rows[r].work.get(key)||0);for(const e of edges) if(e.q===q) row[e.idx]=-1;A.push(row);b.push(0);}
  const solved=solveLp(objective,A,b);if(!solved) return {rate:0,recipeBatches:[],recipeUnits:[]};
  const recipeBatches=solved.x.slice(0,R),recipeUnits=recipeBatches.map((x,r)=>x*model.rows[r].cycleSeconds/3600);let rate=0;for(let r=0;r<R;r++) rate+=objective[r]*Number(recipeBatches[r]||0);
  return {rate,recipeBatches,recipeUnits,x:solved.x};
}

function taskObjects(row){const out=[];for(const [key,seconds] of row.work){const [ability,lvl,fam]=key.split('|');out.push({key,ability,level:Number(lvl),family:fam?Number(fam):null,seconds:Number(seconds||0)});}return out;}
function profileHas(p,l){return !!p&&!!l&&String(p).includes(l);}

export function evaluateIdealPersonalities(model,team,profiles){
  const rows=model.rows,R=rows.length,recipeVars=[],rowVarIndices=Array.from({length:R},()=>[]),genericRows=new Set();
  const add=v=>{v.idx=recipeVars.length;recipeVars.push(v);rowVarIndices[v.r].push(v.idx);};
  for(let r=0;r<R;r++){
    const row=rows[r],tasks=taskObjects(row),letter=FACILITY_PERSONALITY[row.facility]||null;
    if(letter&&tasks.length===1){
      const task=tasks[0];for(let w=0;w<team.length;w++) if(palCanDo(team[w].pal,task)){
        const mult=profileHas(profiles[w],letter)?1.2:1,baseManual=Math.max(0,task.seconds),grow=Math.max(0,row.cycleSeconds-baseManual),workerSeconds=baseManual/mult;
        add({r,w,letter,boosted:mult>1,workerSeconds,occupancySeconds:grow+workerSeconds,netValue:row.netValue});
      }
    } else {genericRows.add(r);add({r,w:null,letter:null,boosted:false,workerSeconds:null,occupancySeconds:row.cycleSeconds,netValue:row.netValue});}
  }
  const alloc=[];for(const r of genericRows){const tasks=taskObjects(rows[r]);for(let ti=0;ti<tasks.length;ti++) for(let w=0;w<team.length;w++) if(palCanDo(team[w].pal,tasks[ti])) alloc.push({r,ti,w,task:tasks[ti],idx:recipeVars.length+alloc.length});}
  const N=recipeVars.length+alloc.length;if(!N) return {rate:0,profiles};const objective=Array(N).fill(0);for(const v of recipeVars) objective[v.idx]=v.netValue;
  const A=[],b=[];
  for(const [facility,cap] of model.caps){const row=Array(N).fill(0);let used=false;for(const v of recipeVars) if(rows[v.r].facility===facility){row[v.idx]=v.occupancySeconds/3600;used=true;}if(used){A.push(row);b.push(cap);}}
  for(const item of model.internalItems){const row=Array(N).fill(0);for(const v of recipeVars){const rec=rows[v.r].recipe;const cons=(rec.inputs||[]).filter(x=>Number(x.item)===item).reduce((s,x)=>s+Number(x.qty||0),0);const prod=(rec.outputs||[]).filter(x=>Number(x.item)===item).reduce((s,x)=>s+Number(x.qty||0),0);row[v.idx]=cons-prod;}A.push(row);b.push(0);}
  for(let w=0;w<team.length;w++){const row=Array(N).fill(0);for(const v of recipeVars) if(v.w===w) row[v.idx]+=Number(v.workerSeconds||0);for(const a of alloc) if(a.w===w) row[a.idx]+=1;A.push(row);b.push(3600);}
  for(const r of genericRows){const tasks=taskObjects(rows[r]),ri=rowVarIndices[r][0];if(ri==null)continue;for(let ti=0;ti<tasks.length;ti++){const row=Array(N).fill(0);row[ri]=tasks[ti].seconds;for(const a of alloc) if(a.r===r&&a.ti===ti) row[a.idx]=-1;A.push(row);b.push(0);}}
  const solved=solveLp(objective,A,b);if(!solved) return {rate:0,profiles};let rate=0;const batches=Array(R).fill(0),boostedByWorker=Array.from({length:team.length},()=>new Set());
  for(const v of recipeVars){const x=Math.max(0,Number(solved.x[v.idx]||0));batches[v.r]+=x;rate+=v.netValue*x;if(v.w!=null&&v.boosted&&x>1e-8) boostedByWorker[v.w].add(rows[v.r].facility);}
  return {rate,profiles,recipeBatches:batches,boostedByWorker};
}

function initialProfiles(model,team){
  return team.map((member,w)=>{
    let best=PERSONALITY_PROFILES[0],score=-1;
    for(const p of PERSONALITY_PROFILES){let s=0;for(const row of model.rows){const letter=FACILITY_PERSONALITY[row.facility];if(!letter||!profileHas(p,letter)) continue;const ts=taskObjects(row);if(ts.length===1&&palCanDo(member.pal,ts[0])) s+=ts[0].seconds*row.batchesPerHour;}if(s>score+1e-9||(Math.abs(s-score)<=1e-9&&p<best)){score=s;best=p;}}
    return best;
  });
}

export async function optimizePersonalities(model,team,onProgress){
  let profiles=initialProfiles(model,team),best=evaluateIdealPersonalities(model,team,profiles);
  for(let round=0;round<3;round++){
    let improved=false;
    for(let w=0;w<team.length;w++){
      const current=profiles[w];let local=current,localBest=best;
      for(const p of PERSONALITY_PROFILES){if(p===current) continue;const test=[...profiles];test[w]=p;const ev=evaluateIdealPersonalities(model,team,test);if(ev.rate>localBest.rate+1e-7||(Math.abs(ev.rate-localBest.rate)<=1e-7&&p<local)){localBest=ev;local=p;}}
      if(local!==current){profiles[w]=local;best=localBest;improved=true;}
      onProgress?.(`Personality round ${round+1} · ${w+1}/${team.length}`);if((w+1)%3===0) await new Promise(r=>setTimeout(r,0));
    }
    if(!improved) break;
  }
  return evaluateIdealPersonalities(model,team,profiles);
}

function relevance(model,pal){let s=0;for(const t of model.tasks) if(palCanDo(pal,t)){const d=Number(model.baselineDemandSeconds.get(t.key)||0)/3600;const over=Math.max(0,Number(pal.abilities?.[t.ability]||0)-t.level);s+=d*(1+over*.03);}return s;}
function normalizeTeam(team){const seen=new Map();return team.map(x=>{const id=Number(x.pal.id),n=(seen.get(id)||0)+1;seen.set(id,n);return {...x,key:`${id}#${n}`,copy:n,label:x.pal.name};});}
function teamKey(team){return team.map(x=>x.key).sort().join('|');}

const BASIC=new Set(['mine','well','farmland','woodland']);
export function burstSlots(model){
  const slots=[];let seq=0;
  for(const row of model.rows){if(!BASIC.has(row.facility)) continue;const tasks=taskObjects(row);if(!tasks.length) continue;
    if(row.facility==='mine'||row.facility==='well'){
      const copies=Math.max(1,Math.ceil(row.units-1e-9));for(let n=1;n<=copies;n++) for(const task of tasks) slots.push({id:`b${seq++}`,facility:row.facility,task,label:`${row.facility==='mine'?'Mine':'Well'} #${n} · ${task.ability}`,weight:row.facility==='mine'?5:4});
    }else{
      const seen=new Set();for(const task of tasks){const k=`${task.ability}|${task.level}|${task.family||''}`;if(seen.has(k)) continue;seen.add(k);slots.push({id:`b${seq++}`,facility:row.facility,task,label:`${row.facility==='farmland'?'Farmland':'Woodland'} · ${task.ability}`,weight:row.facility==='woodland'?4.4:4.2});}
    }
  }
  return slots;
}
export function burstMatch(model,team){
  const slots=burstSlots(model),S=slots.length,W=team.length;if(!S||!W)return{coverageWeight:0,totalWeight:slots.reduce((s,x)=>s+x.weight,0),assignments:[],slots};
  if(S>18){
    const used=new Set(),assignments=[];
    for(const slot of [...slots].sort((a,b)=>b.weight-a.weight||a.label.localeCompare(b.label))){
      let pick=-1,best=-1;
      for(let w=0;w<W;w++){if(used.has(w)||!palCanDo(team[w].pal,slot.task))continue;const over=Math.max(0,Number(team[w].pal.abilities?.[slot.task.ability]||0)-slot.task.level);if(over>best){best=over;pick=w;}}
      if(pick>=0){used.add(pick);assignments.push({worker:pick,slot});}
    }
    return{coverageWeight:assignments.reduce((s,x)=>s+x.slot.weight,0),totalWeight:slots.reduce((s,x)=>s+x.weight,0),assignments,slots};
  }
  const size=1<<S,dp=new Float64Array(size);for(let i=1;i<size;i++)dp[i]=-1e30;let parents=Array.from({length:W},()=>new Int32Array(size).fill(-1)),picked=Array.from({length:W},()=>new Int16Array(size).fill(-1));
  for(let w=0;w<W;w++){
    const next=new Float64Array(dp);const pm=parents[w],ps=picked[w];for(let mask=0;mask<size;mask++){if(dp[mask]<-1e20)continue;for(let s=0;s<S;s++){if(mask&(1<<s)||!palCanDo(team[w].pal,slots[s].task))continue;const nm=mask|(1<<s),over=Math.max(0,Number(team[w].pal.abilities?.[slots[s].task.ability]||0)-slots[s].task.level),val=dp[mask]+slots[s].weight*100+over*2;if(val>next[nm]){next[nm]=val;pm[nm]=mask;ps[nm]=s;}}}dp.set(next);
  }
  let bestMask=0,best=-1;for(let m=0;m<size;m++)if(dp[m]>best){best=dp[m];bestMask=m;}
  // Simpler deterministic assignment reconstruction: greedy against covered mask is enough for display.
  const assignments=[],used=new Set();for(const s of [...slots].sort((a,b)=>b.weight-a.weight)){for(let w=0;w<W;w++)if(!used.has(w)&&palCanDo(team[w].pal,s.task)){used.add(w);assignments.push({worker:w,slot:s});break;}}
  const covered=new Set(assignments.map(x=>x.slot.id));return{coverageWeight:slots.filter(x=>covered.has(x.id)).reduce((s,x)=>s+x.weight,0),totalWeight:slots.reduce((s,x)=>s+x.weight,0),assignments,slots};
}

export function ownedSpecies(state,data){
  const list=[];for(const pal of data.pals){const rec=state.owned?.[String(pal.id)]??state.owned?.[pal.name];if(rec?.enabled&&Number(rec.count||0)>0) list.push({pal,maxCount:Math.max(1,Number(rec.count||1))});}return list;
}

function nextCopy(spec,team){const used=team.filter(x=>Number(x.pal.id)===Number(spec.pal.id)).length;if(used>=spec.maxCount)return null;return{pal:spec.pal,key:`${spec.pal.id}#${used+1}`,copy:used+1,label:spec.pal.name};}

export async function findBestTeams(model,state,data,{limit=4,onProgress}={}){
  const species=ownedSpecies(state,data).filter(s=>model.tasks.some(t=>palCanDo(s.pal,t)));
  const workers=Number(state.workerSlots||0);
  if(species.reduce((sum,x)=>sum+x.maxCount,0)<workers) throw new Error('Not enough enabled Aniimo copies for the requested station slots.');

  const ranked=[...species].sort((a,b)=>relevance(model,b.pal)-relevance(model,a.pal)||a.pal.name.localeCompare(b.pal.name));
  const searchPool=ranked.slice(0,Math.min(36,ranked.length));
  const swapPool=ranked.slice(0,Math.min(24,ranked.length));
  const cache=new Map();
  const exact=team=>{
    const t=normalizeTeam(team),k=teamKey(t);
    if(!cache.has(k)) cache.set(k,evaluateConcreteTeam(model,t));
    return cache.get(k);
  };
  const seeds=[];

  // Coverage/relevance seeds. Different offsets avoid duplicate-heavy tunnel vision.
  for(let mode=0;mode<6;mode++){
    const team=[];
    while(team.length<workers){
      let best=null,bestScore=-Infinity;
      for(let i=0;i<searchPool.length;i++){
        const spec=searchPool[(i+mode)%searchPool.length],cand=nextCopy(spec,team);if(!cand)continue;
        const coverage=model.tasks.reduce((sum,t)=>sum+(palCanDo(cand.pal,t)?Number(model.baselineDemandSeconds.get(t.key)||0):0),0);
        const score=coverage*1000+relevance(model,cand.pal)*100-i*.0001;
        if(score>bestScore){bestScore=score;best=cand;}
      }
      if(!best)break;team.push(best);
    }
    if(team.length===workers) seeds.push(normalizeTeam(team));
  }

  // Simple relevance rotations are especially good when copies of a few species dominate.
  for(let off=0;off<Math.min(5,searchPool.length);off++){
    const team=[];let cursor=off,guard=0;
    while(team.length<workers&&guard++<workers*searchPool.length*2){const spec=searchPool[cursor%searchPool.length],cand=nextCopy(spec,team);if(cand)team.push(cand);cursor++;}
    if(team.length===workers)seeds.push(normalizeTeam(team));
  }

  const unique=new Map(seeds.map(t=>[teamKey(t),t])),candidates=[];let si=0;
  for(const team of unique.values()){
    si++;onProgress?.(`Seed ${si}/${unique.size}`);
    candidates.push({team,eval:exact(team),burst:burstMatch(model,team)});
    if(si%2===0)await new Promise(r=>setTimeout(r,0));
  }
  candidates.sort((a,b)=>b.eval.rate-a.eval.rate||b.burst.coverageWeight-a.burst.coverageWeight);

  const capped=candidates.filter(x=>x.eval.rate>=model.baselineRate-.51);
  if(capped.length){
    // Coin cap is already solved. From here only improve burst resilience while
    // refusing any swap that drops below the cap.
    let best=[...capped].sort((a,b)=>b.burst.coverageWeight-a.burst.coverageWeight)[0];
    for(let round=0;round<2;round++){
      let improved=false;
      for(let pos=0;pos<best.team.length;pos++){
        const reduced=best.team.filter((_,i)=>i!==pos);
        for(const spec of swapPool){
          const cand=nextCopy(spec,reduced);if(!cand)continue;
          const test=normalizeTeam([...reduced,cand]);
          const bm=burstMatch(model,test);
          if(bm.coverageWeight<=best.burst.coverageWeight+1e-9)continue;
          const ev=exact(test);
          if(ev.rate>=model.baselineRate-.51){best={team:test,eval:ev,burst:bm};improved=true;}
        }
      }
      onProgress?.(`Anti-stall refine ${round+1}/2`);await new Promise(r=>setTimeout(r,0));
      if(!improved)break;
    }
    const out=[best,...capped.filter(x=>teamKey(x.team)!==teamKey(best.team))]
      .sort((a,b)=>b.eval.rate-a.eval.rate||b.burst.coverageWeight-a.burst.coverageWeight);
    return out.slice(0,limit);
  }

  let beam=candidates.slice(0,3);
  for(let round=0;round<3;round++){
    const next=[];let improved=false;
    for(let ci=0;ci<beam.length;ci++){
      let bestTeam=beam[ci].team,bestEval=beam[ci].eval,bestBurst=beam[ci].burst;
      for(let pos=0;pos<bestTeam.length;pos++){
        const reduced=bestTeam.filter((_,i)=>i!==pos);
        for(const spec of swapPool){
          const cand=nextCopy(spec,reduced);if(!cand)continue;
          const test=normalizeTeam([...reduced,cand]),ev=exact(test),bm=burstMatch(model,test);
          const rateBetter=ev.rate>bestEval.rate+.01;
          const bothCapped=ev.rate>=model.baselineRate-.51&&bestEval.rate>=model.baselineRate-.51;
          const burstBetter=bothCapped&&bm.coverageWeight>bestBurst.coverageWeight+1e-9;
          if(rateBetter||burstBetter){bestTeam=test;bestEval=ev;bestBurst=bm;improved=true;}
        }
      }
      next.push({team:bestTeam,eval:bestEval,burst:bestBurst});
      onProgress?.(`Refine ${ci+1}/${beam.length} · round ${round+1}`);await new Promise(r=>setTimeout(r,0));
    }
    const d=new Map();for(const x of [...beam,...next]){const k=teamKey(x.team),old=d.get(k);if(!old||x.eval.rate>old.eval.rate+.01||(Math.abs(x.eval.rate-old.eval.rate)<=.01&&x.burst.coverageWeight>old.burst.coverageWeight))d.set(k,x);}
    beam=[...d.values()].sort((a,b)=>b.eval.rate-a.eval.rate||b.burst.coverageWeight-a.burst.coverageWeight).slice(0,3);
    if(!improved)break;
  }
  return beam.slice(0,limit);
}

export function findEssentialCore(model,team,targetRate){
  let core=normalizeTeam(team),changed=true;
  while(changed){changed=false;for(let i=core.length-1;i>=0;i--){const test=normalizeTeam(core.filter((_,j)=>j!==i)),ev=evaluateConcreteTeam(model,test);if(ev.rate>=targetRate-.51){core=test;changed=true;break;}}}
  return core;
}

export function antiStallSummary(model,full,core){
  const need=new Map();for(const x of core)need.set(Number(x.pal.id),(need.get(Number(x.pal.id))||0)+1);const reserves=[];
  for(const x of full){const id=Number(x.pal.id),n=need.get(id)||0;if(n>0)need.set(id,n-1);else reserves.push(x);}
  const match=burstMatch(model,full),byFacility=new Map();for(const slot of match.slots){const rec=byFacility.get(slot.facility)||{total:0,hit:0};rec.total++;byFacility.set(slot.facility,rec);}for(const a of match.assignments)byFacility.get(a.slot.facility).hit++;
  return {reserves,match,byFacility};
}
