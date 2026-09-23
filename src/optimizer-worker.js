import {GAME_DATA as DATA} from './data.js';
import {optimizePlan} from './optimizer.js';

self.onmessage=e=>{
  const msg=e.data||{};if(msg.type!=='optimize')return;
  const started=performance.now();let lastPost=0;
  try{
    const plan=optimizePlan(msg.state,DATA,{...(msg.options||{}),onProgress:p=>{
      const now=performance.now();if(!p?.done&&now-lastPost<45)return;lastPost=now;self.postMessage({type:'progress',progress:p});
    }});
    const stats={...(plan.optimizerStats||{}),engine:'worker',elapsedMs:Number(plan.optimizerStats?.elapsedMs??performance.now()-started)};
    plan.optimizerStats=stats;
    self.postMessage({type:'result',plan,stats});
  }catch(error){
    self.postMessage({type:'error',message:error?.stack||error?.message||String(error)});
  }
};