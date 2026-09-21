import { VERSION, ABILITY_WORKLOAD, ABILITIES } from './data/meta.js';
import { PALS } from './data/pals.js';
import { RECIPES_A } from './data/recipes-a.js';
import { RECIPES_B } from './data/recipes-b.js';
import { FACILITIES } from './data/facilities.js';
import { ITEMS } from './data/items.js';
export const GAME_DATA={version:VERSION,abilityWorkload:ABILITY_WORKLOAD,abilities:ABILITIES,pals:PALS,recipes:[...RECIPES_A,...RECIPES_B],facilities:FACILITIES,items:ITEMS};
