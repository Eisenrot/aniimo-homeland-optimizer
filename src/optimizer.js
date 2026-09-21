const MODULE_SLUGS={
  'Ecological Module':'ecological-module','Resource Detector':'resource-detector',
  'Kitchen Module':'kitchen-module','Crafting Module':'crafting-module'
};

export const PERSONALITY_PAIRS=[['E','I'],['N','S'],['F','T'],['J','P']];
export const PERSONALITY_NAMES={E:'Energetic',I:'Instinctive',N:'Nimble',S:'Practical',F:'Faithful',T:'Tenacious',J:'Judicious',P:'Playful'};
export const FACILITY_PERSONALITY={
  'bouncy-brew-keg':'E','woodworking-bench':'E','phonolfactory-table':'I','dewy-house':'I',
  'blazing-stove':'N','jukebox-dryer':'N','floral-windmill':'N','chimney-kiln':'S','claw-game-cooker':'S',
  'joy-wheel-loom':'F','starfall-hammock':'F','well':'F','carousel-mill':'T','simmering-pot':'T',
  'crafting-table':'J','nimbus-bed':'J','tidewhisper-sandcastle':'J','pickling-jar':'P','mine':'P'
};
export const PERSONALITY_PROFILES=(()=>{const out=[];for(const a of PERSONALITY_PAIRS[0])for(const b of PERSONALITY_PAIRS[1])for(const c of PERSONALITY_PAIRS[2])for(const d of PERSONALITY_PAIRS[3])out.push(a+b+c+d);return out;})();

const TEMP_ORDER=['Freeze','Cool','Adequate','Warm','Scorching'];
const UTILITY_ABILITY={cooling:{facility:'cooling-unit',ability:'Ice',level:1},heat:{facility:'heat-furnace',ability:'Fire',level:1},sunlamp:{facility:'sunlamp',ability:'Light',level:1},generator:{facility:'crackle-generator',ability:'Lightning',level:1}};
const BASIC=new Set(['mine','well','farmland','woodland']);

export function familyId(id){const n=Number(id);return Number.isFinite(n)?Math.floor(n/1000):null;}
export function itemValue(data,id){return Number(data.items?.[String(id)]?.value??0)||0;}
export function itemName(data,id){return data.items?.[String(id)]?.name??String(id);}
export function recipeNetValue(recipe,data){let v=0;for(const o of recipe.outputs||[])v+=itemValue(data,o.item)*Number(o.qty||0);for(const i of recipe.inputs||[])v-=itemValue(data,i.item)*Number(i.qty||0);return v;}
export function recipeGrossValue(recipe,data){return (recipe.outputs||[]).reduce((s,o)=>s+itemValue(data,o.item)*Number(o.qty||0),0);}
export function recipeNetItem(recipe,item){const id=Number(item);let v=0;for(const o of recipe.outputs||[])if(Number(o.item)===id)v+=Number(o.qty||0);for(const i of recipe.inputs||[])if(Number(i.item)===id)v-=Number(i.qty||0);return v;}
export function manualWorkload(recipe){return Number(recipe.workload||0)+(recipe.steps||[]).reduce((s,x)=>s+Number(x.workload||0),0);}

function facilityStacks(state,slug){
  const cfg=state.facilities?.[slug];if(!cfg)return[];
  if(Array.isArray(cfg.stacks))return cfg.stacks.filter(x=>Number(x.count||0)>0).map(x=>({count:Number(x.count||0),level:Number(x.level||1)}));
  return Number(cfg.count||0)>0?[{count:Number(cfg.count||0),level:Number(cfg.level||1)}]:[];
}
function facilityCount(state,slug){return facilityStacks(state,slug).reduce((s,x)=>s+x.count,0);}
function maxFacilityLevel(state,slug){return facilityStacks(state,slug).reduce((m,x)=>Math.max(m,x.level),0);}
function facilityOutputLimit(data,slug,level){const f=data.facilities.find(x=>x.slug===slug);return Number(f?.outputLimit?.[String(level)]??f?.outputLimit?.[level]??0)||0;}

function enabledPals(state,data){return data.pals.filter(p=>{const r=state.owned?.[String(p.id)]??state.owned?.[p.name];return !!r?.enabled&&Number(r.count||0)>0;});}
function enabledFamilySet(state,data){const out=new Set();for(const p of enabledPals(state,data))out.add(familyId(p.id));return out;}
function abilityAvailable(step,state,data,family=null){
  if(String(state.abilityLevel)==='auto')return enabledPals(state,data).some(p=>(!family||familyId(p.id)===family)&&Number(p.abilities?.[step.ability]||0)>=Number(step.level||0));
  return Number(step.level||0)<=Number(state.abilityLevel||1);
}
function noteEnabled(recipe,state){return !recipe.note||state.recipeNotes?.[String(recipe.note.item)]!==false;}

function weatherRatio(required,scenario){
  if(!required)return 1;
  if(required==='Adequate')return scenario.sunlamp?1:0;
  const temps=[];if(scenario.cooling)temps.push(scenario.cooling);if(scenario.heat)temps.push(scenario.heat);
  if(!temps.length)return 0;
  const a=TEMP_ORDER.indexOf(required);if(a<0)return 0;let best=0;
  for(const current of temps){const b=TEMP_ORDER.indexOf(current);if(b<0)continue;const d=Math.min(Math.abs(a-b),4);best=Math.max(best,[1,.8,.5,.2,.2][d]);}
  return best;
}

function cycleParts(recipe,state,scenario,personalityMultiplier=1){
  const weather=weatherRatio(recipe.env,scenario);if(recipe.env&&weather<=0)return{cycle:Infinity,manual:Infinity,grow:Infinity,weather:0};
  if(recipe.electric){const g=Number(recipe.growSeconds||0)/(weather||1);return{cycle:g,manual:0,grow:g,weather:weather||1};}
  const pct=Math.max(1,Number(state.speeds?.[recipe.facility]??100));
  const fed=state.hungry?.2:1,speed=(pct/100)*Math.max(.01,Number(personalityMultiplier||1))*fed;
  const manual=manualWorkload(recipe)>0?manualWorkload(recipe)/speed:0;
  const grow=Number(recipe.growSeconds||0),ratio=weather||1;
  return{cycle:(grow+manual)/ratio,manual:manual/ratio,grow:grow/ratio,weather:ratio};
}
export function cycleSeconds(recipe,state,scenario={cooling:null,heat:null,sunlamp:false,generator:false},personalityMultiplier=1){return cycleParts(recipe,state,scenario,personalityMultiplier).cycle;}

