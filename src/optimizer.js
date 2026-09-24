import {climateAllows,evaluateClimateLayout} from './climate.js';
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
const PERMANENT_STAFFING=new Set(['mine','well','dewy-house','tidewhisper-sandcastle']);
const BURST_STAFFING=new Set(['farmland','woodland']);
const NO_PERSONALITY_SPEED_FACILITIES=new Set(['aniipod-maker','dance-pad-polisher']);

export function familyId(id){const n=Number(id);return Number.isFinite(n)?Math.floor(n/1000):null;}
export function itemValue(data,id){return Number(data.items?.[String(id)]?.value??0)||0;}
export function itemName(data,id){return data.items?.[String(id)]?.name??String(id);}
export function recipeNetValue(recipe,data){let v=0;for(const o of recipe.outputs||[])v+=itemValue(data,o.item)*Number(o.qty||0);for(const i of recipe.inputs||[])v-=itemValue(data,i.item)*Number(i.qty||0);return v;}
export function recipeGrossValue(recipe,data){return (recipe.outputs||[]).reduce((s,o)=>s+itemValue(data,o.item)*Number(o.qty||0),0);}
export function recipeNetItem(recipe,item){const id=Number(item);let v=0;for(const o of recipe.outputs||[])if(Number(o.item)===id)v+=Number(o.qty||0);for(const i of recipe.inputs||[])if(Number(i.item)===id)v-=Number(i.qty||0);return v;}
export function manualWorkload(recipe){return Number(recipe.workload||0)+(recipe.steps||[]).reduce((s,x)=>s+Number(x.workload||0),0);}
export function recipeRequiredAbilityLevel(recipe){return Math.max(1,Number(recipe?.steps?.[0]?.level||1));}
export function recipeUsesMeasuredEfficiency(recipe){return !recipe?.electric&&Number(recipe?.workload||0)>0&&(recipe?.steps||[]).length===1;}
export function recipeUsesGatheringCurve(recipe){return recipeUsesMeasuredEfficiency(recipe)&&!(recipe.inputs||[]).length&&!NO_PERSONALITY_SPEED_FACILITIES.has(recipe.facility);}
export function baseWorkRateForRecipe(recipe){if(!recipeUsesMeasuredEfficiency(recipe))return 1;const special=NO_PERSONALITY_SPEED_FACILITIES.has(recipe.facility),gather=recipeUsesGatheringCurve(recipe);if(!special&&!gather)return 1;return 1+.25*(recipeRequiredAbilityLevel(recipe)-1);}
export function displayedEfficiencyMultiplier(recipe,abilityLevel,personalityBonus=false){
  const required=recipeRequiredAbilityLevel(recipe),level=Math.max(0,Number(abilityLevel)||0);if(level<required)return 0;
  const above=Math.min(4,level)-required;let eff=1;
  if(NO_PERSONALITY_SPEED_FACILITIES.has(recipe.facility))eff=1+.4*above;
  else if(recipeUsesGatheringCurve(recipe))eff=1+(required===1?.5:.4)*above;
  else eff=above===0?1:2+above;
  if(personalityBonus&&FACILITY_PERSONALITY[recipe.facility])eff*=1.2;
  return eff;
}
export function displayedEfficiencyPct(recipe,abilityLevel,personalityBonus=false){return displayedEfficiencyMultiplier(recipe,abilityLevel,personalityBonus)*100;}
export function defaultRecipeEfficiencyPct(recipe){
  if(recipe?.electric||manualWorkload(recipe)<=0)return 100;
  // The theoretical pass assumes exactly the suitability the chosen recipe asks for.
  // That is always 100% displayed Efficiency; facility-specific base work rate is handled separately.
  return displayedEfficiencyPct(recipe,recipeRequiredAbilityLevel(recipe),false)||100;
}

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

function weatherRatio(required,scenario){return climateAllows(required,scenario)?1:0;}

function cycleParts(recipe,state,scenario,personalityMultiplier=1){
  const weather=weatherRatio(recipe.env,scenario);if(recipe.env&&weather<=0)return{cycle:Infinity,manual:Infinity,grow:Infinity,weather:0};
  if(recipe.electric){const g=Number(recipe.growSeconds||0)/(weather||1);return{cycle:g,manual:0,grow:g,weather:weather||1};}
  const recipePct=state.realRecipeSpeeds?.[String(recipe.id)]??state.realRecipeSpeeds?.[recipe.id],fallbackPct=state.manualSpeeds?state.speeds?.[recipe.facility]:defaultRecipeEfficiencyPct(recipe),pct=Math.max(1,Number(recipePct??fallbackPct??100));
  const fed=state.hungry?.2:1,baseRate=baseWorkRateForRecipe(recipe),speed=(pct/100)*Math.max(.01,Number(personalityMultiplier||1))*fed*baseRate;
  const manual=manualWorkload(recipe)>0?manualWorkload(recipe)/speed:0;
  const grow=Number(recipe.growSeconds||0),ratio=weather||1;
  return{cycle:(grow+manual)/ratio,manual:manual/ratio,grow:grow/ratio,weather:ratio};
}
function workerCycleParts(recipe,state,scenario,abilityLevel,personalityBonus=false){
  if(!recipeUsesMeasuredEfficiency(recipe))return cycleParts(recipe,state,scenario,personalityBonus?1.2:1);
  const weather=weatherRatio(recipe.env,scenario);if(recipe.env&&weather<=0)return{cycle:Infinity,manual:Infinity,grow:Infinity,weather:0,efficiencyPct:0};
  const eff=displayedEfficiencyMultiplier(recipe,abilityLevel,personalityBonus),fed=state.hungry?.2:1,baseRate=baseWorkRateForRecipe(recipe);
  if(eff<=0)return{cycle:Infinity,manual:Infinity,grow:Infinity,weather:weather||1,efficiencyPct:0};
  const manual=manualWorkload(recipe)/(eff*baseRate*fed),grow=Number(recipe.growSeconds||0),ratio=weather||1;
  return{cycle:(grow+manual)/ratio,manual:manual/ratio,grow:grow/ratio,weather:ratio,efficiencyPct:eff*100,baseRate};
}
export function cycleSeconds(recipe,state,scenario={cooling:null,heat:null,sunlamp:false,generator:false},personalityMultiplier=1){return cycleParts(recipe,state,scenario,personalityMultiplier).cycle;}
export function workerCycleSeconds(recipe,state,scenario,abilityLevel,personalityBonus=false){return workerCycleParts(recipe,state,scenario,abilityLevel,personalityBonus).cycle;}

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
  for(const g of state.guarantees||[]){const item=String(g.item||'');if(g.enabled===false||!g.maximize||!item||seen.has(item))continue;seen.add(item);out.push({key:`co:${item}`,item,label:itemName(data,item)});}
  return out;
}
function objectivePartCoef(recipe,spec,data){return spec.item==='coin'?recipeNetValue(recipe,data):recipeNetItem(recipe,spec.item);}
function objectiveCoef(recipe,state,data){return objectivePartCoef(recipe,objectiveSpecs(state,data)[0],data);}
function buildObjectiveWeights(recipes,state,data,A,b){
  const specs=objectiveSpecs(state,data);if(specs.length===1)return[{...specs[0],scale:1,normalizer:1,max:null}];
  const out=[];for(const spec of specs){const c=recipes.map(r=>objectivePartCoef(r,spec,data)),solved=solveLp(c,A,b);let max=0;if(solved)for(let i=0;i<c.length;i++)max+=c[i]*Number(solved.x[i]||0);if(spec.key==='primary'||max>1e-8){const normalizer=Math.max(1e-8,Math.abs(max));out.push({...spec,scale:1/normalizer,normalizer,max});}}
  return out.length?out:[{...specs[0],scale:1,normalizer:1,max:null}];
}
function activeObjectiveWeights(weights){return(weights||[]).filter(w=>w.key==='primary'||w.max==null||Number(w.max)>1e-8);}
function combinedObjectiveCoef(recipe,state,data,weights=null){const source=weights?.length?weights:[{...objectiveSpecs(state,data)[0],scale:1}],ws=activeObjectiveWeights(source);return ws.reduce((sum,w)=>sum+objectivePartCoef(recipe,w,data)*Number(w.scale||0),0);}
function objectiveVector(recipes,weight,data){return recipes.map(r=>objectivePartCoef(r,weight,data)*Number(weight.scale||0));}
function solveJointObjective(vectors,A,b){
  if(!vectors.length)return null;
  if(vectors.length===1)return{solved:solveLp(vectors[0],A,b),jointMinShare:null};
  const n=vectors[0].length,A1=A.map(row=>[...row,0]),b1=[...b];
  for(const c of vectors){A1.push([...c.map(v=>-Number(v||0)),1]);b1.push(0);}
  const fair=solveLp([...Array(n).fill(0),1],A1,b1);if(!fair)return null;
  const jointMinShare=Math.max(0,Number(fair.x[n]||0)),floor=Math.max(0,jointMinShare-1e-7),A2=A.map(row=>[...row]),b2=[...b];
  for(const c of vectors){A2.push(c.map(v=>-Number(v||0)));b2.push(-floor);}
  const sum=Array(n).fill(0);for(const c of vectors)for(let i=0;i<n;i++)sum[i]+=Number(c[i]||0);
  const solved=solveLp(sum,A2,b2);
  return{solved:solved||{x:fair.x.slice(0,n),duals:[]},jointMinShare};
}
function planBeats(a,b){
  if(!b)return true;
  const aj=Number.isFinite(Number(a?.jointMinShare))?Number(a.jointMinShare):null,bj=Number.isFinite(Number(b?.jointMinShare))?Number(b.jointMinShare):null;
  if(aj!=null||bj!=null){const av=aj??0,bv=bj??0;if(av>bv+1e-8)return true;if(bv>av+1e-8)return false;}
  if(Number(a?.objectiveRate||0)>Number(b?.objectiveRate||0)+1e-8)return true;
  if(Number(b?.objectiveRate||0)>Number(a?.objectiveRate||0)+1e-8)return false;
  return Number(a?.utilityWorkers||0)<Number(b?.utilityWorkers||0);
}
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
  for(const g of state.guarantees||[]){if(g.enabled===false||g.maximize)continue;const item=Number(g.item),minimum=Math.max(0,Number(g.perHour||0));if(!item||minimum<=0)continue;A.push(recipes.map(r=>-recipeNetItem(r,item)));b.push(-minimum);}
}
function addClimateCaps(A,b,recipes,state,scenario,caps=[]){
  for(const cap of caps||[]){
    const maxUnits=Math.max(0,Number(cap.maxUnits||0)),row=recipes.map(r=>r.facility===cap.facility&&r.env===cap.env?cycleParts(r,state,scenario).cycle/3600:0);
    if(row.some(x=>x>0)){A.push(row);b.push(maxUnits);}
  }
}
function recipeLaborSeconds(recipe,state,scenario){const parts=cycleParts(recipe,state,scenario);return recipe.pet?Math.max(parts.cycle,parts.manual):parts.manual;}

