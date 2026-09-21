import { GAME_DATA as DATA } from './data.js';
import { DEFAULT_STATE } from './defaults.js';
import {
  optimizePlan, requiredAbilities, pickCoverageCore, buildTeamModel,
  findBestTeams, optimizePersonalities, findEssentialCore, antiStallSummary,
  ownedSpecies, itemName, FACILITY_PERSONALITY, PERSONALITY_NAMES
} from './optimizer.js';

const STORE='aniimoHomelandOptimizerStateV1';
const HIDEOUT='https://www.hideoutgacha.com';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const asset=path=>path?.startsWith('http')?path:`${HIDEOUT}${path||''}`;
const fmt=n=>Math.round(Number(n||0)).toLocaleString();
const pct=n=>`${(Number(n||0)*100).toFixed(2)}%`;
const clone=x=>JSON.parse(JSON.stringify(x));
const facilityMap=new Map(DATA.facilities.map(x=>[x.slug,x]));
const palMap=new Map(DATA.pals.map(x=>[String(x.id),x]));
let state=loadState();
let currentPlan=null,currentModel=null;
let recomputeTimer=null;

function defaultOwned(){
  const out={}; for(const p of DATA.pals) out[String(p.id)]={enabled:true,count:1}; return out;
}
function normalizeState(s){
  const x={...clone(DEFAULT_STATE),...clone(s||{})};
  x.facilities={...clone(DEFAULT_STATE.facilities),...(s?.facilities||{})};
  x.modules={...clone(DEFAULT_STATE.modules),...(s?.modules||{})};
  x.speeds={...clone(DEFAULT_STATE.speeds),...(s?.speeds||{})};
  x.climate={...clone(DEFAULT_STATE.climate),...(s?.climate||{})};
  if(!x.owned||!Object.keys(x.owned).length)x.owned=defaultOwned();
  for(const p of DATA.pals) if(!x.owned[String(p.id)]) x.owned[String(p.id)]={enabled:true,count:1};
  return x;
}
function loadState(){
  try{return normalizeState(JSON.parse(localStorage.getItem(STORE)||'null'));}catch{return normalizeState(null);}
}
function saveState(){localStorage.setItem(STORE,JSON.stringify(state));}

function parseFacilities(raw){
  const out={};for(const tok of String(raw||'').split('_')){if(!tok.includes(':'))continue;const [slug,val]=tok.split(':',2);const dot=val.lastIndexOf('.');const count=Number(dot>=0?val.slice(0,dot):val),level=Number(dot>=0?val.slice(dot+1):1);if(slug&&Number.isFinite(count)&&Number.isFinite(level))out[slug]={count,level};}return out;
}
function parseSimple(raw){const out={};for(const tok of String(raw||'').split('_')){if(!tok.includes(':'))continue;const [k,v]=tok.split(':',2),n=Number(v);if(k&&Number.isFinite(n))out[k]=n;}return out;}
function applyUrl(input){
  let u;try{u=new URL(input,location.href);}catch{throw new Error('That does not look like a URL.');}
  const q=u.searchParams;
  if(q.has('f')) state.facilities=parseFacilities(q.get('f'));
  if(q.has('m')) state.modules=parseSimple(q.get('m'));
  if(q.has('y')) state.speeds=parseSimple(q.get('y'));
  if(q.has('h')) state.homelandLevel=Math.max(1,Number(q.get('h'))||1);
  if(q.has('w')) state.workerSlots=Math.max(1,Number(q.get('w'))||1);
  if(q.has('a')) state.abilityLevel=Math.max(1,Number(q.get('a'))||1);
  if(q.has('p')){
    const ids=new Set(q.get('p').split('.').map(String));
    for(const p of DATA.pals) state.owned[String(p.id)]={enabled:ids.has(String(p.id)),count:state.owned?.[String(p.id)]?.count||1};
  }
  if(q.has('c')){
    for(const token of q.get('c').split('.')){const [id,n]=token.split('-');if(state.owned[id])state.owned[id].count=Math.max(1,Number(n)||1);}
  }
  saveState();renderAll();
}
function shareUrl(){
  const u=new URL(location.href);u.search='';
  const f=Object.entries(state.facilities).filter(([,x])=>Number(x.count)>0).map(([k,x])=>`${k}:${x.count}.${x.level}`).join('_');
  const m=Object.entries(state.modules).filter(([,v])=>Number(v)>0).map(([k,v])=>`${k}:${v}`).join('_');
  const y=Object.entries(state.speeds).filter(([,v])=>Number(v)>0).map(([k,v])=>`${k}:${v}`).join('_');
  const owned=DATA.pals.filter(p=>state.owned[String(p.id)]?.enabled).map(p=>p.id).join('.');
  const copies=DATA.pals.filter(p=>state.owned[String(p.id)]?.enabled&&Number(state.owned[String(p.id)].count)>1).map(p=>`${p.id}-${state.owned[String(p.id)].count}`).join('.');
  u.searchParams.set('f',f);u.searchParams.set('m',m);u.searchParams.set('y',y);u.searchParams.set('a',state.abilityLevel);u.searchParams.set('h',state.homelandLevel);u.searchParams.set('w',state.workerSlots);u.searchParams.set('p',owned);if(copies)u.searchParams.set('c',copies);return u.toString();
}

