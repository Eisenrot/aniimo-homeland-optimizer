import {GAME_DATA as DATA} from './src/data.js';
import {DEFAULT_STATE} from './src/defaults.js';
import {optimizePlan,buildTeamModel,findBestTeams,optimizePersonalities,antiStallSummary,staffingCoverageMatch,utilityTasksForScenario,assignUtilityWorkers} from './src/optimizer.js';
const state=structuredClone(DEFAULT_STATE);state.owned={};for(const p of DATA.pals)state.owned[String(p.id)]={enabled:true,count:1};state.teamSlots=9;
const plan=optimizePlan(state,DATA),model=buildTeamModel(plan,state,DATA);
const teams=await findBestTeams(model,state,DATA,{limit:1,onProgress:()=>{}});
if(!teams.length)throw new Error('real team search returned no team');
if(!(teams[0].eval.objectiveRate>=0))throw new Error('real team evaluation failed');
const special=await optimizePersonalities(model,teams[0].team,()=>{},teams[0].eval,teams[0].burst);
if(!special.traitHints?.length)throw new Error('personality hints missing');
if(!special.rows?.length)throw new Error('personality result rows missing');
const specialRate=special.rows.reduce((sum,row)=>sum+Number(row.perHour||0),0);
if(Math.abs(specialRate-special.rate)>1e-5)throw new Error(`special displayed rows do not match special rate: ${specialRate} vs ${special.rate}`);
const coverage=antiStallSummary(model,teams[0].team,teams[0].team,special.rows);
for(const [f,v] of coverage.permanentByFacility)if(v.hit>v.total)throw new Error(`invalid permanent coverage ${f}: ${v.hit}/${v.total}`);
console.log('generic',plan.ratePerHour.toFixed(2),'real',teams[0].eval.rate.toFixed(2),'special',special.rate.toFixed(2),'permanent',Object.fromEntries(coverage.permanentByFacility));


const syntheticRows=[
  {facility:'mine',recipe:{id:9001},units:1},
  {facility:'farmland',recipe:{id:9002},units:1,batchesPerHour:10},
  {facility:'farmland',recipe:{id:9003},units:1,batchesPerHour:5},
  {facility:'woodland',recipe:{id:9004},units:1,batchesPerHour:2}
];
const syntheticModel={
  rows:[
    {facility:'mine',recipe:{id:9001},work:new Map([['Earth|2||mine',1]])},
    {facility:'farmland',recipe:{id:9002},work:new Map([['Earth|1||farmland',120],['Grass|1||farmland',120]])},
    {facility:'farmland',recipe:{id:9003},work:new Map([['Earth|1||farmland',120],['Dark|1||farmland',120]])},
    {facility:'woodland',recipe:{id:9004},work:new Map([['Earth|1||woodland',60],['Grass|1||woodland',60],['Dark|1||woodland',60]])}
  ],
  plan:{rows:syntheticRows},
  tasks:[],
  baselineDemandSeconds:new Map(),
  state:{},
  scenario:{}
};
const syntheticTeam=[
  {pal:{id:9901000,name:'Permanent Earth',abilities:{Earth:2}}},
  {pal:{id:9902000,name:'Burst Generalist',abilities:{Earth:1,Grass:1,Dark:1}}}
];
const syntheticCoverage=staffingCoverageMatch(syntheticModel,syntheticTeam,syntheticRows);
const byFacility=new Map();
for(const slot of syntheticCoverage.slots){const rec=byFacility.get(slot.facility)||{total:0,hit:0};rec.total++;byFacility.set(slot.facility,rec);}
for(const a of syntheticCoverage.assignments)byFacility.get(a.slot.facility).hit++;
if(byFacility.get('mine')?.hit!==1||byFacility.get('mine')?.total!==1)throw new Error('permanent slot should reserve one dedicated worker');
if(byFacility.get('farmland')?.total!==3||byFacility.get('farmland')?.hit!==3)throw new Error(`Farmland burst coverage should collapse to Earth/Grass/Dark 3/3, got ${JSON.stringify(byFacility.get('farmland'))}`);
if(byFacility.get('woodland')?.total!==3||byFacility.get('woodland')?.hit!==3)throw new Error(`Woodland burst coverage should be reusable and independent 3/3, got ${JSON.stringify(byFacility.get('woodland'))}`);
const burstWorkers=new Set(syntheticCoverage.assignments.filter(x=>x.slot.mode==='burst').map(x=>x.worker));
if(burstWorkers.size!==1||!burstWorkers.has(1))throw new Error('one free burst-capable worker should be reusable across Farmland and Woodland stages');
console.log('burst coverage reuse',Object.fromEntries(byFacility));