function rawOptimize(state,data,scenario,allowRecipes=null,forcedWeights=null,climateCaps=[]){
  let recipes=data.recipes.filter(r=>recipeRunnable(r,state,data,scenario));if(allowRecipes)recipes=recipes.filter(r=>allowRecipes.has(r.id));
  if(!recipes.length)return{ratePerHour:0,targetRate:0,objectiveRate:0,rows:[],runnableRecipes:[],scenario,scenarioLabel:scenarioLabel(scenario),utilityWorkers:utilityWorkerCount(scenario),infeasible:false,objectiveWeights:forcedWeights||[]};
  const n=recipes.length,A=[],b=[];
  addFacilityConstraints(A,b,recipes,state,data,scenario);
  const workerLimit=Number(state.workerSlots||0);if(workerLimit>0){A.push(recipes.map(r=>r.electric?0:recipeLaborSeconds(r,state,scenario)/3600));b.push(Math.max(0,workerLimit-utilityWorkerCount(scenario)));}
  addMaterialBalance(A,b,recipes,data);addGuarantees(A,b,recipes,state);addClimateCaps(A,b,recipes,state,scenario,climateCaps);
  const objectiveWeights=forcedWeights?.length?forcedWeights:buildObjectiveWeights(recipes,state,data,A,b),activeWeights=activeObjectiveWeights(objectiveWeights),vectors=activeWeights.map(w=>objectiveVector(recipes,w,data)),objective=recipes.map(r=>combinedObjectiveCoef(r,state,data,objectiveWeights)),joint=solveJointObjective(vectors,A,b),solved=joint?.solved;
  if(!solved)return{ratePerHour:0,targetRate:0,objectiveRate:-Infinity,rows:[],runnableRecipes:recipes,scenario,scenarioLabel:scenarioLabel(scenario),utilityWorkers:utilityWorkerCount(scenario),infeasible:true,objectiveWeights,jointMinShare:joint?.jointMinShare??null};
  const rows=[];let coin=0,target=0,obj=0;
  recipes.forEach((recipe,i)=>{const batches=Math.max(0,Number(solved.x[i]||0));if(batches<=1e-8)return;const parts=cycleParts(recipe,state,scenario),units=batches*parts.cycle/3600,coinPart=recipeNetValue(recipe,data)*batches,targetPart=state.target&&state.target!=='coin'?recipeNetItem(recipe,state.target)*batches:coinPart;coin+=coinPart;target+=targetPart;obj+=objective[i]*batches;rows.push({facility:recipe.facility,recipe,batchesPerHour:batches,units,perHour:coinPart,targetPerHour:targetPart,cycleSeconds:parts.cycle,manualSeconds:parts.manual,netValue:recipeNetValue(recipe,data)});});
  return{ratePerHour:coin,targetRate:target,objectiveRate:obj,rows,runnableRecipes:recipes,scenario,scenarioLabel:scenarioLabel(scenario),utilityWorkers:utilityWorkerCount(scenario),infeasible:false,objectiveWeights,jointMinShare:joint?.jointMinShare??null};
}
function oneRecipeOptimize(state,data,scenario,mixed,climateCaps=[]){
  const byFacility=new Map();
  for(const r of mixed.runnableRecipes){const arr=byFacility.get(r.facility)||[];arr.push(r);byFacility.set(r.facility,arr);}
  const constrained=new Map(),alwaysAllowed=[];
  for(const [facility,rs] of byFacility){
    const cap=Math.max(1,Math.floor(facilityCount(state,facility)||1)),ids=rs.map(r=>r.id);
    if(ids.length<=cap)alwaysAllowed.push(...ids);else constrained.set(facility,{ids,cap,recipes:rs});
  }
  if(!constrained.size)return mixed;
  const cloneSelection=sel=>new Map([...sel].map(([f,ids])=>[f,new Set(ids)]));
  const selectionKey=sel=>[...sel].sort((a,b)=>a[0].localeCompare(b[0])).map(([f,ids])=>`${f}:${[...ids].sort((a,b)=>Number(a)-Number(b)).join(',')}`).join('|');
  const selectedRecipeIds=sel=>new Set([...alwaysAllowed,...[...sel.values()].flatMap(ids=>[...ids])]);
  const solveCache=new Map();
  const solveSelected=sel=>{const key=selectionKey(sel);if(solveCache.has(key))return solveCache.get(key);const solved=rawOptimize(state,data,scenario,selectedRecipeIds(sel),mixed.objectiveWeights,climateCaps);solveCache.set(key,solved);return solved;};
  const activeByFacility=new Map();for(const row of mixed.rows){const arr=activeByFacility.get(row.facility)||[];arr.push(row);activeByFacility.set(row.facility,arr);}
  const recipeById=new Map(mixed.runnableRecipes.map(r=>[r.id,r]));
  const objectiveRecipeScore=r=>combinedObjectiveCoef(r,state,data,mixed.objectiveWeights);
  function makeSeed(mode='objective'){
    const sel=new Map();
    for(const [facility,cfg] of constrained){
      const active=[...(activeByFacility.get(facility)||[])],chosen=[],seen=new Set();
      const score=row=>mode==='units'?Number(row.units||0):mode==='coin'?Number(row.perHour||0):objectiveRecipeScore(row.recipe)*Number(row.batchesPerHour||0);
      active.sort((a,b)=>score(b)-score(a));
      for(const row of active)if(!seen.has(row.recipe.id)&&chosen.length<cfg.cap){seen.add(row.recipe.id);chosen.push(row.recipe.id);}
      const rest=[...cfg.recipes].sort((a,b)=>objectiveRecipeScore(b)-objectiveRecipeScore(a)||recipeGrossValue(b,data)-recipeGrossValue(a,data));
      for(const r of rest)if(!seen.has(r.id)&&chosen.length<cfg.cap){seen.add(r.id);chosen.push(r.id);}
      sel.set(facility,new Set(chosen));
    }
    return sel;
  }
  const outputRecipes=new Map();
  for(const r of mixed.runnableRecipes)for(const o of r.outputs||[]){const id=Number(o.item),arr=outputRecipes.get(id)||[];arr.push(r);outputRecipes.set(id,arr);}
  for(const [item,rs] of outputRecipes)rs.sort((a,b)=>{
    const aq=(a.outputs||[]).filter(o=>Number(o.item)===item).reduce((s,o)=>s+Number(o.qty||0),0),bq=(b.outputs||[]).filter(o=>Number(o.item)===item).reduce((s,o)=>s+Number(o.qty||0),0);
    const ac=cycleParts(a,state,scenario).cycle,bc=cycleParts(b,state,scenario).cycle;
    return (bq/Math.max(1,bc))-(aq/Math.max(1,ac))||objectiveRecipeScore(b)-objectiveRecipeScore(a);
  });
  function reserveRecipe(sel,locked,recipe){
    const cfg=constrained.get(recipe.facility);if(!cfg)return{sel,locked};
    const ids=new Set(sel.get(recipe.facility)||[]),locks=new Set(locked.get(recipe.facility)||[]);
    if(ids.has(recipe.id)){locks.add(recipe.id);const nl=new Map(locked);nl.set(recipe.facility,locks);return{sel,locked:nl};}
    let victim=null;
    for(const id of ids)if(!locks.has(id)){
      if(victim==null)victim=id;
      else{
        const a=recipeById.get(id),b=recipeById.get(victim);
        if(objectiveRecipeScore(a)<objectiveRecipeScore(b))victim=id;
      }
    }
    if(ids.size>=cfg.cap&&victim==null)return null;
    const ns=cloneSelection(sel),next=new Set(ns.get(recipe.facility)||[]);
    if(next.size>=cfg.cap)next.delete(victim);
    next.add(recipe.id);ns.set(recipe.facility,next);
    const nl=new Map(locked);locks.add(recipe.id);nl.set(recipe.facility,locks);
    return{sel:ns,locked:nl};
  }
  function injectItem(sel,locked,item,visiting=new Set(),depth=0){
    const id=Number(item);if(depth>12||visiting.has(id))return{sel,locked};
    const producers=outputRecipes.get(id)||[];
    if(!producers.length)return globalProducedItems(data).has(id)?null:{sel,locked};
    const nextVisiting=new Set(visiting);nextVisiting.add(id);
    for(const recipe of producers){
      let reserved=reserveRecipe(sel,locked,recipe);if(!reserved)continue;
      let cur=reserved,ok=true;
      for(const input of recipe.inputs||[]){
        const inputId=Number(input.item);if(!globalProducedItems(data).has(inputId))continue;
        const next=injectItem(cur.sel,cur.locked,inputId,nextVisiting,depth+1);if(!next){ok=false;break;}cur=next;
      }
      if(ok)return cur;
    }
    return null;
  }
  function objectiveSeed(base,items){
    let cur={sel:cloneSelection(base),locked:new Map()};
    for(const item of items){const next=injectItem(cur.sel,cur.locked,item);if(!next)return null;cur=next;}
    return cur.sel;
  }
  function localSearch(seed,budget=900){
    let sel=cloneSelection(seed),best=solveSelected(sel),left=budget;
    for(let pass=0;pass<5;pass++){
      let improved=false;
      for(const [facility,cfg] of constrained){
        let current=new Set(sel.get(facility)||[]);
        for(const outId of [...current]){
          for(const inId of cfg.ids){
            if(current.has(inId)||left--<=0)continue;
            const testSel=cloneSelection(sel),next=new Set(current);next.delete(outId);next.add(inId);testSel.set(facility,next);
            const test=solveSelected(testSel);
            if(planBeats(test,best)){best=test;sel=testSel;current=next;improved=true;break;}
          }
          if(left<=0)break;
        }
        if(left<=0)break;
      }
      if(!improved||left<=0)break;
    }
    return best;
  }
  const baseSeeds=[makeSeed('objective'),makeSeed('coin'),makeSeed('units')],objectiveItems=activeObjectiveWeights(mixed.objectiveWeights).map(w=>w.item).filter(x=>x!=='coin'),seeds=[];
  for(const base of baseSeeds){
    seeds.push(base);
    for(const item of objectiveItems){const s=objectiveSeed(base,[item]);if(s)seeds.push(s);}
    if(objectiveItems.length)for(let off=0;off<Math.min(4,objectiveItems.length);off++){const order=[...objectiveItems.slice(off),...objectiveItems.slice(0,off)],s=objectiveSeed(base,order);if(s)seeds.push(s);}
  }
  const unique=new Map(seeds.map(s=>[selectionKey(s),s]));let best=null;
  for(const seed of unique.values()){const test=localSearch(seed);if(planBeats(test,best))best=test;}
  return best||mixed;
}