export function recipeRunnable(recipe,state,data,scenario={cooling:null,heat:null,sunlamp:false,generator:false}){
  if(facilityCount(state,recipe.facility)<=0||Number(recipe.level||1)>maxFacilityLevel(state,recipe.facility))return false;
  const fac=data.facilities.find(x=>x.slug===recipe.facility);
  if(recipe.electric&&(!scenario.generator||Number(state.homelandLevel||1)<Number(fac?.electricHomeLevel||12)))return false;
  if(!noteEnabled(recipe,state))return false;
  if(recipe.module){const slug=MODULE_SLUGS[recipe.module.name];if(!slug||Number(state.modules?.[slug]||0)<Number(recipe.module.level||0))return false;}
  if(recipe.env&&weatherRatio(recipe.env,scenario)<=0)return false;
  const fam=recipe.pet?familyId(recipe.pet):null;
  if(fam&&!enabledFamilySet(state,data).has(fam))return false;
  if(!recipe.electric)for(const step of recipe.steps||[])if(!abilityAvailable(step,state,data,fam))return false;
  return true;
}

// Two-phase simplex: maximise c*x subject to A*x <= b, x>=0.
export function solveLp(objective,A,b){
  const m=A.length,n=objective.length;if(!m)return{x:Array(n).fill(0),duals:[]};
  const neg=b.map(v=>v<-1e-9),artificialCount=neg.reduce((s,x)=>s+(x?1:0),0),cols=n+m+artificialCount+1,rhs=cols-1;
  const tab=Array.from({length:m+1},()=>Array(cols).fill(0)),basis=Array(m).fill(0),artificial=[];let next=n+m;
  for(let r=0;r<m;r++){const sign=neg[r]?-1:1;for(let c=0;c<n;c++)tab[r][c]=sign*Number(A[r][c]||0);tab[r][n+r]=sign;tab[r][rhs]=sign*Number(b[r]||0);if(neg[r]){tab[r][next]=1;basis[r]=next;artificial.push(next++);}else basis[r]=n+r;}
  const limit=20*(n+m)+2500;
  function pivot(forbidden){let bland=false;for(let iter=0;iter<limit;iter++){let enter=-1;if(bland){for(let c=0;c<cols-1;c++)if(!forbidden.has(c)&&tab[m][c]<-1e-9){enter=c;break;}}else{let best=-1e-9;for(let c=0;c<cols-1;c++)if(!forbidden.has(c)&&tab[m][c]<best){best=tab[m][c];enter=c;}}if(enter<0)return;let leave=-1,ratio=Infinity;for(let r=0;r<m;r++){if(tab[r][enter]<=1e-9)continue;const q=tab[r][rhs]/tab[r][enter];if(q<ratio-1e-9||(bland&&Math.abs(q-ratio)<=1e-9&&(leave<0||basis[r]<basis[leave]))){ratio=q;leave=r;}}if(leave<0)return;const pv=tab[leave][enter];for(let c=0;c<cols;c++)tab[leave][c]/=pv;for(let r=0;r<=m;r++)if(r!==leave){const f=tab[r][enter];if(Math.abs(f)<=1e-9)continue;for(let c=0;c<cols;c++)tab[r][c]-=f*tab[leave][c];}basis[leave]=enter;if(!bland&&iter>4*(n+m)+500)bland=true;}}
  function setObjective(coef){tab[m].fill(0);for(let c=0;c<cols-1;c++)tab[m][c]=-coef(c);for(let r=0;r<m;r++){const f=tab[m][basis[r]];if(Math.abs(f)<=1e-9)continue;for(let c=0;c<cols;c++)tab[m][c]-=f*tab[r][c];}}
  if(artificialCount){const aset=new Set(artificial);setObjective(c=>aset.has(c)?-1:0);pivot(new Set());if(tab[m][rhs]<-1e-7)return null;for(let r=0;r<m;r++)if(aset.has(basis[r])){let enter=-1;for(let c=0;c<n+m&&enter<0;c++)if(Math.abs(tab[r][c])>1e-9)enter=c;if(enter<0)continue;const pv=tab[r][enter];for(let c=0;c<cols;c++)tab[r][c]/=pv;for(let rr=0;rr<=m;rr++)if(rr!==r){const f=tab[rr][enter];if(Math.abs(f)<=1e-9)continue;for(let c=0;c<cols;c++)tab[rr][c]-=f*tab[r][c];}basis[r]=enter;}setObjective(c=>c<n?Number(objective[c]||0):0);pivot(aset);}else{setObjective(c=>c<n?Number(objective[c]||0):0);pivot(new Set());}
  const x=Array(n).fill(0);for(let r=0;r<m;r++)if(basis[r]<n)x[basis[r]]=Math.max(0,tab[r][rhs]);return{x,duals:Array(m).fill(0)};
}

function globalProducedItems(data){if(!data.__produced)data.__produced=new Set(data.recipes.flatMap(r=>(r.outputs||[]).map(x=>Number(x.item))));return data.__produced;}
function objectiveSpecs(state,data){
  const primary=state.target&&state.target!=='coin'?String(state.target):'coin',seen=new Set([primary]),out=[{key:'primary',item:primary,label:primary==='coin'?'Home Coin':itemName(data,primary)}];
  for(const g of state.guarantees||[]){const item=String(g.item||'');if(!g.maximize||!item||seen.has(item))continue;seen.add(item);out.push({key:`co:${item}`,item,label:itemName(data,item)});}
  return out;
}
function objectivePartCoef(recipe,spec,data){return spec.item==='coin'?recipeNetValue(recipe,data):recipeNetItem(recipe,spec.item);}
function objectiveCoef(recipe,state,data){return objectivePartCoef(recipe,objectiveSpecs(state,data)[0],data);}
function buildObjectiveWeights(recipes,state,data,A,b){
  const specs=objectiveSpecs(state,data);if(specs.length===1)return[{...specs[0],scale:1,normalizer:1,max:null}];
  const out=[];for(const spec of specs){const c=recipes.map(r=>objectivePartCoef(r,spec,data)),solved=solveLp(c,A,b);let max=0;if(solved)for(let i=0;i<c.length;i++)max+=c[i]*Number(solved.x[i]||0);if(spec.key==='primary'||max>1e-8){const normalizer=Math.max(1e-8,Math.abs(max));out.push({...spec,scale:1/normalizer,normalizer,max});}}
  return out.length?out:[{...specs[0],scale:1,normalizer:1,max:null}];
}
function combinedObjectiveCoef(recipe,state,data,weights=null){const ws=weights?.length?weights:[{...objectiveSpecs(state,data)[0],scale:1}];return ws.reduce((sum,w)=>sum+objectivePartCoef(recipe,w,data)*Number(w.scale||0),0);}
function utilityWorkerCount(scenario){return Number(!!scenario.cooling)+Number(!!scenario.heat)+Number(!!scenario.sunlamp)+Number(!!scenario.generator);}
function scenarioKey(s){return `${s.cooling||'-'}|${s.heat||'-'}|${s.sunlamp?'sun':'-'}|${s.generator?'gen':'-'}`;}
function scenarioLabel(s){const out=[];if(s.cooling)out.push(`Cooling: ${s.cooling}`);if(s.heat)out.push(`Heat: ${s.heat}`);if(s.sunlamp)out.push('Sunlamp: Adequate');if(s.generator)out.push('Crackle Generator');return out.length?out.join(' · '):'No utility building used';}

