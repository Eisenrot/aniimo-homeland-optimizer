export const PLAN_CACHE_VERSION=1;
export const PLAN_CACHE_STORE='aniimoOptimizerPlanCacheV1';

export function stableStringify(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(v=>v===undefined?'null':stableStringify(v)).join(',')+']';
  const keys=Object.keys(value).filter(k=>value[k]!==undefined).sort();
  return '{'+keys.map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
}

export function planCacheSignature(planState,runOptions={},buildId='dev'){
  return stableStringify({
    version:PLAN_CACHE_VERSION,
    build:String(buildId||'dev'),
    state:planState,
    search:{
      maxClimateVariants:Number(runOptions.maxClimateVariants||0),
      maxClimateOffset:Number(runOptions.maxClimateOffset||0)
    }
  });
}

export function readPlanCache(storage,planState,runOptions={},buildId='dev'){
  try{
    const raw=storage?.getItem?.(PLAN_CACHE_STORE);if(!raw)return null;
    const entry=JSON.parse(raw);
    if(entry?.version!==PLAN_CACHE_VERSION){storage?.removeItem?.(PLAN_CACHE_STORE);return null;}
    if(entry.signature!==planCacheSignature(planState,runOptions,buildId))return null;
    if(!entry.plan||entry.plan.infeasible||entry.plan.realTeamApplied)return null;
    return entry;
  }catch{return null;}
}

export function writePlanCache(storage,planState,runOptions={},buildId='dev',plan,stats={}){
  if(!plan||plan.infeasible||plan.realTeamApplied)return false;
  try{
    const entry={
      version:PLAN_CACHE_VERSION,
      signature:planCacheSignature(planState,runOptions,buildId),
      createdAt:Date.now(),
      plan,
      stats
    };
    storage?.setItem?.(PLAN_CACHE_STORE,JSON.stringify(entry));
    return true;
  }catch{return false;}
}