function scenarios(state){
  const cooling=state.climateOptions?.cooling?[null,'Cool','Freeze']:[null],heat=state.climateOptions?.heat?[null,'Warm','Scorching']:[null],sun=state.climateOptions?.sunlamp?[false,true]:[false],gen=state.generatorAvailable?[false,true]:[false];
  const out=[];for(const c of cooling)for(const h of heat)for(const s of sun)for(const g of gen)out.push({cooling:c,heat:h,sunlamp:s,generator:g});return out;
}
function climateCapKey(caps){
  return[...(caps||[])].sort((a,b)=>(a.facility+'|'+a.env).localeCompare(b.facility+'|'+b.env)).map(x=>`${x.facility}|${x.env}:${Number(x.maxUnits||0)}`).join(';');
}
function reducedClimateCaps(caps,demand){
  const key=`${demand.facility}|${demand.env}`,next=(caps||[]).map(x=>({...x})),existing=next.find(x=>`${x.facility}|${x.env}`===key),limit=Math.max(0,Number(demand.count||0)-1);
  if(existing){if(Number(existing.maxUnits)<=limit+1e-9)return null;existing.maxUnits=limit;}
  else next.push({facility:demand.facility,env:demand.env,maxUnits:limit});
  return next;
}
function climateFeasibleScenarioPlan(state,data,scenario,sharedWeights,runtime={}){
  const queue=[[]],seen=new Set(),rejected=[],maxVariants=Math.max(1,Number(runtime.maxClimateVariants||28));let tries=0,best=null;
  while(queue.length&&tries<maxVariants){
    const caps=queue.shift(),key=climateCapKey(caps);if(seen.has(key))continue;seen.add(key);tries++;
    runtime.candidatePlans=(runtime.candidatePlans||0)+1;
    runtime.emit?.({phase:'search',variant:tries,maxVariants,detail:scenarioLabel(scenario)});
    let plan=rawOptimize(state,data,scenario,null,sharedWeights,caps);if(state.oneRecipePerFacility&&!plan.infeasible)plan=oneRecipeOptimize(state,data,scenario,plan,caps);
    if(plan.infeasible)continue;
    const layout=evaluateClimateLayout(plan,state,data,{
      maxOffset:runtime.maxClimateOffset,
      onProgress:p=>{runtime.climateOffsets=(runtime.climateOffsets||0)+Number(p.delta||0);runtime.emit?.({phase:'geometry',variant:tries,maxVariants,detail:scenarioLabel(scenario),geometry:p});}
    });
    plan.climateLayout=layout;plan.climateCaps=caps;plan.climateVariantsTested=tries;
    if(layout.feasible){if(planBeats(plan,best))best=plan;continue;}
    rejected.push(plan);
    const branches=[...(layout.branchDemands||[])].sort((a,b)=>Number(b.count||0)-Number(a.count||0)||Number(b.units||0)-Number(a.units||0)).slice(0,4);
    for(const demand of branches){const next=reducedClimateCaps(caps,demand);if(next&&!seen.has(climateCapKey(next)))queue.push(next);}
  }
  if(best)return best;
  let fallback=null;for(const p of rejected)if(planBeats(p,fallback))fallback=p;
  if(fallback){fallback.infeasible=true;fallback.climateFailure=fallback.climateLayout;fallback.climateVariantsTested=tries;return fallback;}
  return null;
}
export function optimizePlan(state,data,options={}){
  const scenarioList=scenarios(state),specs=objectiveSpecs(state,data),started=Date.now(),runtime={
    candidatePlans:0,climateOffsets:0,scenarioIndex:0,scenarioTotal:scenarioList.length,
    maxClimateVariants:Math.max(1,Number(options.maxClimateVariants||28)),
    maxClimateOffset:Math.max(1,Number(options.maxClimateOffset||9))
  };
  const emit=extra=>{
    if(typeof options.onProgress!=='function')return;
    const elapsedMs=Math.max(1,Date.now()-started),scenarioProgress=runtime.scenarioTotal?Math.min(1,(runtime.scenarioIndex+(Number(extra?.variant||0)/Math.max(1,runtime.maxClimateVariants)))/runtime.scenarioTotal):0;
    options.onProgress({
      ...extra,scenarioIndex:runtime.scenarioIndex,scenarioTotal:runtime.scenarioTotal,
      candidatePlans:runtime.candidatePlans,climateOffsets:runtime.climateOffsets,
      elapsedMs,candidatesPerSecond:runtime.candidatePlans/(elapsedMs/1000),
      progress:Number(extra?.progress??scenarioProgress)
    });
  };
  runtime.emit=emit;
  let sharedWeights=null;
  if(specs.length>1){
    const maxima=new Map(specs.map(s=>[s.key,0]));
    for(let i=0;i<scenarioList.length;i++){
      runtime.candidatePlans++;emit({phase:'calibrating',progress:(i+1)/(scenarioList.length*2),detail:'Common objective scale'});
      const probe=rawOptimize(state,data,scenarioList[i]);for(const w of probe.objectiveWeights||[])if(Number.isFinite(w.max)&&w.max>Number(maxima.get(w.key)||0))maxima.set(w.key,w.max);
    }
    sharedWeights=specs.map(spec=>{const max=Number(maxima.get(spec.key)||0),normalizer=Math.max(1e-8,Math.abs(max));return{...spec,scale:1/normalizer,normalizer,max};});
  }
  let best=null,bestClimateFailure=null,testedCount=0;
  for(let i=0;i<scenarioList.length;i++){
    runtime.scenarioIndex=i;
    const plan=climateFeasibleScenarioPlan(state,data,scenarioList[i],sharedWeights,runtime);if(!plan){runtime.scenarioIndex=i+1;emit({phase:'search',progress:(i+1)/scenarioList.length});continue;}testedCount++;
    if(plan.infeasible){if(plan.climateFailure&&planBeats(plan,bestClimateFailure))bestClimateFailure=plan;}
    else if(planBeats(plan,best))best=plan;
    runtime.scenarioIndex=i+1;emit({phase:'search',progress:(i+1)/scenarioList.length,detail:scenarioLabel(scenarioList[i])});
  }
  const optimizerStats={engine:'cpu',elapsedMs:Date.now()-started,candidatePlans:runtime.candidatePlans,climateOffsets:runtime.climateOffsets,scenarioTotal:scenarioList.length,testedScenarios:testedCount};
  emit({phase:'done',progress:1,done:true,...optimizerStats});
  if(!best){
    if(bestClimateFailure)return{...bestClimateFailure,testedScenarios:scenarioList.length,objectiveWeights:bestClimateFailure.objectiveWeights||sharedWeights||[],optimizerStats};
    return{ratePerHour:0,targetRate:0,objectiveRate:0,rows:[],runnableRecipes:[],scenario:{},scenarioLabel:'No feasible plan',utilityWorkers:0,infeasible:true,objectiveWeights:sharedWeights||[],climateLayout:{feasible:true,status:'none',demands:[],message:'No climate-sensitive production is active.'},testedScenarios:scenarioList.length,optimizerStats};
  }
  best.testedScenarios=scenarioList.length;best.optimizerStats=optimizerStats;return best;
}
export function planItemRates(plan,data){
  const rates=new Map();for(const row of plan.rows){const b=row.batchesPerHour;for(const o of row.recipe.outputs||[])rates.set(Number(o.item),(rates.get(Number(o.item))||0)+Number(o.qty||0)*b);for(const i of row.recipe.inputs||[])rates.set(Number(i.item),(rates.get(Number(i.item))||0)-Number(i.qty||0)*b);}
  return[...rates].map(([item,rate])=>({item,rate,name:itemName(data,item),value:itemValue(data,item),coinPerHour:Math.max(0,rate)*itemValue(data,item)}));
}
function recipeBlockerMessages(recipe,state,data,scenario,plan){
  const out=[],fac=data.facilities.find(x=>x.slug===recipe.facility),facName=fac?.name||recipe.facility,count=facilityCount(state,recipe.facility),level=maxFacilityLevel(state,recipe.facility);
  if(count<=0)out.push(`${facName} is not placed.`);else if(Number(recipe.level||1)>level)out.push(`${facName} needs Lv.${recipe.level}; your highest is Lv.${level}.`);
  if(recipe.electric){if(!scenario?.generator)out.push(`${facName} E-mode needs the Crackle Generator in the chosen utility plan.`);if(Number(state.homelandLevel||1)<Number(fac?.electricHomeLevel||12))out.push(`${facName} E-mode unlocks at RV ${fac?.electricHomeLevel||12}.`);}
  if(!noteEnabled(recipe,state))out.push(`${recipe.note?.name||'Required Recipe Note'} is disabled.`);
  if(recipe.module){const slug=MODULE_SLUGS[recipe.module.name],have=Number(state.modules?.[slug]||0),need=Number(recipe.module.level||0);if(!slug||have<need)out.push(`${recipe.module.name} Lv.${need} is required; current Lv.${have}.`);}
  if(recipe.env&&weatherRatio(recipe.env,scenario||{})<=0){
    if(recipe.env==='Scorching')out.push(state.climateOptions?.heat?'Needs Scorching from the Heat Furnace, but the chosen utility plan is not Scorching.':'Needs Scorching, but Heat Furnace is disabled.');
    else if(recipe.env==='Warm')out.push(state.climateOptions?.heat?'Needs Warm/compatible Heat Furnace climate, but the chosen utility plan does not provide it.':'Needs Warm climate, but Heat Furnace is disabled.');
    else if(recipe.env==='Freeze'||recipe.env==='Cool')out.push(state.climateOptions?.cooling?`Needs ${recipe.env}/compatible Cooling Unit climate, but the chosen utility plan does not provide it.`:`Needs ${recipe.env}, but Cooling Unit is disabled.`);
    else if(recipe.env==='Adequate')out.push(state.climateOptions?.sunlamp?'Needs Adequate from Sunlamp, but the chosen utility plan does not use it.':'Needs Adequate climate, but Sunlamp is disabled.');
    else out.push(`Needs ${recipe.env} climate, which the chosen utility plan does not provide.`);
  }
  const fam=recipe.pet?familyId(recipe.pet):null;if(fam&&!enabledFamilySet(state,data).has(fam))out.push(`Needs resident ${recipe.petName||'Aniimo family'}, but that family is not enabled.`);
  if(!recipe.electric)for(const step of recipe.steps||[])if(!abilityAvailable(step,state,data,fam))out.push(String(state.abilityLevel)==='auto'?`No enabled Aniimo can cover ${step.ability} Lv.${step.level} for this recipe.`:`Planning ability ceiling is below ${step.ability} Lv.${step.level}.`);
  if(state.oneRecipePerFacility&&count>0){
    const active=[...new Map((plan?.rows||[]).filter(row=>row.facility===recipe.facility&&Number(row.batchesPerHour||0)>1e-8).map(row=>[row.recipe.id,row.recipe])).values()];
    if(!active.some(r=>r.id===recipe.id)&&active.length>=count){
      const names=[...new Set(active.flatMap(r=>(r.outputs||[]).map(o=>itemName(data,o.item))))].slice(0,4);
      out.push(`One-recipe mode has all ${count} ${facName} cop${count===1?'y':'ies'} committed to ${names.join(', ')||'other recipes'}.`);
    }
  }
  return out;
}
function objectiveProductionTrace(plan,state,data,item){
  const produced=globalProducedItems(data),steps=[],seen=new Set(),scenario=plan?.scenario||{};
  function walk(id,depth=0,path=new Set()){
    id=Number(id);if(depth>8||path.has(id))return;
    const key=`${id}:${depth}`;if(seen.has(key))return;seen.add(key);
    const producers=data.recipes.filter(r=>(r.outputs||[]).some(o=>Number(o.item)===id));
    if(!producers.length){steps.push({item:id,name:itemName(data,id),facility:null,blockers:[`No recipe in the data produces ${itemName(data,id)}.`]});return;}
    const ranked=producers.map(recipe=>{const blockers=recipeBlockerMessages(recipe,state,data,scenario,plan),run=recipeRunnable(recipe,state,data,scenario),cycle=cycleParts(recipe,state,scenario).cycle;return{recipe,blockers,run,cycle};}).sort((a,b)=>Number(b.run)-Number(a.run)||a.blockers.length-b.blockers.length||a.cycle-b.cycle);
    const chosen=ranked[0],fac=data.facilities.find(f=>f.slug===chosen.recipe.facility);
    steps.push({item:id,name:itemName(data,id),facility:fac?.name||chosen.recipe.facility,recipeId:chosen.recipe.id,blockers:chosen.blockers});
    const nextPath=new Set(path);nextPath.add(id);
    for(const input of chosen.recipe.inputs||[])if(produced.has(Number(input.item)))walk(Number(input.item),depth+1,nextPath);
  }
  walk(Number(item));
  const uniq=[],keys=new Set();for(const s of steps){const k=`${s.item}|${s.facility||''}`;if(!keys.has(k)){keys.add(k);uniq.push(s);}}
  return uniq;
}
export function diagnoseObjective(plan,state,data,item,{minimum=0,maximize=false}={}){
  const id=Number(item),actual=planItemRates(plan||{rows:[]},data).find(x=>Number(x.item)===id)?.rate||0,need=Math.max(0,Number(minimum||0)),ok=maximize?actual>1e-8:actual+1e-7>=need;
  if(ok)return{ok:true,item:id,actual,minimum:need,maximize,detail:'',chain:[]};
  const weight=(plan?.objectiveWeights||[]).find(w=>String(w.item)===String(item)),theoreticalMax=Number(weight?.max||0),trace=objectiveProductionTrace(plan,state,data,id),blockers=[...new Set(trace.flatMap(x=>x.blockers||[]))],chain=trace.map(x=>x.facility?`${x.name} @ ${x.facility}`:x.name);
  let detail='';
  if(blockers.length)detail=blockers.join(' ');
  else if(maximize&&theoreticalMax>1e-8)detail=`The model says this objective can reach about ${theoreticalMax.toFixed(2)}/h, but the final optimizer result contains 0/h. That is a solver-selection failure rather than an unlock failure.`;
  else if(maximize)detail='No currently legal production chain reaches this MAX objective.';
  else detail=`The final plan produces ${actual.toFixed(2)}/h, below the required ${need.toFixed(2)}/h.`;
  return{ok:false,item:id,actual,minimum:need,maximize,theoreticalMax,detail,chain,trace};
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
  const rawTotal=manualWorkload(recipe);if(parts.manual<=1e-9||rawTotal<=0||!steps.length)return new Map();const raw=new Map();if(Number(recipe.workload||0)>0){const s=steps[0],k=taskKey(s.ability,s.level,fam,recipe.facility);raw.set(k,(raw.get(k)||0)+Number(recipe.workload||0));}for(const s of steps){const w=Number(s.workload||0);if(w<=0)continue;const k=taskKey(s.ability,s.level,fam,recipe.facility);raw.set(k,(raw.get(k)||0)+w);}const out=new Map();for(const[k,v]of raw)out.set(k,parts.manual*v/rawTotal);return out;
}
export function utilityTasksForScenario(scenario){const out=[];for(const key of ['cooling','heat','sunlamp','generator'])if(scenario?.[key]){const x=UTILITY_ABILITY[key];out.push({key:taskKey(x.ability,x.level,'',x.facility),ability:x.ability,level:x.level,family:null,facility:x.facility,name:x.facility.replaceAll('-',' '),seconds:3600,fixed:true});}return out;}
function makeCandidateRows(plan,state,data){const source=state.oneRecipePerFacility?plan.rows.map(r=>r.recipe):(plan.runnableRecipes||[]);const uniq=[...new Map(source.map(r=>[r.id,r])).values()];return uniq.map(recipe=>{const parts=cycleParts(recipe,state,plan.scenario);return{facility:recipe.facility,recipe,cycleSeconds:parts.cycle,manualSeconds:parts.manual,work:splitRecipeWork(recipe,state,plan.scenario),netValue:recipeNetValue(recipe,data),objective:combinedObjectiveCoef(recipe,state,data,plan.objectiveWeights)};});}