function addFacilityConstraints(A,b,recipes,state,data,scenario){
  const n=recipes.length;
  const slugs=[...new Set(recipes.map(r=>r.facility))];
  for(const slug of slugs){
    const stacks=facilityStacks(state,slug);if(!stacks.length)continue;
    const thresholds=[...new Set(recipes.filter(r=>r.facility===slug).map(r=>Number(r.level||1)))].sort((a,b)=>a-b);
    for(const lvl of thresholds){
      const cap=stacks.filter(x=>x.level>=lvl).reduce((s,x)=>s+x.count,0);if(cap<=0)continue;
      const row=Array(n).fill(0);let used=false;
      recipes.forEach((r,i)=>{if(r.facility===slug&&Number(r.level||1)>=lvl){row[i]=cycleParts(r,state,scenario).cycle/3600;used=true;}});
      if(used){A.push(row);b.push(cap);}
      const collect=Number(state.collectHours||0);if(collect>0){
        const batchCap=stacks.filter(x=>x.level>=lvl).reduce((s,x)=>s+x.count*facilityOutputLimit(data,slug,x.level),0);
        if(batchCap>0){const cr=Array(n).fill(0);let cu=false;recipes.forEach((r,i)=>{if(r.facility===slug&&Number(r.level||1)>=lvl){cr[i]=collect;cu=true;}});if(cu){A.push(cr);b.push(batchCap);}}
      }
    }
  }
}
function addMaterialBalance(A,b,recipes,data){
  const n=recipes.length,globallyProduced=globalProducedItems(data),consumed=new Set(recipes.flatMap(r=>(r.inputs||[]).map(x=>Number(x.item))));
  for(const item of consumed){if(!globallyProduced.has(item))continue;const row=recipes.map(r=>-recipeNetItem(r,item));A.push(row);b.push(0);}
}
function addGuarantees(A,b,recipes,state){
  for(const g of state.guarantees||[]){const item=Number(g.item),minimum=Math.max(0,Number(g.perHour||0));if(!item||minimum<=0)continue;A.push(recipes.map(r=>-recipeNetItem(r,item)));b.push(-minimum);}
}
function recipeLaborSeconds(recipe,state,scenario){const parts=cycleParts(recipe,state,scenario);return recipe.pet?Math.max(parts.cycle,parts.manual):parts.manual;}

function rawOptimize(state,data,scenario,allowRecipes=null,forcedWeights=null){
  let recipes=data.recipes.filter(r=>recipeRunnable(r,state,data,scenario));if(allowRecipes)recipes=recipes.filter(r=>allowRecipes.has(r.id));
  if(!recipes.length)return{ratePerHour:0,targetRate:0,objectiveRate:0,rows:[],runnableRecipes:[],scenario,scenarioLabel:scenarioLabel(scenario),utilityWorkers:utilityWorkerCount(scenario),infeasible:false,objectiveWeights:forcedWeights||[]};
  const n=recipes.length,A=[],b=[];
  addFacilityConstraints(A,b,recipes,state,data,scenario);
  const workerLimit=Number(state.workerSlots||0);if(workerLimit>0){A.push(recipes.map(r=>r.electric?0:recipeLaborSeconds(r,state,scenario)/3600));b.push(Math.max(0,workerLimit-utilityWorkerCount(scenario)));}
  addMaterialBalance(A,b,recipes,data);addGuarantees(A,b,recipes,state);
  const objectiveWeights=forcedWeights?.length?forcedWeights:buildObjectiveWeights(recipes,state,data,A,b),objective=recipes.map(r=>combinedObjectiveCoef(r,state,data,objectiveWeights));
  const solved=solveLp(objective,A,b);if(!solved)return{ratePerHour:0,targetRate:0,objectiveRate:-Infinity,rows:[],runnableRecipes:recipes,scenario,scenarioLabel:scenarioLabel(scenario),utilityWorkers:utilityWorkerCount(scenario),infeasible:true,objectiveWeights};
  const rows=[];let coin=0,target=0,obj=0;
  recipes.forEach((recipe,i)=>{const batches=Math.max(0,Number(solved.x[i]||0));if(batches<=1e-8)return;const parts=cycleParts(recipe,state,scenario),units=batches*parts.cycle/3600,coinPart=recipeNetValue(recipe,data)*batches,targetPart=state.target&&state.target!=='coin'?recipeNetItem(recipe,state.target)*batches:coinPart;coin+=coinPart;target+=targetPart;obj+=objective[i]*batches;rows.push({facility:recipe.facility,recipe,batchesPerHour:batches,units,perHour:coinPart,targetPerHour:targetPart,cycleSeconds:parts.cycle,manualSeconds:parts.manual,netValue:recipeNetValue(recipe,data)});});
  return{ratePerHour:coin,targetRate:target,objectiveRate:obj,rows,runnableRecipes:recipes,scenario,scenarioLabel:scenarioLabel(scenario),utilityWorkers:utilityWorkerCount(scenario),infeasible:false,objectiveWeights};
}
function oneRecipeOptimize(state,data,scenario,mixed){
  const runnableSet=new Set(mixed.runnableRecipes.map(r=>r.id)),byFacility=new Map();
  for(const r of mixed.runnableRecipes){const arr=byFacility.get(r.facility)||[];arr.push(r);byFacility.set(r.facility,arr);}
  const options=new Map([...byFacility].filter(([,rs])=>rs.length>1).map(([f,rs])=>[f,rs.map(r=>r.id)]));
  if(!options.size)return mixed;
  const fixed=[...byFacility].filter(([,rs])=>rs.length===1).map(([,rs])=>rs[0].id);
  const solveSelected=sel=>rawOptimize(state,data,scenario,new Set([...fixed,...sel.values()]),mixed.objectiveWeights);
  function localSearch(seed,budget=450){const sel=new Map(seed);let best=solveSelected(sel),left=budget;for(let pass=0;pass<4;pass++){let improved=false;for(const [facility,ids] of options){let current=sel.get(facility);for(const id of ids){if(id===current||left--<=0)continue;sel.set(facility,id);const test=solveSelected(sel);if(test.objectiveRate>best.objectiveRate+1e-9){best=test;improved=true;current=id;}else sel.set(facility,current);}}if(!improved||left<=0)break;}return best;}
  const seeds=[];const activeByFacility=new Map();for(const row of mixed.rows){const arr=activeByFacility.get(row.facility)||[];arr.push(row);activeByFacility.set(row.facility,arr);}const seedFrom=(pick)=>new Map([...options].map(([f,ids])=>{const active=activeByFacility.get(f)||[];if(active.length)return[f,pick(active).recipe.id];const rs=data.recipes.filter(r=>r.facility===f&&ids.includes(r.id));return[f,rs.sort((a,b)=>recipeGrossValue(b,data)-recipeGrossValue(a,data))[0]?.id];}));
  seeds.push(seedFrom(rows=>[...rows].sort((a,b)=>b.targetPerHour-a.targetPerHour)[0]));seeds.push(seedFrom(rows=>[...rows].sort((a,b)=>b.units-a.units)[0]));seeds.push(new Map([...options].map(([f,ids])=>{const rs=data.recipes.filter(r=>r.facility===f&&ids.includes(r.id));rs.sort((a,b)=>recipeGrossValue(b,data)-recipeGrossValue(a,data));return[f,rs[0]?.id];})));
  let best=null;for(const seed of seeds){const test=localSearch(seed);if(!best||test.objectiveRate>best.objectiveRate+1e-9)best=test;}return best||mixed;
}