function title(text,aside=''){return `<div class="section-title"><span></span><h3>${esc(text)}</h3><i></i>${aside?`<em class="micro">${aside}</em>`:''}</div>`;}
function renderGeneral(){
  $('#general-panel').innerHTML=title('Optimizer')+`
    <div class="grid2">
      <div class="field"><label>Homeland level</label><input id="homeland-level" type="number" min="1" max="20" value="${state.homelandLevel}"></div>
      <div class="field"><label>Aniimo you can station</label><input id="worker-slots" type="number" min="1" max="45" value="${state.workerSlots}"></div>
      <div class="field"><label>Best ability level</label><select id="ability-level">${[1,2,3,4].map(n=>`<option ${n===Number(state.abilityLevel)?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Climate</label><select id="climate-enabled"><option value="0" ${!state.climate.enabled?'selected':''}>None</option><option value="1" ${state.climate.enabled?'selected':''}>Temperature building</option></select></div>
    </div>
    <div class="field" style="margin-top:10px;${state.climate.enabled?'':'display:none'}" id="temperature-field"><label>Temperature setting</label><select id="temperature">${['Freeze','Cool','Adequate','Warm','Scorching'].map(x=>`<option ${x===state.climate.temperature?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="quick-row"><button class="ghost speed-all" data-speed="100">100% speed</button><button class="ghost speed-all" data-speed="300">300% speed</button><button class="ghost speed-all" data-speed="400">400% speed</button></div>
    <p class="micro">Speed % is the facility Efficiency shown in game. Personality is modeled separately as +20% worker speed on a matching building.</p>`;
  $('#homeland-level').oninput=e=>update(x=>x.homelandLevel=Number(e.target.value));
  $('#worker-slots').oninput=e=>update(x=>x.workerSlots=Math.max(1,Number(e.target.value)||1));
  $('#ability-level').onchange=e=>update(x=>x.abilityLevel=Number(e.target.value));
  $('#climate-enabled').onchange=e=>{state.climate.enabled=e.target.value==='1';saveState();renderGeneral();scheduleCompute();};
  $('#temperature')?.addEventListener('change',e=>update(x=>x.climate.temperature=e.target.value));
  document.querySelectorAll('.speed-all').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.speed);for(const f of DATA.facilities)state.speeds[f.slug]=n;saveState();renderFacilities();scheduleCompute();});
}
function renderFacilities(){
  const rows=[...DATA.facilities].sort((a,b)=>{
    const ac=Number(state.facilities[a.slug]?.count||0)>0,bc=Number(state.facilities[b.slug]?.count||0)>0;return Number(bc)-Number(ac)||a.name.localeCompare(b.name);
  });
  $('#facilities-panel').innerHTML=title('Facilities')+`<div class="facility-list">${rows.map(f=>{
    const cfg=state.facilities[f.slug]||{count:0,level:1},speed=state.speeds[f.slug]??300;
    return `<div class="facility-row" data-facility="${f.slug}">
      <div class="facility-name"><img src="${asset(f.icon)}" alt=""><div><b>${esc(f.name)}</b><small>${esc(f.categoryName||f.kind)}</small></div></div>
      <input class="fac-count" title="Count" type="number" min="0" max="99" value="${cfg.count}">
      <input class="fac-level" title="Level" type="number" min="1" max="${f.maxLevel}" value="${cfg.level}">
      <input class="fac-speed speed-cell" title="Speed %" type="number" min="1" max="999" value="${speed}">
    </div>`;}).join('')}</div>`;
  document.querySelectorAll('.facility-row').forEach(row=>{
    const slug=row.dataset.facility;
    row.querySelector('.fac-count').oninput=e=>facilityUpdate(slug,'count',Math.max(0,Number(e.target.value)||0));
    row.querySelector('.fac-level').oninput=e=>facilityUpdate(slug,'level',Math.max(1,Number(e.target.value)||1));
    row.querySelector('.fac-speed').oninput=e=>{state.speeds[slug]=Math.max(1,Number(e.target.value)||100);saveState();scheduleCompute();};
  });
}
function facilityUpdate(slug,key,value){if(!state.facilities[slug])state.facilities[slug]={count:0,level:1};state.facilities[slug][key]=value;saveState();scheduleCompute();}
function renderModules(){
  const mods=[['crafting-module','Crafting Module'],['ecological-module','Ecological Module'],['kitchen-module','Kitchen Module'],['resource-detector','Resource Detector']];
  $('#modules-panel').innerHTML=title('Modules')+`<div class="grid2">${mods.map(([k,n])=>`<div class="field"><label>${n}</label><input class="module-level" data-module="${k}" type="number" min="0" max="20" value="${state.modules[k]||0}"></div>`).join('')}</div>`;
  document.querySelectorAll('.module-level').forEach(i=>i.oninput=e=>{state.modules[e.target.dataset.module]=Math.max(0,Number(e.target.value)||0);saveState();scheduleCompute();});
}
function renderOwnership(){
  const enabled=DATA.pals.filter(p=>state.owned[String(p.id)]?.enabled),copies=enabled.reduce((s,p)=>s+Number(state.owned[String(p.id)]?.count||1),0);
  $('#ownership-panel').innerHTML=title('Aniimo you own',`${enabled.length} species · ${copies} copies`)+`
    <div class="ownership-tools"><input id="pal-search" placeholder="Filter Aniimo…"><button id="own-all" class="ghost">All</button><button id="own-none" class="ghost">None</button></div>
    <p class="micro" style="margin:0 0 8px">The checkbox controls availability; the number is how many copies the team search may use. Copy counts stay in localStorage and are also preserved by this site's share links.</p>
    <div class="ownership-grid" id="ownership-grid">${DATA.pals.map(p=>palRow(p)).join('')}</div>
    <div class="summary-line"><span>Disabled species are removed from family-gated recipes and team search.</span><span id="owned-summary">${enabled.length}/${DATA.pals.length}</span></div>`;
  bindOwnership();
}
function palRow(p){
  const rec=state.owned[String(p.id)]||{enabled:true,count:1};const abilities=Object.entries(p.abilities||{}).map(([a,l])=>`${a} ${l}`).join(' · ');
  return `<label class="pal-row ${rec.enabled?'':'off'}" data-id="${p.id}" data-name="${esc(p.name.toLowerCase())}"><input class="pal-enabled" type="checkbox" ${rec.enabled?'checked':''}><img src="${HIDEOUT}/images/aniimo/heads/${String(p.id).slice(0,-2)}.webp" onerror="this.style.visibility='hidden'" alt=""><span><b>${esc(p.name)}</b><small>${esc(abilities)}</small></span><input class="pal-count" type="number" min="1" max="99" value="${rec.count||1}" title="Copies"></label>`;
}
function bindOwnership(){
  $('#pal-search').oninput=e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('.pal-row').forEach(r=>r.style.display=!q||r.dataset.name.includes(q)?'grid':'none');};
  $('#own-all').onclick=()=>{for(const p of DATA.pals)state.owned[String(p.id)].enabled=true;saveState();renderOwnership();scheduleCompute();};
  $('#own-none').onclick=()=>{for(const p of DATA.pals)state.owned[String(p.id)].enabled=false;saveState();renderOwnership();scheduleCompute();};
  document.querySelectorAll('.pal-row').forEach(row=>{
    const id=row.dataset.id;
    row.querySelector('.pal-enabled').onchange=e=>{state.owned[id].enabled=e.target.checked;saveState();row.classList.toggle('off',!e.target.checked);scheduleCompute();};
    row.querySelector('.pal-count').oninput=e=>{state.owned[id].count=Math.max(1,Number(e.target.value)||1);saveState();};
  });
}
function update(mut){mut(state);saveState();scheduleCompute();}
function scheduleCompute(){clearTimeout(recomputeTimer);recomputeTimer=setTimeout(computePlan,80);$('#team-panel').innerHTML=title('Real team optimizer')+`<div class="empty">Plan changed. Re-run team analysis after the production optimum settles.</div>`;}