export function buildTeamModel(plan,state,data){
  const rows=makeCandidateRows(plan,state,data),tasks=new Map(),baselineDemandSeconds=new Map(),fixedTaskSeconds=new Map();
  for(const row of rows)for(const[key]of row.work){const [ability,lvl,fam,tag]=key.split('|');tasks.set(key,{key,ability,level:Number(lvl),family:fam?Number(fam):null,tag,facility:tag||row.facility});}
  for(const row of plan.rows){const work=splitRecipeWork(row.recipe,state,plan.scenario);for(const[key,sec]of work)baselineDemandSeconds.set(key,(baselineDemandSeconds.get(key)||0)+sec*row.batchesPerHour);}
  for(const u of utilityTasksForScenario(plan.scenario)){tasks.set(u.key,u);fixedTaskSeconds.set(u.key,u.seconds);baselineDemandSeconds.set(u.key,(baselineDemandSeconds.get(u.key)||0)+u.seconds);}
  const internalItems=[...new Set(rows.flatMap(r=>(r.recipe.inputs||[]).map(x=>Number(x.item))))].filter(x=>globalProducedItems(data).has(x));
  return{rows,tasks:[...tasks.values()],baselineDemandSeconds,fixedTaskSeconds,internalItems,baselineRate:plan.ratePerHour,baselineTargetRate:plan.targetRate,state,data,scenario:plan.scenario,plan};
}
export function palCanDo(pal,task){if(Number(pal?.abilities?.[task.ability]||0)<Number(task.level||0))return false;if(task.family&&familyId(pal.id)!==task.family)return false;return true;}
function taskRepresentativeRecipe(model,task){return model.rows.find(r=>r.facility===task.facility&&r.work.has(task.key))?.recipe||null;}
function workerTaskRelativeSpeed(model,pal,task){
  if(model.state.manualSpeeds)return 1;
  const recipe=taskRepresentativeRecipe(model,task);if(!recipe||!recipeUsesMeasuredEfficiency(recipe))return 1;
  const level=Number(pal?.abilities?.[task.ability]||0),actual=displayedEfficiencyMultiplier(recipe,level,false),baseline=Math.max(.01,defaultRecipeEfficiencyPct(recipe)/100);
  return actual>0?actual/baseline:0;
}