function scenarios(state){
  const cooling=state.climateOptions?.cooling?[null,'Cool','Freeze']:[null],heat=state.climateOptions?.heat?[null,'Warm','Scorching']:[null],sun=state.climateOptions?.sunlamp?[false,true]:[false],gen=state.generatorAvailable?[false,true]:[false];
  const out=[];for(const c of cooling)for(const h of heat)for(const s of sun)for(const g of gen)out.push({cooling:c,heat:h,sunlamp:s,generator:g});return out;
}
export function optimizePlan(state,data){
  const scenarioList=scenarios(state),specs=objectiveSpecs(state,data);let sharedWeights=null;
  if(specs.length>1){
    const maxima=new Map(specs.map(s=>[s.key,0]));
    for(const scenario of scenarioList){const probe=rawOptimize(state,data,scenario);for(const w of probe.objectiveWeights||[])if(Number.isFinite(w.max)&&w.max>Number(maxima.get(w.key)||0))maxima.set(w.key,w.max);}
    sharedWeights=specs.map(spec=>{const max=Number(maxima.get(spec.key)||0),normalizer=Math.max(1e-8,Math.abs(max));return{...spec,scale:1/normalizer,normalizer,max};});
  }
  let best=null;const tested=[];
  for(const scenario of scenarioList){
    let plan=rawOptimize(state,data,scenario,null,sharedWeights);if(state.oneRecipePerFacility&&!plan.infeasible)plan=oneRecipeOptimize(state,data,scenario,plan);tested.push(plan);
    if(plan.infeasible)continue;
    if(!best||plan.objectiveRate>best.objectiveRate+1e-8||(Math.abs(plan.objectiveRate-best.objectiveRate)<=1e-8&&plan.utilityWorkers<best.utilityWorkers))best=plan;
  }
  if(!best)return{ratePerHour:0,targetRate:0,objectiveRate:0,rows:[],runnableRecipes:[],scenario:{},scenarioLabel:'No feasible plan',utilityWorkers:0,infeasible:true,tested,objectiveWeights:sharedWeights||[]};
  best.testedScenarios=tested.length;return best;
}
export function planItemRates(plan,data){
  const rates=new Map();for(const row of plan.rows){const b=row.batchesPerHour;for(const o of row.recipe.outputs||[])rates.set(Number(o.item),(rates.get(Number(o.item))||0)+Number(o.qty||0)*b);for(const i of row.recipe.inputs||[])rates.set(Number(i.item),(rates.get(Number(i.item))||0)-Number(i.qty||0)*b);}
  return[...rates].map(([item,rate])=>({item,rate,name:itemName(data,item),value:itemValue(data,item),coinPerHour:Math.max(0,rate)*itemValue(data,item)}));
}
export function externalInputs(plan,data){const produced=globalProducedItems(data);return planItemRates(plan,data).filter(x=>x.rate< -1e-8&&!produced.has(Number(x.item))).map(x=>({...x,perHour:-x.rate,costPerHour:-x.rate*x.value}));}

export function livingFacilityGroups(state,data){
  const groups=new Map(),owned=enabledPals(state,data);
  for(const r of data.recipes.filter(x=>x.pet)){const fam=familyId(r.pet),g=groups.get(fam)||{family:fam,pet:r.pet,petName:r.petName||'Required Aniimo',facility:r.facility,recipes:[],outputs:new Map()};g.recipes.push(r);for(const o of r.outputs||[])g.outputs.set(Number(o.item),itemName(data,o.item));groups.set(fam,g);}
  return[...groups.values()].map(g=>({...g,owned:owned.filter(p=>familyId(p.id)===g.family),outputs:[...g.outputs].map(([item,name])=>({item,name}))}));
}

export function requiredAbilities(plan){
  const map=new Map();
  for(const row of plan.rows){const local=new Map();for(const s of row.recipe.steps||[])local.set(s.ability,Math.max(local.get(s.ability)||0,Number(s.level||0)));for(const [ability,level] of local){const rec=map.get(ability)||{ability,level:0,jobs:new Set(),units:0};rec.level=Math.max(rec.level,level);rec.units+=row.units;map.set(ability,rec);}for(const s of row.recipe.steps||[])map.get(s.ability)?.jobs.add(s.name);}
  for(const u of utilityTasksForScenario(plan.scenario)){const rec=map.get(u.ability)||{ability:u.ability,level:0,jobs:new Set(),units:0};rec.level=Math.max(rec.level,u.level);rec.units+=1;rec.jobs.add(u.name);map.set(u.ability,rec);}
  return[...map.values()].map(x=>({...x,jobs:[...x.jobs].sort(),count:Math.max(1,Math.ceil(x.units-1e-9))})).sort((a,b)=>b.level-a.level||a.ability.localeCompare(b.ability));
}
export function pickCoverageCore(demands,stationCap,pals){
  const req=new Map();for(const d of demands)req.set(d.ability,Math.max(req.get(d.ability)||0,d.level));const covered=[],uncovered=[];for(const [ability,level] of [...req].sort((a,b)=>a[0].localeCompare(b[0])))(pals.some(p=>Number(p.abilities?.[ability]||0)>=level)?covered:uncovered).push({ability,level});if(!covered.length)return{core:[],uncovered,spare:stationCap,shortStations:0};
  const dims=covered.slice(0,16),mask=p=>dims.reduce((m,d,i)=>Number(p.abilities?.[d.ability]||0)>=d.level?m|(1<<i):m,0),score=p=>dims.reduce((s,d)=>Number(p.abilities?.[d.ability]||0)>=d.level?s+Number(p.abilities[d.ability]):s,0),target=(1<<dims.length)-1,dp=new Map([[0,{count:0,score:0,key:'',pals:[]}]]),better=(a,b)=>a.count!==b.count?a.count<b.count:a.score!==b.score?a.score>b.score:a.key<b.key;
  for(const pal of pals.filter(p=>mask(p)).sort((a,b)=>a.name.localeCompare(b.name))){const pm=mask(pal);for(const [m,cur] of [...dp]){const nm=m|pm;if(nm===m)continue;const cand={count:cur.count+1,score:cur.score+score(pal),key:cur.key?`${cur.key},${pal.name}`:pal.name,pals:[...cur.pals,pal]},old=dp.get(nm);if(!old||better(cand,old))dp.set(nm,cand);}}
  const best=dp.get(target),core=best?.pals||[];return{core,uncovered,spare:Math.max(0,stationCap-core.length),shortStations:Math.max(0,core.length-stationCap)};
}

