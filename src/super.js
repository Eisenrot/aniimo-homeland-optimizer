import {GAME_DATA as DATA} from './data.js';
import {optimizePlan,buildTeamModel,findBestTeams,planItemRates} from './optimizer.js';

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
        <p>This keeps your current Homeland inventory, modules, speeds, recipe-note access and enabled roster, then searches the strongest setup allowed by those choices.</p>
        <ul>
          <li>Re-solves the complete recipe economy, including climate and generator possibilities.</li>
          <li>Respects the current Objective, every hard <b>Also make at least</b> value and every enabled <b>MAX</b> co-objective.</li>
          <li>Tests every theoretical Aniimo count from 1 to the maximum allowed by your Homeland level.</li>
          <li>Then tests every feasible real-team size up to the same cap and your enabled copy count.</li>
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
    const cap=api.maxAniimoForLevel(base.homelandLevel);
    const maxReal=Math.min(cap,enabledCopies(base));
    if(maxReal<1)throw new Error('No enabled Aniimo copies are available for the real-team pass.');

    spinner('Establishing one common objective scale…');
    const referenceState=api.normalizeState({...base,workerSlots:cap,teamSlots:Math.min(maxReal,base.teamSlots)});
    const referencePlan=optimizePlan(referenceState,DATA);
    if(referencePlan.infeasible)throw new Error('The current hard requirements are not feasible even at the Homeland Aniimo cap.');
    const weights=referencePlan.objectiveWeights?.length
      ? referencePlan.objectiveWeights
      : [{item:base.target==='coin'?'coin':String(base.target),scale:1}];

    let bestGeneric=null;
    for(let n=1;n<=cap;n++){
      spinner(`Theoretical pass · ${n}/${cap} Aniimo`);
      const trial=api.normalizeState({...base,workerSlots:n,teamSlots:Math.min(base.teamSlots,n)});
      const plan=optimizePlan(trial,DATA);
      if(!plan.infeasible){
        const score=scoreRows(plan.rows,plan.ratePerHour,weights);
        if(!bestGeneric||score>bestGeneric.score+1e-8||(Math.abs(score-bestGeneric.score)<=1e-8&&n<bestGeneric.n)){
          bestGeneric={n,score,plan,state:trial};
        }
      }
      if(n%3===0)await tick();
    }
    if(!bestGeneric)throw new Error('No feasible theoretical setup was found.');

    let bestReal=null;
    for(let n=1;n<=maxReal;n++){
      spinner(`Real-team pass · ${n}/${maxReal} Aniimo`);
      const trial=api.normalizeState({...base,workerSlots:bestGeneric.n,teamSlots:n});
      const model=buildTeamModel(bestGeneric.plan,trial,DATA);
      try{
        const teams=await findBestTeams(model,trial,DATA,{
          limit:1,
          onProgress:t=>spinner(`${t} · team size ${n}/${maxReal}`)
        });
        const candidate=teams[0];
        if(candidate){
          const score=scoreRows(candidate.eval.rows,candidate.eval.rate,weights);
          if(!bestReal||score>bestReal.score+1e-8||(Math.abs(score-bestReal.score)<=1e-8&&n<bestReal.n)){
            bestReal={n,score,candidate};
          }
        }
      }catch{}
      await tick();
    }
    if(!bestReal)throw new Error('No concrete team could satisfy the current requirements.');

    spinner('Applying the winner as one atomic change…');
    const next={...base,workerSlots:bestGeneric.n,teamSlots:bestReal.n};
    api.applyAtomicState(next,before);

    summary.innerHTML=`<b>Winner applied.</b><span>${bestGeneric.n}/${cap} theoretical · ${bestReal.n}/${maxReal} real team · ${fmt1(base.target==='coin'?bestReal.candidate.eval.rate:bestReal.candidate.eval.targetRate)} ${esc(objectiveName(base))}/h</span>`;
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
