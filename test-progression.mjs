import {GAME_DATA as DATA} from './src/data.js';
import {DEFAULT_STATE} from './src/defaults.js';
import {fillHomelandForRV,maxFacilityLevelAtRV,maxModuleLevelAtRV} from './src/progression.js';
import {optimizePlan} from './src/optimizer.js';

const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const base=structuredClone(DEFAULT_STATE);

const rv8=fillHomelandForRV({...base,homelandLevel:8},DATA);
const rv9=fillHomelandForRV({...base,homelandLevel:9},DATA);

assert(rv8.facilities.farmland.count===18,'RV8 Farmland ceiling should be 18');
assert(rv8.facilities.woodland.count===9,'RV8 Woodland ceiling should be 9');
assert(rv8.facilities.mine.count===4,'RV8 Mine ceiling should be 4');
assert(rv8.facilities.well.count===2,'RV8 Well ceiling should be 2');

assert(rv9.facilities.farmland.count===20,'RV9 Farmland ceiling should be 20');
assert(rv9.facilities.woodland.count===10,'RV9 Woodland ceiling should be 10');
assert(rv9.facilities.mine.count===5,'RV9 Mine ceiling should be 5');
assert(rv9.facilities.well.count===2,'RV9 Well ceiling should remain 2');
assert(rv9.facilities['carousel-mill'].count===2,'RV9 should unlock a second Carousel Mill');

assert(rv8.facilities.farmland.level===4,'RV8 Farmland should cap at Lv.4');
assert(rv9.facilities.farmland.level===5,'RV9 Farmland should unlock Lv.5');
assert(rv9.facilities.mine.level===3,'RV9 Mine should unlock Lv.3');
assert(rv9.facilities['crafting-table'].level===4,'RV9 Crafting Table should unlock Lv.4');
assert(rv9.facilities['bouncy-brew-keg'].level===2,'RV9 Bouncy Brew Keg should unlock Lv.2');
assert(rv9.facilities['aniipod-maker'].level===3,'RV9 Aniipod Maker should unlock Lv.3');
const rv10=fillHomelandForRV({...base,homelandLevel:10},DATA),rv11=fillHomelandForRV({...base,homelandLevel:11},DATA);
assert(rv10.facilities['crafting-table'].count===2,'RV10 should unlock a second Crafting Table');
assert(rv10.facilities['woodworking-bench'].count===2,'RV10 should unlock a second Woodworking Bench');
assert(rv10.facilities['chimney-kiln'].count===2,'RV10 should unlock a second Chimney Kiln');
assert(rv11.facilities['claw-game-cooker'].count===2,'RV11 should unlock a second Claw Game Cooker');
assert(rv11.facilities['jukebox-dryer'].count===2,'RV11 should unlock a second Jukebox Dryer');

assert(rv9.modules['ecological-module']===3,'RV9 Ecological Module should be Lv.3');
assert(rv9.modules['kitchen-module']===3,'RV9 Kitchen Module should be Lv.3');
assert(rv9.modules['resource-detector']===2,'RV9 Resource Detector should be Lv.2');
assert(rv9.modules['crafting-module']===2,'RV9 Crafting Module should be Lv.2');

assert(maxModuleLevelAtRV('ecological-module',18)===8,'Ecological module RV ladder mismatch');
assert(maxModuleLevelAtRV('kitchen-module',19)===7,'Kitchen module RV ladder mismatch');
assert(maxModuleLevelAtRV('resource-detector',19)===8,'Resource detector RV ladder mismatch');
assert(maxModuleLevelAtRV('crafting-module',19)===7,'Crafting module RV ladder mismatch');

const farmland=DATA.facilities.find(f=>f.slug==='farmland');
assert(maxFacilityLevelAtRV(farmland,8)===4,'facility homeLevel gate failed at RV8');
assert(maxFacilityLevelAtRV(farmland,9)===5,'facility homeLevel gate failed at RV9');

const p8=optimizePlan(rv8,DATA),p9=optimizePlan(rv9,DATA);
assert(!p8.infeasible&&!p9.infeasible,'autofilled RV plan should be feasible');
assert((p9.runnableRecipes?.length||0)>(p8.runnableRecipes?.length||0),'RV9 should expose more runnable recipes than RV8');
assert(p9.ratePerHour>=p8.ratePerHour-1e-7,'RV9 autofill should not reduce the best coin ceiling');

console.log('RV8',p8.runnableRecipes.length,'recipes',p8.ratePerHour.toFixed(2),'coin/h');
console.log('RV9',p9.runnableRecipes.length,'recipes',p9.ratePerHour.toFixed(2),'coin/h');
