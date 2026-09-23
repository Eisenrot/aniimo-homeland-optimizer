import {PLAN_CACHE_STORE,PLAN_CACHE_VERSION,planCacheSignature,readPlanCache,writePlanCache} from './src/plan-cache.js';

class FakeStorage{
  constructor(){this.map=new Map();}
  getItem(k){return this.map.has(k)?this.map.get(k):null;}
  setItem(k,v){this.map.set(k,String(v));}
  removeItem(k){this.map.delete(k);}
}
const storage=new FakeStorage(),stateA={b:2,a:{z:1,y:[3,2,1]}},stateSame={a:{y:[3,2,1],z:1},b:2},options={maxClimateVariants:28,maxClimateOffset:9},plan={ratePerHour:123,rows:[{facility:'farmland',units:1}],scenario:{cooling:'Cool'}},stats={candidatePlans:8};
if(planCacheSignature(stateA,options,'abc')!==planCacheSignature(stateSame,{maxClimateOffset:9,maxClimateVariants:28},'abc'))throw new Error('cache signature must be deterministic across object key order');
if(!writePlanCache(storage,stateA,options,'abc',plan,stats))throw new Error('successful theoretical plan should cache');
const hit=readPlanCache(storage,stateSame,options,'abc');
if(!hit||hit.plan.ratePerHour!==123||hit.stats.candidatePlans!==8)throw new Error('exact state should restore cached plan');
if(readPlanCache(storage,{...stateA,b:3},options,'abc'))throw new Error('state change must invalidate cache');
if(readPlanCache(storage,stateA,{...options,maxClimateVariants:56},'abc'))throw new Error('search budget change must invalidate cache');
if(readPlanCache(storage,stateA,options,'def'))throw new Error('new deployed build must invalidate cache');
if(writePlanCache(storage,stateA,options,'abc',{infeasible:true},{}))throw new Error('infeasible plan must not cache');
if(writePlanCache(storage,stateA,options,'abc',{realTeamApplied:true},{}))throw new Error('real-team overlay must not cache');
storage.setItem(PLAN_CACHE_STORE,JSON.stringify({version:PLAN_CACHE_VERSION-1}));
if(readPlanCache(storage,stateA,options,'abc')!==null||storage.getItem(PLAN_CACHE_STORE)!==null)throw new Error('schema mismatch should invalidate stored entry');
console.log('persistent theoretical plan cache OK');