function taskKey(ability,level,family='',tag=''){return`${ability}|${level}|${family||''}|${tag||''}`;}
function splitRecipeWork(recipe,state,scenario){
  if(recipe.electric)return new Map();const parts=cycleParts(recipe,state,scenario),steps=recipe.steps||[],fam=recipe.pet?familyId(recipe.pet):'';
  if(recipe.pet){const s=steps[0]||{ability:'Leisure',level:1};return new Map([[taskKey(s.ability,s.level,fam,recipe.facility),parts.cycle]]);}
  const rawTotal=manualWorkload(recipe);if(parts.manual<=1e-9||rawTotal<=0||!steps.length)return new Map();const raw=new Map();if(Number(recipe.workload||0)>0){const s=steps[0],k=taskKey(s.ability,s.level,fam,'');raw.set(k,(raw.get(k)||0)+Number(recipe.workload||0));}for(const s of steps){const w=Number(s.workload||0);if(w<=0)continue;const k=taskKey(s.ability,s.level,fam,'');raw.set(k,(raw.get(k)||0)+w);}const out=new Map();for(const[k,v]of raw)out.set(k,parts.manual*v/rawTotal);return out;
}
function utilityTasksForScenario(scenario){const out=[];for(const key of ['cooling','heat','sunlamp','generator'])if(scenario?.[key]){const x=UTILITY_ABILITY[key];out.push({key:taskKey(x.ability,x.level,'',x.facility),ability:x.ability,level:x.level,family:null,facility:x.facility,name:x.facility.replaceAll('-',' '),seconds:3600,fixed:true});}return out;}
function makeCandidateRows(plan,state,data){const source=state.oneRecipePerFacility?plan.rows.map(r=>r.recipe):(plan.runnableRecipes||[]);const uniq=[...new Map(source.map(r=>[r.id,r])).values()];return uniq.map(recipe=>{const parts=cycleParts(recipe,state,plan.scenario);return{facility:recipe.facility,recipe,cycleSeconds:parts.cycle,manualSeconds:parts.manual,work:splitRecipeWork(recipe,state,plan.scenario),netValue:recipeNetValue(recipe,data),objective:combinedObjectiveCoef(recipe,state,data,plan.objectiveWeights)};});}

export function buildTeamModel(plan,state,data){
  const rows=makeCandidateRows(plan,state,data),tasks=new Map(),baselineDemandSeconds=new Map(),fixedTaskSeconds=new Map();
  for(const row of rows)for(const[key]of row.work){const [ability,lvl,fam,tag]=key.split('|');tasks.set(key,{key,ability,level:Number(lvl),family:fam?Number(fam):null,tag});}
  for(const row of plan.rows){const work=splitRecipeWork(row.recipe,state,plan.scenario);for(const[key,sec]of work)baselineDemandSeconds.set(key,(baselineDemandSeconds.get(key)||0)+sec*row.batchesPerHour);}
  for(const u of utilityTasksForScenario(plan.scenario)){tasks.set(u.key,u);fixedTaskSeconds.set(u.key,u.seconds);baselineDemandSeconds.set(u.key,(baselineDemandSeconds.get(u.key)||0)+u.seconds);}
  const internalItems=[...new Set(rows.flatMap(r=>(r.recipe.inputs||[]).map(x=>Number(x.item))))].filter(x=>globalProducedItems(data).has(x));
  return{rows,tasks:[...tasks.values()],baselineDemandSeconds,fixedTaskSeconds,internalItems,baselineRate:plan.ratePerHour,baselineTargetRate:plan.targetRate,state,data,scenario:plan.scenario,plan};
}
export function palCanDo(pal,task){if(Number(pal?.abilities?.[task.ability]||0)<Number(task.level||0))return false;if(task.family&&familyId(pal.id)!==task.family)return false;return true;}

function addTeamFacilityConstraints(A,b,N,rows,model){
  const state=model.state,data=model.data,scenario=model.scenario,slugs=[...new Set(rows.map(r=>r.facility))];
  for(const slug of slugs){const stacks=facilityStacks(state,slug);if(!stacks.length)continue;const thresholds=[...new Set(rows.filter(r=>r.facility===slug).map(r=>Number(r.recipe.level||1)))].sort((a,b)=>a-b);for(const lvl of thresholds){const cap=stacks.filter(x=>x.level>=lvl).reduce((s,x)=>s+x.count,0),row=Array(N).fill(0);let used=false;rows.forEach((r,i)=>{if(r.facility===slug&&Number(r.recipe.level||1)>=lvl){row[i]=r.cycleSeconds/3600;used=true;}});if(used){A.push(row);b.push(cap);}const collect=Number(state.collectHours||0);if(collect>0){const batchCap=stacks.filter(x=>x.level>=lvl).reduce((s,x)=>s+x.count*facilityOutputLimit(data,slug,x.level),0);if(batchCap>0){const cr=Array(N).fill(0);let cu=false;rows.forEach((r,i)=>{if(r.facility===slug&&Number(r.recipe.level||1)>=lvl){cr[i]=collect;cu=true;}});if(cu){A.push(cr);b.push(batchCap);}}}}}
}

