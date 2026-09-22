// RV progression used by the optimizer's "Fill for RV" and Super Optimizer passes.
// Bulk production counts represent the strongest progression state reachable while still at
// that RV level: i.e. the placed-facility targets for the next RV rung, carrying forward
// facilities that are not mentioned again. RV20 keeps the final known 40/20/10/2 ceiling.

export const RV_BULK_FACILITIES={
  1:{farmland:4,woodland:0,mine:0,well:0},
  2:{farmland:6,woodland:3,mine:0,well:0},
  3:{farmland:8,woodland:4,mine:2,well:0},
  4:{farmland:10,woodland:5,mine:2,well:1},
  5:{farmland:12,woodland:6,mine:3,well:1},
  6:{farmland:14,woodland:7,mine:3,well:1},
  7:{farmland:16,woodland:8,mine:4,well:1},
  8:{farmland:18,woodland:9,mine:4,well:2},
  9:{farmland:20,woodland:10,mine:5,well:2},
  10:{farmland:22,woodland:11,mine:5,well:2},
  11:{farmland:24,woodland:12,mine:6,well:2},
  12:{farmland:26,woodland:13,mine:6,well:2},
  13:{farmland:28,woodland:14,mine:7,well:2},
  14:{farmland:30,woodland:15,mine:7,well:2},
  15:{farmland:32,woodland:16,mine:8,well:2},
  16:{farmland:34,woodland:17,mine:8,well:2},
  17:{farmland:36,woodland:18,mine:9,well:2},
  18:{farmland:38,woodland:19,mine:9,well:2},
  19:{farmland:40,woodland:20,mine:10,well:2},
  20:{farmland:40,woodland:20,mine:10,well:2}
};

export const MODULE_RV_UNLOCKS={
  'ecological-module':[[1,3],[2,7],[3,8],[4,11],[5,12],[6,14],[7,17],[8,18]],
  'kitchen-module':[[1,2],[2,4],[3,8],[4,10],[5,13],[6,16],[7,19]],
  'resource-detector':[[1,5],[2,8],[3,11],[4,12],[5,13],[6,15],[7,17],[8,19]],
  'crafting-module':[[1,5],[2,7],[3,10],[4,12],[5,17],[6,18],[7,19]]
};

const clone=x=>JSON.parse(JSON.stringify(x));
const clampRv=rv=>Math.min(20,Math.max(1,Number(rv)||1));

export function maxModuleLevelAtRV(slug,rv){
  const level=clampRv(rv);
  let best=0;
  for(const [moduleLevel,requiredRv] of MODULE_RV_UNLOCKS[slug]||[]){
    if(requiredRv<=level)best=Math.max(best,moduleLevel);
  }
  return best;
}

export function maxFacilityLevelAtRV(facility,rv){
  const level=clampRv(rv);
  let best=0;
  for(const [facilityLevel,requiredRv] of Object.entries(facility?.homeLevel||{})){
    if(Number(requiredRv)<=level)best=Math.max(best,Number(facilityLevel)||0);
  }
  return best;
}

export function fillHomelandForRV(source,data){
  const state=clone(source||{});
  const rv=clampRv(state.homelandLevel);
  const bulk=RV_BULK_FACILITIES[rv]||RV_BULK_FACILITIES[1];
  const facilities={};

  for(const facility of data.facilities||[]){
    if(facility.kind==='utility')continue;
    const maxLevel=maxFacilityLevelAtRV(facility,rv);
    const count=Object.prototype.hasOwnProperty.call(bulk,facility.slug)
      ? Number(bulk[facility.slug]||0)
      : maxLevel>0?1:0;
    facilities[facility.slug]={count,level:maxLevel||1};
  }

  state.facilities=facilities;
  state.modules={...(state.modules||{})};
  for(const slug of Object.keys(MODULE_RV_UNLOCKS)){
    state.modules[slug]=maxModuleLevelAtRV(slug,rv);
  }
  return state;
}

export function progressionSummary(rv,data){
  const level=clampRv(rv),bulk=RV_BULK_FACILITIES[level];
  const unlocked=(data.facilities||[])
    .filter(f=>f.kind!=='utility')
    .map(f=>({slug:f.slug,name:f.name,count:Object.prototype.hasOwnProperty.call(bulk,f.slug)?bulk[f.slug]:(maxFacilityLevelAtRV(f,level)?1:0),level:maxFacilityLevelAtRV(f,level)}))
    .filter(x=>x.count>0&&x.level>0);
  const modules=Object.fromEntries(Object.keys(MODULE_RV_UNLOCKS).map(k=>[k,maxModuleLevelAtRV(k,level)]));
  return{rv:level,bulk:{...bulk},unlocked,modules};
}
