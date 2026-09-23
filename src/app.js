import {GAME_DATA as DATA} from './data.js';
import {DEFAULT_STATE} from './defaults.js';
import {
  optimizePlan,requiredAbilities,pickCoverageCore,buildTeamModel,findBestTeams,optimizePersonalities,
  findEssentialCore,antiStallSummary,itemName,itemValue,livingFacilityGroups,planItemRates,externalInputs,
  diagnoseObjective,defaultRecipeEfficiencyPct
} from './optimizer.js';
import {fillHomelandForRV,progressionSummary} from './progression.js';
import {readPlanCache,writePlanCache} from './plan-cache.js';
import {
  LAYOUT_SETTINGS_STORE,PLOT_MATRIX,plotRect,normalizeLayoutSettings,enabledPlotNumbers,enabledPlotRects,
  buildFullBaseLayout,layoutStillFitsPlots,readFullLayoutCache,writeFullLayoutCache
} from './full-layout.js';
import {evaluateClimateLayout,productionPlacementCounts} from './climate.js';

const STORE='aniimoHomelandOptimizerStateV1',PERF_STORE='aniimoOptimizerPerformanceV1',HIDEOUT='https://www.hideoutgacha.com';
const BUILD_ID=document.querySelector('meta[name="aniimo-build"]')?.content||'dev';
const MAX_ANIIMO_BY_HOMELAND=[0,5,8,11,14,17,20,22,24,26,28,30,32,34,36,38,40,42,43,44,45];
const maxAniimoForLevel=level=>MAX_ANIIMO_BY_HOMELAND[Math.min(20,Math.max(1,Number(level)||1))]||5;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const asset=path=>path?.startsWith('http')?path:`${HIDEOUT}${path||''}`,fmt=n=>Math.round(Number(n||0)).toLocaleString(),fmt1=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1}),pct=n=>`${(Number(n||0)*100).toFixed(2)}%`,clone=x=>JSON.parse(JSON.stringify(x));
const facilityMap=new Map(DATA.facilities.map(x=>[x.slug,x])),layoutPaletteCache=new Map();
let state=loadState(),perfSettings=loadPerfSettings(),layoutSettings=normalizeLayoutSettings(loadRawLayoutSettings(),state.homelandLevel),currentPlan=null,currentModel=null,currentFullLayout=null,recomputeTimer=null,undoSnapshot=null,undoTimer=null,teamSpeedOverride=null,teamAnalysisBaseline=null,teamAppliedPlan=false,activePlanSolve=null,activeLayoutSolve=null,plotDraftDisabled=null,computeSerial=0,layoutComputeSerial=0,lastOptimizerStats=null;
function diffCount(a,b){if(a===b)return 0;if(a==null||b==null||typeof a!=='object'||typeof b!=='object')return 1;const keys=new Set([...Object.keys(a),...Object.keys(b)]);let n=0;for(const k of keys){n+=diffCount(a[k],b[k]);if(n>=2)return n;}return n;}
function ensureUndoBar(){if($('#change-undo'))return;document.body.insertAdjacentHTML('beforeend',`<div id="change-undo" class="change-undo"><span><b>Detected a change.</b> Revert?</span><div><button id="undo-change" class="undo-action">REVERT</button><button id="close-undo" class="undo-action muted">CLOSE</button></div></div>`);$('#undo-change').onclick=()=>{if(!undoSnapshot)return;state=normalizeState(undoSnapshot);undoSnapshot=null;saveState();hideUndo();renderAll();history.replaceState(null,'',shareUrl());};$('#close-undo').onclick=hideUndo;}
function hideUndo(){clearTimeout(undoTimer);$('#change-undo')?.classList.remove('show');}
function offerUndo(before){if(diffCount(before,state)<2)return;ensureUndoBar();undoSnapshot=clone(before);$('#change-undo').classList.add('show');clearTimeout(undoTimer);undoTimer=setTimeout(hideUndo,12000);}
function applyAtomicState(next,before=clone(state)){teamSpeedOverride=null;state=normalizeState(next);saveState();renderAll();offerUndo(before);history.replaceState(null,'',shareUrl());}
function effectivePlanState(){if(!teamSpeedOverride)return state;return{...state,speeds:{...state.speeds,...teamSpeedOverride.facilities},realRecipeSpeeds:{...teamSpeedOverride.recipes}};}
function clearTeamSpeedOverride(refresh=true){const had=!!teamSpeedOverride||teamAppliedPlan;teamSpeedOverride=null;teamAnalysisBaseline=null;teamAppliedPlan=false;if(had&&refresh)renderFacilities();return had;}
function captureTeamBaseline(){
  const plan=currentPlan||{};
  return{
    ratePerHour:Number(plan.ratePerHour||0),
    targetRate:Number(plan.targetRate||0),
    objectiveRate:Number(plan.objectiveRate||0),
    objectiveWeights:clone(plan.objectiveWeights||[]),
    workerSlots:Number(state.workerSlots||0),
    teamSlots:Number(state.teamSlots||0)
  };
}
function comparisonForEval(ev,baseline){
  const b=baseline||captureTeamBaseline(),joint=(b.objectiveWeights||[]).length>1;
  if(joint){
    const base=Number(b.objectiveRate||0),actual=Number(ev?.objectiveRate||0);
    return{ratio:base?actual/base:0,delta:null,label:'of frozen theoretical combined objective',base,actual};
  }
  const base=state.target==='coin'?Number(b.ratePerHour||0):Number(b.targetRate||0),actual=state.target==='coin'?Number(ev?.rate||0):Number(ev?.targetRate||0);
  return{ratio:base?actual/base:0,delta:actual-base,label:'of frozen theoretical baseline',base,actual};
}
function speedOverrideFromSpecial(special){
  const profile=special?.ev?.speedProfile;if(!profile)return null;const facilities={},recipes={},details={};
  for(const[id,v]of Object.entries(profile.recipes||{}))if(Number.isFinite(Number(v?.pct)))recipes[id]=Number(v.pct);
  for(const[slug,v]of Object.entries(profile.facilities||{})){if(!Number.isFinite(Number(v?.pct)))continue;facilities[slug]=Number(v.pct);const workers=(v.workers||[]).map(i=>special.team?.[Number(i)]?.pal?.name).filter(Boolean);details[slug]={pct:Number(v.pct),workers:[...new Set(workers)],recipes:v.recipes||[]};}
  return Object.keys(facilities).length?{facilities,recipes,details}:null;
}

function defaultOwned(){const out={};for(const p of DATA.pals)out[String(p.id)]={enabled:true,count:1};return out;}
function normalizeState(s){
  const x={...clone(DEFAULT_STATE),...clone(s||{})};
  x.facilities={...clone(DEFAULT_STATE.facilities),...(s?.facilities||{})};x.modules={...clone(DEFAULT_STATE.modules),...(s?.modules||{})};x.speeds={...clone(DEFAULT_STATE.speeds),...(s?.speeds||{})};
  x.climateOptions={...clone(DEFAULT_STATE.climateOptions),...(s?.climateOptions||{})};
  if(s?.climate?.enabled&&!s?.climateOptions){const t=s.climate.temperature;if(t==='Cool'||t==='Freeze')x.climateOptions.cooling=true;else if(t==='Warm'||t==='Scorching')x.climateOptions.heat=true;else if(t==='Adequate')x.climateOptions.sunlamp=true;}
  x.homelandLevel=Math.min(20,Math.max(1,Number(x.homelandLevel)||1));const maxSlots=maxAniimoForLevel(x.homelandLevel);x.workerSlots=Math.min(maxSlots,Math.max(1,Number(x.workerSlots)||1));x.teamSlots=Math.min(maxSlots,Math.max(1,Number(s?.teamSlots??s?.workerSlots??x.teamSlots)||1));x.collectHours=Math.max(0,Number(x.collectHours||0));x.oneRecipePerFacility=!!x.oneRecipePerFacility;x.generatorAvailable=!!x.generatorAvailable;x.hungry=!!x.hungry;x.manualSpeeds=!!x.manualSpeeds;
  x.recipeNotes={...(s?.recipeNotes||{})};x.guarantees=Array.isArray(s?.guarantees)?s.guarantees.map(g=>({item:String(g.item||''),perHour:Math.max(0,Number(g.perHour||0)),maximize:!!g.maximize,enabled:g.enabled!==false})):[];x.target=String(x.target||'coin');
  if(!x.owned||!Object.keys(x.owned).length)x.owned=defaultOwned();for(const p of DATA.pals)if(!x.owned[String(p.id)])x.owned[String(p.id)]={enabled:true,count:1};
  return x;
}
function loadState(){try{return normalizeState(JSON.parse(localStorage.getItem(STORE)||'null'));}catch{return normalizeState(null);}}
function saveState(){localStorage.setItem(STORE,JSON.stringify(state));}