export function evaluateConcreteTeam(model,team){
  const R=model.rows.length,Q=model.tasks.length,edges=[];for(let w=0;w<team.length;w++)for(let q=0;q<Q;q++)if(palCanDo(team[w].pal,model.tasks[q]))edges.push({w,q,idx:R+edges.length});const N=R+edges.length;if(!N)return{rate:0,targetRate:0,objectiveRate:0,rows:[],workerTaskSeconds:[]};
  const objective=Array(N).fill(0);for(let r=0;r<R;r++)objective[r]=model.rows[r].objective;const A=[],b=[];addTeamFacilityConstraints(A,b,N,model.rows,model);
  for(const item of model.internalItems){const row=Array(N).fill(0);for(let r=0;r<R;r++)row[r]=-recipeNetItem(model.rows[r].recipe,item);A.push(row);b.push(0);}
  for(const g of model.state.guarantees||[]){const item=Number(g.item),minimum=Math.max(0,Number(g.perHour||0));if(!item||minimum<=0)continue;const row=Array(N).fill(0);for(let r=0;r<R;r++)row[r]=-recipeNetItem(model.rows[r].recipe,item);A.push(row);b.push(-minimum);}
  for(let w=0;w<team.length;w++){const row=Array(N).fill(0);for(const e of edges)if(e.w===w)row[e.idx]=1;A.push(row);b.push(3600);}
  for(let q=0;q<Q;q++){const row=Array(N).fill(0),key=model.tasks[q].key;for(let r=0;r<R;r++)row[r]=Number(model.rows[r].work.get(key)||0);for(const e of edges)if(e.q===q)row[e.idx]=-1;A.push(row);b.push(-Number(model.fixedTaskSeconds.get(key)||0));}
  const solved=solveLp(objective,A,b);if(!solved)return{rate:0,targetRate:0,objectiveRate:-Infinity,rows:[],workerTaskSeconds:[],infeasible:true};
  const recipeBatches=solved.x.slice(0,R),rows=[];let rate=0,target=0,obj=0;for(let r=0;r<R;r++){const batches=Number(recipeBatches[r]||0);if(batches<=1e-8)continue;const base=model.rows[r],coin=base.netValue*batches,targ=model.state.target&&model.state.target!=='coin'?recipeNetItem(base.recipe,model.state.target)*batches:coin;rate+=coin;target+=targ;obj+=base.objective*batches;rows.push({...base,batchesPerHour:batches,units:batches*base.cycleSeconds/3600,perHour:coin,targetPerHour:targ});}
  const workerTaskSeconds=Array.from({length:team.length},()=>new Map());for(const e of edges){const sec=Number(solved.x[e.idx]||0);if(sec>1e-7)workerTaskSeconds[e.w].set(model.tasks[e.q].key,sec);}
  return{rate,targetRate:target,objectiveRate:obj,rows,recipeBatches,workerTaskSeconds,x:solved.x,infeasible:false};
}

function relevance(model,pal){let s=0;for(const t of model.tasks)if(palCanDo(pal,t)){const d=Number(model.baselineDemandSeconds.get(t.key)||0)/3600,over=Math.max(0,Number(pal.abilities?.[t.ability]||0)-t.level);s+=d*(1+over*.03);}return s;}
function normalizeTeam(team){const seen=new Map();return team.map(x=>{const id=Number(x.pal.id),n=(seen.get(id)||0)+1;seen.set(id,n);return{...x,key:`${id}#${n}`,copy:n,label:x.pal.name};});}
function teamKey(team){return team.map(x=>x.key).sort().join('|');}
export function ownedSpecies(state,data){const list=[];for(const pal of data.pals){const rec=state.owned?.[String(pal.id)]??state.owned?.[pal.name];if(rec?.enabled&&Number(rec.count||0)>0)list.push({pal,maxCount:Math.max(1,Number(rec.count||1))});}return list;}
function nextCopy(spec,team){const used=team.filter(x=>Number(x.pal.id)===Number(spec.pal.id)).length;if(used>=spec.maxCount)return null;return{pal:spec.pal,key:`${spec.pal.id}#${used+1}`,copy:used+1,label:spec.pal.name};}

function taskObjects(row){const out=[];for(const[key,seconds]of row.work){const[ability,lvl,fam,tag]=key.split('|');out.push({key,ability,level:Number(lvl),family:fam?Number(fam):null,tag,seconds:Number(seconds||0)});}return out;}
export function burstSlots(model,rows=model.plan.rows){const slots=[];let seq=0;for(const base of rows){if(!BASIC.has(base.facility))continue;const row=model.rows.find(x=>x.recipe.id===base.recipe.id)||{...base,work:splitRecipeWork(base.recipe,model.state,model.scenario)},tasks=taskObjects(row);if(!tasks.length)continue;if(row.facility==='mine'||row.facility==='well'){const copies=Math.max(1,Math.ceil(base.units-1e-9));for(let n=1;n<=copies;n++)for(const task of tasks)slots.push({id:`b${seq++}`,facility:row.facility,task,label:`${row.facility==='mine'?'Mine':'Well'} #${n} · ${task.ability}`,weight:row.facility==='mine'?5:4});}else{const seen=new Set();for(const task of tasks){const k=`${task.ability}|${task.level}|${task.family||''}`;if(seen.has(k))continue;seen.add(k);slots.push({id:`b${seq++}`,facility:row.facility,task,label:`${row.facility==='farmland'?'Farmland':'Woodland'} · ${task.ability}`,weight:row.facility==='woodland'?4.4:4.2});}}}return slots;}
export function burstMatch(model,team,rows=model.plan.rows){const slots=burstSlots(model,rows),W=team.length;if(!slots.length||!W)return{coverageWeight:0,totalWeight:slots.reduce((s,x)=>s+x.weight,0),assignments:[],slots};const used=new Set(),assignments=[];for(const slot of [...slots].sort((a,b)=>b.weight-a.weight||a.label.localeCompare(b.label))){let pick=-1,best=-Infinity;for(let w=0;w<W;w++){if(used.has(w)||!palCanDo(team[w].pal,slot.task))continue;const over=Math.max(0,Number(team[w].pal.abilities?.[slot.task.ability]||0)-slot.task.level),score=over*10+relevance(model,team[w].pal);if(score>best){best=score;pick=w;}}if(pick>=0){used.add(pick);assignments.push({worker:pick,slot});}}return{coverageWeight:assignments.reduce((s,x)=>s+x.slot.weight,0),totalWeight:slots.reduce((s,x)=>s+x.weight,0),assignments,slots};}

