import { VERSION, ABILITY_WORKLOAD, ABILITIES } from './data/meta.js';
import { PALS } from './data/pals.js';
import { RECIPES_A } from './data/recipes-a.js';
import { RECIPES_B } from './data/recipes-b.js';
import { FACILITIES } from './data/facilities.js';
import { ITEMS } from './data/items.js';
import { HARVEST_MOON_FESTIVAL, HARVEST_MOON_ITEMS, HARVEST_MOON_RECIPES } from './data/events/Harvest Moon Festival.js';
import { UTILITY_FACILITY_DEFS } from './utility-system.js';

const facilityMap=new Map(FACILITIES.map(facility=>[facility.slug,{...facility}]));
for(const [slug,definition] of Object.entries(UTILITY_FACILITY_DEFS)){
  facilityMap.set(slug,{...(facilityMap.get(slug)||{}),...definition});
}
export const GAME_DATA={
  version:VERSION,
  abilityWorkload:ABILITY_WORKLOAD,
  abilities:ABILITIES,
  pals:PALS,
  recipes:[...RECIPES_A,...RECIPES_B,...HARVEST_MOON_RECIPES],
  facilities:[...facilityMap.values()],
  items:{...ITEMS,...HARVEST_MOON_ITEMS},
  events:[HARVEST_MOON_FESTIVAL]
};