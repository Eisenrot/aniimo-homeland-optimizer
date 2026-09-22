import {GAME_DATA as DATA} from './data.js';
import {optimizePlan,buildTeamModel,findBestTeams,findEssentialCore,evaluateConcreteTeam,planItemRates} from './optimizer.js';
import {fillHomelandForRV,progressionSummary} from './progression.js';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt1=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1});
let running=false;

function bridge(){return window.__aniimoOptimizerBridge;}
function tick(){return new Promise(r=>setTimeout(r,0));}
function enabledCopies(state){
  return DATA.pals.reduce((sum,p)=>{
    const rec=state.owned?.[String(p.id)];
    return sum+(rec?.enabled?Math.max(1,Number(rec.count||1)):0);
  },0);
}
function scoreRows(rows,coinRate,weights){
  const rates=new Map(planItemRates({rows:rows||[]},DATA).map(x=>[String(x.item),Number(x.rate||0)]));
  return(weights||[]).reduce((sum,w)=>{
    const value=w.item==='coin'?Number(coinRate||0):Number(rates.get(String(w.item))||0);
    return sum+value*Number(w.scale||1);
  },0);
}
function objectiveName(state){
  if(state.target==='coin')return'Home Coin';
  const row=DATA.items?.[String(state.target)]||DATA.items?.[Number(state.target)];
  return row?.name||String(state.target);
}