function taskDemandHours(model,task){return Math.max(0,Number(model.baselineDemandSeconds?.get?.(task.key)||0))/3600;}
function productionRelevance(model,pal){
  let score=0;
  for(const task of model.tasks||[]){
    if(task.fixed||!palCanDo(pal,task))continue;
    score+=taskDemandHours(model,task)*Math.max(.0001,workerTaskRelativeSpeed(model,pal,task));
  }
  return score;
}
function utilityOpportunityCost(model,pal){return productionRelevance(model,pal);}
function hungarianUtilityAssignment(cost){
  const n=cost.length,m=cost[0]?.length||0;if(!n)return[];if(m<n)return null;
  const u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
  for(let i=1;i<=n;i++){
    p[0]=i;let j0=0;const minv=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);
    do{
      used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
      for(let j=1;j<=m;j++)if(!used[j]){const cur=cost[i0-1][j-1]-u[i0]-v[j];if(cur<minv[j]){minv[j]=cur;way[j]=j0;}if(minv[j]<delta){delta=minv[j];j1=j;}}
      if(!Number.isFinite(delta))return null;
      for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else minv[j]-=delta;
      j0=j1;
    }while(p[j0]!==0);
    do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0!==0);
  }
  const assignment=Array(n).fill(-1);for(let j=1;j<=m;j++)if(p[j]>0&&p[j]<=n)assignment[p[j]-1]=j-1;return assignment;
}
export function assignUtilityWorkers(model,team){
  const tasks=(model.tasks||[]).filter(t=>t.fixed);
  if(!tasks.length)return{feasible:true,assignments:[],workers:[]};
  if(team.length<tasks.length)return{feasible:false,assignments:[],workers:[],uncovered:tasks};
  const BIG=1e9,cost=tasks.map((task,ti)=>team.map((member,w)=>{
    if(!palCanDo(member.pal||member,task))return BIG;
    const pal=member.pal||member,opportunity=utilityOpportunityCost(model,pal),over=Math.max(0,Number(pal.abilities?.[task.ability]||0)-Number(task.level||0));
    return opportunity*1000+over*.05+w*.000001+ti*.000000001;
  })),match=hungarianUtilityAssignment(cost);
  if(!match)return{feasible:false,assignments:[],workers:[],uncovered:tasks};
  const assignments=[];for(let ti=0;ti<tasks.length;ti++){const w=match[ti];if(w<0||cost[ti][w]>=BIG/2)return{feasible:false,assignments:[],workers:[],uncovered:[tasks[ti]]};assignments.push({worker:w,task:tasks[ti],seconds:3600});}
  return{feasible:true,assignments,workers:[...new Set(assignments.map(a=>a.worker))],uncovered:[]};
}

function estimatedTeamOccupancySeconds(model,row,team,reserved){
  if(model.state.manualSpeeds||!recipeUsesMeasuredEfficiency(row.recipe))return Number(row.cycleSeconds||0);
  const tasks=taskObjects(row);if(tasks.length!==1)return Number(row.cycleSeconds||0);
  const task=tasks[0];let best=Infinity;
  for(let w=0;w<team.length;w++){
    if(reserved.has(w)||!palCanDo(team[w].pal,task))continue;
    const abilityLevel=Number(team[w].pal.abilities?.[task.ability]||0),parts=workerCycleParts(row.recipe,model.state,model.scenario,abilityLevel,false);
    if(Number.isFinite(parts.cycle)&&parts.cycle>0)best=Math.min(best,parts.cycle);
  }
  return Number.isFinite(best)?best:Number(row.cycleSeconds||0);
}
function addTeamFacilityConstraints(A,b,N,rows,model,occupancySeconds=null){
  const state=model.state,data=model.data,scenario=model.scenario,slugs=[...new Set(rows.map(r=>r.facility))];
  for(const slug of slugs){const stacks=facilityStacks(state,slug);if(!stacks.length)continue;const thresholds=[...new Set(rows.filter(r=>r.facility===slug).map(r=>Number(r.recipe.level||1)))].sort((a,b)=>a-b);for(const lvl of thresholds){const cap=stacks.filter(x=>x.level>=lvl).reduce((s,x)=>s+x.count,0),row=Array(N).fill(0);let used=false;rows.forEach((r,i)=>{if(r.facility===slug&&Number(r.recipe.level||1)>=lvl){row[i]=Number(occupancySeconds?.[i]??r.cycleSeconds)/3600;used=true;}});if(used){A.push(row);b.push(cap);}const collect=Number(state.collectHours||0);if(collect>0){const batchCap=stacks.filter(x=>x.level>=lvl).reduce((s,x)=>s+x.count*facilityOutputLimit(data,slug,x.level),0);if(batchCap>0){const cr=Array(N).fill(0);let cu=false;rows.forEach((r,i)=>{if(r.facility===slug&&Number(r.recipe.level||1)>=lvl){cr[i]=collect;cu=true;}});if(cu){A.push(cr);b.push(batchCap);}}}}}
}

export function evaluateConcreteTeam(model,team){
  const utility=assignUtilityWorkers(model,team);if(!utility.feasible)return{rate:0,targetRate:0,objectiveRate:-Infinity,rows:[],workerTaskSeconds:Array.from({length:team.length},()=>new Map()),utilityAssignments:[],utilityWorkers:0,infeasible:true,utilityInfeasible:true};
  const reserved=new Set(utility.workers),activeTasks=model.tasks.filter(t=>!t.fixed),R=model.rows.length,Q=activeTasks.length,edges=[],occupancySeconds=model.rows.map(row=>estimatedTeamOccupancySeconds(model,row,team,reserved));
  for(let w=0;w<team.length;w++){if(reserved.has(w))continue;for(let q=0;q<Q;q++)if(palCanDo(team[w].pal,activeTasks[q]))edges.push({w,q,ratio:workerTaskRelativeSpeed(model,team[w].pal,activeTasks[q]),idx:R+edges.length});}
  const N=R+edges.length;
  if(!N){const workerTaskSeconds=Array.from({length:team.length},()=>new Map());for(const a of utility.assignments)workerTaskSeconds[a.worker].set(a.task.key,3600);return{rate:0,targetRate:0,objectiveRate:0,rows:[],workerTaskSeconds,utilityAssignments:utility.assignments,utilityWorkers:utility.assignments.length,infeasible:false};}
  const objective=Array(N).fill(0);for(let r=0;r<R;r++)objective[r]=model.rows[r].objective;const A=[],b=[];addTeamFacilityConstraints(A,b,N,model.rows,model,occupancySeconds);
  for(const item of model.internalItems){const row=Array(N).fill(0);for(let r=0;r<R;r++)row[r]=-recipeNetItem(model.rows[r].recipe,item);A.push(row);b.push(0);}
  for(const g of model.state.guarantees||[]){if(g.enabled===false||g.maximize)continue;const item=Number(g.item),minimum=Math.max(0,Number(g.perHour||0));if(!item||minimum<=0)continue;const row=Array(N).fill(0);for(let r=0;r<R;r++)row[r]=-recipeNetItem(model.rows[r].recipe,item);A.push(row);b.push(-minimum);}
  for(let w=0;w<team.length;w++){const row=Array(N).fill(0);for(const e of edges)if(e.w===w)row[e.idx]=1;A.push(row);b.push(reserved.has(w)?0:3600);}
  for(let q=0;q<Q;q++){const row=Array(N).fill(0),key=activeTasks[q].key;for(let r=0;r<R;r++)row[r]=Number(model.rows[r].work.get(key)||0);for(const e of edges)if(e.q===q)row[e.idx]=-Math.max(.0001,e.ratio||1);A.push(row);b.push(0);}
  const solved=solveLp(objective,A,b);if(!solved)return{rate:0,targetRate:0,objectiveRate:-Infinity,rows:[],workerTaskSeconds:[],utilityAssignments:utility.assignments,utilityWorkers:utility.assignments.length,infeasible:true};
  const recipeBatches=solved.x.slice(0,R),rows=[];let rate=0,target=0,obj=0;for(let r=0;r<R;r++){const batches=Number(recipeBatches[r]||0);if(batches<=1e-8)continue;const base=model.rows[r],cycle=Number(occupancySeconds[r]||base.cycleSeconds||0),coin=base.netValue*batches,targ=model.state.target&&model.state.target!=='coin'?recipeNetItem(base.recipe,model.state.target)*batches:coin;rate+=coin;target+=targ;obj+=base.objective*batches;rows.push({...base,batchesPerHour:batches,units:batches*cycle/3600,cycleSeconds:cycle,perHour:coin,targetPerHour:targ});}
  const workerTaskSeconds=Array.from({length:team.length},()=>new Map());for(const a of utility.assignments)workerTaskSeconds[a.worker].set(a.task.key,3600);for(const e of edges){const sec=Number(solved.x[e.idx]||0);if(sec>1e-7)workerTaskSeconds[e.w].set(activeTasks[e.q].key,sec);}
  return{rate,targetRate:target,objectiveRate:obj,rows,recipeBatches,workerTaskSeconds,utilityAssignments:utility.assignments,utilityWorkers:utility.assignments.length,x:solved.x,infeasible:false};
}
function relevance(model,pal){
  let s=productionRelevance(model,pal);
  // Utility overlevel does not make a 24/7 station "more staffed"; eligibility
  // matters, while the worker's production potential is handled separately.
  for(const task of model.tasks||[])if(task.fixed&&palCanDo(pal,task))s+=taskDemandHours(model,task)*.5;
  return s;
}
function normalizeTeam(team){const seen=new Map();return team.map(x=>{const id=Number(x.pal.id),n=(seen.get(id)||0)+1;seen.set(id,n);return{...x,key:`${id}#${n}`,copy:n,label:x.pal.name};});}
function teamKey(team){return team.map(x=>x.key).sort().join('|');}
export function ownedSpecies(state,data){const list=[];for(const pal of data.pals){const rec=state.owned?.[String(pal.id)]??state.owned?.[pal.name];if(rec?.enabled&&Number(rec.count||0)>0)list.push({pal,maxCount:Math.max(1,Number(rec.count||1))});}return list;}
function nextCopy(spec,team){const used=team.filter(x=>Number(x.pal.id)===Number(spec.pal.id)).length;if(used>=spec.maxCount)return null;return{pal:spec.pal,key:`${spec.pal.id}#${used+1}`,copy:used+1,label:spec.pal.name};}
function mergeSpecPools(...pools){const out=new Map();for(const pool of pools)for(const spec of pool||[])if(!out.has(Number(spec.pal.id)))out.set(Number(spec.pal.id),spec);return[...out.values()];}
function utilitySpecialistSpecs(model,species,perTask=8){
  const out=[];
  for(const task of (model.tasks||[]).filter(t=>t.fixed)){
    const eligible=species.filter(spec=>palCanDo(spec.pal,task)).sort((a,b)=>{
      const ac=utilityOpportunityCost(model,a.pal),bc=utilityOpportunityCost(model,b.pal);if(Math.abs(ac-bc)>1e-9)return ac-bc;
      const ao=Math.max(0,Number(a.pal.abilities?.[task.ability]||0)-task.level),bo=Math.max(0,Number(b.pal.abilities?.[task.ability]||0)-task.level);
      return ao-bo||a.pal.name.localeCompare(b.pal.name);
    });
    out.push(...eligible.slice(0,perTask));
  }
  return mergeSpecPools(out);
}
function utilitySeedCore(model,species){
  const tasks=(model.tasks||[]).filter(t=>t.fixed);if(!tasks.length)return[];
  const copies=[];for(const spec of species)for(let copy=1;copy<=Math.min(spec.maxCount,tasks.length);copy++)copies.push({spec,copy,pal:spec.pal,key:`${spec.pal.id}#${copy}`,label:spec.pal.name});
  if(copies.length<tasks.length)return[];
  const BIG=1e9,cost=tasks.map((task,ti)=>copies.map((cand,ci)=>{
    if(!palCanDo(cand.pal,task))return BIG;
    const opportunity=utilityOpportunityCost(model,cand.pal),over=Math.max(0,Number(cand.pal.abilities?.[task.ability]||0)-task.level);
    return opportunity*1000+over*.05+ci*.000001+ti*.000000001;
  })),match=hungarianUtilityAssignment(cost);
  if(!match)return[];
  const picked=[];for(let ti=0;ti<tasks.length;ti++){const ci=match[ti];if(ci<0||cost[ti][ci]>=BIG/2)return[];picked.push(copies[ci]);}
  return normalizeTeam(picked);
}
function fillTeam(seed,pool,workers){
  const team=normalizeTeam(seed||[]);if(team.length>workers)return team.slice(0,workers);
  for(const spec of pool){while(team.length<workers){const cand=nextCopy(spec,team);if(!cand)break;team.push(cand);}if(team.length>=workers)break;}
  return normalizeTeam(team);
}