const farmLoad=syntheticCoverage.burstLoadByFacility.get('farmland'),woodLoad=syntheticCoverage.burstLoadByFacility.get('woodland');
if(Math.abs(farmLoad.demandHours-1)>1e-9)throw new Error(`Farmland burst load should be 1.00 h/h, got ${farmLoad.demandHours}`);
if(Math.abs(woodLoad.demandHours-.1)>1e-9)throw new Error(`Woodland burst load should be 0.10 h/h, got ${woodLoad.demandHours}`);
if(Math.abs(farmLoad.capacityRatio-1)>1e-6)throw new Error(`Farmland capacity ratio should be 1.0x with one free generalist, got ${farmLoad.capacityRatio}`);
if(Math.abs(woodLoad.capacityRatio-10)>1e-6)throw new Error(`Woodland capacity ratio should be 10.0x with one free generalist, got ${woodLoad.capacityRatio}`);
if(!(woodLoad.capacityRatio>farmLoad.capacityRatio))throw new Error('lighter Woodland workload should show more burst headroom than Farmland');
console.log('burst load metrics',{farmland:farmLoad,woodland:woodLoad});


const utilityTasks=utilityTasksForScenario({cooling:'Cool',heat:'Scorching',sunlamp:true,generator:false});
const utilityModel={
  tasks:[
    ...utilityTasks,
    {key:'Earth|1||mine',ability:'Earth',level:1,fixed:false,facility:'mine'}
  ],
  baselineDemandSeconds:new Map([['Earth|1||mine',3600],...utilityTasks.map(t=>[t.key,3600])]),
  state:{manualSpeeds:false},
  rows:[]
};
const utilityTeam=[
  {pal:{id:9910001,name:'Ice specialist',abilities:{Ice:1,Earth:4}}},
  {pal:{id:9910002,name:'Fire specialist',abilities:{Fire:1}}},
  {pal:{id:9910003,name:'Light specialist',abilities:{Light:1}}},
  {pal:{id:9910004,name:'Flexible climate',abilities:{Ice:1,Fire:1,Light:1,Earth:1}}}
];
const utilityMatch=assignUtilityWorkers(utilityModel,utilityTeam);
if(!utilityMatch.feasible||utilityMatch.assignments.length!==3)throw new Error('three climate utilities require three dedicated Aniimo');
if(new Set(utilityMatch.assignments.map(x=>x.worker)).size!==3)throw new Error('one Aniimo must not be split across multiple 24/7 utility stations');
for(const a of utilityMatch.assignments)if(Number(utilityTeam[a.worker].pal.abilities[a.task.ability]||0)<a.task.level)throw new Error('utility assignment ignored required climate ability');
const coverageModel={...utilityModel,plan:{rows:[]},scenario:{cooling:'Cool',heat:'Scorching',sunlamp:true,generator:false}};
const utilityCoverage=staffingCoverageMatch(coverageModel,utilityTeam,[]);
if(utilityCoverage.slots.filter(x=>x.mode==='utility').length!==3)throw new Error('utility coverage slots missing from team staffing');
if(utilityCoverage.assignments.filter(x=>x.slot.mode==='utility').length!==3)throw new Error('utility staffing coverage did not assign all climate stations');
console.log('dedicated utility workers OK',utilityMatch.assignments.map(a=>({facility:a.task.facility,ability:a.task.ability,worker:utilityTeam[a.worker].pal.name})));


const cheapUtilityModel={
  tasks:[
    {key:'Light|1||sunlamp',ability:'Light',level:1,fixed:true,facility:'sunlamp'},
    {key:'Water|1||well',ability:'Water',level:1,fixed:false,facility:'well'}
  ],
  baselineDemandSeconds:new Map([['Light|1||sunlamp',3600],['Water|1||well',3600]]),
  state:{manualSpeeds:false},
  rows:[]
};
const cheapUtilityTeam=[
  {pal:{id:9920001,name:'Glacy-like generalist',abilities:{Light:3,Water:4}}},
  {pal:{id:9920002,name:'Lunara-like specialist',abilities:{Light:3}}},
  {pal:{id:9920003,name:'Water worker',abilities:{Water:2}}}
];
const cheapUtility=assignUtilityWorkers(cheapUtilityModel,cheapUtilityTeam);
if(!cheapUtility.feasible)throw new Error('cheap utility specialist fixture should be feasible');
const lightAssignment=cheapUtility.assignments.find(a=>a.task.ability==='Light');
if(cheapUtilityTeam[lightAssignment.worker].pal.name!=='Lunara-like specialist')throw new Error('utility assignment should preserve the higher-value production worker when an equally valid specialist exists');
console.log('utility opportunity cost preserves production specialists',cheapUtilityTeam[lightAssignment.worker].pal.name);

