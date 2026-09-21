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

const living=livingFacilityGroups(state,DATA);
if(living.length!==7)throw new Error(`expected 7 resident families, got ${living.length}`);
console.log('mixed coin/h',mixed.ratePerHour.toFixed(2),'scenarios',withClimate.testedScenarios,'walkaway',walkPlan.ratePerHour.toFixed(2),'resident families',living.length);
