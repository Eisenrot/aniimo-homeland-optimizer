import {GAME_DATA as DATA} from './src/data.js';
import {DEFAULT_STATE} from './src/defaults.js';
import {optimizePlan,livingFacilityGroups,planItemRates} from './src/optimizer.js';

const clone=x=>structuredClone(x);
const state=clone(DEFAULT_STATE);
state.owned={};for(const p of DATA.pals)state.owned[String(p.id)]={enabled:true,count:1};
const mixed=optimizePlan(state,DATA);
if(!(mixed.ratePerHour>0))throw new Error('default plan produced no revenue');
if(mixed.utilityWorkers!==0)throw new Error('default plan unexpectedly used a utility building');

const climate=clone(state);climate.climateOptions={cooling:true,heat:true,sunlamp:true};
const withClimate=optimizePlan(climate,DATA);
if(withClimate.objectiveRate+1e-6<mixed.objectiveRate)throw new Error('optional climate buildings made the optimum worse');

const capped=clone(state);capped.collectHours=24;
const cappedPlan=optimizePlan(capped,DATA);
if(cappedPlan.objectiveRate>mixed.objectiveRate+1e-6)throw new Error('collection cap improved the optimum');

const walk=clone(state);walk.oneRecipePerFacility=true;
const walkPlan=optimizePlan(walk,DATA);
if(walkPlan.objectiveRate>mixed.objectiveRate+1e-6)throw new Error('one-recipe mode beat the unconstrained mix');

const material=clone(state);material.target='4010174';material.guarantees=[];
const materialPlan=optimizePlan(material,DATA);
if(!(materialPlan.targetRate>0))throw new Error('material target did not produce Coarse-Sifted Ore');

const joint=clone(state);joint.guarantees=[{item:'4010169',perHour:0,maximize:true}];
const jointPlan=optimizePlan(joint,DATA);
if((jointPlan.objectiveWeights||[]).length<2)throw new Error('co-max requirement did not become a second objective');
const rough=planItemRates(jointPlan,DATA).find(x=>x.item===4010169)?.rate||0;
if(!(rough>0))throw new Error('co-max Rough Lumber objective produced no Rough Lumber');

const disabled=clone(state);
disabled.guarantees=[{item:'4010169',perHour:1e9,maximize:true,enabled:false}];
const disabledPlan=optimizePlan(disabled,DATA);
if(disabledPlan.infeasible)throw new Error('disabled sub-objective still constrained the solver');
if((disabledPlan.objectiveWeights||[]).length!==1)throw new Error('disabled MAX sub-objective still joined the objective');

const maxOverridesRate=clone(state);
maxOverridesRate.guarantees=[{item:'4010169',perHour:1e9,maximize:true,enabled:true}];
const maxOverridesRatePlan=optimizePlan(maxOverridesRate,DATA);
if(maxOverridesRatePlan.infeasible)throw new Error('MAX still enforced the saved /h minimum');
if((maxOverridesRatePlan.objectiveWeights||[]).length<2)throw new Error('MAX did not remain a co-objective');

const minimum=clone(state);
minimum.facilities['aniipod-maker']={count:2,level:2};
minimum.guarantees=[{item:'110002',perHour:3,maximize:false,enabled:true}];
const minimumPlan=optimizePlan(minimum,DATA);
if(minimumPlan.infeasible)throw new Error('3/h Aniipod Pro minimum should be feasible');
const proRate=planItemRates(minimumPlan,DATA).find(x=>x.item===110002)?.rate||0;
if(proRate<3-1e-6)throw new Error(`solver missed hard Aniipod Pro minimum: ${proRate}/h`);

const living=livingFacilityGroups(state,DATA);
if(living.length!==7)throw new Error(`expected 7 resident families, got ${living.length}`);
console.log('mixed coin/h',mixed.ratePerHour.toFixed(2),'scenarios',withClimate.testedScenarios,'walkaway',walkPlan.ratePerHour.toFixed(2),'resident families',living.length);
