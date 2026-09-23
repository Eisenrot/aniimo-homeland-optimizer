import {GAME_DATA as DATA} from './src/data.js';
import {DEFAULT_STATE} from './src/defaults.js';
import {optimizePlan,buildTeamModel,findBestTeams,optimizePersonalities,antiStallSummary,staffingCoverageMatch} from './src/optimizer.js';
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
