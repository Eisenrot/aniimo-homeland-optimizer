import {GAME_DATA as DATA} from './src/data.js';
import {DEFAULT_STATE} from './src/defaults.js';
import {fillHomelandForRV} from './src/progression.js';
import {optimizePlan,recipeRunnable,planItemRates,diagnoseObjective} from './src/optimizer.js';

const clone=x=>structuredClone(x);
const kvass=DATA.recipes.find(r=>Number(r.id)===4010006);
if(!kvass)throw new Error('Potato Kvass recipe missing from data');

const base=fillHomelandForRV({...clone(DEFAULT_STATE),homelandLevel:9},DATA);
base.workerSlots=28;
base.teamSlots=28;
base.target='coin';
base.climateOptions={cooling:true,heat:true,sunlamp:true};
base.recipeNotes={'4040115':true};
base.guarantees=[{item:'4010006',perHour:0,maximize:true,enabled:true}];

const scenario={cooling:null,heat:null,sunlamp:false,generator:false};
if(!recipeRunnable(kvass,base,DATA,scenario))throw new Error('enabled RV9 Potato Kvass recipe is not runnable');

const enabled=optimizePlan(base,DATA);
const enabledRate=planItemRates(enabled,DATA).find(x=>Number(x.item)===4010006)?.rate||0;
const weight=enabled.objectiveWeights?.find(x=>String(x.item)==='4010006');
console.log('enabled kvass',enabledRate,'weight',weight,'keg',base.facilities['bouncy-brew-keg'],'pot',base.facilities['simmering-pot']);

const disabled=clone(base);
disabled.recipeNotes['4040115']=false;
if(recipeRunnable(kvass,disabled,DATA,scenario))throw new Error('disabled Potato Kvass note still leaves recipe runnable');
const disabledPlan=optimizePlan(disabled,DATA);
const disabledRate=planItemRates(disabledPlan,DATA).find(x=>Number(x.item)===4010006)?.rate||0;
if(disabledRate>1e-8)throw new Error('disabled Potato Kvass note still produced Potato Kvass');

if(!weight||!(Number(weight.max)>0))throw new Error('Potato Kvass MAX objective never found a positive theoretical maximum');
if(!(enabledRate>1e-8))throw new Error('Potato Kvass MAX objective is present and runnable but optimizer still chooses zero Potato Kvass');

const joint=fillHomelandForRV({...clone(DEFAULT_STATE),homelandLevel:9},DATA);
joint.workerSlots=13;
joint.teamSlots=13;
joint.target='coin';
joint.climateOptions={cooling:true,heat:true,sunlamp:true};
joint.recipeNotes={'4040115':true};
joint.guarantees=[
  {item:'4010169',perHour:0,maximize:true,enabled:true},
  {item:'4010174',perHour:0,maximize:true,enabled:true},
  {item:'4010006',perHour:0,maximize:true,enabled:true}
];
const jointPlan=optimizePlan(joint,DATA),jointRates=new Map(planItemRates(jointPlan,DATA).map(x=>[Number(x.item),x.rate]));
for(const id of [4010169,4010174,4010006])if(!((jointRates.get(id)||0)>1e-8))throw new Error(`joint MAX starved ${id}: ${jointRates.get(id)||0}/h`);
if(jointPlan.scenario?.heat!=='Scorching')throw new Error(`joint Potato Kvass MAX did not choose Scorching: ${jointPlan.scenarioLabel}`);
if(!(Number(jointPlan.jointMinShare)>1e-8))throw new Error(`joint MAX fairness share is not positive: ${jointPlan.jointMinShare}`);
console.log('joint MAX rates',Object.fromEntries([...jointRates].filter(([id])=>[4010169,4010174,4010006].includes(id))),'share',jointPlan.jointMinShare,'scenario',jointPlan.scenarioLabel);

const walk=clone(joint);
walk.oneRecipePerFacility=true;
const walkPlan=optimizePlan(walk,DATA),walkRates=new Map(planItemRates(walkPlan,DATA).map(x=>[Number(x.item),x.rate]));
for(const id of [4010169,4010174,4010006])if(!((walkRates.get(id)||0)>1e-8))throw new Error('walk-away MAX starved '+id+': '+(walkRates.get(id)||0)+'/h · '+walkPlan.scenarioLabel);
if(walkPlan.scenario?.heat!=='Scorching')throw new Error('walk-away Potato Kvass MAX did not choose Scorching: '+walkPlan.scenarioLabel);
const walkKvass=diagnoseObjective(walkPlan,walk,DATA,'4010006',{maximize:true});
if(!walkKvass.ok)throw new Error('walk-away diagnostics still think Potato Kvass is missing: '+walkKvass.detail);
console.log('walk-away MAX rates',Object.fromEntries([...walkRates].filter(([id])=>[4010169,4010174,4010006].includes(id))),'scenario',walkPlan.scenarioLabel);

const blocked=clone(joint);blocked.facilities['bouncy-brew-keg']={count:1,level:1};
const blockedPlan=optimizePlan(blocked,DATA),blockedDiag=diagnoseObjective(blockedPlan,blocked,DATA,'4010006',{maximize:true});
if(blockedDiag.ok)throw new Error('Potato Kvass unexpectedly remained reachable with Bouncy Brew Keg Lv.1');
if(!/Bouncy Brew Keg needs Lv\.2/i.test(blockedDiag.detail))throw new Error('objective diagnostics failed to identify blocked recipe chain: '+blockedDiag.detail);

console.log('recipe-note MAX gating works');