const searchRecipe={id:9930001,facility:'well',level:1,inputs:[],outputs:[{item:1,qty:1}],workload:3600,steps:[{name:'Gather',ability:'Water',level:1}]};
const distractors=Array.from({length:50},(_,i)=>({id:9931000+i,name:`A Worker ${String(i+1).padStart(2,'0')}`,abilities:{Water:1}}));
const searchPals=[
  {id:9930002,name:'Glacy-like Prismana',abilities:{Light:3,Water:4}},
  ...distractors,
  {id:9930003,name:'Lunara-like Utility',abilities:{Light:3}}
];
const searchData={
  items:{'1':{name:'Test Water',value:100}},
  facilities:[{slug:'well',name:'Well',kind:'production',outputLimit:{1:99}}],
  recipes:[searchRecipe],pals:searchPals,abilities:{}
};
const searchState={
  teamSlots:3,workerSlots:3,target:'coin',guarantees:[],oneRecipePerFacility:true,manualSpeeds:false,hungry:false,collectHours:0,
  facilities:{well:{count:1,level:1}},owned:Object.fromEntries(searchPals.map(p=>[String(p.id),{enabled:true,count:1}]))
};
const searchPlan={scenario:{sunlamp:true},rows:[{facility:'well',recipe:searchRecipe,batchesPerHour:1,units:1,perHour:100,targetPerHour:100}],runnableRecipes:[searchRecipe],ratePerHour:100,targetRate:100,objectiveRate:100};
const searchModel=buildTeamModel(searchPlan,searchState,searchData);
const searchTeams=await findBestTeams(searchModel,searchState,searchData,{limit:1,onProgress:()=>{}});
if(!searchTeams.length)throw new Error('utility-aware team search fixture returned no team');
const searchNames=new Set(searchTeams[0].team.map(x=>x.pal.name));
if(!searchNames.has('Lunara-like Utility')||!searchNames.has('Glacy-like Prismana'))throw new Error(`utility-aware search failed to preserve the cheap utility specialist and Lv.4 production worker: ${[...searchNames].join(', ')}`);
const searchUtility=searchTeams[0].eval.utilityAssignments.find(a=>a.task.ability==='Light');
if(searchTeams[0].team[searchUtility.worker].pal.name!=='Lunara-like Utility')throw new Error('real-team search wasted the Lv.4 production worker on Sunlamp');
if(!(searchTeams[0].eval.objectiveRate>100.01))throw new Error(`Lv.4 worker speed did not improve concrete-team throughput: ${searchTeams[0].eval.objectiveRate}`);
console.log('utility-aware Prismana search OK',{team:[...searchNames],rate:searchTeams[0].eval.objectiveRate});


const altRecipeA={id:9940001,facility:'test-bench',level:1,inputs:[{item:9940999,qty:1}],outputs:[{item:9940101,qty:1}],workload:3600,steps:[{name:'A',ability:'Fire',level:1,workload:0}]};
const altRecipeB={id:9940002,facility:'test-bench',level:1,inputs:[{item:9940999,qty:1}],outputs:[{item:9940102,qty:1}],workload:3600,steps:[{name:'B',ability:'Water',level:1,workload:0}]};
const altPal={id:9941001,name:'Water specialist',abilities:{Fire:1,Water:4}};
const altData={
  items:{'9940999':{name:'Free Input',value:0},'9940101':{name:'Generic Prize',value:100},'9940102':{name:'Real-team Prize',value:50}},
  facilities:[{slug:'test-bench',name:'Test Bench',kind:'processing',outputLimit:{1:999}}],
  recipes:[altRecipeA,altRecipeB],pals:[altPal],abilities:{}
};
const altState={
  homelandLevel:10,workerSlots:1,teamSlots:1,abilityLevel:'auto',collectHours:0,oneRecipePerFacility:true,generatorAvailable:false,hungry:false,manualSpeeds:false,
  climateOptions:{cooling:false,heat:false,sunlamp:false},target:'coin',guarantees:[],facilities:{'test-bench':{count:1,level:1}},modules:{},speeds:{},recipeNotes:{},owned:{'9941001':{enabled:true,count:1}}
};
const altPlan=optimizePlan(altState,altData);
if(altPlan.rows[0]?.recipe?.id!==altRecipeA.id)throw new Error('synthetic generic one-recipe baseline should choose recipe A');
const altModel=buildTeamModel(altPlan,altState,altData),altTeams=await findBestTeams(altModel,altState,altData,{limit:1,onProgress:()=>{}});
if(!altTeams.length)throw new Error('one-recipe recipe-set exploration returned no team');
if(!altTeams[0].eval.rows.some(r=>r.recipe.id===altRecipeB.id))throw new Error('real-team pass stayed trapped in the generic one-recipe selection');
if(!(altTeams[0].eval.rate>200))throw new Error(`real-team alternate recipe speed was not captured: ${altTeams[0].eval.rate}`);
console.log('one-recipe real-team recipe-set exploration OK',{baseline:altPlan.ratePerHour,real:altTeams[0].eval.rate,recipe:altTeams[0].eval.rows[0]?.recipe?.id});