function ensureUi(){
  if($('#super-opt-btn'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <button id="super-opt-btn" class="super-opt-btn" title="Super Optimizer" aria-label="Open Super Optimizer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2Zm6.3 10.3.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5ZM5.2 13.8l1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1 1.1-3Z"/></svg>
    </button>
    <div id="super-opt-overlay" class="super-opt-overlay" aria-hidden="true">
      <div class="super-opt-modal" role="dialog" aria-modal="true" aria-label="Super Optimizer">
        <button id="super-opt-close" class="modal-close" aria-label="Close">×</button>
        <div class="super-title">Super Optimizer <span>WIP</span></div>
        <p>This keeps your Objective, speeds, recipe-note access, climate/power permissions and enabled roster, then rebuilds the production side to the strongest legal Homeland your current RV level can support.</p>
        <ul>
          <li>Auto-fills every unlocked facility at the highest level legal for your RV, including the bulk Farmland / Woodland / Mine / Well progression.</li><li>Auto-maxes Ecological, Kitchen, Resource Detector and Crafting modules to the highest level legal for your RV, unlocking their recipe tiers before solving.</li><li>Re-solves the complete recipe economy, including climate and generator possibilities.</li>
          <li>Respects the current Objective, every hard <b>Also make at least</b> value and every enabled <b>MAX</b> co-objective.</li>
          <li>Tests every theoretical Aniimo count from 1 to the maximum allowed by your Homeland level.</li>
          <li>For every theoretical count, tests the largest concrete roster you can field, then shrinks it to the smallest core that preserves that result.</li>
          <li>Real-team passes use actual abilities, copies, resident-family gates and the full runnable recipe pool.</li>
          <li>Nothing is changed while it scans. The winning counts are applied once at the end; equal scores prefer fewer occupied slots.</li>
        </ul>
        <div id="super-opt-summary" class="super-summary"></div>
        <button id="super-opt-start" class="primary super-start">Scan this Homeland</button>
        <div id="super-opt-progress" class="super-progress">Ready.</div>
      </div>
    </div>
  `);
  $('#super-opt-btn').onclick=()=>setOpen(true);
  $('#super-opt-close').onclick=()=>{if(!running)setOpen(false);};
  $('#super-opt-overlay').onclick=e=>{if(e.target===$('#super-opt-overlay')&&!running)setOpen(false);};
  $('#super-opt-start').onclick=run;
}
function setOpen(open){
  ensureUi();
  $('#super-opt-overlay').classList.toggle('open',open);
  $('#super-opt-overlay').setAttribute('aria-hidden',open?'false':'true');
}
function setProgress(html){$('#super-opt-progress').innerHTML=html;}
function spinner(text){setProgress(`<span class="loader"></span> ${esc(text)}`);}

async function run(){
  if(running)return;
  const api=bridge();
  if(!api){setProgress('Optimizer bridge is not ready.');return;}
  running=true;
  const button=$('#super-opt-start'),summary=$('#super-opt-summary');
  button.disabled=true;summary.innerHTML='';
  try{
    const before=api.getState();
    const base=api.normalizeState(before);
    const autoBase=api.normalizeState(fillHomelandForRV(base,DATA));
    const cap=api.maxAniimoForLevel(autoBase.homelandLevel);
    const maxReal=Math.min(cap,enabledCopies(autoBase));
    const rvSummary=progressionSummary(autoBase.homelandLevel,DATA);
    const m=rvSummary.modules;
    summary.innerHTML=`<b>RV ${rvSummary.rv} production ceiling loaded.</b><span>${rvSummary.bulk.farmland} Farmland · ${rvSummary.bulk.woodland} Woodland · ${rvSummary.bulk.mine} Mine · ${rvSummary.bulk.well} Well · Eco ${m['ecological-module']} · Kitchen ${m['kitchen-module']} · Resource ${m['resource-detector']} · Crafting ${m['crafting-module']}</span>`;
    if(maxReal<1)throw new Error('No enabled Aniimo copies are available for the real-team pass.');

    spinner('Establishing one common objective scale…');
    const referenceState=api.normalizeState({...autoBase,workerSlots:cap,teamSlots:Math.min(maxReal,autoBase.teamSlots)});
    const referencePlan=optimizePlan(referenceState,DATA);
    if(referencePlan.infeasible)throw new Error('The current hard requirements are not feasible even at the Homeland Aniimo cap.');
    const weights=referencePlan.objectiveWeights?.length
      ? referencePlan.objectiveWeights
      : [{item:base.target==='coin'?'coin':String(base.target),scale:1}];

    const theoretical=[];
    for(let n=1;n<=cap;n++){
      spinner(`Theoretical pass · ${n}/${cap} Aniimo`);
      const trial=api.normalizeState({...autoBase,workerSlots:n,teamSlots:Math.min(maxReal,Math.max(1,autoBase.teamSlots))});
      const plan=optimizePlan(trial,DATA);
      if(!plan.infeasible){
        const genericScore=scoreRows(plan.rows,plan.ratePerHour,weights);
        theoretical.push({n,plan,genericScore});
      }
      if(n%3===0)await tick();
    }
    if(!theoretical.length)throw new Error('No feasible theoretical setup was found.');

    let winner=null;
    for(let i=0;i<theoretical.length;i++){
      const entry=theoretical[i];
      spinner(`Concrete pass · theoretical ${entry.n}/${cap} · ${i+1}/${theoretical.length}`);
      const trial=api.normalizeState({...autoBase,workerSlots:entry.n,teamSlots:maxReal});
      const teamPlan={...entry.plan,objectiveWeights:weights};
      const model=buildTeamModel(teamPlan,trial,DATA);
      try{
        const teams=await findBestTeams(model,trial,DATA,{
          limit:1,
          onProgress:t=>spinner(`${t} · theoretical ${entry.n}/${cap}`)
        });
        const candidate=teams[0];
        if(candidate){
          const core=findEssentialCore(model,candidate.team,candidate.eval.objectiveRate);
          const coreEval=evaluateConcreteTeam(model,core);
          const score=scoreRows(coreEval.rows,coreEval.rate,weights);
          const realN=core.length;
          const better=!winner||score>winner.score+1e-8||
            (Math.abs(score-winner.score)<=1e-8&&(realN<winner.realN||
              (realN===winner.realN&&entry.n<winner.theoreticalN)));
          if(better)winner={score,realN,theoreticalN:entry.n,plan:entry.plan,team:core,eval:coreEval};
        }
      }catch{}
      await tick();
    }
    if(!winner)throw new Error('No concrete team could satisfy the current requirements.');
    spinner('Applying the winner as one atomic change…');
    const next={...autoBase,workerSlots:winner.theoreticalN,teamSlots:winner.realN};
    api.applyAtomicState(next,before);

    summary.innerHTML=`<b>Winner applied.</b><span>${winner.theoreticalN}/${cap} theoretical · ${winner.realN}/${maxReal} real team · ${fmt1(autoBase.target==='coin'?winner.eval.rate:winner.eval.targetRate)} ${esc(objectiveName(autoBase))}/h</span>`;
    spinner('Rebuilding the detailed real-team analyzer for the winning setup…');
    await api.analyzeTeam();
    setProgress('Complete. The winning settings were applied together, and the detailed roster analysis is now below.');
  }catch(e){
    setProgress(esc(e?.message||e));
  }finally{
    running=false;
    button.disabled=false;
  }
}

ensureUi();
