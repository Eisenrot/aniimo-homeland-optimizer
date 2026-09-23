import {GAME_DATA as DATA} from './data.js';
import {buildFullBaseLayout} from './full-layout.js';

self.onmessage=e=>{
  const msg=e.data||{};if(msg.type!=='layout')return;
  try{const layout=buildFullBaseLayout(msg.plan,msg.planState,DATA,msg.settings||{});self.postMessage({type:'result',layout});}
  catch(error){self.postMessage({type:'error',message:error?.stack||error?.message||String(error)});}
};