function taskObjects(row){const out=[];for(const[key,seconds]of row.work){const[ability,lvl,fam,tag]=key.split('|');out.push({key,ability,level:Number(lvl),family:fam?Number(fam):null,tag,facility:tag||row.facility,seconds:Number(seconds||0)});}return out;}
export function staffingCoverageSlots(model,rows=model.plan.rows){
  const slots=[],seq={n:0},active=rows||[];
  for(const task of utilityTasksForScenario(model.scenario))slots.push({id:`u${seq.n++}`,mode:'utility',facility:task.facility,task,label:`${task.facility.replaceAll('-',' ')} · ${task.ability} Lv.${task.level}`,weight:140});
  const permanentGroups=new Map(),burstGroups=new Map();
  for(const base of active){
    const row=model.rows.find(x=>x.recipe.id===base.recipe.id)||{...base,work:splitRecipeWork(base.recipe,model.state,model.scenario)},tasks=taskObjects(row);
    if(!tasks.length)continue;
    if(PERMANENT_STAFFING.has(base.facility)){
      const rec=permanentGroups.get(row.facility)||{units:0,tasks:[]};
      rec.units+=Math.max(0,Number(base.units||0));
      rec.tasks.push(...tasks);
      permanentGroups.set(row.facility,rec);
    }
    if(BURST_STAFFING.has(base.facility)){
      const rec=burstGroups.get(row.facility)||new Map();
      for(const task of tasks){
        const k=`${task.ability}|${task.family||''}`,prev=rec.get(k);
        if(!prev||Number(task.level||0)>Number(prev.level||0))rec.set(k,task);
      }
      burstGroups.set(row.facility,rec);
    }
  }
  for(const[facility,rec]of permanentGroups){
    const copies=Math.max(1,Math.ceil(rec.units-1e-9));
    const strongest=[...rec.tasks].sort((a,b)=>Number(b.level||0)-Number(a.level||0))[0];
    if(!strongest)continue;
    for(let n=1;n<=copies;n++)slots.push({id:`p${seq.n++}`,mode:'permanent',facility,task:strongest,label:`${facility.replaceAll('-',' ')} #${n} · ${strongest.ability}`,weight:100});
  }
  for(const[facility,rec]of burstGroups){
    for(const task of [...rec.values()].sort((a,b)=>a.ability.localeCompare(b.ability)||Number(b.level||0)-Number(a.level||0))){
      slots.push({id:`b${seq.n++}`,mode:'burst',facility,task,label:`${facility==='farmland'?'Farmland':'Woodland'} · ${task.ability} Lv.${task.level}`,weight:facility==='woodland'?4.4:4.2});
    }
  }
  return slots;
}
export function staffingCoverageMatch(model,team,rows=model.plan.rows){
  const slots=staffingCoverageSlots(model,rows),W=team.length;
  if(!slots.length||!W)return{coverageWeight:0,totalWeight:slots.reduce((s,x)=>s+x.weight,0),assignments:[],slots,utilityWorkers:[],permanentWorkers:[],reservedWorkers:[]};
  const assignments=[],reservedUsed=new Set(),utilitySlots=slots.filter(x=>x.mode==='utility'),permanent=slots.filter(x=>x.mode==='permanent').sort((a,b)=>b.weight-a.weight||a.label.localeCompare(b.label)),burst=slots.filter(x=>x.mode==='burst').sort((a,b)=>b.weight-a.weight||a.label.localeCompare(b.label)),utility=assignUtilityWorkers(model,team);
  if(utility.feasible)for(const a of utility.assignments){const slot=utilitySlots.find(s=>s.task.key===a.task.key);if(slot){reservedUsed.add(a.worker);assignments.push({worker:a.worker,slot});}}
  const scoreWorker=(w,slot)=>{const over=Math.max(0,Number(team[w].pal.abilities?.[slot.task.ability]||0)-slot.task.level);return over*10+relevance(model,team[w].pal);};
  for(const slot of permanent){
    let pick=-1,best=-Infinity;
    for(let w=0;w<W;w++){if(reservedUsed.has(w)||!palCanDo(team[w].pal,slot.task))continue;const score=scoreWorker(w,slot);if(score>best){best=score;pick=w;}}
    if(pick>=0){reservedUsed.add(pick);assignments.push({worker:pick,slot});}
  }
  for(const slot of burst){
    let pick=-1,best=-Infinity;
    for(let w=0;w<W;w++){if(reservedUsed.has(w)||!palCanDo(team[w].pal,slot.task))continue;const score=scoreWorker(w,slot);if(score>best){best=score;pick=w;}}
    if(pick>=0)assignments.push({worker:pick,slot});
  }
  const utilityWorkers=assignments.filter(x=>x.slot.mode==='utility').map(x=>x.worker),permanentWorkers=assignments.filter(x=>x.slot.mode==='permanent').map(x=>x.worker),base={coverageWeight:assignments.reduce((s,x)=>s+x.slot.weight,0),totalWeight:slots.reduce((s,x)=>s+x.weight,0),assignments,slots,utilityWorkers,permanentWorkers,reservedWorkers:[...reservedUsed]};
  const burstLoadByFacility=burstLoadSummary(model,team,rows,base),ratios=[...burstLoadByFacility.values()].map(x=>Number(x.capacityRatio||0));
  return{...base,burstLoadByFacility,burstResilienceScore:ratios.length?Math.min(...ratios):0};
}
export function burstLoadSummary(model,team,rows=model.plan.rows,match=null){
  const active=rows||[],resolvedMatch=match||staffingCoverageMatch(model,team,active),reserved=new Set(resolvedMatch.reservedWorkers||resolvedMatch.permanentWorkers||[]),free=team.map((_,i)=>i).filter(i=>!reserved.has(i)),byFacility=new Map();
  for(const base of active){
    if(!BURST_STAFFING.has(base.facility))continue;
    const row=model.rows.find(x=>x.recipe.id===base.recipe.id)||{...base,work:splitRecipeWork(base.recipe,model.state,model.scenario)},batches=Math.max(0,Number(base.batchesPerHour||0));
    if(batches<=1e-9)continue;
    const rec=byFacility.get(base.facility)||{tasks:new Map(),demandSeconds:0};
    for(const task of taskObjects(row)){
      const demand=Math.max(0,Number(task.seconds||0))*batches;if(demand<=1e-9)continue;
      const key=`${task.ability}|${task.level}|${task.family||''}`,prev=rec.tasks.get(key);
      if(prev)prev.demandSeconds+=demand;else rec.tasks.set(key,{task:{...task,facility:base.facility},demandSeconds:demand});
      rec.demandSeconds+=demand;
    }
    byFacility.set(base.facility,rec);
  }
  const out=new Map();
  for(const[facility,rec]of byFacility){
    const tasks=[...rec.tasks.values()],edges=[];
    for(const entry of tasks)for(const w of free)if(palCanDo(team[w].pal,entry.task))edges.push({entry,w,ratio:Math.max(.0001,workerTaskRelativeSpeed(model,team[w].pal,entry.task))});
    const N=edges.length+1,z=edges.length,objective=Array(N).fill(0);objective[z]=1;const A=[],b=[];
    for(const w of free){const row=Array(N).fill(0);edges.forEach((e,i)=>{if(e.w===w)row[i]=1;});A.push(row);b.push(3600);}
    for(const entry of tasks){const row=Array(N).fill(0);row[z]=entry.demandSeconds;edges.forEach((e,i)=>{if(e.entry===entry)row[i]-=e.ratio;});A.push(row);b.push(0);}
    const solved=tasks.length&&free.length?solveLp(objective,A,b):null,capacityRatio=Math.max(0,Number(solved?.x?.[z]||0)),demandHours=rec.demandSeconds/3600,eligibleWorkers=new Set(edges.map(e=>e.w)).size;
    out.set(facility,{demandHours,capacityRatio,capacityHours:demandHours*capacityRatio,headroomHours:demandHours*Math.max(0,capacityRatio-1),eligibleWorkers,freeWorkers:free.length});
  }
  return out;
}
export function burstSlots(model,rows=model.plan.rows){return staffingCoverageSlots(model,rows).filter(x=>x.mode==='burst');}
export function burstMatch(model,team,rows=model.plan.rows){return staffingCoverageMatch(model,team,rows);}