function loadRawLayoutSettings(){try{return JSON.parse(localStorage.getItem(LAYOUT_SETTINGS_STORE)||'null')||{};}catch{return{};}}
function currentLayoutSettings(){layoutSettings=normalizeLayoutSettings(layoutSettings,state.homelandLevel);return layoutSettings;}
function saveLayoutSettings(){layoutSettings=normalizeLayoutSettings(layoutSettings,state.homelandLevel);localStorage.setItem(LAYOUT_SETTINGS_STORE,JSON.stringify(layoutSettings));}
function cachedFullLayout(){
  if(!currentPlan?.rows?.length)return null;const settings=currentLayoutSettings(),cached=readFullLayoutCache(localStorage,currentPlan,effectivePlanState(),settings,BUILD_ID);if(cached)currentFullLayout=cached;return cached;
}
function startFullLayoutSolve(plan,planState,settings){
  if(typeof Worker==='undefined'){
    let cancelled=false;const promise=new Promise((resolve,reject)=>setTimeout(()=>{if(cancelled)return reject(Object.assign(new Error('Cancelled'),{name:'AbortError'}));try{resolve(buildFullBaseLayout(plan,planState,DATA,settings));}catch(e){reject(e);}},0));return{promise,cancel:()=>{cancelled=true;}};
  }
  const worker=new Worker('./src/layout-worker.js',{type:'module'});let settled=false;
  const promise=new Promise((resolve,reject)=>{worker.onmessage=e=>{const msg=e.data||{};if(msg.type==='result'){settled=true;worker.terminate();resolve(msg.layout);}else if(msg.type==='error'){settled=true;worker.terminate();reject(new Error(msg.message||'Full-layout worker failed.'));}};worker.onerror=e=>{if(settled)return;settled=true;worker.terminate();reject(new Error(e.message||'Full-layout worker crashed.'));};worker.postMessage({type:'layout',plan,planState,settings});});
  return{promise,cancel:()=>{if(!settled){settled=true;worker.terminate();}}};
}
function rebuildFullLayout(){currentFullLayout=null;renderClimateLayout({forceLayout:true});}
function updateLayoutSettings(mutator){const next={...currentLayoutSettings(),disabledPlots:[...(currentLayoutSettings().disabledPlots||[])]};mutator(next);layoutSettings=normalizeLayoutSettings(next,state.homelandLevel);saveLayoutSettings();rebuildFullLayout();}
function loadPerfSettings(){try{const x=JSON.parse(localStorage.getItem(PERF_STORE)||'null')||{};return{engine:['worker','main'].includes(x.engine)?x.engine:'worker',climateVariants:[12,28,56].includes(Number(x.climateVariants))?Number(x.climateVariants):28,liveProgress:x.liveProgress!==false};}catch{return{engine:'worker',climateVariants:28,liveProgress:true};}}
function savePerfSettings(){localStorage.setItem(PERF_STORE,JSON.stringify(perfSettings));}
function optimizerRunOptions(){return{maxClimateVariants:perfSettings.climateVariants,maxClimateOffset:9};}
function startPlanSolve(planState,{onProgress=null}={}){
  const options=optimizerRunOptions();
  if(perfSettings.engine==='main'||typeof Worker==='undefined'){
    let cancelled=false;
    const promise=new Promise((resolve,reject)=>setTimeout(()=>{if(cancelled)return reject(Object.assign(new Error('Cancelled'),{name:'AbortError'}));try{const started=performance.now(),plan=optimizePlan(planState,DATA,{...options,onProgress});plan.optimizerStats={...(plan.optimizerStats||{}),engine:'main',elapsedMs:Number(plan.optimizerStats?.elapsedMs??performance.now()-started)};resolve({plan,stats:plan.optimizerStats});}catch(e){reject(e);}},0));
    return{promise,cancel:()=>{cancelled=true;}};
  }
  const worker=new Worker('./src/optimizer-worker.js',{type:'module'});let settled=false;
  const promise=new Promise((resolve,reject)=>{
    worker.onmessage=e=>{const msg=e.data||{};if(msg.type==='progress'){onProgress?.(msg.progress||{});return;}if(msg.type==='result'){settled=true;worker.terminate();resolve({plan:msg.plan,stats:msg.stats||msg.plan?.optimizerStats||{}});}else if(msg.type==='error'){settled=true;worker.terminate();reject(new Error(msg.message||'Optimizer worker failed.'));}};
    worker.onerror=e=>{if(settled)return;settled=true;worker.terminate();reject(new Error(e.message||'Optimizer worker crashed.'));};
    worker.postMessage({type:'optimize',state:planState,options});
  });
  return{promise,cancel:()=>{if(!settled){settled=true;worker.terminate();}}};
}
function optimizerEngineLabel(engine=perfSettings.engine){return engine==='cache'?'Cached result':engine==='main'?'Main thread':'Worker acceleration';}
function optimizerProgressMarkup(p={},running=true){
  const cacheHit=!!p.cacheHit,progress=cacheHit?1:Math.max(0,Math.min(1,Number(p.progress??(running?0:1)))),filled=Math.round(progress*20),segments=Array.from({length:20},(_,i)=>`<i class="${i<filled?'on':''}"></i>`).join(''),elapsed=Math.max(0,Number(p.elapsedMs||0))/1000,candidates=Math.max(0,Number(p.candidatePlans||0)),rate=cacheHit?0:Number(p.candidatesPerSecond||p.rate||0),scenarios=Math.max(0,Number(p.scenarioIndex??p.testedScenarios??0)),total=Math.max(0,Number(p.scenarioTotal||0)),phase=String(p.phase||'search').replace(/^./,x=>x.toUpperCase()),engine=optimizerEngineLabel(p.engine||perfSettings.engine);
  const stats=cacheHit?'Exact plan state restored · optimization and climate placement skipped':[total?`${Math.min(scenarios,total)}/${total} scenarios`:'',candidates?`${candidates.toLocaleString()} candidates`:'',Number(p.climateOffsets||0)?`${Number(p.climateOffsets).toLocaleString()} geometry checks`:'',rate>0?`${fmt1(rate)}/s`:'',elapsed>0?`${elapsed.toFixed(elapsed<10?2:1)}s`:''].filter(Boolean).join(' · ');
  return`<div id="optimizer-live-progress" class="optimizer-progress ${running?'running':'done'}"><div class="optimizer-progress-copy"><b>${cacheHit?'Cached':running?phase:'Finished'} · ${esc(engine)}</b><span>${esc(stats||'Preparing search…')}</span></div><div class="optimizer-progress-track">${segments}</div></div>`;
}
function showOptimizerProgress(p={}){
  if(!perfSettings.liveProgress)return;
  const panel=$('#plan-panel'),html=optimizerProgressMarkup(p,true),old=$('#optimizer-live-progress');
  if(old){old.outerHTML=html;return;}
  const heading=panel.querySelector('.section-title');if(heading)heading.insertAdjacentHTML('afterend',html);else panel.innerHTML=title('Best plan')+html+`<div class="empty">Searching legal production, climate and geometry candidates…</div>`;
}
function ensureOptimizerSettingsUi(){
  if($('#optimizer-settings-btn'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <button id="optimizer-settings-btn" class="optimizer-settings-btn" title="Optimizer settings" aria-label="Optimizer settings">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.7 2h2.6l.5 2.1c.6.2 1.1.4 1.6.7l1.9-1.1 1.8 1.8-1.1 1.9c.3.5.5 1 .7 1.6l2.1.5v2.6l-2.1.5c-.2.6-.4 1.1-.7 1.6l1.1 1.9-1.8 1.8-1.9-1.1c-.5.3-1 .5-1.6.7l-.5 2.1h-2.6l-.5-2.1c-.6-.2-1.1-.4-1.6-.7l-1.9 1.1-1.8-1.8 1.1-1.9c-.3-.5-.5-1-.7-1.6l-2.1-.5V9.5L5.3 9c.2-.6.4-1.1.7-1.6L4.9 5.5l1.8-1.8 1.9 1.1c.5-.3 1-.5 1.6-.7L10.7 2Zm1.3 6.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2Z"/></svg>
    </button>
    <div id="optimizer-settings-overlay" class="optimizer-settings-overlay" aria-hidden="true">
      <div class="optimizer-settings-modal" role="dialog" aria-modal="true" aria-label="Optimizer settings">
        <button id="optimizer-settings-close" class="modal-close" aria-label="Close">×</button>
        <div class="super-title">Optimizer settings <span>ENGINE</span></div>
        <p>Heavy plan and climate searches can run outside the page's main thread. This keeps the interface responsive while the solver explores alternatives.</p>
        <div class="optimizer-setting-row"><div><b>Compute engine</b><small>Worker mode is the stable default. Main thread exists for compatibility.</small></div><select id="optimizer-engine"><option value="worker">Worker acceleration (stable)</option><option value="main">Main thread / compatibility</option></select></div>
        <div class="optimizer-setting-row"><div><b>Climate branch budget</b><small>How many rejected-plan variants each utility scenario may explore.</small></div><select id="optimizer-climate-budget"><option value="12">Quick · 12</option><option value="28">Balanced · 28</option><option value="56">Exhaustive · 56</option></select></div>
        <label class="optimizer-setting-check"><input id="optimizer-live-toggle" type="checkbox"><span><b>Live search telemetry</b><small>Show scenario progress, candidate count and search throughput in Best plan.</small></span></label>
      </div>
    </div>
  `);
  const overlay=$('#optimizer-settings-overlay'),setOpen=open=>{overlay.classList.toggle('open',open);overlay.setAttribute('aria-hidden',open?'false':'true');};
  $('#optimizer-settings-btn').onclick=()=>setOpen(true);$('#optimizer-settings-close').onclick=()=>setOpen(false);overlay.onclick=e=>{if(e.target===overlay)setOpen(false);};
  $('#optimizer-engine').value=perfSettings.engine;$('#optimizer-climate-budget').value=String(perfSettings.climateVariants);$('#optimizer-live-toggle').checked=perfSettings.liveProgress;
  $('#optimizer-engine').onchange=e=>{perfSettings.engine=e.target.value;savePerfSettings();};
  $('#optimizer-climate-budget').onchange=e=>{perfSettings.climateVariants=Number(e.target.value)||28;savePerfSettings();scheduleCompute();};
  $('#optimizer-live-toggle').onchange=e=>{perfSettings.liveProgress=e.target.checked;savePerfSettings();if(!perfSettings.liveProgress)$('#optimizer-live-progress')?.remove();};
}

function parseFacilities(raw){const out={};for(const tok of String(raw||'').split('_')){if(!tok.includes(':'))continue;const[slug,val]=tok.split(':',2),dot=val.lastIndexOf('.'),count=Number(dot>=0?val.slice(0,dot):val),level=Number(dot>=0?val.slice(dot+1):1);if(slug&&Number.isFinite(count)&&Number.isFinite(level))out[slug]={count,level};}return out;}
function parseSimple(raw){const out={};for(const tok of String(raw||'').split('_')){if(!tok.includes(':'))continue;const[k,v]=tok.split(':',2),n=Number(v);if(k&&Number.isFinite(n))out[k]=n;}return out;}
function applyUrl(input){
  const before=clone(state);let u;try{u=new URL(input,location.href);}catch{throw new Error('That does not look like a URL.');}const q=u.searchParams;
  if(q.has('f'))state.facilities=parseFacilities(q.get('f'));if(q.has('m'))state.modules=parseSimple(q.get('m'));if(q.has('y'))state.speeds=parseSimple(q.get('y'));
  if(q.has('h'))state.homelandLevel=Math.max(1,Number(q.get('h'))||1);if(q.has('w'))state.workerSlots=Math.max(1,Number(q.get('w'))||1);if(q.has('tw'))state.teamSlots=Math.max(1,Number(q.get('tw'))||1);
  if(q.has('a'))state.abilityLevel=q.get('a')==='auto'?'auto':Math.max(1,Number(q.get('a'))||1);if(q.has('collect'))state.collectHours=Math.max(0,Number(q.get('collect'))||0);if(q.has('one'))state.oneRecipePerFacility=q.get('one')==='1';
  if(q.has('cl')){const v=new Set(q.get('cl').split('.'));state.climateOptions={cooling:v.has('cooling'),heat:v.has('heat'),sunlamp:v.has('sunlamp')};}
  if(q.has('gen'))state.generatorAvailable=q.get('gen')==='1';if(q.has('hungry'))state.hungry=q.get('hungry')==='1';if(q.has('sm'))state.manualSpeeds=q.get('sm')==='1';if(q.has('target'))state.target=q.get('target')||'coin';
  if(q.has('g'))state.guarantees=q.get('g').split('.').map(x=>{const[id,n]=x.split('-');return{item:id,perHour:Number(n)||0,maximize:false,enabled:true};}).filter(x=>x.item);if(q.has('mx')){const maxItems=new Set(q.get('mx').split('.'));for(const g of state.guarantees)g.maximize=maxItems.has(String(g.item));}if(q.has('gd')){const disabled=new Set(q.get('gd').split('.').map(x=>Number(x)));state.guarantees.forEach((g,i)=>g.enabled=!disabled.has(i));}if(q.has('rn')){const disabledNotes=new Set(q.get('rn').split('.').filter(Boolean));const notes={};for(const r of DATA.recipes)if(r.note)notes[String(r.note.item)]=!disabledNotes.has(String(r.note.item));state.recipeNotes=notes;}
  if(q.has('p')){const ids=new Set(q.get('p').split('.').map(String));for(const p of DATA.pals)state.owned[String(p.id)]={enabled:ids.has(String(p.id)),count:1};}
  const ownedCounts=q.get('oc')||q.get('c');if(ownedCounts)for(const token of ownedCounts.split('.')){const[id,n]=token.split('-');if(state.owned[id])state.owned[id].count=Math.max(1,Number(n)||1);}
  state=normalizeState(state);saveState();renderAll();offerUndo(before);
}
function shareUrl(){
  const u=new URL(location.href);u.search='';const f=Object.entries(state.facilities).filter(([,x])=>Number(x.count)>0).map(([k,x])=>`${k}:${x.count}.${x.level}`).join('_'),m=Object.entries(state.modules).filter(([,v])=>Number(v)>0).map(([k,v])=>`${k}:${v}`).join('_'),y=Object.entries(state.speeds).filter(([,v])=>Number(v)>0).map(([k,v])=>`${k}:${v}`).join('_');
  const owned=DATA.pals.filter(p=>state.owned[String(p.id)]?.enabled).map(p=>p.id).join('.'),ownedCounts=DATA.pals.filter(p=>Number(state.owned[String(p.id)]?.count||1)!==1).map(p=>`${p.id}-${Math.max(1,Number(state.owned[String(p.id)]?.count||1))}`).join('.'),cl=Object.entries(state.climateOptions).filter(([,v])=>v).map(([k])=>k).join('.'),g=(state.guarantees||[]).filter(x=>x.item).map(x=>`${x.item}-${Number(x.perHour)||0}`).join('.'),mx=(state.guarantees||[]).filter(x=>x.item&&x.maximize).map(x=>x.item).join('.'),gd=(state.guarantees||[]).map((x,i)=>x.enabled===false?i:null).filter(x=>x!=null).join('.'),rn=[...new Set(DATA.recipes.filter(r=>r.note&&state.recipeNotes?.[String(r.note.item)]===false).map(r=>String(r.note.item)))].join('.');
  for(const[k,v]of[['f',f],['m',m],['y',y],['a',state.abilityLevel],['h',state.homelandLevel],['w',state.workerSlots],['tw',state.teamSlots],['collect',state.collectHours],['one',state.oneRecipePerFacility?1:0],['cl',cl],['gen',state.generatorAvailable?1:0],['hungry',state.hungry?1:0],['sm',state.manualSpeeds?1:0],['target',state.target],['mx',mx],['gd',gd],['rn',rn],['p',owned],['oc',ownedCounts]])if(v!==''&&v!=null)u.searchParams.set(k,String(v));if(g)u.searchParams.set('g',g);return u.toString();
}

function title(text,aside=''){return`<div class="section-title"><span></span><h3>${esc(text)}</h3><i></i>${aside?`<em class="micro">${aside}</em>`:''}</div>`;}
function update(mut,{rerender=null,plan=true}={}){mut(state);saveState();if(rerender)rerender();if(plan)scheduleCompute();}
function utilityCard(key,name,desc,icon=null){
  const generator=key==='generator',slug=key==='cooling'?'cooling-unit':key==='heat'?'heat-furnace':key==='sunlamp'?'sunlamp':'crackle-generator',f=facilityMap.get(slug),on=generator?!!state.generatorAvailable:!!state.climateOptions[key],src=icon||asset(f?.icon);
  return`<label class="utility-card ${on?'enabled':''}"><input class="utility-option" data-key="${key}" type="checkbox" ${on?'checked':''}><div class="utility-main"><img src="${src}" alt=""><b>${esc(name)}</b></div><small>${esc(desc)}</small></label>`;
}
function renderGeneral(){
  const cap=maxAniimoForLevel(state.homelandLevel),rv=progressionSummary(state.homelandLevel,DATA),collectionCap=Number(state.collectHours)>0;
  $('#general-panel').innerHTML=title('Plan settings')+`
    <div class="grid2 plan-settings-grid">
      <div class="field"><label>Homeland level</label><div class="number-with-max"><input id="homeland-level" type="number" min="1" max="20" value="${state.homelandLevel}"><span>/ 20</span></div></div>
      <div class="field"><label>Planning ability ceiling</label><select id="ability-level"><option value="auto" ${String(state.abilityLevel)==='auto'?'selected':''}>Auto from enabled roster</option>${[1,2,3,4].map(n=>`<option value="${n}" ${Number(state.abilityLevel)===n?'selected':''}>Lv.${n}</option>`).join('')}</select></div>
      <div class="field"><label>Theoretical plan Aniimo</label><div class="number-with-max"><input id="worker-slots" type="number" min="1" max="${cap}" value="${state.workerSlots}"><span>/ ${cap}</span></div></div>
      <div class="field"><label>Real team Aniimo</label><div class="number-with-max"><input id="team-slots" type="number" min="1" max="${cap}" value="${state.teamSlots}"><span>/ ${cap}</span></div></div>
    </div>
    <div class="capacity-note"><span>RV ${rv.rv} ceiling · ${rv.bulk.farmland} Farmland · ${rv.bulk.woodland} Woodland · ${rv.bulk.mine} Mine · ${rv.bulk.well} Well</span><button id="fill-rv" class="ghost compact">Fill for RV ${rv.rv}</button></div>
    <div class="plan-rules">
      <label class="check-row compact-rule"><input id="one-recipe" type="checkbox" ${state.oneRecipePerFacility?'checked':''}><span><b>One recipe per facility</b><small>Each physical copy stays on one recipe.</small></span></label>
      <div class="check-row compact-rule collection-rule ${collectionCap?'enabled':''}">
        <label class="collection-toggle"><input id="limit-collection" type="checkbox" ${collectionCap?'checked':''}><span><b>I empty facilities every</b></span></label>
        <select id="collect-hours" aria-label="Collection interval" ${collectionCap?'':'disabled'}>${[[0,'As often as it takes'],[1,'1 hour'],[2,'2 hours'],[4,'4 hours'],[8,'8 hours'],[12,'12 hours'],[24,'1 day'],[48,'2 days']].filter(([v])=>collectionCap?v>0:v===0).map(([v,n])=>`<option value="${v}" ${Number(state.collectHours)===v?'selected':''}>${n}</option>`).join('')}</select>
      </div>
      <label class="check-row compact-rule"><input id="hungry" type="checkbox" ${state.hungry?'checked':''}><span><b>Aniimo are out of food</b><small>Manual work runs at 20% speed.</small></span></label>
    </div>
    <div class="micro-label utility-heading">Utility buildings available to the solver</div>
    <div class="utility-grid">
      ${utilityCard('cooling','Cooling Unit','Provides Cool or Freeze.')}
      ${utilityCard('heat','Heat Furnace','Provides Warm or Scorching.')}
      ${utilityCard('sunlamp','Sunlamp','Provides Adequate conditions.')}
      ${utilityCard('generator','Crackle Generator','Enables E-mode recipes.','https://aniipedia.com/items/10400021.webp')}
    </div>
    <p class="micro utility-help">Checked means the solver may place it when useful; nothing is forced.</p>`;
  $('#homeland-level').onchange=e=>{state.homelandLevel=Math.min(20,Math.max(1,Number(e.target.value)||1));const m=maxAniimoForLevel(state.homelandLevel);state.workerSlots=Math.min(m,state.workerSlots);state.teamSlots=Math.min(m,state.teamSlots);saveState();renderGeneral();scheduleCompute();};
  $('#fill-rv').onclick=()=>{const before=clone(state);applyAtomicState(fillHomelandForRV(state,DATA),before);};
  $('#worker-slots').oninput=e=>update(x=>x.workerSlots=Math.min(maxAniimoForLevel(x.homelandLevel),Math.max(1,Number(e.target.value)||1)));
  $('#team-slots').oninput=e=>update(x=>x.teamSlots=Math.min(maxAniimoForLevel(x.homelandLevel),Math.max(1,Number(e.target.value)||1)));
  $('#ability-level').onchange=e=>update(x=>x.abilityLevel=e.target.value==='auto'?'auto':Number(e.target.value));
  $('#one-recipe').onchange=e=>update(x=>x.oneRecipePerFacility=e.target.checked);
  $('#limit-collection').onchange=e=>{state.collectHours=e.target.checked?(Number(state.collectHours)>0?Number(state.collectHours):1):0;saveState();renderGeneral();scheduleCompute();};
  $('#collect-hours').onchange=e=>update(x=>x.collectHours=Math.max(1,Number(e.target.value)||1),{rerender:renderGeneral});
  $('#hungry').onchange=e=>update(x=>x.hungry=e.target.checked);
  document.querySelectorAll('.utility-option').forEach(i=>i.onchange=e=>update(x=>{const key=e.target.dataset.key;if(key==='generator')x.generatorAvailable=e.target.checked;else x.climateOptions[key]=e.target.checked;},{rerender:renderGeneral}));
}
function automaticFacilitySpeed(slug){
  const active=(currentPlan?.rows||[]).filter(r=>r.facility===slug&&!r.recipe.electric&&(r.recipe.steps||[]).length);
  if(!active.length)return{pct:100,needs:[],active:false};
  let weighted=0,total=0;const needs=new Set();
  for(const row of active){
    const pct=defaultRecipeEfficiencyPct(row.recipe),weight=Math.max(1e-6,Number(row.batchesPerHour||0)*Math.max(1,Number(row.manualSeconds||1)));
    weighted+=pct*weight;total+=weight;
    for(const step of row.recipe.steps||[])needs.add(`${step.ability} Lv.${step.level}`);
  }
  return{pct:total?weighted/total:100,needs:[...needs],active:true};
}
function renderFacilities(){
  const rows=DATA.facilities.filter(f=>f.kind!=='utility').sort((a,b)=>{const ac=Number(state.facilities[a.slug]?.count||0)>0,bc=Number(state.facilities[b.slug]?.count||0)>0;return Number(bc)-Number(ac)||a.category-b.category||a.name.localeCompare(b.name);}),calibrated=!!teamSpeedOverride,manual=!!state.manualSpeeds;
  $('#facilities-panel').innerHTML=title('Facilities',calibrated?'real-team Efficiency · resets on plan change':manual?'manual Speed % locked':'automatic recipe-aware Efficiency')+`<label class="speed-mode-toggle"><input id="manual-speeds" type="checkbox" ${manual?'checked':''}><span><b>Manual Speed %</b><small>${manual?'Stored custom values are authoritative; Real Team will not overwrite them.':'Off = use each active recipe’s minimum required ability as the theoretical baseline. Real Team may temporarily replace it with actual abilities + personality.'}</small></span></label><div class="facility-head"><span>Facility</span><span>Count</span><span>Level</span><span>Speed %</span></div><div class="facility-list">${rows.map(f=>{const cfg=state.facilities[f.slug]||{count:0,level:1},auto=teamSpeedOverride?.details?.[f.slug],theory=automaticFacilitySpeed(f.slug),speed=manual?(state.speeds[f.slug]??300):(auto?.pct??theory.pct),mode=manual?'MANUAL':auto?'REAL':theory.active?'AUTO':'AUTO · idle',details=manual?'Stored custom Speed %':auto?`Real-team estimate: ${Number(auto.pct).toFixed(1)}% · ${auto.workers.join(', ')||'recommended worker'}`:`${theory.needs.length?theory.needs.join(' · '):'No active worked recipe'} · minimum required ability baseline`;return`<div class="facility-row ${auto&&!manual?'real-speed-row':!manual?'auto-speed-row':''}" data-facility="${f.slug}"><div class="facility-name"><img src="${asset(f.icon)}" alt=""><div><b>${esc(f.name)}</b><small>${esc(f.categoryName||f.kind)} · max Lv.${f.maxLevel} · ${esc(mode)}</small></div></div><input class="fac-count" title="Count" type="number" min="0" max="99" value="${cfg.count}"><input class="fac-level" title="Level" type="number" min="1" max="${f.maxLevel}" value="${cfg.level}"><input class="fac-speed speed-cell ${auto&&!manual?'real-speed':!manual?'auto-speed':''}" title="${esc(details)}" type="number" min="1" max="999" step="0.1" value="${Number(speed).toFixed(1)}" ${manual?'':'readonly'}></div>`;}).join('')}</div>`;
  $('#manual-speeds').onchange=e=>{teamSpeedOverride=null;state.manualSpeeds=e.target.checked;saveState();renderFacilities();scheduleCompute({refreshFacilities:false});};
  document.querySelectorAll('.facility-row').forEach(row=>{const slug=row.dataset.facility;row.querySelector('.fac-count').oninput=e=>facilityUpdate(slug,'count',Math.max(0,Number(e.target.value)||0));row.querySelector('.fac-level').oninput=e=>facilityUpdate(slug,'level',Math.max(1,Number(e.target.value)||1));row.querySelector('.fac-speed').oninput=e=>{if(!state.manualSpeeds)return;state.speeds[slug]=Math.max(1,Number(e.target.value)||100);saveState();scheduleCompute({refreshFacilities:false});};});
}
function facilityUpdate(slug,key,value){if(!state.facilities[slug])state.facilities[slug]={count:0,level:1};state.facilities[slug][key]=value;saveState();scheduleCompute();}
function renderModules(){
  const mods=[
    ['crafting-module','Crafting Module','https://aniipedia.com/items/4040014.webp'],
    ['ecological-module','Ecological Module','https://aniipedia.com/items/4040011.webp'],
    ['kitchen-module','Kitchen Module','https://aniipedia.com/items/4040012.webp'],
    ['resource-detector','Resource Detector','https://aniipedia.com/items/4040013.webp']
  ];
  $('#modules-panel').innerHTML=title('Upgrade modules')+`<div class="module-grid">${mods.map(([k,n,icon])=>`<div class="module-card"><img src="${icon}" alt=""><div class="module-info"><label>${esc(n)}</label><span>Upgrade level</span></div><input class="module-level" data-module="${k}" type="number" min="0" max="20" value="${state.modules[k]||0}" aria-label="${esc(n)} level"></div>`).join('')}</div>`;
  document.querySelectorAll('.module-level').forEach(i=>i.oninput=e=>update(x=>x.modules[e.target.dataset.module]=Math.max(0,Number(e.target.value)||0)));
}
const RECIPE_NOTE_UNLOCKS={'4040114':'RV 7','4040115':'RV 9','4040116':'RV 12','4040117':'RV 16','4040118':'RV 18','4040119':'RV 19'};
function recipeNoteIcon(id){return `${HIDEOUT}/images/aniimo/database/materials/item_${id}.webp`;}
function recipeNotes(){const m=new Map();for(const r of DATA.recipes)if(r.note){const key=String(r.note.item),old=m.get(key),output=(r.outputs||[])[0]?.item;if(!old)m.set(key,{...r.note,outputItem:output,outputName:output?itemName(DATA,output):''});else if(!old.outputItem&&output){old.outputItem=output;old.outputName=itemName(DATA,output);}}const rv=n=>Number((RECIPE_NOTE_UNLOCKS[String(n.item)]||'999').match(/\d+/)?.[0]||999);return[...m.values()].sort((a,b)=>rv(a)-rv(b)||a.name.localeCompare(b.name));}
function renderNotes(){const notes=recipeNotes(),on=notes.filter(n=>state.recipeNotes[String(n.item)]!==false).length;$('#notes-panel').innerHTML=title('Recipe notes',`${on} of ${notes.length} read`)+`<div class="note-grid">${notes.map(n=>{const name=n.name.replace(/^Recipe Note:\s*/,''),unlock=RECIPE_NOTE_UNLOCKS[String(n.item)]||'Recipe Note',output=n.outputItem?itemIcon(n.outputItem):'';return`<label class="note-card"><input class="note-toggle" data-id="${n.item}" type="checkbox" ${state.recipeNotes[String(n.item)]!==false?'checked':''}><div class="note-body"><div class="note-main"><img src="${output||recipeNoteIcon(n.item)}" alt="" onerror="this.style.opacity='.15'"><div><b>${esc(name)}</b>${n.outputName?`<span class="note-unlocks"><img src="${recipeNoteIcon(n.item)}" alt="" onerror="this.style.opacity='.15'"><span>Unlocks ${esc(n.outputName)}</span></span>`:''}</div></div><div class="note-unlock">Unlocked by <b>${esc(unlock)}</b></div></div></label>`;}).join('')}</div><p class="micro">Untick a note you have not read and every recipe gated by it disappears from the solver.</p>`;document.querySelectorAll('.note-toggle').forEach(i=>i.onchange=e=>update(x=>x.recipeNotes[e.target.dataset.id]=e.target.checked,{rerender:renderNotes}));}
function renderLiving(){const groups=livingFacilityGroups(state,DATA),caught=groups.filter(g=>g.owned.length).length;$('#living-panel').innerHTML=title('Aniimo living in facilities',`${caught} of ${groups.length} caught`)+`<p class="micro" style="margin:0 0 8px">No second checklist. This is inferred from the Aniimo roster in the header. If a family is disabled, its resident-only recipes simply stop existing.</p><div class="living-grid">${groups.map(g=>{const fac=facilityMap.get(g.facility),outs=g.outputs.map(x=>x.name).join(' · '),who=g.owned.map(p=>p.name).join(', ');return`<div class="living-card ${g.owned.length?'':'locked'}"><img src="${HIDEOUT}/images/aniimo/heads/${String(g.pet).slice(0,-2)}.webp" alt=""><div><b>${esc(g.petName)}</b><small>${esc(fac?.name||g.facility)} · makes ${esc(outs)}</small><div class="living-state">${g.owned.length?`available via ${esc(who)}`:'family not enabled'}</div></div></div>`;}).join('')}</div>`;}
const OWNERSHIP_ABILITY_LOOKUP=new Map(Object.keys(DATA.abilities||{}).map(name=>[name.toLowerCase(),name]));
function compareOwnershipLevel(level,op,target){if(op==='>')return level>target;if(op==='>=')return level>=target;if(op==='<')return level<target;if(op==='<=')return level<=target;return level===target;}
function palMatchesOwnershipFilter(p,raw){
  const q=String(raw||'').trim().toLowerCase();if(!q)return true;
  const tokens=q.replace(/\s*(<=|>=|=|<|>)\s*/g,'$1').split(/[\s,]+/).filter(Boolean),abilityRules=[],globalTests=[],nameTerms=[];
  for(const token of tokens){
    const fused=token.match(/^([a-z][a-z-]*)(<=|>=|=|<|>)(\d+)$/i);
    if(fused&&OWNERSHIP_ABILITY_LOOKUP.has(fused[1].toLowerCase())){abilityRules.push({ability:OWNERSHIP_ABILITY_LOOKUP.get(fused[1].toLowerCase()),tests:[{op:fused[2],target:Number(fused[3])}]});continue;}
    const ability=OWNERSHIP_ABILITY_LOOKUP.get(token);if(ability){abilityRules.push({ability,tests:[]});continue;}
    const level=token.match(/^(<=|>=|=|<|>)?(\d+)$/);if(level){globalTests.push({op:level[1]||'=',target:Number(level[2])});continue;}
    nameTerms.push(token);
  }
  const name=String(p?.name||'').toLowerCase();if(nameTerms.some(term=>!name.includes(term)))return false;
  const abilities=p?.abilities||{},passes=(value,tests)=>tests.every(t=>compareOwnershipLevel(Number(value||0),t.op,t.target));
  if(abilityRules.length){
    for(const rule of abilityRules){const value=Number(abilities?.[rule.ability]||0);if(value<=0||!passes(value,[...rule.tests,...globalTests]))return false;}
    return true;
  }
  if(globalTests.length)return Object.values(abilities).some(value=>Number(value||0)>0&&passes(Number(value),globalTests));
  return true;
}
function renderOwnership(){const enabled=DATA.pals.filter(p=>state.owned[String(p.id)]?.enabled),copies=enabled.reduce((s,p)=>s+Number(state.owned[String(p.id)]?.count||1),0);$('#ownership-panel').innerHTML=title('Aniimo you own',`${enabled.length} species · ${copies} copies`)+`<div class="ownership-tools"><input id="pal-search" placeholder="Name, ability or level… e.g. Light, <3" title="Examples: Light · 4 · Light, >=2 · Fire, <=3"><button id="own-all" class="ghost">All</button><button id="own-none" class="ghost">None</button></div><div class="ownership-filter-hint">Filter by name, ability, or ability level · <b>Light</b> · <b>4</b> · <b>Light, &lt;3</b></div><div class="ownership-grid" id="ownership-grid">${DATA.pals.map(p=>palRow(p)).join('')}</div><div class="summary-line"><span>Checkbox = usable species. Number = copies available to the real-team search.</span><span>${enabled.length}/${DATA.pals.length}</span></div>`;bindOwnership();}
function palRow(p){const rec=state.owned[String(p.id)]||{enabled:true,count:1},abilities=Object.entries(p.abilities||{}).map(([a,l])=>abilityPill(a,l,true)).join('');return`<label class="pal-row ${rec.enabled?'':'off'}" data-id="${p.id}" data-name="${esc(p.name.toLowerCase())}"><input class="pal-enabled" type="checkbox" ${rec.enabled?'checked':''}><img src="${palHeadIcon(p)}" onerror="this.style.visibility='hidden'" alt=""><span class="pal-info"><b>${esc(p.name)}</b><span class="pal-abilities">${abilities}</span></span><input class="pal-count" type="number" min="1" max="99" value="${rec.count||1}" title="Copies"></label>`;}
function bindOwnership(){
  const search=$('#pal-search');
  search.oninput=e=>{const q=e.target.value;document.querySelectorAll('.pal-row').forEach(row=>{const p=DATA.pals.find(x=>String(x.id)===String(row.dataset.id));row.style.display=p&&palMatchesOwnershipFilter(p,q)?'grid':'none';});};
  $('#own-all').onclick=()=>{for(const p of DATA.pals)state.owned[String(p.id)].enabled=true;saveState();renderOwnership();renderLiving();scheduleCompute();};
  $('#own-none').onclick=()=>{for(const p of DATA.pals)state.owned[String(p.id)].enabled=false;saveState();renderOwnership();renderLiving();scheduleCompute();};
  document.querySelectorAll('.pal-row').forEach(row=>{const id=row.dataset.id;row.querySelector('.pal-enabled').onchange=e=>{state.owned[id].enabled=e.target.checked;saveState();row.classList.toggle('off',!e.target.checked);renderLiving();scheduleCompute();};row.querySelector('.pal-count').oninput=e=>{state.owned[id].count=Math.max(1,Number(e.target.value)||1);saveState();};});
}
function targetItems(){const ids=new Set(DATA.recipes.flatMap(r=>(r.outputs||[]).map(o=>Number(o.item))));return[...ids].map(id=>({id,name:itemName(DATA,id),value:itemValue(DATA,id)})).sort((a,b)=>a.name.localeCompare(b.name));}
const HOME_COIN_ICON='https://aniipedia.com/items/v/tl98fh/1010.webp';
const SPECIAL_ITEM_ICONS={
  '110001':`${HIDEOUT}/images/aniimo/database/capture/item_110001.webp`,
  '110002':`${HIDEOUT}/images/aniimo/database/capture/item_110002.webp`,
  '110007':`${HIDEOUT}/images/aniimo/database/capture/item_110007.webp`,
  '150001':`${HIDEOUT}/images/aniimo/database/currency/item_150001.webp`,
  '150002':`${HIDEOUT}/images/aniimo/database/currency/item_150002.webp`,
  '150003':`${HIDEOUT}/images/aniimo/database/currency/item_150003.webp`
};
function itemIcon(value){const id=String(value);return id==='coin'?HOME_COIN_ICON:SPECIAL_ITEM_ICONS[id]||`${HIDEOUT}/images/aniimo/database/materials/item_${id}.webp`;}
const ABILITY_ICONS={
  Fire:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_fire.webp',
  Grass:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_grass.webp',
  Water:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_water.webp',
  Earth:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_earth.webp',
  Lightning:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_electricity.webp',
  Ice:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_ice.webp',
  Wind:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_wind.webp',
  Dark:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_shadow.webp',
  Light:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_bg_light.webp',
  Hauling:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_Img_Ability_Transport.webp',
  Artisanship:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_Img_Ability_Cropping.webp',
  Leisure:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_Img_Ability_Play.webp',
  Perfumery:'https://aniidex.com/_ipx/q_95&s_34x34/images/homeland/UI_Img_Ability_Incense_Making.webp'
};
function abilityIcon(name){return ABILITY_ICONS[name]||'';}
function palHeadIcon(p){return `${HIDEOUT}/images/aniimo/heads/${String(p.id).slice(0,-2)}.webp`;}
function itemInline(qty,item){return `<span class="item-inline"><img src="${itemIcon(item)}" alt="" onerror="this.style.opacity='.15'"><span>${esc(qty)}× ${esc(itemName(DATA,item))}</span></span>`;}
function coinValue(value,decimals=false){return `<span class="coin-value"><img src="${HOME_COIN_ICON}" alt=""><span>${decimals?fmt1(value):fmt(value)}</span></span>`;}
function metricValue(icon,value){return `<span class="metric-value"><img src="${icon}" alt=""><span>${value}</span></span>`;}
function abilityPill(name,level,mini=false){const c=DATA.abilities[name]?.color||'#7f8994';return `<span class="ability-pill ${mini?'mini':''}" style="--ability:${c}"><img src="${abilityIcon(name)}" alt=""><span>${esc(name)}</span><b>Lv.${level}</b></span>`;}
function palFallbackColors(p){const cs=Object.keys(p.abilities||{}).map(a=>DATA.abilities[a]?.color).filter(Boolean);return[cs[0]||'#56616c',cs[1]||cs[0]||'#313943'];}
function palAbilityChip(p,ability){const[a,b]=palFallbackColors(p),src=palHeadIcon(p);return `<span class="pal-ability-chip" data-palette-src="${src}" style="--pal-a:${a};--pal-b:${b}"><img src="${src}" alt="" onerror="this.style.visibility='hidden'"><span><b>${esc(p.name)}</b> · Lv.${p.abilities[ability]}</span></span>`;}
function teamPalChip(member,inner=''){const p=member.pal||member,[a,b]=palFallbackColors(p),src=palHeadIcon(p);return `<span class="pal-ability-chip team-pal-chip" data-palette-src="${src}" style="--pal-a:${a};--pal-b:${b}"><img src="${src}" alt="" onerror="this.style.visibility='hidden'"><span class="team-pal-copy"><b>${esc(p.name)}</b>${inner}</span></span>`;}
function coverageChip(f,v){const fac=facilityMap.get(f),name=fac?.name||f;return `<span class="coverage-chip ${v.hit===v.total?'full':''}">${fac?.icon?`<img src="${asset(fac.icon)}" alt="">`:''}<span>${esc(name)}</span><b>${v.hit}/${v.total}</b></span>`;}
function burstCoverageChip(f,v){
  const fac=facilityMap.get(f),name=fac?.name||f,ratio=Number(v.capacityRatio||0),load=Number(v.demandHours||0),full=v.hit===v.total&&ratio>=1-.001,capacity=ratio>=10?`${fmt1(ratio)}×`:ratio>0?`${ratio.toFixed(2)}×`:'0×',headroom=ratio>=1?`+${Math.round((ratio-1)*100)}%`:`${Math.round(ratio*100)}% covered`,title=`Current burst labour: ${load.toFixed(2)} Aniimo-h/h · independent service capacity: ${capacity} this load · ${v.eligibleWorkers||0} compatible free worker${Number(v.eligibleWorkers||0)===1?'':'s'} after permanent reservations.`;
  return`<span class="coverage-chip burst-load-chip ${full?'full':ratio>0?'partial':''}" title="${esc(title)}">${fac?.icon?`<img src="${asset(fac.icon)}" alt="">`:''}<span class="coverage-name">${esc(name)}</span><b>${v.hit}/${v.total}</b><span class="burst-metric"><em>load</em> ${load.toFixed(2)} h/h</span><span class="burst-metric ${ratio>=1?'healthy':'strained'}"><em>capacity</em> ${capacity} · ${headroom}</span></span>`;
}
function staffingCoverageMarkup(summary){
  if(!summary)return'';
  const permanent=[...(summary.permanentByFacility||new Map())],burst=[...(summary.burstByFacility||new Map())],parts=[];
  if(permanent.length)parts.push(`<div class="subhead">Permanent 24/7 coverage</div><div class="coverage permanent-coverage">${permanent.map(([f,v])=>coverageChip(f,v)).join('')}</div>`);
  if(burst.length)parts.push(`<div class="subhead">Burst / restart coverage</div><div class="coverage burst-coverage">${burst.map(([f,v])=>burstCoverageChip(f,v)).join('')}</div><p class="micro burst-help">Ability coverage is reusable across sequential crop/tree jobs. Load is the current plan's real manual labour demand; capacity is each facility family's independent headroom after permanent workers are reserved.</p>`);
  return parts.join('');
}
function applyPalGradients(){
  document.querySelectorAll('.pal-ability-chip[data-palette-src]').forEach(el=>{
    if(el.dataset.paletteDone)return;el.dataset.paletteDone='1';const img=new Image();img.crossOrigin='anonymous';
    img.onload=()=>{try{const cv=document.createElement('canvas'),ctx=cv.getContext('2d',{willReadFrequently:true});cv.width=cv.height=28;ctx.drawImage(img,0,0,28,28);const d=ctx.getImageData(0,0,28,28).data,bins=new Map();for(let i=0;i<d.length;i+=4){const a=d[i+3];if(a<110)continue;let r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx<35||mn>235||mx-mn<18)continue;r=Math.round(r/32)*32;g=Math.round(g/32)*32;b=Math.round(b/32)*32;const k=`${r},${g},${b}`;bins.set(k,(bins.get(k)||0)+a/255);}const ranked=[...bins].sort((x,y)=>y[1]-x[1]).map(([k])=>k.split(',').map(Number));if(!ranked.length)return;const first=ranked[0],dist=c=>Math.hypot(c[0]-first[0],c[1]-first[1],c[2]-first[2]),second=ranked.find(c=>dist(c)>85)||ranked[1]||first;el.style.setProperty('--pal-a',`rgb(${first.join(',')})`);el.style.setProperty('--pal-b',`rgb(${second.join(',')})`);}catch{}};
    img.src=el.dataset.paletteSrc;
  });
}
function itemChoice(value){if(String(value)==='coin')return{id:'coin',name:'Home Coin',value:0,icon:itemIcon('coin')};const id=String(value||'');return{id,name:itemName(DATA,id),value:itemValue(DATA,id),icon:itemIcon(id)};}
function pickerMenu(includeCoin,current){
  const items=targetItems(),zero=items.filter(x=>x.value<=0),sold=items.filter(x=>x.value>0);
  const option=x=>`<button type="button" class="item-option ${String(current)===String(x.id)?'selected':''}" data-value="${x.id}" data-search="${esc(String(x.name).toLowerCase())}" role="option" aria-selected="${String(current)===String(x.id)}"><img loading="lazy" decoding="async" src="${itemIcon(x.id)}" alt="" onerror="this.style.opacity='.15'"><span>${esc(x.name)}</span></button>`;
  return `<div class="item-picker-search"><span>⌕</span><input type="search" autocomplete="off" spellcheck="false" placeholder="Search items…" aria-label="Search items"></div><div class="item-picker-list">${includeCoin?option({id:'coin',name:'Home Coin'}):''}<div class="item-group" data-group="zero"><div class="item-group-title">Does not sell</div>${zero.map(option).join('')}</div><div class="item-group" data-group="sold"><div class="item-group-title">Crafting / sellable materials</div>${sold.map(option).join('')}</div><div class="item-picker-empty">No matching items.</div></div>`;
}
function itemPicker(value,includeCoin,picker,index=''){
  const current=itemChoice(value);
  return`<div class="item-picker" data-picker="${picker}" data-i="${index}"><button type="button" class="item-picker-button" aria-haspopup="listbox" aria-expanded="false"><img src="${current.icon}" alt="" onerror="this.style.opacity='.15'"><span>${esc(current.name)}</span><i>⌄</i></button><div class="item-picker-menu" role="listbox">${pickerMenu(includeCoin,value)}</div></div>`;
}
function resetPicker(menu){
  const search=menu.querySelector('.item-picker-search input');if(search)search.value='';
  menu.querySelectorAll('.item-option').forEach(o=>o.hidden=false);
  menu.querySelectorAll('.item-group').forEach(g=>g.hidden=false);
  const empty=menu.querySelector('.item-picker-empty');if(empty)empty.hidden=true;
}
function filterPicker(menu,query){
  const q=String(query||'').trim().toLowerCase(),options=[...menu.querySelectorAll('.item-option')];
  for(const o of options)o.hidden=!!q&&!String(o.dataset.search||'').includes(q);
  for(const g of menu.querySelectorAll('.item-group'))g.hidden=![...g.querySelectorAll('.item-option')].some(o=>!o.hidden);
  const empty=menu.querySelector('.item-picker-empty');if(empty)empty.hidden=options.some(o=>!o.hidden);
}
function bindItemPickers(){
  const closeMenu=menu=>{resetPicker(menu);menu.classList.remove('open');menu.previousElementSibling?.setAttribute('aria-expanded','false');};
  const closeAll=()=>document.querySelectorAll('.item-picker-menu.open').forEach(closeMenu);
  document.querySelectorAll('.item-picker').forEach(p=>{
    const trigger=p.querySelector('.item-picker-button'),menu=p.querySelector('.item-picker-menu'),search=menu.querySelector('.item-picker-search input');
    menu.onclick=e=>e.stopPropagation();
    trigger.onclick=e=>{e.stopPropagation();const opening=!menu.classList.contains('open');closeAll();if(opening){resetPicker(menu);menu.classList.add('open');trigger.setAttribute('aria-expanded','true');setTimeout(()=>search?.focus(),0);}};
    if(search){search.onclick=e=>e.stopPropagation();search.oninput=e=>filterPicker(menu,e.target.value);search.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeMenu(menu);trigger.focus();}};}
    p.querySelectorAll('.item-option').forEach(o=>o.onclick=e=>{e.stopPropagation();const value=o.dataset.value;if(p.dataset.picker==='target')state.target=value;else{const i=Number(p.dataset.i);if(state.guarantees[i])state.guarantees[i].item=value;}saveState();renderObjectives();scheduleCompute();});
  });
  if(!document.documentElement.dataset.itemPickerClose){document.addEventListener('click',closeAll);document.documentElement.dataset.itemPickerClose='1';}
}
function renderObjectives(){
  const joint=(state.guarantees||[]).filter(g=>g.enabled!==false&&g.maximize).length,active=(state.guarantees||[]).filter(g=>g.enabled!==false).length;
  $('#objective-panel').innerHTML=title('Objective')+`<div class="field"><label>Maximise</label>${itemPicker(state.target,true,'target')}</div><div class="micro-label objective-subtitle" style="margin-top:10px"><span>Also make at least</span><b>${active}/${(state.guarantees||[]).length} active${joint?` · ${joint} co-max`:''}</b></div><div id="guarantees">${(state.guarantees||[]).map((g,i)=>guaranteeRow(g,i)).join('')}</div><div class="objective-actions"><button id="add-guarantee" class="ghost">+ another requirement</button><button id="clear-guarantees" class="ghost">Clear requirements</button></div><div id="objective-diagnostics"></div><p class="micro">A normal row is a hard minimum in items per hour, and the solver maximises the main Objective around that floor. <b>MAX overrides /h completely</b>: the saved number is paused. Reachable MAX objectives are balanced by their normalised share first, so one cannot be silently starved, then remaining capacity breaks ties by total normalised output.</p>`;
  $('#add-guarantee').onclick=()=>{const first=targetItems()[0];state.guarantees.push({item:String(first?.id||''),perHour:1,maximize:false,enabled:true});saveState();renderObjectives();scheduleCompute();};
  $('#clear-guarantees').onclick=()=>{state.guarantees=[];saveState();renderObjectives();scheduleCompute();};
  document.querySelectorAll('.guarantee-enabled').forEach(i=>i.onchange=e=>{state.guarantees[Number(e.target.dataset.i)].enabled=e.target.checked;saveState();renderObjectives();scheduleCompute();});document.querySelectorAll('.guarantee-rate').forEach(i=>i.oninput=e=>{state.guarantees[Number(e.target.dataset.i)].perHour=Math.max(0,Number(e.target.value)||0);saveState();scheduleCompute();});
  document.querySelectorAll('.guarantee-max').forEach(i=>i.onchange=e=>{state.guarantees[Number(e.target.dataset.i)].maximize=e.target.checked;saveState();renderObjectives();scheduleCompute();});
  document.querySelectorAll('.guarantee-remove').forEach(b=>b.onclick=()=>{state.guarantees.splice(Number(b.dataset.i),1);saveState();renderObjectives();scheduleCompute();});
  bindItemPickers();
}
function guaranteeRow(g,i){const enabled=g.enabled!==false,maxed=!!g.maximize;return`<div class="objective-row ${enabled?'':'disabled'} ${maxed?'maxed':''}"><label class="guarantee-enabled-toggle" title="${enabled?'Disable this requirement without deleting it':'Enable this requirement'}"><input class="guarantee-enabled" data-i="${i}" type="checkbox" ${enabled?'checked':''} aria-label="${enabled?'Disable':'Enable'} requirement"></label>${itemPicker(g.item,false,'guarantee',i)}<label class="rate-field" title="${maxed?'Ignored while MAX is enabled; uncheck MAX to restore this minimum':'Minimum items per hour'}"><input class="guarantee-rate" data-i="${i}" type="number" min="0" step="any" value="${g.perHour||0}" aria-label="How many per hour" ${maxed?'disabled':''}><span>${maxed?'MAX':'/h'}</span></label><label class="maximize-toggle" title="Maximise this item together with the main objective; this replaces the /h minimum"><input class="guarantee-max" data-i="${i}" type="checkbox" ${maxed?'checked':''}><span>MAX</span></label><button class="ghost guarantee-remove" data-i="${i}" aria-label="Remove">×</button></div>`;}
function renderObjectiveDiagnostics(){
  const host=$('#objective-diagnostics');if(!host||!currentPlan)return;
  const requests=[];
  if(state.target&&state.target!=='coin')requests.push({item:String(state.target),maximize:true,primary:true});
  for(const g of state.guarantees||[]){
    if(g.enabled===false||!g.item)continue;
    if(g.maximize)requests.push({item:String(g.item),maximize:true,primary:false});
    else if(Number(g.perHour||0)>0)requests.push({item:String(g.item),maximize:false,minimum:Number(g.perHour||0),primary:false});
  }
  const warnings=[];
  for(const req of requests){
    const d=diagnoseObjective(currentPlan,effectivePlanState(),DATA,req.item,{minimum:req.minimum||0,maximize:req.maximize});
    if(d.ok)continue;
    const name=itemName(DATA,req.item),kind=req.maximize?'MAX':`${fmt1(req.minimum)}/h minimum`;
    const chain=d.chain?.length?` Relevant production line: ${d.chain.join(' ← ')}.`:'';
    warnings.push(`<div class="objective-warning"><img src="${itemIcon(req.item)}" alt=""><div><b>${esc(name)} ${esc(kind)} is missing from the final plan</b><span>${esc(d.detail+chain)}</span></div></div>`);
  }
  if(currentPlan?.climateFailure&&!currentPlan.climateFailure.feasible){const d=currentPlan.climateFailure;warnings.push(`<div class="objective-warning"><div class="climate-warning-mark">C/H</div><div><b>Climate placement is physically infeasible</b><span>${esc(d.message||'No valid Cooling / Heat placement was found for this plan.')}</span></div></div>`);}
  host.innerHTML=warnings.join('');
}

function scheduleCompute({keepTeamSpeeds=false,refreshFacilities=true}={}){if(!keepTeamSpeeds)clearTeamSpeedOverride(refreshFacilities);clearTimeout(recomputeTimer);recomputeTimer=setTimeout(()=>computePlan(),100);$('#team-panel').innerHTML=title('Real team optimizer')+`<div class="empty">Plan changed. Real-team speed calibration and its comparison baseline were cleared; the next analysis starts fresh.</div>`;}
async function computePlan({keepTeam=false}={}){
  const serial=++computeSerial;activePlanSolve?.cancel?.();activePlanSolve=null;
  const planState=effectivePlanState(),runOptions=optimizerRunOptions(),cacheable=!teamSpeedOverride&&!teamAppliedPlan,cached=cacheable?readPlanCache(localStorage,planState,runOptions,BUILD_ID):null;
  if(cached){
    currentPlan=cached.plan;currentFullLayout=null;lastOptimizerStats={...(cached.stats||currentPlan.optimizerStats||{}),engine:'cache',cacheHit:true,elapsedMs:0,progress:1};
    try{
      currentModel=buildTeamModel(currentPlan,planState,DATA);renderPlan();renderClimateLayout();renderOutputs();renderAbilities();renderObjectiveDiagnostics();if(!state.manualSpeeds||teamSpeedOverride)renderFacilities();if(!keepTeam)renderTeamReady();
      return;
    }catch(e){console.warn('Cached plan restore failed; recomputing.',e);}
  }
  const started=performance.now();lastOptimizerStats=null;showOptimizerProgress({progress:0,phase:'starting',scenarioIndex:0,scenarioTotal:0,candidatePlans:0,elapsedMs:0,engine:perfSettings.engine});
  const solve=startPlanSolve(planState,{onProgress:p=>{if(serial!==computeSerial)return;showOptimizerProgress({...p,engine:perfSettings.engine});}});activePlanSolve=solve;
  try{
    const result=await solve.promise;if(serial!==computeSerial)return;currentPlan=result.plan;currentFullLayout=null;lastOptimizerStats={...(result.stats||currentPlan.optimizerStats||{}),engine:perfSettings.engine,elapsedMs:Number(result.stats?.elapsedMs??performance.now()-started),progress:1};
    currentModel=buildTeamModel(currentPlan,planState,DATA);
    if(cacheable&&!currentPlan?.infeasible&&!currentPlan?.realTeamApplied)writePlanCache(localStorage,planState,runOptions,BUILD_ID,currentPlan,lastOptimizerStats);
    renderPlan();renderClimateLayout();renderOutputs();renderAbilities();renderObjectiveDiagnostics();if(!state.manualSpeeds||teamSpeedOverride)renderFacilities();if(!keepTeam)renderTeamReady();
  }catch(e){
    if(serial!==computeSerial||e?.name==='AbortError')return;currentPlan={rows:[],ratePerHour:0,targetRate:0,infeasible:true,scenarioLabel:'Error'};$('#plan-panel').innerHTML=title('Best plan')+`<div class="empty warning">${esc(e.message||e)}</div>`;$('#climate-panel').hidden=true;$('#outputs-panel').innerHTML='';$('#abilities-panel').innerHTML='';if(!keepTeam)renderTeamReady();
  }finally{if(serial===computeSerial)activePlanSolve=null;}
}
function objectiveName(){return state.target==='coin'?'Home Coin':itemName(DATA,state.target);}
const GENERATOR_ICON='https://aniipedia.com/items/10400021.webp';
function utilityChoiceMarkup(plan){
  const s=plan?.scenario||{},items=[];
  const add=(slug,label,icon=null)=>{const src=icon||asset(facilityMap.get(slug)?.icon);items.push(`<span class="utility-choice-item">${src?`<img src="${src}" alt="">`:''}<span>${esc(label)}</span></span>`);};
  if(s.cooling)add('cooling-unit',`Cooling: ${s.cooling}`);
  if(s.heat)add('heat-furnace',`Heat: ${s.heat}`);
  if(s.sunlamp)add('sunlamp','Sunlamp: Adequate');
  if(s.generator)add('crackle-generator','Crackle Generator',GENERATOR_ICON);
  return items.length?items.join('<span class="utility-choice-sep">·</span>'):'<span class="utility-choice-none">No utility building used</span>';
}
function productionDisplayCounts(facility,rows){return productionPlacementCounts(facility,rows,state,DATA);}
function groupedPlanRows(rows){
  const sorted=[...rows].sort((a,b)=>Number(b.perHour||0)-Number(a.perHour||0)),groups=new Map(),order=[];
  for(const row of sorted){if(!groups.has(row.facility)){groups.set(row.facility,[]);order.push(row.facility);}groups.get(row.facility).push(row);}
  return order.flatMap(facility=>{const group=groups.get(facility).sort((a,b)=>Number(b.perHour||0)-Number(a.perHour||0)),display=productionDisplayCounts(facility,group);return group.map((row,i)=>({row,continued:i>0,displayCount:display.get(row)||null}));});
}
function renderPlan(){const rawRows=[...(currentPlan.rows||[])],rows=groupedPlanRows(rawRows),targetRate=state.target==='coin'?currentPlan.ratePerHour:currentPlan.targetRate;let labor=currentPlan.utilityWorkers||0;for(const r of rawRows)labor+=r.recipe.pet?r.units:(r.manualSeconds||0)*r.batchesPerHour/3600;const aside=currentPlan.realTeamApplied?`${rawRows.length} assignments · exact real-team + personalities`:`${rawRows.length} assignments · ${currentPlan.testedScenarios||1} utility scenarios tested`,progress=lastOptimizerStats?optimizerProgressMarkup({...lastOptimizerStats,scenarioIndex:lastOptimizerStats.scenarioTotal||currentPlan.testedScenarios||0,scenarioTotal:lastOptimizerStats.scenarioTotal||currentPlan.testedScenarios||0,progress:1,candidatesPerSecond:Number(lastOptimizerStats.candidatePlans||0)/(Math.max(1,Number(lastOptimizerStats.elapsedMs||0))/1000)},false):'';$('#plan-panel').innerHTML=title('Best plan',aside)+progress+`
  <div class="metric-grid"><div class="metric"><small>${esc(objectiveName())} / hour</small><strong>${metricValue(itemIcon(state.target==='coin'?'coin':state.target),fmt1(targetRate))}</strong><span>${(state.guarantees||[]).some(g=>g.enabled!==false&&g.maximize)?'jointly maximised':'maximised output'}</span></div><div class="metric"><small>Home Coin / hour</small><strong>${metricValue(HOME_COIN_ICON,fmt(currentPlan.ratePerHour))}</strong><span>${fmt(currentPlan.ratePerHour*24)} / day</span></div></div>
  <div class="scenario-bar"><div><b>Utility choice</b><div class="chosen utility-choice">${utilityChoiceMarkup(currentPlan)}</div></div><span>${currentPlan.utilityWorkers||0} dedicated station slot${currentPlan.utilityWorkers===1?'':'s'} · ${state.oneRecipePerFacility?'walk-away recipes':'mixed recipes'} · ${state.collectHours?`collect every ${state.collectHours}h`:'no collection cap'}</span></div>
  ${currentPlan.infeasible?`<div class="empty warning">No feasible plan satisfies the current requirements.</div>`:rows.length?`<table class="plan-table"><thead><tr><th>Facility</th><th>Produce</th><th>Needs</th><th class="num">Cycle</th><th class="num coin-head"><img src="${HOME_COIN_ICON}" alt="">Coin/h</th></tr></thead><tbody>${rows.map(x=>planRow(x.row,x.continued,x.displayCount)).join('')}</tbody></table><p class="micro">Estimated active labour: ${labor.toFixed(2)} Aniimo-hours per hour, including resident and utility assignments.</p>`:`<div class="empty">No runnable production chain with the current settings.</div>`}`;}
function climateService(d,scenario={}){
  const utility=(slug,label)=>({slug,label,icon:asset(facilityMap.get(slug)?.icon)});
  if(d.env==='Adequate')return{items:[utility('sunlamp','Sunlamp')],label:'Sunlamp: Adequate'};
  if(d.env==='Scorching')return{items:[utility('heat-furnace','Heat')],label:'Heat: Scorching'};
  if(d.env==='Freeze')return{items:[utility('cooling-unit','Cooling')],label:'Cooling: Freeze'};
  if(d.env==='Warm'){
    if(scenario.cooling==='Cool'&&scenario.heat==='Scorching')return{items:[utility('heat-furnace','Heat'),utility('cooling-unit','Cooling')],label:'Heat + Cool: Warm'};
    return{items:[utility('heat-furnace','Heat')],label:`Heat: ${scenario.heat||'Warm'}`};
  }
  if(d.env==='Cool'){
    if(scenario.cooling==='Freeze'&&scenario.heat==='Warm')return{items:[utility('cooling-unit','Cooling'),utility('heat-furnace','Heat')],label:'Cooling + Heat: Cool'};
    return{items:[utility('cooling-unit','Cooling')],label:`Cooling: ${scenario.cooling||'Cool'}`};
  }
  return{items:[],label:d.env||''};
}
function climateBadge(d,scenario=currentPlan?.scenario||{}){
  const fac=facilityMap.get(d.facility),service=climateService(d,scenario),utilityIcons=service.items.map(x=>x.icon?`<img class="climate-service-icon" src="${x.icon}" alt="${esc(x.label)}">`:'').join('');
  return `<span class="climate-demand climate-${String(d.env).toLowerCase()}">${fac?.icon?`<img class="climate-demand-facility" src="${asset(fac.icon)}" alt="">`:''}<span>${d.count}× ${esc(fac?.name||d.name||d.facility)}</span><span class="climate-demand-service">${utilityIcons}<b>${esc(service.label)}</b></span></span>`;
}
function fallbackLayoutPalette(key){
  let h=0;for(const c of String(key||'structure'))h=(h*31+c.charCodeAt(0))%360;
  return[`hsl(${h} 34% 27%)`,`hsl(${(h+32)%360} 40% 38%)`];
}
function fullLayoutSvg(layout,climate){
  if(!layout)return'';
  const allPlots=PLOT_MATRIX.flat().map(plotRect).filter(Boolean),level=Math.min(16,Math.max(1,Number(state.homelandLevel)||1)),disabled=new Set(currentLayoutSettings().disabledPlots||[]),placements=layout.placements||[],fields=layout.fields||[],WORLD_W=80,WORLD_H=60;
  const fitRects=[...placements,...fields],fx=Math.max(0,Math.min(...fitRects.map(r=>Number(r.x||0)),40)),fy=Math.max(0,Math.min(...fitRects.map(r=>Number(r.y||0)),30)),fr=Math.min(WORLD_W,Math.max(...fitRects.map(r=>Number(r.x||0)+Number(r.w||0)),60)),fb=Math.min(WORLD_H,Math.max(...fitRects.map(r=>Number(r.y||0)+Number(r.h||0)),45)),pad=2.5,fit={x:Math.max(0,fx-pad),y:Math.max(0,fy-pad),w:Math.min(WORLD_W,Math.max(8,fr-fx+pad*2)),h:Math.min(WORLD_H,Math.max(8,fb-fy+pad*2))};
  if(fit.x+fit.w>WORLD_W)fit.x=WORLD_W-fit.w;if(fit.y+fit.h>WORLD_H)fit.y=WORLD_H-fit.h;
  const plotPalette=['#4fd68b','#8ddd72','#d6dc62','#e4c75d','#e7ad57','#e88f51','#e67451','#df5d58','#d95268','#cb507a','#b8518e','#a454a1','#905db0','#7868bd','#6276c4','#5684c8'];
  const defs=placements.map((p,i)=>{const [a,b]=fallbackLayoutPalette(p.facility),src=p.icon||asset(facilityMap.get(p.facility)?.icon)||'';return `<linearGradient id="layout-grad-${i}" x1="0" y1="0" x2="1" y2="1"><stop class="layout-stop-a" data-palette-key="${esc(p.facility)}" data-palette-src="${esc(src)}" offset="0%" stop-color="${a}"/><stop class="layout-stop-b" data-palette-key="${esc(p.facility)}" data-palette-src="${esc(src)}" offset="100%" stop-color="${b}"/></linearGradient><clipPath id="layout-clip-${i}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx=".16"/></clipPath>`;}).join('');
  const commonDefs=`<pattern id="layout-world-grid-minor" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M .5 0 L 0 0 0 .5" fill="none" stroke="rgba(220,233,243,.035)" stroke-width=".025"/></pattern><pattern id="layout-world-grid-major" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(229,239,247,.075)" stroke-width=".035"/></pattern><filter id="layout-image-wash" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation=".55"/><feColorMatrix type="saturate" values="1.35"/></filter><linearGradient id="layout-image-shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,.04)"/><stop offset="100%" stop-color="rgba(0,0,0,.16)"/></linearGradient>`;
  const plotFills=allPlots.map(p=>{const locked=p.plot>level,off=!locked&&disabled.has(p.plot),color=plotPalette[p.plot-1],fillAlpha=locked?.018:off?.028:.055,strokeAlpha=locked?.10:off?.24:.36,textAlpha=locked?.15:off?.30:.48,cls=locked?'locked':off?'disabled':'enabled';return `<g class="layout-plot ${cls}" data-plot="${p.plot}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${color}" fill-opacity="${fillAlpha}" stroke="${color}" stroke-opacity="${strokeAlpha}"/><text x="${p.x+p.w/2}" y="${p.y+p.h/2+.65}" text-anchor="middle" fill="${color}" fill-opacity="${textAlpha}">${p.plot}</text></g>`;}).join('');
  const backgrounds=placements.map((p,i)=>{const src=p.icon||asset(facilityMap.get(p.facility)?.icon)||'';return `<g class="layout-structure-bg" data-facility="${esc(p.facility)}"><title>${esc(p.name)}${p.outputItem?` · ${esc(itemName(DATA,p.outputItem))}`:''} · ${p.x},${p.y} · ${p.w}×${p.h}${p.rotated?' · rotated':''}</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx=".16" fill="url(#layout-grad-${i})"/>${src?`<image class="layout-image-wash" href="${src}" x="${p.x-.35}" y="${p.y-.35}" width="${p.w+.7}" height="${p.h+.7}" preserveAspectRatio="xMidYMid slice" clip-path="url(#layout-clip-${i})" filter="url(#layout-image-wash)"/>`:''}<rect class="layout-image-shade" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx=".16" fill="url(#layout-image-shade)"/></g>`;}).join('');
  const fieldSvg=fields.map(f=>`<rect class="full-climate-field ${esc(f.type)}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}"/>`).join('');
  const cool=fields.find(f=>f.type==='cooling'),heat=fields.find(f=>f.type==='heating');let derived='';
  if(cool&&heat&&climate?.mode){const x=Math.max(cool.x,heat.x),y=Math.max(cool.y,heat.y),right=Math.min(cool.x+cool.w,heat.x+heat.w),bottom=Math.min(cool.y+cool.h,heat.y+heat.h);if(right>x&&bottom>y)derived=`<rect class="full-climate-field derived env-${climate.mode==='hot'?'warm':'cool'}" x="${x}" y="${y}" width="${right-x}" height="${bottom-y}"/>`;}
  const plotLines=allPlots.map(p=>{const color=plotPalette[p.plot-1],locked=p.plot>level,off=!locked&&disabled.has(p.plot);return `<rect class="layout-plot-outline ${locked?'locked':off?'disabled':'enabled'}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" stroke="${color}" stroke-opacity="${locked?.12:off?.30:.48}"/>`;}).join('');
  const iconGroup=p=>{const fac=facilityMap.get(p.facility),structureSrc=p.icon||asset(fac?.icon),outputSrc=p.outputItem?itemIcon(p.outputItem):'',min=Math.max(.8,Math.min(p.w,p.h)),pad=min*.18,structureSize=Math.max(.45,min-pad*2),outputSize=outputSrc?structureSize*.5:0,gap=outputSrc?Math.max(.05,structureSize*.06):0,total=structureSize+(outputSrc?gap+outputSize:0),cx=p.x+p.w/2,top=p.y+p.h/2-total/2,imgs=[];if(structureSrc)imgs.push(`<image class="layout-structure-icon" href="${structureSrc}" x="${cx-structureSize/2}" y="${top}" width="${structureSize}" height="${structureSize}" preserveAspectRatio="xMidYMid meet"/>`);if(outputSrc)imgs.push(`<image class="layout-output-icon" href="${outputSrc}" x="${cx-outputSize/2}" y="${top+structureSize+gap}" width="${outputSize}" height="${outputSize}" preserveAspectRatio="xMidYMid meet"/>`);return `<g class="layout-icon-group"><title>${esc(p.name)}${p.outputItem?` → ${esc(itemName(DATA,p.outputItem))}`:''}</title>${imgs.join('')}</g>`;};
  const icons=placements.map(iconGroup).join('');
  return `<svg class="climate-map full-layout-map" viewBox="0 0 ${WORLD_W} ${WORLD_H}" data-world-w="${WORLD_W}" data-world-h="${WORLD_H}" data-fit-x="${fit.x}" data-fit-y="${fit.y}" data-fit-w="${fit.w}" data-fit-h="${fit.h}" role="img" aria-label="Optimized full Homeland layout"><defs>${commonDefs}${defs}</defs><rect class="layout-world-bg" x="0" y="0" width="${WORLD_W}" height="${WORLD_H}"/><rect class="layout-world-grid minor" x="0" y="0" width="${WORLD_W}" height="${WORLD_H}" fill="url(#layout-world-grid-minor)"/><rect class="layout-world-grid major" x="0" y="0" width="${WORLD_W}" height="${WORLD_H}" fill="url(#layout-world-grid-major)"/>${plotFills}${backgrounds}${plotLines}${fieldSvg}${derived}${icons}</svg>`;
}
async function analyzeLayoutPalette(src){
  if(!src)return null;if(layoutPaletteCache.has(src))return layoutPaletteCache.get(src);
  const promise=new Promise(resolve=>{
    const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{
      try{
        const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return resolve(null);ctx.drawImage(img,0,0,48,48);const px=ctx.getImageData(0,0,48,48).data,buckets=new Map();
        for(let i=0;i<px.length;i+=4){const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];if(a<96)continue;const max=Math.max(r,g,b),min=Math.min(r,g,b),brightness=(r+g+b)/3,sat=max-min;if(brightness<20||brightness>246)continue;const qr=Math.round(r/24)*24,qg=Math.round(g/24)*24,qb=Math.round(b/24)*24,key=`${qr},${qg},${qb}`,weight=(sat*1.45+Math.min(brightness,190)*.12)*(a/255);buckets.set(key,(buckets.get(key)||0)+weight);}
        const ranked=[...buckets.entries()].sort((a,b)=>b[1]-a[1]).map(([k])=>k.split(',').map(Number));if(!ranked.length)return resolve(null);const first=ranked[0],second=ranked.find(x=>Math.hypot(x[0]-first[0],x[1]-first[1],x[2]-first[2])>70)||first.map(v=>Math.min(255,v+36));resolve([`rgb(${first[0]} ${first[1]} ${first[2]})`,`rgb(${second[0]} ${second[1]} ${second[2]})`]);
      }catch{resolve(null);}
    };img.onerror=()=>resolve(null);img.src=src;
  });layoutPaletteCache.set(src,promise);return promise;
}
async function hydrateLayoutPalettes(root){
  const stops=[...root.querySelectorAll('.layout-stop-a[data-palette-src]')],sources=new Map();for(const stop of stops){const src=stop.dataset.paletteSrc,key=stop.dataset.paletteKey;if(src&&!sources.has(key))sources.set(key,src);}
  for(const[key,src]of sources){const palette=await analyzeLayoutPalette(src);if(!palette)continue;root.querySelectorAll(`.layout-stop-a[data-palette-key="${CSS.escape(key)}"]`).forEach(x=>x.setAttribute('stop-color',palette[0]));root.querySelectorAll(`.layout-stop-b[data-palette-key="${CSS.escape(key)}"]`).forEach(x=>x.setAttribute('stop-color',palette[1]));}
}
function layoutSettingsMarkup(full){
  const s=currentLayoutSettings(),enabled=enabledPlotNumbers(s,state.homelandLevel),storageLocked=Number(state.homelandLevel)<2,shapeOptions=[['auto','Auto'],['compact','Compact block'],['rows','Rows'],['clusters','Production clusters'],['spread','Spaced out']],storageOptions=Array.from({length:25},(_,i)=>`<option value="${i}" ${Number(s.storageUnits)===i?'selected':''}>${i}</option>`).join('');
  return `<div class="full-layout-settings"><div class="layout-settings-head"><b>FULL BASE</b><span>${full?.feasible?`${full.itemCount||0} structures · ${full.usedPlots?.length||0}/${enabled.length} plots used`:'layout needs attention'}</span></div><label class="layout-check"><input id="layout-compact" type="checkbox" ${s.compact?'checked':''}><span><b>Compress layout</b><small>Try to keep the complete base as tight as possible.</small></span></label><label class="layout-field"><span>Shape</span><select id="layout-shape">${shapeOptions.map(([v,n])=>`<option value="${v}" ${s.shape===v?'selected':''}>${n}</option>`).join('')}</select></label><label class="layout-check"><input id="layout-rotate" type="checkbox" ${s.allowRotate?'checked':''}><span><b>Allow 90° rotation</b><small>Rotate non-square facilities when it improves the fit.</small></span></label><label class="layout-field"><span>Storage units</span><select id="layout-storage" ${storageLocked?'disabled title="Storage Units unlock at RV2"':''}>${storageOptions}</select></label><button id="plot-management-open" class="plot-management-open"><img src="./assets/plot_management.webp" alt=""><span><b>Plot management</b><small>${enabled.length} of ${Math.min(16,Number(state.homelandLevel)||1)} unlocked plots enabled</small></span></button></div>`;
}
function ensurePlotManagementUi(){
  if($('#plot-management-overlay'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="plot-management-overlay" class="plot-management-overlay" aria-hidden="true"><div class="plot-management-modal" role="dialog" aria-modal="true" aria-label="Homeland plot management"><button id="plot-management-close" class="modal-close" aria-label="Close plot management">×</button><div class="plot-management-title"><img src="./assets/plot_management.webp" alt=""><div><small>FULL BASE</small><h3>Plot management</h3><p>Plot 1 unlocks at RV1; every following plot unlocks with its matching Homeland level.</p></div></div><div id="plot-management-grid" class="plot-management-grid"></div><p class="micro">Disable unlocked plots you do not want the auto-layout to use. Locked plots remain visible but cannot be selected.</p></div></div>`);
  $('#plot-management-close').onclick=()=>setPlotManagementOpen(false);$('#plot-management-overlay').onclick=e=>{if(e.target===$('#plot-management-overlay'))setPlotManagementOpen(false);};
}
function renderPlotManagementGrid(){
  ensurePlotManagementUi();const grid=$('#plot-management-grid'),saved=currentLayoutSettings(),draft=plotDraftDisabled??[...(saved.disabledPlots||[])],disabled=new Set(draft),level=Math.min(16,Math.max(1,Number(state.homelandLevel)||1));
  grid.innerHTML=PLOT_MATRIX.flat().map(n=>{const locked=n>level,on=!locked&&!disabled.has(n);return `<button type="button" class="plot-cell ${locked?'locked':on?'enabled':'disabled'}" data-plot="${n}" ${locked?'disabled':''}><b>${n}</b><span>${locked?`RV ${n}`:on?'ENABLED':'DISABLED'}</span></button>`;}).join('');
  grid.querySelectorAll('.plot-cell:not(.locked)').forEach(btn=>btn.onclick=()=>{const n=Number(btn.dataset.plot),set=new Set(plotDraftDisabled??saved.disabledPlots??[]);if(set.has(n))set.delete(n);else set.add(n);plotDraftDisabled=[...set].filter(x=>Number.isInteger(x)&&x>=1&&x<=16).sort((a,b)=>a-b);renderPlotManagementGrid();});
}
function setPlotManagementOpen(open){
  ensurePlotManagementUi();const overlay=$('#plot-management-overlay'),wasOpen=overlay.classList.contains('open');
  if(open){
    if(!wasOpen)plotDraftDisabled=[...(currentLayoutSettings().disabledPlots||[])];
    renderPlotManagementGrid();overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');return;
  }
  overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');
  if(!wasOpen){plotDraftDisabled=null;return;}
  const before=[...(currentLayoutSettings().disabledPlots||[])].sort((a,b)=>a-b),after=[...(plotDraftDisabled??before)].sort((a,b)=>a-b),changed=before.length!==after.length||before.some((n,i)=>n!==after[i]);plotDraftDisabled=null;
  if(!changed)return;
  layoutSettings=normalizeLayoutSettings({...currentLayoutSettings(),disabledPlots:after},state.homelandLevel);saveLayoutSettings();currentFullLayout=null;renderClimateLayout({forceLayout:true});
}
function bindFullLayoutControls(){
  $('#layout-compact').onchange=e=>updateLayoutSettings(x=>x.compact=e.target.checked);
  $('#layout-shape').onchange=e=>updateLayoutSettings(x=>x.shape=e.target.value);
  $('#layout-rotate').onchange=e=>updateLayoutSettings(x=>x.allowRotate=e.target.checked);
  $('#layout-storage').onchange=e=>updateLayoutSettings(x=>x.storageUnits=Math.max(0,Number(e.target.value)||0));
  $('#plot-management-open').onclick=()=>setPlotManagementOpen(true);
}
function paintFullLayout(host,full,climate){
  const demands=(climate?.demands||[]).map(d=>climateBadge(d,currentPlan.scenario||{})).join(''),good=!!full?.feasible,status=good?'PLACEMENT FOUND':'NO VALID FULL LAYOUT',message=good?(climate?.status&&climate.status!=='none'?climate.message:`${full.itemCount||0} plan structures placed across ${full.usedPlots?.length||0} Homeland plots.`):(full?.reason||'The active plan does not fit inside the enabled plots.'),aside=good?`${full.itemCount||0} structures · ${full.usedPlots?.length||0} plots`:'full-base packing blocked',map=fullLayoutSvg(full,climate),summary=`<div class="climate-layout-copy compact full-base-copy"><div class="climate-status ${good?'good':'bad'}">${status}</div><div class="climate-info-box">${esc(message)}</div>${demands?`<div class="climate-demand-list compact">${demands}</div>`:''}${layoutSettingsMarkup(full)}</div>`;
  host.innerHTML=title('Layout',aside)+`<div class="climate-layout-grid full-base-grid"><div class="climate-map-panel"><div class="climate-map-toolbar"><button type="button" class="climate-map-btn" data-climate-action="zoom-out" title="Zoom out" aria-label="Zoom out">−</button><span class="climate-map-zoom" id="climate-map-zoom">100%</span><button type="button" class="climate-map-btn" data-climate-action="zoom-in" title="Zoom in" aria-label="Zoom in">+</button><button type="button" class="climate-map-btn center" data-climate-action="center" title="Center optimized layout">◎ Center</button></div><div class="climate-map-wrap"><div class="climate-map-viewport" id="climate-map-viewport"><div class="climate-map-stage" id="climate-map-stage">${map}</div></div></div></div>${summary}</div>`;
  bindFullLayoutControls();setupClimateMapViewer(host);hydrateLayoutPalettes(host);
}
async function renderClimateLayout({forceLayout=false,reuseLayout=false}={}){
  const host=$('#climate-panel');if(!host)return;if(!currentPlan?.rows?.length){host.hidden=true;host.innerHTML='';return;}host.hidden=false;
  let climate=currentPlan.climateLayout;if(!climate)climate=evaluateClimateLayout(currentPlan,effectivePlanState(),DATA);currentPlan.climateLayout=climate;
  if(reuseLayout&&currentFullLayout){paintFullLayout(host,currentFullLayout,climate);return;}
  const serial=++layoutComputeSerial;activeLayoutSolve?.cancel?.();activeLayoutSolve=null;
  if(!forceLayout){const cached=currentFullLayout||cachedFullLayout();if(cached){paintFullLayout(host,cached,climate);return;}}
  const settings=currentLayoutSettings(),planSnapshot=clone(currentPlan),stateSnapshot=clone(effectivePlanState());
  host.innerHTML=title('Layout','packing full base…')+`<div class="full-layout-loading"><span class="loader"></span><div><b>Arranging the full Homeland</b><small>Climate clusters first, then every active structure. You can keep using the rest of the page while this runs.</small></div></div>`;
  const solve=startFullLayoutSolve(planSnapshot,stateSnapshot,settings);activeLayoutSolve=solve;
  try{
    const result=await solve.promise;if(serial!==layoutComputeSerial)return;currentFullLayout=result;writeFullLayoutCache(localStorage,currentPlan,effectivePlanState(),currentLayoutSettings(),BUILD_ID,currentFullLayout);paintFullLayout(host,currentFullLayout,climate);
  }catch(e){if(serial!==layoutComputeSerial||e?.name==='AbortError')return;host.innerHTML=title('Layout','layout worker error')+`<div class="empty warning">${esc(e.message||e)}</div>`;}
  finally{if(serial===layoutComputeSerial)activeLayoutSolve=null;}
}
function setupClimateMapViewer(root=document){
  const viewport=root.querySelector('#climate-map-viewport'),stage=root.querySelector('#climate-map-stage'),svg=stage?.querySelector('svg'),zoomLabel=root.querySelector('#climate-map-zoom');
  if(!viewport||!stage||!svg)return;
  const vb=svg.viewBox?.baseVal;if(!vb?.width||!vb?.height)return;
  const BASE_UNIT=32,baseW=vb.width*BASE_UNIT,baseH=vb.height*BASE_UNIT,minScale=.12,maxScale=7,fitX=Number(svg.dataset.fitX??vb.x),fitY=Number(svg.dataset.fitY??vb.y),fitW=Math.max(1,Number(svg.dataset.fitW??vb.width)),fitH=Math.max(1,Number(svg.dataset.fitH??vb.height));
  stage.style.width=`${baseW}px`;stage.style.height=`${baseH}px`;svg.style.width='100%';svg.style.height='100%';
  let homeScale=1,scale=1,tx=0,ty=0,dragging=false,dragStartX=0,dragStartY=0,pinchStartDistance=0,pinchStartScale=1,pinchStartTx=0,pinchStartTy=0,pinchCenterStart=null;
  const pointers=new Map(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function clampPan(){
    const vw=viewport.clientWidth,vh=viewport.clientHeight,sw=baseW*scale,sh=baseH*scale;
    tx=sw<=vw?(vw-sw)/2:clamp(tx,vw-sw,0);ty=sh<=vh?(vh-sh)/2:clamp(ty,vh-sh,0);
  }
  function apply(){clampPan();stage.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;if(zoomLabel)zoomLabel.textContent=`${Math.round((scale/Math.max(.0001,homeScale))*100)}%`;}
  function center(){const vw=viewport.clientWidth,vh=viewport.clientHeight;if(!vw||!vh)return;const fitPxW=fitW*BASE_UNIT,fitPxH=fitH*BASE_UNIT;homeScale=clamp(Math.min(vw/fitPxW,vh/fitPxH)*.9,minScale,maxScale);scale=homeScale;tx=(vw-fitPxW*scale)/2-fitX*BASE_UNIT*scale;ty=(vh-fitPxH*scale)/2-fitY*BASE_UNIT*scale;apply();}
  function zoomAt(clientX,clientY,dir){const r=viewport.getBoundingClientRect(),px=clientX-r.left,py=clientY-r.top,old=scale,next=clamp(scale*(dir>0?1.16:1/1.16),minScale,maxScale);if(Math.abs(next-old)<1e-8)return;const wx=(px-tx)/old,wy=(py-ty)/old;scale=next;tx=px-wx*scale;ty=py-wy*scale;apply();}
  viewport.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,e.deltaY<0?1:-1);},{passive:false});
  viewport.addEventListener('pointerdown',e=>{viewport.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){dragging=true;viewport.classList.add('dragging');dragStartX=e.clientX-tx;dragStartY=e.clientY-ty;}else if(pointers.size===2){const pts=[...pointers.values()];pinchStartDistance=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);pinchStartScale=scale;pinchStartTx=tx;pinchStartTy=ty;pinchCenterStart={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};dragging=false;viewport.classList.remove('dragging');}});
  viewport.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const pts=[...pointers.values()],dist=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};if(pinchStartDistance>0){const r=viewport.getBoundingClientRect(),sx=pinchCenterStart.x-r.left,sy=pinchCenterStart.y-r.top,mx=mid.x-r.left,my=mid.y-r.top,next=clamp(pinchStartScale*(dist/pinchStartDistance),minScale,maxScale),ratio=next/pinchStartScale;scale=next;tx=mx-(sx-pinchStartTx)*ratio;ty=my-(sy-pinchStartTy)*ratio;apply();}return;}if(dragging){tx=e.clientX-dragStartX;ty=e.clientY-dragStartY;apply();}});
  const endPointer=e=>{pointers.delete(e.pointerId);if(!pointers.size){dragging=false;viewport.classList.remove('dragging');}};viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);viewport.addEventListener('lostpointercapture',endPointer);
  root.querySelector('[data-climate-action="zoom-in"]')?.addEventListener('click',()=>{const r=viewport.getBoundingClientRect();zoomAt(r.left+r.width/2,r.top+r.height/2,1);});root.querySelector('[data-climate-action="zoom-out"]')?.addEventListener('click',()=>{const r=viewport.getBoundingClientRect();zoomAt(r.left+r.width/2,r.top+r.height/2,-1);});root.querySelector('[data-climate-action="center"]')?.addEventListener('click',center);viewport.addEventListener('dblclick',center);requestAnimationFrame(center);
}
function duration(s){if(!Number.isFinite(s))return'—';if(s>=3600)return`${(s/3600).toFixed(s%3600?1:0)}h`;if(s>=60)return`${Math.round(s/60)} min`;return`${Math.round(s)}s`;}
function durationHours(h){if(!Number.isFinite(h)||h<=0)return'—';if(h>=48)return`${(h/24).toFixed(1)}d`;if(h>=1)return`${h.toFixed(1)}h`;return`${Math.ceil(h*60)}m`;}
function materialFlows(plan){const map=new Map();for(const row of plan?.rows||[]){const b=Number(row.batchesPerHour||0);for(const o of row.recipe.outputs||[]){const id=Number(o.item),r=map.get(id)||{produced:0,consumed:0};r.produced+=Number(o.qty||0)*b;map.set(id,r);}for(const i of row.recipe.inputs||[]){const id=Number(i.item),r=map.get(id)||{produced:0,consumed:0};r.consumed+=Number(i.qty||0)*b;map.set(id,r);}}return map;}
function flowBadges(row){const flows=materialFlows(currentPlan),ids=[...new Set((row.recipe.inputs||[]).map(x=>Number(x.item)))],badges=[];for(const id of ids){const f=flows.get(id);if(!f||f.produced<=1e-7)continue;const net=f.produced-f.consumed,eps=.05,cls=net>eps?'surplus':net<-eps?'deficit':'balanced',label=net>eps?`+${fmt1(net)}/h left`:net<-eps?`${fmt1(net)}/h short`:'balanced';badges.push(`<span class="flow-badge ${cls}" title="Internal material balance"><img src="${itemIcon(id)}" alt=""><span>${esc(itemName(DATA,id))}</span><span class="flow-ledger">${fmt1(f.produced)} made · ${fmt1(f.consumed)} used</span><b>${label}</b></span>`);}return badges.length?`<div class="flow-badges">${badges.join('')}</div>`:'';}
function planRowClasses(row,continued=false){
  const out=[];if(continued)out.push('facility-continuation');
  const env=String(row?.recipe?.env||'').toLowerCase();
  if(env&&['freeze','cool','adequate','warm','scorching'].includes(env))out.push('climate-row',`climate-${env}`);
  if(row?.recipe?.electric)out.push('climate-row','climate-electric');
  return out.join(' ');
}
function facilityUsageLabel(row,fac,displayCount=null){
  const units=Math.max(0,Number(row?.units||0));
  if(fac?.kind==='production')return{label:`${Math.max(1,Number(displayCount)||1)}×`,title:`Calculated load: ${units<.995?`${Math.round(units*100)}%`:`${units.toFixed(2)} structure-equivalents`}. Whole placements are apportioned across this facility group without exceeding your placed count.`};
  return{label:units>=.995?`${units.toFixed(units>=10?0:1)}×`:`${Math.round(units*100)}%`,title:''};
}
function planRow(row,continued=false,displayCount=null){const fac=facilityMap.get(row.facility),usage=facilityUsageLabel(row,fac,displayCount),outs=(row.recipe.outputs||[]).map(o=>itemInline(o.qty,o.item)).join('<span class="item-sep">·</span>'),ins=(row.recipe.inputs||[]).map(i=>itemInline(i.qty,i.item)).join('<span class="item-sep">·</span>')||'<span class="nothing">nothing</span>',steps=(row.recipe.steps||[]).map(s=>abilityPill(s.ability,s.level)).join(''),extras=[row.recipe.pet?`resident ${row.recipe.petName||'family'}`:'',row.recipe.electric?'E-mode':''].filter(Boolean),needs=steps?`<div class="needs-list">${steps}</div>${extras.length?`<div class="need-extra">${esc(extras.join(' · '))}</div>`:''}`:`<span class="no-manual">No manual job</span>${extras.length?`<div class="need-extra">${esc(extras.join(' · '))}</div>`:''}`;return`<tr class="${planRowClasses(row,continued)}"><td><div class="prod" ${usage.title?`title="${esc(usage.title)}"`:''}>${continued?'<span class="facility-group-arrow">↳</span>':''}<img src="${asset(fac?.icon)}" alt=""><span>${usage.label} ${esc(fac?.name||row.facility)}</span></div></td><td><div class="recipe-items"><b>${outs}</b><div class="subtle from-line">from ${ins}</div>${flowBadges(row)}</div></td><td class="req">${needs}</td><td class="num">${duration(row.cycleSeconds)}</td><td class="num coin-cell"><b>${coinValue(row.perHour)}</b></td></tr>`;}
function outputKinds(){const primary=new Set(),secondary=new Set(),used=new Set();for(const row of currentPlan?.rows||[]){for(const input of row.recipe.inputs||[])used.add(Number(input.item));(row.recipe.outputs||[]).forEach((o,i)=>(i===0?primary:secondary).add(Number(o.item)));}return{primary,secondary,used};}
function sparkline(item,rate,kind='utility'){const palette=kind==='sell'?['#67d98b','#b4f4c7']:kind==='byproduct'?['#e6b85c','#f6dda3']:kind==='input'?['#ff6178','#ff9aaa']:['#74aef2','#b7d6fb'],seed=(Number(item)||String(item).split('').reduce((s,c)=>s+c.charCodeAt(0),0))+Math.round(Number(rate||0)*10),vals=[];for(let i=0;i<8;i++){const wave=Math.sin((seed%37+i*1.73)*.77)*.22,step=((seed*(i+5)*17)%29)/100;vals.push(Math.max(.08,Math.min(.95,.48+wave+step)));}vals[7]=Math.max(.18,Math.min(.94,.38+(Math.log10(Math.max(1,Number(rate||1)))%1)*.48));const pts=vals.map((v,i)=>`${(i*11.7).toFixed(1)},${(25-v*20).toFixed(1)}`).join(' '),last=pts.split(' ').at(-1).split(','),gid=`sp-${String(item).replace(/[^a-zA-Z0-9]/g,'')}-${kind}`;return`<svg class="sparkline" viewBox="0 0 82 30" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${palette[0]}" stop-opacity=".42"/><stop offset="100%" stop-color="${palette[0]}" stop-opacity="0"/></linearGradient></defs><polygon class="area" points="0,29 ${pts} 82,29" fill="url(#${gid})"/><polyline class="line" points="${pts}" stroke="${palette[0]}"/><circle class="dot" cx="${last[0]}" cy="${last[1]}" r="2.3" stroke="${palette[1]}"/></svg>`;}
function renderOutputs(){if(!currentPlan?.rows?.length){$('#outputs-panel').innerHTML=title('What you end up with')+`<div class="empty">Nothing is running.</div>`;return;}const rates=planItemRates(currentPlan,DATA),positive=rates.filter(x=>x.rate>1e-7).sort((a,b)=>b.coinPerHour-a.coinPerHour||b.rate-a.rate).slice(0,16),external=externalInputs(currentPlan,DATA).sort((a,b)=>b.costPerHour-a.costPerHour).slice(0,8),kinds=outputKinds();$('#outputs-panel').innerHTML=title('What you end up with')+`<div class="output-grid">${positive.map(x=>{const item=Number(x.item),secondaryOnly=kinds.secondary.has(item)&&!kinds.primary.has(item),byproduct=x.value>0&&secondaryOnly&&!kinds.used.has(item),kind=x.value<=0?'utility':secondaryOnly&&kinds.used.has(item)?'utility':byproduct?'byproduct':'sell',detail=x.value<=0?'progression / utility output':byproduct?`${fmt(x.value)} coin each · sellable byproduct`:kind==='utility'?`${fmt(x.value)} coin each · retained for production`:`${fmt(x.value)} coin each · sell output`;return`<div class="output-card ${kind}"><div class="output-info"><img src="${itemIcon(x.item)}" alt="" onerror="this.style.opacity='.15'"><div><b>${esc(x.name)}</b><small>${detail}</small></div></div><strong>${fmt1(x.rate)}/h</strong>${sparkline(x.item,x.rate,kind)}</div>`;}).join('')}</div>${external.length?`<div class="subhead">External inputs / seeds to buy</div><div class="output-grid">${external.map(x=>`<div class="output-card input"><div class="output-info"><img src="${itemIcon(x.item)}" alt="" onerror="this.style.opacity='.15'"><div><b>${esc(x.name)}</b><small>${x.value?`${fmt(x.costPerHour)} coin/h cost`:'external input'}</small></div></div><strong class="negative">${fmt1(x.perHour)}/h</strong>${sparkline(x.item,x.perHour,'input')}</div>`).join('')}</div>`:''}`;}
function renderAbilities(){const req=requiredAbilities(currentPlan),enabled=DATA.pals.filter(p=>state.owned[String(p.id)]?.enabled),core=pickCoverageCore(req,state.teamSlots,enabled);$('#abilities-panel').innerHTML=title('Abilities needed',`${core.core.length} minimum coverage · ${Math.max(0,state.teamSlots-core.core.length)} real-team slots spare`)+`<div class="ability-grid">${req.map(r=>{const c=DATA.abilities[r.ability]?.color||'#888',options=enabled.filter(p=>Number(p.abilities?.[r.ability]||0)>=r.level).sort((a,b)=>Number(b.abilities[r.ability])-Number(a.abilities[r.ability])).slice(0,4),copies=enabled.filter(p=>Number(p.abilities?.[r.ability]||0)>=r.level).reduce((s,p)=>s+Number(state.owned[String(p.id)]?.count||1),0);return`<div class="ability-card" style="--ability:${c}"><div class="ability-head"><div>${abilityPill(r.ability,r.level)}</div><span>${r.count} jobs</span></div><p>${esc(r.jobs.join(', '))}</p><div class="coverage-note">${copies} enabled copies can cover this</div><div class="chips pal-ability-list">${options.map(p=>palAbilityChip(p,r.ability)).join('')}</div></div>`;}).join('')}</div>${core.uncovered.length?`<p class="warning">Roster cannot cover: ${core.uncovered.map(x=>`${x.ability} Lv.${x.level}`).join(', ')}</p>`:''}`;applyPalGradients();}
function renderTeamReady(){$('#team-panel').innerHTML=title('Real team optimizer')+`<div class="team-toolbar"><button id="analyze-team" class="primary">Analyze ${state.teamSlots}-Aniimo real team</button><span id="team-status" class="status">Uses enabled copies, actual abilities, resident families, utility jobs and the full runnable recipe pool.</span></div><p class="micro">The theoretical plan above uses ${state.workerSlots} generic station slots. This pass is separate on purpose: it asks what your ${state.teamSlots}-Aniimo roster can actually achieve, and it is free to rebalance recipes around the team instead of merely checking whether it can imitate the generic plan.</p><div id="team-results"></div>`;$('#analyze-team').onclick=analyzeTeam;}
async function analyzeTeam(){
  const btn=$('#analyze-team'),status=$('#team-status'),box=$('#team-results');btn.disabled=true;box.innerHTML='';
  try{
    if(teamSpeedOverride||teamAppliedPlan){teamSpeedOverride=null;teamAppliedPlan=false;teamAnalysisBaseline=null;computePlan({keepTeam:true});renderFacilities();}
    teamAnalysisBaseline=captureTeamBaseline();const baseline=clone(teamAnalysisBaseline);
    const teams=await findBestTeams(currentModel,currentModel.state||state,DATA,{limit:4,onProgress:t=>status.innerHTML=`<span class="loader"></span> ${esc(t)}`});
    if(!teams.length)throw new Error('No valid team found.');
    const best=teams[0],core=findEssentialCore(currentModel,best.team,best.eval.objectiveRate),anti=antiStallSummary(currentModel,best.team,core,best.eval.rows);
    let special=null;
    for(let i=0;i<Math.min(3,teams.length);i++){
      status.innerHTML=`<span class="loader"></span> Measured-speed personality pass ${i+1}/${Math.min(3,teams.length)}`;
      const ev=await optimizePersonalities(currentModel,teams[i].team,t=>status.innerHTML=`<span class="loader"></span> ${esc(t)}`,teams[i].eval,teams[i].burst);
      if(!special||ev.objectiveRate>special.ev.objectiveRate)special={team:teams[i].team,ev};
    }
    if(special){
      special.coverage=antiStallSummary(currentModel,special.team,special.team,special.ev.rows);
      teamSpeedOverride=state.manualSpeeds?null:speedOverrideFromSpecial(special);
      currentPlan={...currentPlan,rows:special.ev.rows||[],ratePerHour:Number(special.ev.rate||0),targetRate:Number(special.ev.targetRate||0),objectiveRate:Number(special.ev.objectiveRate||0),utilityWorkers:Number(special.ev.utilityWorkers??currentPlan.utilityWorkers??0),realTeamApplied:true};
      currentPlan.climateLayout=evaluateClimateLayout(currentPlan,effectivePlanState(),DATA);
      currentFullLayout=null;
      teamAppliedPlan=true;
      renderPlan();renderClimateLayout();renderOutputs();renderAbilities();renderObjectiveDiagnostics();renderFacilities();
    }
    status.textContent=state.manualSpeeds?'Done · exact real-team + personality plan applied; manual Speed % remained locked':special?'Done · exact real-team + personality plan applied above; measured Efficiency shown in Facilities':'Done · actual roster optimum calculated against the frozen theoretical baseline';
    box.innerHTML=(special?renderSpecial(special,baseline):'')+teams.map((x,i)=>renderTeamCard(x,i,i===0?{core,anti}:null,baseline)).join('');
    applyPalGradients();
  }catch(e){teamAnalysisBaseline=null;teamAppliedPlan=false;status.textContent=e.message||String(e);box.innerHTML=`<div class="empty warning">${esc(e.message||e)}</div>`;}finally{btn.disabled=false;}
}
function traitMarkup(h){return`<span class="traits">${(h?.display||[]).map(x=>{const names=(x.facilities||[]).map(f=>facilityMap.get(f)?.name||f),boost=names.length?` · +20% to ${names.join(', ')}`:'';return`<span class="trait ${x.status}" title="${esc(x.status==='must'?`Required for primary role${boost}`:x.status==='nice'?`Useful secondary role${boost}`:'No relevant preference')}">${esc(x.char)}</span>`;}).join('')}</span>`;}
function speedCalibrationMarkup(s){const rows=Object.entries(s?.ev?.speedProfile?.facilities||{}).sort((a,b)=>Number(b[1]?.pct||0)-Number(a[1]?.pct||0));if(!rows.length)return'';return`<div class="speed-calibration"><div class="subhead">Measured real-team Efficiency</div><div class="speed-calibration-grid">${rows.map(([slug,v])=>{const fac=facilityMap.get(slug),workers=(v.workers||[]).map(i=>s.team?.[Number(i)]?.pal?.name).filter(Boolean);return`<span class="speed-chip" title="${esc(workers.join(', ')||'Recommended worker')}">${fac?.icon?`<img src="${asset(fac.icon)}" alt="">`:''}<span>${esc(fac?.name||slug)}</span><b>${fmt1(v.pct)}%</b></span>`;}).join('')}</div><p class="micro">These are the facility-screen Efficiency values actually used by the exact real-team + personality plan above. Changing any plan setting clears this calibration.</p></div>`;}
function renderSpecial(s,baseline=teamAnalysisBaseline){const cmp=comparisonForEval(s.ev,baseline),actual=state.target==='coin'?s.ev.rate:s.ev.targetRate,deltaText=cmp.delta==null?'':` · ${cmp.delta>=0?'+':''}${fmt1(cmp.delta)}/h`;return`<div class="result-card special"><div class="result-label">Special #1 · ideal legal personalities for the real team</div><div class="result-rate">${fmt1(actual)} ${esc(objectiveName())}/h</div><div class="result-delta">${pct(cmp.ratio)} ${esc(cmp.label)}${deltaText} · ${fmt(s.ev.rate)} coin/h</div><div class="chips team-chip-grid">${s.team.map((x,i)=>teamPalChip(x,traitMarkup(s.ev.traitHints?.[i]))).join('')}</div>${speedCalibrationMarkup(s)}${staffingCoverageMarkup(s.coverage)}<p class="micro"><span style="color:var(--green)">Green</span> letters belong to the worker's primary assigned structure and are kept mandatory. <span style="color:var(--amber)">Yellow</span> letters improve other plan jobs that Aniimo can cover. Hover a letter to see the exact structure receiving <b>+20%</b>. <b>o</b> means the pair is irrelevant.</p></div>`;}
function renderTeamCard(x,index,staff,baseline=teamAnalysisBaseline){const cmp=comparisonForEval(x.eval,baseline),actual=state.target==='coin'?x.eval.rate:x.eval.targetRate,deltaText=cmp.delta==null?'':` · ${cmp.delta>=0?'+':''}${fmt1(cmp.delta)}/h`;let extra='';if(staff){const{core,anti}=staff;extra+=`<div class="subhead">Essential core · ${core.length}</div><div class="chips team-chip-grid">${core.map(teamPalChip).join('')}</div>`;if(anti.reserves.length)extra+=`<div class="subhead">Anti-stall / spare coverage · ${anti.reserves.length}</div><div class="chips team-chip-grid">${anti.reserves.map(teamPalChip).join('')}</div>`;extra+=staffingCoverageMarkup(anti);}return`<div class="result-card ${index===0?'best':''}"><div class="result-label">${index===0?'Best actual roster plan':`Alternative ${index+1}`}</div><div class="result-rate">${fmt1(actual)} ${esc(objectiveName())}/h</div><div class="result-delta">${pct(cmp.ratio)} ${esc(cmp.label)}${deltaText} · ${fmt(x.eval.rate)} coin/h</div><div class="chips team-chip-grid">${x.team.map(teamPalChip).join('')}</div><div class="subhead">Plan rebalanced for this team · ${x.eval.rows.length} assignments</div>${extra}</div>`;}

function renderAll(){teamSpeedOverride=null;teamAnalysisBaseline=null;teamAppliedPlan=false;currentFullLayout=null;ensureOptimizerSettingsUi();ensurePlotManagementUi();renderObjectives();renderGeneral();renderFacilities();renderModules();renderNotes();renderLiving();renderOwnership();computePlan();}
window.__aniimoOptimizerBridge={getState:()=>clone(state),normalizeState,applyAtomicState,maxAniimoForLevel,shareUrl,analyzeTeam:()=>analyzeTeam(),getPerformanceSettings:()=>({...perfSettings}),optimizePlanAsync:async(planState,onProgress=null)=>{const solve=startPlanSolve(planState,{onProgress});return(await solve.promise).plan;}};
function setOwnershipOpen(open){const overlay=$('#ownership-overlay'),toggle=$('#ownership-toggle');overlay.classList.toggle('open',open);overlay.setAttribute('aria-hidden',open?'false':'true');toggle.setAttribute('aria-expanded',open?'true':'false');if(open)setTimeout(()=>$('#pal-search')?.focus(),0);}
$('#ownership-toggle').onclick=()=>setOwnershipOpen(!$('#ownership-overlay').classList.contains('open'));
$('#ownership-close').onclick=()=>setOwnershipOpen(false);
$('#ownership-overlay').onclick=e=>{if(e.target===$('#ownership-overlay'))setOwnershipOpen(false);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){setOwnershipOpen(false);setPlotManagementOpen(false);}});
$('#import-btn').onclick=()=>{try{applyUrl($('#import-url').value.trim());$('#import-url').value='';}catch(e){alert(e.message);}};$('#reset-btn').onclick=()=>{if(confirm('Reset the optimizer to project defaults?')){state=normalizeState(null);saveState();renderAll();}};$('#copy-link').onclick=async()=>{const url=shareUrl();await navigator.clipboard.writeText(url);$('#copy-link').textContent='Copied';setTimeout(()=>$('#copy-link').textContent='Copy share link',1200);};$('#data-version').textContent=`DATA ${DATA.version}`;
const SHARE_STATE_KEYS=['f','m','y','a','h','w','tw','p','c','oc','collect','one','cl','gen','hungry','sm','target','g','mx','gd','rn'];
const startupUrl=new URL(location.href),hasSharedState=[...startupUrl.searchParams.keys()].some(k=>SHARE_STATE_KEYS.includes(k));
if(hasSharedState){try{applyUrl(location.href);for(const k of SHARE_STATE_KEYS)startupUrl.searchParams.delete(k);history.replaceState(null,'',startupUrl.toString());}catch{renderAll();}}else renderAll();
