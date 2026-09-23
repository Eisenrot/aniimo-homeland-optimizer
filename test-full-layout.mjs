import {GAME_DATA as DATA} from './src/data.js';
import {PLOT_MATRIX,PLOT_WIDTH,PLOT_HEIGHT,plotRect,normalizeLayoutSettings,enabledPlotNumbers,planPhysicalItems,buildFullBaseLayout,layoutStillFitsPlots,fullLayoutSignature} from './src/full-layout.js';

if(JSON.stringify(PLOT_MATRIX)!==JSON.stringify([[13,14,15,16],[12,7,8,9],[11,4,3,6],[10,2,1,5]]))throw new Error('plot numbering matrix drifted');
if(plotRect(1).x!==40||plotRect(1).y!==45||plotRect(16).x!==60||plotRect(16).y!==0)throw new Error('plot coordinates are wrong');
if(PLOT_WIDTH!==20||PLOT_HEIGHT!==15)throw new Error('plot geometry must remain 20x15');
const s=normalizeLayoutSettings({disabledPlots:[2,10,99],storageUnits:3},9);
if(s.disabledPlots.join(',')!=='2'||s.storageUnits!==3)throw new Error('layout settings normalization failed');
if(enabledPlotNumbers(s,9).join(',')!=='1,3,4,5,6,7,8,9')throw new Error('enabled plot set failed');

const state={homelandLevel:9,oneRecipePerFacility:true,facilities:{farmland:{count:20,level:5},woodland:{count:10,level:3},mine:{count:5,level:3},'crafting-table':{count:1,level:4}},climateOptions:{}};
const plan={scenario:{cooling:'Cool',heat:'Scorching',sunlamp:true},rows:[
  {facility:'farmland',units:7,perHour:4865,recipe:{id:1,env:'Adequate',outputs:[{item:4001007,qty:7}]}},
  {facility:'farmland',units:1,perHour:908,recipe:{id:2,env:'Scorching',outputs:[{item:4001001,qty:6}]}},
  {facility:'farmland',units:7,perHour:2870,recipe:{id:3,outputs:[{item:4001004,qty:7}]}},
  {facility:'farmland',units:4,perHour:539,recipe:{id:4,outputs:[{item:4001000,qty:42}]}},
  {facility:'farmland',units:1,perHour:239,recipe:{id:5,outputs:[{item:4001002,qty:46}]}},
  {facility:'woodland',units:10,perHour:4285,recipe:{id:6,env:'Warm',outputs:[{item:4001034,qty:7}]}},
  {facility:'mine',units:5,perHour:4560,recipe:{id:7,outputs:[{item:4001051,qty:6}]}},
  {facility:'crafting-table',units:.17,perHour:5132,recipe:{id:8,outputs:[{item:4010084,qty:1}]}}
]};
plan.climateLayout={feasible:true,status:'overlap',mode:'hot',message:'test',demands:[
  {facility:'farmland',name:'Farmland',env:'Scorching',count:1,w:2,h:2},
  {facility:'farmland',name:'Farmland',env:'Adequate',count:7,w:2,h:2},
  {facility:'woodland',name:'Woodland',env:'Warm',count:10,w:4,h:4}
],coolingField:{x:0,y:0,w:9,h:9},heatField:{x:1.5,y:0,w:9,h:9},utilities:[
  {facility:'cooling-unit',x:3.5,y:3.5,w:2,h:2},{facility:'heat-furnace',x:5.5,y:4,w:1,h:1}
],placements:[
  ...Array.from({length:10},(_,i)=>({facility:'woodland',name:'Woodland',env:'Warm',copy:i+1,x:(i%5)*3.2-3,y:Math.floor(i/5)*4,w:4,h:4})),
  {facility:'farmland',name:'Farmland',env:'Scorching',copy:1,x:9,y:4,w:2,h:2}
],adequateLayout:{feasible:true,field:{x:0,y:0,w:9,h:9},utility:{facility:'sunlamp',x:4,y:4,w:1,h:1},placements:Array.from({length:7},(_,i)=>({facility:'farmland',name:'Farmland',env:'Adequate',copy:i+1,x:(i%4)*2,y:Math.floor(i/4)*2,w:2,h:2}))}};

const items=planPhysicalItems(plan,state,DATA,{storageUnits:2});
if(items.filter(x=>x.facility==='farmland').length!==20)throw new Error('full layout must place all 20 active Farmlands');
if(items.filter(x=>x.facility==='woodland').length!==10)throw new Error('full layout must place all 10 active Woodlands');
if(items.filter(x=>x.facility==='storage-unit').length!==2)throw new Error('storage unit count missing');
if(!items.some(x=>x.facility==='crafting-table'))throw new Error('fractional processing assignment still needs a physical structure');

const built=buildFullBaseLayout(plan,state,DATA,{compact:true,shape:'auto',allowRotate:true,storageUnits:2,disabledPlots:[]});
if(!built.feasible)throw new Error('full base layout should fit at RV9: '+built.reason);
if(built.placements.length!==items.length)throw new Error(`layout lost structures: ${built.placements.length}/${items.length}`);
if(!layoutStillFitsPlots(built,{disabledPlots:[]},9))throw new Error('fresh layout must fit enabled plots');
const used=built.usedPlots[0];if(used&&layoutStillFitsPlots(built,{disabledPlots:[used]},9))throw new Error('disabling a used plot must invalidate the layout');
if(fullLayoutSignature(plan,state,{compact:true},'a')===fullLayoutSignature(plan,state,{compact:false},'a'))throw new Error('layout settings must invalidate layout cache');
console.log('full base auto-layout OK',{items:built.itemCount,plots:built.usedPlots,bounds:built.bounds});