export async function findBestTeams(model,state,data,{limit=4,onProgress}={}){
  const species=ownedSpecies(state,data),workers=Math.max(1,Number(state.teamSlots||state.workerSlots||1));if(species.reduce((sum,x)=>sum+x.maxCount,0)<workers)throw new Error('Not enough enabled Aniimo copies for the requested real-team slots.');
  const ranked=[...species].sort((a,b)=>relevance(model,b.pal)-relevance(model,a.pal)||a.pal.name.localeCompare(b.pal.name)),utilityPool=utilitySpecialistSpecs(model,species),searchCount=Math.min(ranked.length,Math.max(42,Math.min(64,workers+14))),swapCount=Math.min(ranked.length,Math.max(32,Math.min(56,workers+10))),searchPool=mergeSpecPools(ranked.slice(0,searchCount),utilityPool),swapPool=mergeSpecPools(ranked.slice(0,swapCount),utilityPool),cache=new Map();
  const exact=team=>{const t=normalizeTeam(team),k=teamKey(t);if(!cache.has(k))cache.set(k,evaluateConcreteTeam(model,t));return cache.get(k);},seeds=[];
  const utilityCore=utilitySeedCore(model,species);if(utilityCore.length){const utilitySeed=fillTeam(utilityCore,mergeSpecPools(searchPool,ranked),workers);if(utilitySeed.length===workers)seeds.push(utilitySeed);}
  for(let mode=0;mode<8;mode++){const team=[];while(team.length<workers){let best=null,bestScore=-Infinity;for(let i=0;i<searchPool.length;i++){const spec=searchPool[(i+mode)%searchPool.length],cand=nextCopy(spec,team);if(!cand)continue;const score=relevance(model,cand.pal)*1000-i*.001;if(score>bestScore){bestScore=score;best=cand;}}if(!best)break;team.push(best);}if(team.length===workers)seeds.push(normalizeTeam(team));}
  for(let off=0;off<Math.min(6,searchPool.length);off++){const team=[];let cursor=off,guard=0;while(team.length<workers&&guard++<workers*searchPool.length*3){const spec=searchPool[cursor%searchPool.length],cand=nextCopy(spec,team);if(cand)team.push(cand);cursor++;}if(team.length===workers)seeds.push(normalizeTeam(team));}
  const unique=new Map(seeds.map(t=>[teamKey(t),t])),candidates=[];let si=0;for(const team of unique.values()){si++;onProgress?.(`Seed ${si}/${unique.size}`);const ev=exact(team),burst=burstMatch(model,team,ev.rows);candidates.push({team,eval:ev,burst});if(si%2===0)await new Promise(r=>setTimeout(r,0));}
  const teamCompare=(a,b)=>b.eval.objectiveRate-a.eval.objectiveRate||b.burst.coverageWeight-a.burst.coverageWeight||Number(b.burst.burstResilienceScore||0)-Number(a.burst.burstResilienceScore||0);
  const teamBetter=(a,b)=>a.eval.objectiveRate>b.eval.objectiveRate+.0001||(Math.abs(a.eval.objectiveRate-b.eval.objectiveRate)<=.0001&&(a.burst.coverageWeight>b.burst.coverageWeight+.0001||(Math.abs(a.burst.coverageWeight-b.burst.coverageWeight)<=.0001&&Number(a.burst.burstResilienceScore||0)>Number(b.burst.burstResilienceScore||0)+.0001)));
  candidates.sort(teamCompare);let beam=candidates.slice(0,4);
  for(let round=0;round<3;round++){const next=[];let improved=false;for(let ci=0;ci<beam.length;ci++){let best=beam[ci];for(let pos=0;pos<best.team.length;pos++){const reduced=best.team.filter((_,i)=>i!==pos);for(const spec of swapPool){const cand=nextCopy(spec,reduced);if(!cand)continue;const test=normalizeTeam([...reduced,cand]),ev=exact(test),bm=burstMatch(model,test,ev.rows),candidate={team:test,eval:ev,burst:bm};if(teamBetter(candidate,best)){best=candidate;improved=true;}}}next.push(best);onProgress?.(`Refine ${ci+1}/${beam.length} · round ${round+1}`);await new Promise(r=>setTimeout(r,0));}const d=new Map();for(const x of[...beam,...next]){const k=teamKey(x.team),old=d.get(k);if(!old||teamBetter(x,old))d.set(k,x);}beam=[...d.values()].sort(teamCompare).slice(0,4);if(!improved)break;}
  return beam.slice(0,limit);
}

export function findEssentialCore(model,team,target){let core=normalizeTeam(team),changed=true;while(changed){changed=false;for(let i=core.length-1;i>=0;i--){const test=normalizeTeam(core.filter((_,j)=>j!==i)),ev=evaluateConcreteTeam(model,test);if(ev.objectiveRate>=target-.0001){core=test;changed=true;break;}}}return core;}
export function antiStallSummary(model,full,core,rows=null){
  const need=new Map();for(const x of core)need.set(Number(x.pal.id),(need.get(Number(x.pal.id))||0)+1);
  const reserves=[];for(const x of full){const id=Number(x.pal.id),n=need.get(id)||0;if(n>0)need.set(id,n-1);else reserves.push(x);}
  const match=staffingCoverageMatch(model,full,rows||model.plan.rows),byFacility=new Map(),utilityByFacility=new Map(),permanentByFacility=new Map(),burstByFacility=new Map();
  const modeMap=mode=>mode==='utility'?utilityByFacility:mode==='permanent'?permanentByFacility:burstByFacility;
  for(const slot of match.slots){for(const map of[byFacility,modeMap(slot.mode)]){const rec=map.get(slot.facility)||{total:0,hit:0};rec.total++;map.set(slot.facility,rec);}}
  for(const a of match.assignments){byFacility.get(a.slot.facility).hit++;modeMap(a.slot.mode).get(a.slot.facility).hit++;}
  for(const[facility,metrics]of match.burstLoadByFacility||[])Object.assign(burstByFacility.get(facility)||{},metrics);
  return{reserves,match,byFacility,utilityByFacility,permanentByFacility,burstByFacility,burstResilienceScore:match.burstResilienceScore||0};
}
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
    const primaryLetters=new Map(),secondaryLetters=new Map(),primaryFacilities=new Map(),secondaryFacilities=new Map();
    for(const[f,v]of primary[w]){const l=FACILITY_PERSONALITY[f];if(!l)continue;primaryLetters.set(l,(primaryLetters.get(l)||0)+v);if(!primaryFacilities.has(l))primaryFacilities.set(l,new Set());primaryFacilities.get(l).add(f);}
    for(const row of rows){const l=FACILITY_PERSONALITY[row.facility];if(!l)continue;const tasks=taskObjects(row);if(tasks.some(t=>palCanDo(team[w].pal,t))){secondaryLetters.set(l,(secondaryLetters.get(l)||0)+Number(row.batchesPerHour||0)*Math.max(1,row.cycleSeconds));if(!secondaryFacilities.has(l))secondaryFacilities.set(l,new Set());secondaryFacilities.get(l).add(row.facility);}}
    const must=new Map();for(const pair of PERSONALITY_PAIRS){const choices=pair.filter(l=>primaryLetters.has(l));if(choices.length)must.set(pair.join(''),choices.sort((a,b)=>(primaryLetters.get(b)||0)-(primaryLetters.get(a)||0))[0]);}
    const candidates=PERSONALITY_PROFILES.filter(p=>[...must.entries()].every(([pair,l])=>p.includes(l))),score=p=>{let s=0;for(const l of p){s+=(primaryLetters.get(l)||0)*100+(secondaryLetters.get(l)||0);}return s;};
    let profile=candidates[0]||PERSONALITY_PROFILES[0],best=-Infinity;for(const p of candidates){const sc=score(p);if(sc>best+1e-8||(Math.abs(sc-best)<=1e-8&&p<profile)){best=sc;profile=p;}}
    const display=[];for(const pair of PERSONALITY_PAIRS){const key=pair.join(''),required=must.get(key);if(required)display.push({char:required,status:'must',facilities:[...(primaryFacilities.get(required)||[])]});else{const picked=pair.find(l=>profile.includes(l));if(picked&&(secondaryLetters.get(picked)||0)>0)display.push({char:picked,status:'nice',facilities:[...(secondaryFacilities.get(picked)||[])]});else display.push({char:'o',status:'none',facilities:[]});}}
    hints.push({profile,display,primaryLetters:[...primaryLetters.keys()],secondaryLetters:[...secondaryLetters.keys()]});
  }
  return hints;
}

