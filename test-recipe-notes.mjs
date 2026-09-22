import {GAME_DATA as DATA} from './src/data.js';
import {DEFAULT_STATE} from './src/defaults.js';
import {fillHomelandForRV} from './src/progression.js';
import {optimizePlan,recipeRunnable,planItemRates} from './src/optimizer.js';

const clone=x=>structuredClone(x);
const kvass=DATA.recipes.find(r=>Number(r.id)===4010006);
if(!kvass)throw new Error('Potato Kvass recipe missing from data');

const base=fillHomelandForRV({...clone(DEFAULT_STATE),homelandLevel:9},DATA);
base.workerSlots=28;
base.teamSlots=28;
base.target='coin';
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

console.log('recipe-note MAX gating works');