export async function findBestTeams(model,state,data,{limit=4,onProgress}={}){
  const species=ownedSpecies(state,data),workers=Math.max(1,Number(state.teamSlots||state.workerSlots||1));if(species.reduce((sum,x)=>sum+x.maxCount,0)<workers)throw new Error('Not enough enabled Aniimo copies for the requested real-team slots.');
  const ranked=[...species].sort((a,b)=>relevance(model,b.pal)-relevance(model,a.pal)||a.pal.name.localeCompare(b.pal.name)),searchPool=ranked.slice(0,Math.min(42,ranked.length)),swapPool=ranked.slice(0,Math.min(28,ranked.length)),cache=new Map();
  const exact=team=>{const t=normalizeTeam(team),k=teamKey(t);if(!cache.has(k))cache.set(k,evaluateConcreteTeam(model,t));return cache.get(k);},seeds=[];
  for(let mode=0;mode<8;mode++){const team=[];while(team.length<workers){let best=null,bestScore=-Infinity;for(let i=0;i<searchPool.length;i++){const spec=searchPool[(i+mode)%searchPool.length],cand=nextCopy(spec,team);if(!cand)continue;const score=relevance(model,cand.pal)*1000-i*.001;if(score>bestScore){bestScore=score;best=cand;}}if(!best)break;team.push(best);}if(team.length===workers)seeds.push(normalizeTeam(team));}
  for(let off=0;off<Math.min(6,searchPool.length);off++){const team=[];let cursor=off,guard=0;while(team.length<workers&&guard++<workers*searchPool.length*3){const spec=searchPool[cursor%searchPool.length],cand=nextCopy(spec,team);if(cand)team.push(cand);cursor++;}if(team.length===workers)seeds.push(normalizeTeam(team));}
  const unique=new Map(seeds.map(t=>[teamKey(t),t])),candidates=[];let si=0;for(const team of unique.values()){si++;onProgress?.(`Seed ${si}/${unique.size}`);const ev=exact(team),burst=burstMatch(model,team,ev.rows);candidates.push({team,eval:ev,burst});if(si%2===0)await new Promise(r=>setTimeout(r,0));}
  candidates.sort((a,b)=>b.eval.objectiveRate-a.eval.objectiveRate||b.burst.coverageWeight-a.burst.coverageWeight);let beam=candidates.slice(0,4);
  for(let round=0;round<3;round++){const next=[];let improved=false;for(let ci=0;ci<beam.length;ci++){let best=beam[ci];for(let pos=0;pos<best.team.length;pos++){const reduced=best.team.filter((_,i)=>i!==pos);for(const spec of swapPool){const cand=nextCopy(spec,reduced);if(!cand)continue;const test=normalizeTeam([...reduced,cand]),ev=exact(test),bm=burstMatch(model,test,ev.rows);const better=ev.objectiveRate>best.eval.objectiveRate+.0001||(Math.abs(ev.objectiveRate-best.eval.objectiveRate)<=.0001&&bm.coverageWeight>best.burst.coverageWeight+.0001);if(better){best={team:test,eval:ev,burst:bm};improved=true;}}}next.push(best);onProgress?.(`Refine ${ci+1}/${beam.length} · round ${round+1}`);await new Promise(r=>setTimeout(r,0));}const d=new Map();for(const x of[...beam,...next]){const k=teamKey(x.team),old=d.get(k);if(!old||x.eval.objectiveRate>old.eval.objectiveRate+.0001||(Math.abs(x.eval.objectiveRate-old.eval.objectiveRate)<=.0001&&x.burst.coverageWeight>old.burst.coverageWeight))d.set(k,x);}beam=[...d.values()].sort((a,b)=>b.eval.objectiveRate-a.eval.objectiveRate||b.burst.coverageWeight-a.burst.coverageWeight).slice(0,4);if(!improved)break;}
  return beam.slice(0,limit);
}

export function findEssentialCore(model,team,target){let core=normalizeTeam(team),changed=true;while(changed){changed=false;for(let i=core.length-1;i>=0;i--){const test=normalizeTeam(core.filter((_,j)=>j!==i)),ev=evaluateConcreteTeam(model,test);if(ev.objectiveRate>=target-.0001){core=test;changed=true;break;}}}return core;}
export function antiStallSummary(model,full,core,rows=null){const need=new Map();for(const x of core)need.set(Number(x.pal.id),(need.get(Number(x.pal.id))||0)+1);const reserves=[];for(const x of full){const id=Number(x.pal.id),n=need.get(id)||0;if(n>0)need.set(id,n-1);else reserves.push(x);}const match=burstMatch(model,full,rows||model.plan.rows),byFacility=new Map();for(const slot of match.slots){const rec=byFacility.get(slot.facility)||{total:0,hit:0};rec.total++;byFacility.set(slot.facility,rec);}for(const a of match.assignments)byFacility.get(a.slot.facility).hit++;return{reserves,match,byFacility};}

function profileHas(p,l){return!!p&&!!l&&String(p).includes(l);}
function activePersonalityRows(model,concreteEval){return(concreteEval?.rows?.length?concreteEval.rows:model.plan.rows).map(r=>{const base=model.rows.find(x=>x.recipe.id===r.recipe.id);return base?{...base,batchesPerHour:r.batchesPerHour,units:r.units,perHour:r.perHour}:{...r,work:splitRecipeWork(r.recipe,model.state,model.scenario),objective:combinedObjectiveCoef(r.recipe,model.state,model.data,model.plan.objectiveWeights)};});}
function workerFacilityWeights(model,team,concreteEval,burst){
  const rows=activePersonalityRows(model,concreteEval),taskFacility=new Map();
  for(const row of rows)for(const[key,sec]of row.work){const m=taskFacility.get(key)||new Map();m.set(row.facility,(m.get(row.facility)||0)+sec*Number(row.batchesPerHour||0));taskFacility.set(key,m);}
  const weights=Array.from({length:team.length},()=>new Map()),primary=Array.from({length:team.length},()=>new Map());
  for(let w=0;w<team.length;w++)for(const[key,sec]of concreteEval.workerTaskSeconds?.[w]||[]){const fm=taskFacility.get(key);if(!fm)continue;const total=[...fm.values()].reduce((s,x)=>s+x,0)||1;for(const[f,v]of fm)weights[w].set(f,(weights[w].get(f)||0)+sec*v/total);}
  for(const a of burst?.assignments||[])primary[a.worker].set(a.slot.facility,(primary[a.worker].get(a.slot.facility)||0)+a.slot.weight*1000);
  for(let w=0;w<team.length;w++)if(!primary[w].size){let best=null,val=-1;for(const[f,v]of weights[w])if(v>val){best=f;val=v;}if(best)primary[w].set(best,val+1000);}
  return{weights,primary,rows};
}
function chooseProfileHints(model,team,concreteEval,burst){
  const {weights,primary,rows}=workerFacilityWeights(model,team,concreteEval,burst),hints=[];
  for(let w=0;w<team.length;w++){
    const primaryLetters=new Map(),secondaryLetters=new Map();
    for(const[f,v]of primary[w]){const l=FACILITY_PERSONALITY[f];if(l)primaryLetters.set(l,(primaryLetters.get(l)||0)+v);}
    for(const row of rows){const l=FACILITY_PERSONALITY[row.facility];if(!l)continue;const tasks=taskObjects(row);if(tasks.some(t=>palCanDo(team[w].pal,t)))secondaryLetters.set(l,(secondaryLetters.get(l)||0)+Number(row.batchesPerHour||0)*Math.max(1,row.cycleSeconds));}
    const must=new Map();for(const pair of PERSONALITY_PAIRS){const choices=pair.filter(l=>primaryLetters.has(l));if(choices.length)must.set(pair.join(''),choices.sort((a,b)=>(primaryLetters.get(b)||0)-(primaryLetters.get(a)||0))[0]);}
    const candidates=PERSONALITY_PROFILES.filter(p=>[...must.entries()].every(([pair,l])=>p.includes(l))),score=p=>{let s=0;for(const l of p){s+=(primaryLetters.get(l)||0)*100+(secondaryLetters.get(l)||0);}return s;};
    let profile=candidates[0]||PERSONALITY_PROFILES[0],best=-Infinity;for(const p of candidates){const s=score(p);if(s>best+1e-8||(Math.abs(s-best)<=1e-8&&p<profile)){best=s;profile=p;}}
    const display=[];for(const pair of PERSONALITY_PAIRS){const key=pair.join(''),required=must.get(key);if(required)display.push({char:required,status:'must'});else{const picked=pair.find(l=>profile.includes(l));if(picked&&(secondaryLetters.get(picked)||0)>0)display.push({char:picked,status:'nice'});else display.push({char:'o',status:'none'});}}
    hints.push({profile,display,primaryLetters:[...primaryLetters.keys()],secondaryLetters:[...secondaryLetters.keys()]});
  }
  return hints;
}