function personalityEval(model,team,profiles,rows){
  // Re-optimise only the concrete team's active recipe set. Utility stations are pre-assigned to
  // unique 24/7 workers so the LP cannot illegally split one climate station across several Aniimo.
  const utility=assignUtilityWorkers(model,team);if(!utility.feasible)return{rate:0,targetRate:0,objectiveRate:-Infinity,profiles,rows:[],utilityAssignments:[],utilityWorkers:0};
  const reserved=new Set(utility.workers),recipeVars=[],rowVarIndices=Array.from({length:rows.length},()=>[]),genericRows=new Set(),add=v=>{v.idx=recipeVars.length;recipeVars.push(v);rowVarIndices[v.r].push(v.idx);};
  for(let r=0;r<rows.length;r++){const row=rows[r],tasks=taskObjects(row),letter=model.state.manualSpeeds?null:(FACILITY_PERSONALITY[row.facility]||null);if(!model.state.manualSpeeds&&tasks.length===1&&recipeUsesMeasuredEfficiency(row.recipe)){const task=tasks[0];for(let w=0;w<team.length;w++)if(!reserved.has(w)&&palCanDo(team[w].pal,task)){const personality=!!letter&&profileHas(profiles[w],letter),abilityLevel=Number(team[w].pal.abilities?.[task.ability]||0),parts=workerCycleParts(row.recipe,model.state,model.scenario,abilityLevel,personality);add({r,w,letter,boosted:personality,personality,ability:task.ability,abilityLevel,requiredLevel:task.level,efficiencyPct:parts.efficiencyPct||displayedEfficiencyPct(row.recipe,abilityLevel,personality),baseRate:parts.baseRate||baseWorkRateForRecipe(row.recipe),workerSeconds:row.recipe.pet?parts.cycle:parts.manual,occupancySeconds:parts.cycle,objective:combinedObjectiveCoef(row.recipe,model.state,model.data,model.plan.objectiveWeights),coin:recipeNetValue(row.recipe,model.data)});}}else if(letter&&tasks.length===1){const task=tasks[0];for(let w=0;w<team.length;w++)if(!reserved.has(w)&&palCanDo(team[w].pal,task)){const mult=profileHas(profiles[w],letter)?1.2:1,parts=cycleParts(row.recipe,model.state,model.scenario,mult);add({r,w,letter,boosted:mult>1,workerSeconds:row.recipe.pet?parts.cycle:parts.manual,occupancySeconds:parts.cycle,objective:combinedObjectiveCoef(row.recipe,model.state,model.data,model.plan.objectiveWeights),coin:recipeNetValue(row.recipe,model.data)});}}else{genericRows.add(r);add({r,w:null,letter:null,boosted:false,workerSeconds:null,occupancySeconds:row.cycleSeconds,objective:combinedObjectiveCoef(row.recipe,model.state,model.data,model.plan.objectiveWeights),coin:recipeNetValue(row.recipe,model.data)});}}
  const alloc=[];for(const r of genericRows){const tasks=taskObjects(rows[r]);for(let ti=0;ti<tasks.length;ti++)for(let w=0;w<team.length;w++)if(palCanDo(team[w].pal,tasks[ti]))alloc.push({r,ti,w,task:tasks[ti],idx:recipeVars.length+alloc.length});}
  const N=recipeVars.length+alloc.length;if(!N)return{rate:0,targetRate:0,objectiveRate:0,profiles};const objective=Array(N).fill(0);for(const v of recipeVars)objective[v.idx]=v.objective;const A=[],b=[];
  for(const slug of [...new Set(rows.map(r=>r.facility))]){const stacks=facilityStacks(model.state,slug),thresholds=[...new Set(rows.filter(r=>r.facility===slug).map(r=>Number(r.recipe.level||1)))].sort((a,b)=>a-b);for(const lvl of thresholds){const cap=stacks.filter(x=>x.level>=lvl).reduce((sum,x)=>sum+x.count,0),row=Array(N).fill(0);let used=false;for(const v of recipeVars)if(rows[v.r].facility===slug&&Number(rows[v.r].recipe.level||1)>=lvl){row[v.idx]=v.occupancySeconds/3600;used=true;}if(used){A.push(row);b.push(cap);}const collect=Number(model.state.collectHours||0);if(collect>0){const batchCap=stacks.filter(x=>x.level>=lvl).reduce((sum,x)=>sum+x.count*facilityOutputLimit(model.data,slug,x.level),0);if(batchCap>0){const cr=Array(N).fill(0);let cu=false;for(const v of recipeVars)if(rows[v.r].facility===slug&&Number(rows[v.r].recipe.level||1)>=lvl){cr[v.idx]=collect;cu=true;}if(cu){A.push(cr);b.push(batchCap);}}}}}
  for(const item of model.internalItems){const row=Array(N).fill(0);for(const v of recipeVars)row[v.idx]=-recipeNetItem(rows[v.r].recipe,item);A.push(row);b.push(0);}
  for(const g of model.state.guarantees||[]){if(g.enabled===false||g.maximize)continue;const item=Number(g.item),minimum=Math.max(0,Number(g.perHour||0));if(!item||minimum<=0)continue;const row=Array(N).fill(0);for(const v of recipeVars)row[v.idx]=-recipeNetItem(rows[v.r].recipe,item);A.push(row);b.push(-minimum);}
  for(let w=0;w<team.length;w++){const row=Array(N).fill(0);for(const v of recipeVars)if(v.w===w)row[v.idx]+=Number(v.workerSeconds||0);for(const a of alloc)if(a.w===w)row[a.idx]+=1;A.push(row);b.push(reserved.has(w)?0:3600);}
  for(const r of genericRows){const tasks=taskObjects(rows[r]),ri=rowVarIndices[r][0];if(ri==null)continue;for(let ti=0;ti<tasks.length;ti++){const row=Array(N).fill(0);row[ri]=tasks[ti].seconds;for(const a of alloc)if(a.r===r&&a.ti===ti)row[a.idx]=-1;A.push(row);b.push(0);}}
  const solved=solveLp(objective,A,b);if(!solved)return{rate:0,targetRate:0,objectiveRate:-Infinity,profiles,rows:[]};let obj=0,coin=0,target=0;const batches=Array(rows.length).fill(0),occupancy=Array(rows.length).fill(0),worked=Array(rows.length).fill(0),boostedByWorker=Array.from({length:team.length},()=>new Set()),speedAssignments=[];
  for(const v of recipeVars){
    const x=Math.max(0,Number(solved.x[v.idx]||0));batches[v.r]+=x;occupancy[v.r]+=x*Number(v.occupancySeconds||rows[v.r].cycleSeconds||0);worked[v.r]+=x*Number(v.workerSeconds||0);obj+=v.objective*x;coin+=v.coin*x;target+=model.state.target&&model.state.target!=='coin'?recipeNetItem(rows[v.r].recipe,model.state.target)*x:v.coin*x;
    if(v.w!=null&&x>1e-8){if(v.boosted)boostedByWorker[v.w].add(rows[v.r].facility);if(v.efficiencyPct)speedAssignments.push({row:v.r,recipeId:rows[v.r].recipe.id,facility:rows[v.r].facility,worker:v.w,batches:x,efficiencyPct:v.efficiencyPct,baseRate:v.baseRate||1,ability:v.ability,abilityLevel:v.abilityLevel,requiredLevel:v.requiredLevel,personality:!!v.personality});}
  }
  for(const a of alloc)worked[a.r]+=Math.max(0,Number(solved.x[a.idx]||0));
  const workerTaskSeconds=Array.from({length:team.length},()=>new Map());for(const a of utility.assignments)workerTaskSeconds[a.worker].set(a.task.key,3600);for(const v of recipeVars)if(v.w!=null){const x=Math.max(0,Number(solved.x[v.idx]||0));if(x>1e-8)workerTaskSeconds[v.w].set(`recipe:${rows[v.r].recipe.id}`,(workerTaskSeconds[v.w].get(`recipe:${rows[v.r].recipe.id}`)||0)+x*Number(v.workerSeconds||0));}for(const a of alloc){const sec=Math.max(0,Number(solved.x[a.idx]||0));if(sec>1e-8)workerTaskSeconds[a.w].set(a.task.key,(workerTaskSeconds[a.w].get(a.task.key)||0)+sec);}
  const recipeAcc=new Map(),facilityAcc=new Map();for(const a of speedAssignments){const recipe=rows[a.row].recipe,baseSeconds=manualWorkload(recipe)/Math.max(.01,a.baseRate||1),weight=Math.max(1e-9,baseSeconds*a.batches),time=weight/Math.max(.01,a.efficiencyPct/100);for(const[k,key]of [['recipe',String(a.recipeId)],['facility',a.facility]]){const map=k==='recipe'?recipeAcc:facilityAcc,rec=map.get(key)||{base:0,time:0,workers:new Set(),recipes:new Set()};rec.base+=weight;rec.time+=time;rec.workers.add(a.worker);rec.recipes.add(String(a.recipeId));map.set(key,rec);}}
  const summarize=map=>Object.fromEntries([...map].map(([k,v])=>[k,{pct:v.time>0?v.base/v.time*100:100,workers:[...v.workers],recipes:[...v.recipes]}]));
  const resultRows=[];for(let r=0;r<rows.length;r++){const bph=Number(batches[r]||0);if(bph<=1e-8)continue;const base=rows[r],coinPart=recipeNetValue(base.recipe,model.data)*bph,targetPart=model.state.target&&model.state.target!=='coin'?recipeNetItem(base.recipe,model.state.target)*bph:coinPart,cycle=bph>0?occupancy[r]/bph:base.cycleSeconds,manual=bph>0&&worked[r]>0?worked[r]/bph:base.manualSeconds;resultRows.push({...base,batchesPerHour:bph,units:occupancy[r]/3600,perHour:coinPart,targetPerHour:targetPart,cycleSeconds:cycle,manualSeconds:manual});}
  return{rate:coin,targetRate:target,objectiveRate:obj,profiles,rows:resultRows,recipeBatches:batches,boostedByWorker,speedAssignments,workerTaskSeconds,utilityAssignments:utility.assignments,utilityWorkers:utility.assignments.length,speedProfile:{recipes:summarize(recipeAcc),facilities:summarize(facilityAcc)}};
}

export async function optimizePersonalities(model,team,onProgress,concreteEval,burst=null){
  const rows=activePersonalityRows(model,concreteEval),match=burst||burstMatch(model,team,concreteEval?.rows),hints=chooseProfileHints(model,team,concreteEval,match),profiles=hints.map(h=>h.profile);
  onProgress?.(`Scoring legal personality roles · ${team.length} workers`);await new Promise(r=>setTimeout(r,0));
  const final=personalityEval(model,team,profiles,rows);return{...final,traitHints:hints};
}
