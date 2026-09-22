import {GAME_DATA as DATA} from './src/data.js';
import {DEFAULT_STATE} from './src/defaults.js';
import {displayedEfficiencyPct,baseWorkRateForRecipe,workerCycleSeconds} from './src/optimizer.js';

const recipe=id=>DATA.recipes.find(r=>Number(r.id)===Number(id));
const eq=(actual,expected,msg,tol=1e-7)=>{if(Math.abs(actual-expected)>tol)throw new Error(`${msg}: expected ${expected}, got ${actual}`);};
const state=structuredClone(DEFAULT_STATE);
state.hungry=false;
const scenario={cooling:null,heat:null,sunlamp:false,generator:false};

// User-observed / in-game measured Efficiency readings.
eq(displayedEfficiencyPct(recipe(4001057),3,true),168,'Mine Clay · Earth Lv.3 + P');
eq(displayedEfficiencyPct(recipe(4020060),3,true),168,'Quick Sea Salt · Leisure Lv.3 + J');
eq(displayedEfficiencyPct(recipe(110002),3,true),140,'Aniipod Pro · Lightning Lv.3 ignores personality');
eq(displayedEfficiencyPct(recipe(4001071),3,true),168,'Plain Fresh Water · Water Lv.3 + F');
eq(displayedEfficiencyPct(recipe(4001071),2,true),120,'Plain Fresh Water · Water Lv.2 + F');
eq(displayedEfficiencyPct(recipe(4001046),3,true),168,'Aromathyst · Leisure Lv.3 + I');
eq(displayedEfficiencyPct(recipe(4010073),3,true),480,'Potato Chips · Dark Lv.3 + N');
eq(displayedEfficiencyPct(recipe(4010174),3,false),300,'Coarse-Sifted Ore · Fire Lv.3 without S');
eq(displayedEfficiencyPct(recipe(4010080),3,true),480,'Bamboo Ware · Artisanship Lv.3 + J');
eq(displayedEfficiencyPct(recipe(4010080),2,true),360,'Bamboo Ware · Artisanship Lv.2 + J');

// Gathering / no-personality structures have a higher base workload rate on harder recipes.
eq(baseWorkRateForRecipe(recipe(4001057)),1.25,'Mine Clay base workload rate');
eq(baseWorkRateForRecipe(recipe(110002)),1.25,'Aniipod Pro base workload rate');
eq(baseWorkRateForRecipe(recipe(4010073)),1,'Jukebox processor base workload rate');

// Timers use BOTH shown Efficiency and that base workload rate.
eq(workerCycleSeconds(recipe(4001057),state,scenario,3,false),2250/(1.25*1.4),'Mine Clay measured timer',1e-6);
eq(workerCycleSeconds(recipe(110002),state,scenario,3,false),2250/(1.25*1.4),'Aniipod Pro measured timer',1e-6);
eq(workerCycleSeconds(recipe(4010073),state,scenario,3,true),54/4.8,'Potato Chips measured timer',1e-6);

console.log('measured Efficiency curves match Mine/Well/Sandcastle/Aniipod/processor readings');
