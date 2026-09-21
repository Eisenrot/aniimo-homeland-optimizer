import {GAME_DATA as DATA} from './src/data.js';
import {DEFAULT_STATE} from './src/defaults.js';
import {optimizePlan,buildTeamModel,findBestTeams,optimizePersonalities} from './src/optimizer.js';
const state=structuredClone(DEFAULT_STATE);state.owned={};for(const p of DATA.pals)state.owned[String(p.id)]={enabled:true,count:1};
const plan=optimizePlan(state,DATA),model=buildTeamModel(plan,state,DATA);
const teams=await findBestTeams(model,state,DATA,{limit:2,onProgress:()=>{}});
for(const t of teams)console.log(t.eval.rate,t.team.map(x=>x.pal.name).join(','));
const special=await optimizePersonalities(model,teams[0].team,()=>{});console.log('special',special.rate,special.profiles.join(','));
