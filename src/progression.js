// RV progression used by the optimizer's "Fill for RV" and Super Optimizer passes.
// Bulk production counts represent the strongest progression state reachable while still at
// that RV level: i.e. the placed-facility targets for the next RV rung, carrying forward
// facilities that are not mentioned again. Bulk plot counts follow the game ladder; processor
// copy unlocks below are the actual placement caps, not the old RV11 fossil wearing a fake moustache.

import {maxGeneratorLevelAtRv} from './utility-system.js';


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
  14:{farmland:30,woodland:15,mine:7,well:3},
  15:{farmland:32,woodland:16,mine:8,well:3},
  16:{farmland:34,woodland:17,mine:8,well:3},
  17:{farmland:36,woodland:18,mine:9,well:3},
  18:{farmland:38,woodland:19,mine:9,well:3},
  19:{farmland:40,woodland:20,mine:10,well:4},
  20:{farmland:40,woodland:20,mine:10,well:4}
};

// Refreshed from current station placement caps + an in-game RV14 sanity check.
// No more dragging RV11 fossils into RV20 and calling it progression.
export const FACILITY_RV_COUNTS={
  'tidewhisper-sandcastle':[0,0,0,0,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2],
  'dewy-house':[0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2],
  'nimbus-bed':[0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,2,2,2,2,2],
  'starfall-hammock':[0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,2,2,2],
  'floral-windmill':[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1],
  'carousel-mill':[0,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2],
  'crafting-table':[0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2],
  'claw-game-cooker':[0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2],
  'jukebox-dryer':[0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2],
  'simmering-pot':[0,0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2],
  'phonolfactory-table':[0,0,0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2],
  'bouncy-brew-keg':[0,0,0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2],
  'blazing-stove':[0,0,0,0,0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2],
  'pickling-jar':[0,0,0,0,0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2],
  'joy-wheel-loom':[0,0,0,0,0,0,1,1,1,1,1,1,1,2,2,2,2,2,2,2],
  'dance-pad-polisher':[0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  'aniipod-maker':[0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  'woodworking-bench':[0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4],
  'chimney-kiln':[0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4]
};

export function facilityCountAtRV(slug,rv){
  const counts=FACILITY_RV_COUNTS[slug];if(!counts)return null;
  const level=clampRv(rv),index=Math.min(level,counts.length)-1;
  return Number(counts[index]||0);
}

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
    const knownCount=facilityCountAtRV(facility.slug,rv);
    const count=Object.prototype.hasOwnProperty.call(bulk,facility.slug)
      ? Number(bulk[facility.slug]||0)
      : knownCount!=null?knownCount:(maxLevel>0?1:0);
    facilities[facility.slug]={count,level:maxLevel||1};
  }

  state.facilities=facilities;
  state.modules={...(state.modules||{})};
  for(const slug of Object.keys(MODULE_RV_UNLOCKS)){
    state.modules[slug]=maxModuleLevelAtRV(slug,rv);
  }

  // Fill RV means strongest unlocked progression. Utility copy counts remain
  // user-owned state, but an existing Generator should not stay haunted by Lv.1.
  state.generatorLevel=maxGeneratorLevelAtRv(rv)||1;

  return state;
}

export function progressionSummary(rv,data){
  const level=clampRv(rv),bulk=RV_BULK_FACILITIES[level];
  const unlocked=(data.facilities||[])
    .filter(f=>f.kind!=='utility')
    .map(f=>{const knownCount=facilityCountAtRV(f.slug,level);return{slug:f.slug,name:f.name,count:Object.prototype.hasOwnProperty.call(bulk,f.slug)?bulk[f.slug]:(knownCount!=null?knownCount:(maxFacilityLevelAtRV(f,level)?1:0)),level:maxFacilityLevelAtRV(f,level)}})
    .filter(x=>x.count>0&&x.level>0);
  const modules=Object.fromEntries(Object.keys(MODULE_RV_UNLOCKS).map(k=>[k,maxModuleLevelAtRV(k,level)]));
  return{rv:level,bulk:{...bulk},unlocked,modules};
}