function computePlan(){
  currentPlan=optimizePlan(state,DATA);currentModel=buildTeamModel(currentPlan,state,DATA);renderPlan();renderAbilities();renderTeamReady();
}
function renderPlan(){
  const rate=currentPlan.ratePerHour,day=rate*24,workers=Math.ceil(currentPlan.rows.reduce((s,r)=>s+(r.recipe.electric?0:Math.max(0,r.cycleSeconds-Number(r.recipe.growSeconds||0))*r.batchesPerHour/3600),0)-1e-9);
  const rows=[...currentPlan.rows].sort((a,b)=>b.perHour-a.perHour);
  $('#plan-panel').innerHTML=title('Best Plan',`${rows.length} assignments`)+`
    <div class="metric-grid"><div class="metric"><small>Rate</small><strong>${fmt(rate)}</strong><span>Home Coin / hour</span></div><div class="metric"><small>Per day</small><strong>${fmt(day)}</strong><span>Home Coin / day</span></div><div class="metric"><small>Generic labor</small><strong>${workers}</strong><span>Aniimo-hours / hour</span></div></div>
    ${rows.length?`<table class="plan-table"><thead><tr><th>Facility</th><th>Produce</th><th>Needs</th><th class="num">Cycle</th><th class="num">Home Coin/h</th></tr></thead><tbody>${rows.map(planRow).join('')}</tbody></table>`:`<div class="empty">No runnable production chain with the current settings.</div>`}`;
}
function duration(s){if(s>=3600)return `${(s/3600).toFixed(s%3600?1:0)}h`;if(s>=60)return `${Math.round(s/60)} min`;return `${Math.round(s)}s`;}
function planRow(row){
  const fac=facilityMap.get(row.facility),out=row.recipe.outputs?.[0],name=out?itemName(DATA,out.item):String(row.recipe.id),fraction=row.units>=.995?`${Math.round(row.units)}×`:`${Math.round(row.units*100)}% of one`;
  const needs=(row.recipe.steps||[]).map(s=>`${s.ability} Lv.${s.level}`).join(', ')+(row.recipe.pet?` · ${row.recipe.petName||'family'}`:'');
  return `<tr><td><div class="prod"><img src="${asset(fac?.icon)}" alt=""><span>${fraction} ${esc(fac?.name||row.facility)}</span></div></td><td>${esc(name)}</td><td class="req">${esc(needs||'—')}</td><td class="num">${duration(row.cycleSeconds)}</td><td class="num"><b>${fmt(row.perHour)}</b></td></tr>`;
}
function renderAbilities(){
  const req=requiredAbilities(currentPlan);const enabledPals=DATA.pals.filter(p=>state.owned[String(p.id)]?.enabled);const core=pickCoverageCore(req,state.workerSlots,enabledPals);
  $('#abilities-panel').innerHTML=title('Abilities needed',`${core.core.length} minimum coverage · ${Math.max(0,state.workerSlots-core.core.length)} spare`)+`<div class="ability-grid">${req.map(r=>{
    const c=DATA.abilities[r.ability]?.color||'#888';const options=enabledPals.filter(p=>Number(p.abilities?.[r.ability]||0)>=r.level).sort((a,b)=>Number(b.abilities[r.ability])-Number(a.abilities[r.ability])).slice(0,3);
    return `<div class="ability-card"><div class="ability-head"><b style="color:${c}">${esc(r.ability)} Lv.${r.level}</b><span>${r.count} buildings</span></div><p>${esc(r.jobs.join(', '))}</p><div class="chips">${options.map(p=>`<span class="chip">${esc(p.name)} · ${p.abilities[r.ability]}</span>`).join('')}</div></div>`;}).join('')}</div>${core.uncovered.length?`<p class="warning">Uncovered: ${core.uncovered.map(x=>`${x.ability} Lv.${x.level}`).join(', ')}</p>`:''}`;
}
function renderTeamReady(){
  $('#team-panel').innerHTML=title('Real team optimizer')+`
    <div class="team-toolbar"><button id="analyze-team" class="primary">Analyze ${state.workerSlots}-Aniimo team</button><span id="team-status" class="status">Coin first. Burst resilience second. Ideal personalities third.</span></div>
    <p class="micro">Unlike generic worker-hours, this pass gives every concrete Aniimo one hour of time, respects its own abilities and family-gated jobs, then prefers basic-material burst coverage once the Home Coin cap is already sustained.</p>
    <div id="team-results"></div>`;
  $('#analyze-team').onclick=analyzeTeam;
}
async function analyzeTeam(){
  const btn=$('#analyze-team'),status=$('#team-status'),box=$('#team-results');btn.disabled=true;box.innerHTML='';
  try{
    const teams=await findBestTeams(currentModel,state,DATA,{limit:4,onProgress:t=>status.innerHTML=`<span class="loader"></span> ${esc(t)}`});
    if(!teams.length)throw new Error('No valid team found.');
    const best=teams[0],core=findEssentialCore(currentModel,best.team,Math.min(currentModel.baselineRate,best.eval.rate)),anti=antiStallSummary(currentModel,best.team,core);
    status.textContent=`Done · ${fmt(best.eval.rate)}/h with ${best.team.length} workers`;
    let special=null;
    for(let i=0;i<Math.min(3,teams.length);i++){
      status.innerHTML=`<span class="loader"></span> Special ${i+1}/${Math.min(3,teams.length)} · ideal personality rolls`;
      const ev=await optimizePersonalities(currentModel,teams[i].team,t=>status.innerHTML=`<span class="loader"></span> ${esc(t)}`);
      if(!special||ev.rate>special.ev.rate)special={team:teams[i].team,ev};
    }
    status.textContent=`Done · concrete team + personality ceiling calculated`;
    box.innerHTML=(special?renderSpecial(special):'')+teams.map((x,i)=>renderTeamCard(x,i,i===0?{core,anti}:null)).join('');
  }catch(e){status.textContent=e.message||String(e);box.innerHTML=`<div class="empty warning">${esc(e.message||e)}</div>`;}finally{btn.disabled=false;}
}
function renderSpecial(s){
  const base=currentModel.baselineRate,ratio=base?s.ev.rate/base:0,delta=s.ev.rate-base;
  return `<div class="result-card special"><div class="result-label">Special #1 · hypothetical ideal personalities</div><div class="result-rate">${fmt(s.ev.rate)} /h</div><div class="result-delta">${pct(ratio)} of generic · ${delta>=0?'+':''}${fmt(delta)}/h</div><div class="chips">${s.team.map((x,i)=>`<span class="chip purple" title="${[...(s.ev.boostedByWorker?.[i]||[])].join(', ')}">${esc(x.pal.name)} (${esc(s.ev.profiles[i])})</span>`).join('')}</div><p class="micro">Each profile is one legal choice from E/I · N/S · F/T · J/P. Matching letters reduce that worker's manual time by 1/1.2 on the rewarded facility; growth timers are untouched.</p></div>`;
}
function renderTeamCard(x,index,staff){
  const base=currentModel.baselineRate,ratio=base?x.eval.rate/base:0,delta=x.eval.rate-base;
  let extra='';
  if(staff){
    const {core,anti}=staff;extra+=`<div class="subhead">Essentials · ${core.length}</div><div class="chips">${core.map(x=>`<span class="chip">${esc(x.pal.name)}</span>`).join('')}</div>`;
    if(anti.reserves.length)extra+=`<div class="subhead">Anti-stall reserves · ${anti.reserves.length}</div><div class="chips">${anti.reserves.map(x=>`<span class="chip">${esc(x.pal.name)}</span>`).join('')}</div>`;
    extra+=`<div class="subhead">Basic-material burst coverage</div><div class="coverage">${[...anti.byFacility].map(([f,v])=>`<span class="${v.hit===v.total?'full':''}">${esc(f)} ${v.hit}/${v.total}</span>`).join('')}</div>`;
  }
  return `<div class="result-card ${index===0?'best':''}"><div class="result-label">${index===0?'Best found':`Alternative ${index+1}`}</div><div class="result-rate">${fmt(x.eval.rate)} /h</div><div class="result-delta">${pct(ratio)} of generic · ${delta>=0?'+':''}${fmt(delta)}/h</div><div class="chips">${x.team.map(m=>`<span class="chip">${esc(m.pal.name)}</span>`).join('')}</div>${extra}</div>`;
}

function renderAll(){renderGeneral();renderFacilities();renderModules();renderOwnership();computePlan();}

$('#import-btn').onclick=()=>{try{applyUrl($('#import-url').value.trim());$('#import-url').value='';}catch(e){alert(e.message);}};
$('#reset-btn').onclick=()=>{if(confirm('Reset the optimizer to the project defaults?')){state=normalizeState(null);saveState();renderAll();}};
$('#copy-link').onclick=async()=>{const url=shareUrl();await navigator.clipboard.writeText(url);$('#copy-link').textContent='Copied';setTimeout(()=>$('#copy-link').textContent='Copy share link',1200);history.replaceState(null,'',url);};
$('#data-version').textContent=`DATA ${DATA.version}`;

// URL beats localStorage when explicit optimizer parameters are present.
if([...new URL(location.href).searchParams.keys()].some(k=>['f','m','y','a','h','w','p','c'].includes(k))){try{applyUrl(location.href);}catch{renderAll();}}else renderAll();