function personalityEval(model,team,profiles,rows){
  // Re-optimise only the concrete team's active recipe set. This keeps the model tractable while
  // still allowing personality speed to rebalance those jobs above the generic baseline.
  const recipeVars=[],rowVarIndices=Array.from({length:rows.length},()=>[]),genericRows=new Set(),add=v=>{v.idx=recipeVars.length;recipeVars.push(v);rowVarIndices[v.r].push(v.idx);};
  for(let r=0;r<rows.length;r++){const row=rows[r],tasks=taskObjects(row),letter=FACILITY_PERSONALITY[row.facility]||null;if(letter&&tasks.length===1){const task=tasks[0];for(let w=0;w<team.length;w++)if(palCanDo(team[w].pal,task)){const mult=profileHas(profiles[w],letter)?1.2:1,parts=cycleParts(row.recipe,model.state,model.scenario,mult);add({r,w,letter,boosted:mult>1,workerSeconds:row.recipe.pet?parts.cycle:parts.manual,occupancySeconds:parts.cycle,objective:combinedObjectiveCoef(row.recipe,model.state,model.data,model.plan.objectiveWeights),coin:recipeNetValue(row.recipe,model.data)});}}else{genericRows.add(r);add({r,w:null,letter:null,boosted:false,workerSeconds:null,occupancySeconds:row.cycleSeconds,objective:combinedObjectiveCoef(row.recipe,model.state,model.data,model.plan.objectiveWeights),coin:recipeNetValue(row.recipe,model.data)});}}
  const alloc=[];for(const r of genericRows){const tasks=taskObjects(rows[r]);for(let ti=0;ti<tasks.length;ti++)for(let w=0;w<team.length;w++)if(palCanDo(team[w].pal,tasks[ti]))alloc.push({r,ti,w,task:tasks[ti],idx:recipeVars.length+alloc.length});}
  const utilityAlloc=[];for(const u of utilityTasksForScenario(model.scenario))for(let w=0;w<team.length;w++)if(palCanDo(team[w].pal,u))utilityAlloc.push({w,task:u,idx:recipeVars.length+alloc.length+utilityAlloc.length});
  const N=recipeVars.length+alloc.length+utilityAlloc.length;if(!N)return{rate:0,targetRate:0,objectiveRate:0,profiles};const objective=Array(N).fill(0);for(const v of recipeVars)objective[v.idx]=v.objective;const A=[],b=[];
  for(const slug of [...new Set(rows.map(r=>r.facility))]){const stacks=facilityStacks(model.state,slug),thresholds=[...new Set(rows.filter(r=>r.facility===slug).map(r=>Number(r.recipe.level||1)))].sort((a,b)=>a-b);for(const lvl of thresholds){const cap=stacks.filter(x=>x.level>=lvl).reduce((sum,x)=>sum+x.count,0),row=Array(N).fill(0);let used=false;for(const v of recipeVars)if(rows[v.r].facility===slug&&Number(rows[v.r].recipe.level||1)>=lvl){row[v.idx]=v.occupancySeconds/3600;used=true;}if(used){A.push(row);b.push(cap);}const collect=Number(model.state.collectHours||0);if(collect>0){const batchCap=stacks.filter(x=>x.level>=lvl).reduce((sum,x)=>sum+x.count*facilityOutputLimit(model.data,slug,x.level),0);if(batchCap>0){const cr=Array(N).fill(0);let cu=false;for(const v of recipeVars)if(rows[v.r].facility===slug&&Number(rows[v.r].recipe.level||1)>=lvl){cr[v.idx]=collect;cu=true;}if(cu){A.push(cr);b.push(batchCap);}}}}}
  for(const item of model.internalItems){const row=Array(N).fill(0);for(const v of recipeVars)row[v.idx]=-recipeNetItem(rows[v.r].recipe,item);A.push(row);b.push(0);}
  for(const g of model.state.guarantees||[]){const item=Number(g.item),minimum=Math.max(0,Number(g.perHour||0));if(!item||minimum<=0)continue;const row=Array(N).fill(0);for(const v of recipeVars)row[v.idx]=-recipeNetItem(rows[v.r].recipe,item);A.push(row);b.push(-minimum);}
  for(let w=0;w<team.length;w++){const row=Array(N).fill(0);for(const v of recipeVars)if(v.w===w)row[v.idx]+=Number(v.workerSeconds||0);for(const a of alloc)if(a.w===w)row[a.idx]+=1;for(const a of utilityAlloc)if(a.w===w)row[a.idx]+=1;A.push(row);b.push(3600);}
  for(const r of genericRows){const tasks=taskObjects(rows[r]),ri=rowVarIndices[r][0];if(ri==null)continue;for(let ti=0;ti<tasks.length;ti++){const row=Array(N).fill(0);row[ri]=tasks[ti].seconds;for(const a of alloc)if(a.r===r&&a.ti===ti)row[a.idx]=-1;A.push(row);b.push(0);}}
  for(const u of utilityTasksForScenario(model.scenario)){const row=Array(N).fill(0);for(const a of utilityAlloc)if(a.task.key===u.key)row[a.idx]-=1;A.push(row);b.push(-3600);}
  const solved=solveLp(objective,A,b);if(!solved)return{rate:0,targetRate:0,objectiveRate:-Infinity,profiles};let obj=0,coin=0,target=0;const batches=Array(rows.length).fill(0),boostedByWorker=Array.from({length:team.length},()=>new Set());
  for(const v of recipeVars){const x=Math.max(0,Number(solved.x[v.idx]||0));batches[v.r]+=x;obj+=v.objective*x;coin+=v.coin*x;target+=model.state.target&&model.state.target!=='coin'?recipeNetItem(rows[v.r].recipe,model.state.target)*x:v.coin*x;if(v.w!=null&&v.boosted&&x>1e-8)boostedByWorker[v.w].add(rows[v.r].facility);}
  return{rate:coin,targetRate:target,objectiveRate:obj,profiles,recipeBatches:batches,boostedByWorker};
}

export async function optimizePersonalities(model,team,onProgress,concreteEval,burst=null){
  const rows=activePersonalityRows(model,concreteEval),match=burst||burstMatch(model,team,concreteEval?.rows),hints=chooseProfileHints(model,team,concreteEval,match),profiles=hints.map(h=>h.profile);
  onProgress?.(`Scoring legal personality roles · ${team.length} workers`);await new Promise(r=>setTimeout(r,0));
  const final=personalityEval(model,team,profiles,rows);return{...final,traitHints:hints};
}
