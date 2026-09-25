import {GAME_DATA as DATA} from './src/data.js';
import {PLOT_MATRIX,PLOT_WIDTH,PLOT_HEIGHT,plotRect,normalizeLayoutSettings,enabledPlotNumbers,planPhysicalItems,buildFullBaseLayout,layoutStillFitsPlots,fullLayoutSignature} from './src/full-layout.js';
import {evaluateClimateLayout} from './src/climate.js';

if(JSON.stringify(PLOT_MATRIX)!==JSON.stringify([[13,14,15,16],[12,7,8,9],[11,4,3,6],[10,2,1,5]]))throw new Error('plot numbering matrix drifted');
if(plotRect(1).x!==40||plotRect(1).y!==45||plotRect(16).x!==60||plotRect(16).y!==0)throw new Error('plot coordinates are wrong');
if(PLOT_WIDTH!==20||PLOT_HEIGHT!==15)throw new Error('plot geometry must remain 20x15');
const s=normalizeLayoutSettings({disabledPlots:[2,10,99],storageUnits:3},9);
if(s.disabledPlots.join(',')!=='2,10'||s.storageUnits!==3)throw new Error('layout settings normalization failed');
if(normalizeLayoutSettings({},9).storageUnits!==1)throw new Error('Storage Units should default to 1 once unlocked');
if(normalizeLayoutSettings({},1).storageUnits!==0)throw new Error('Storage Units must stay unavailable at RV1');
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
plan.climateLayout=evaluateClimateLayout(plan,state,DATA);
if(!plan.climateLayout.feasible)throw new Error('synthetic climate plan should be feasible: '+plan.climateLayout.message);

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

const storageBuilt=buildFullBaseLayout(plan,state,DATA,{compact:true,shape:'auto',allowRotate:true,storageUnits:3,disabledPlots:[]});
if(!storageBuilt.feasible)throw new Error('3-storage layout should fit: '+storageBuilt.reason);
const stores=storageBuilt.placements.filter(x=>x.kind==='storage');
if(stores.length!==3)throw new Error('storage optimizer lost a requested unit');
const centerOf=r=>({x:r.x+r.w/2,y:r.y+r.h/2}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let minStorageDistance=Infinity;for(let i=0;i<stores.length;i++)for(let j=i+1;j<stores.length;j++)minStorageDistance=Math.min(minStorageDistance,dist(centerOf(stores[i]),centerOf(stores[j])));
if(!(minStorageDistance>=4))throw new Error(`storage anchors collapsed onto one another: min distance ${minStorageDistance}`);
if(fullLayoutSignature(plan,state,{storageUnits:1},'a')===fullLayoutSignature(plan,state,{storageUnits:3},'a'))throw new Error('storage count must invalidate layout cache');
console.log('storage distribution OK',{stores:stores.map(x=>[x.x,x.y]),minStorageDistance});

const oneStore=buildFullBaseLayout(plan,state,DATA,{compact:true,shape:'auto',allowRotate:true,storageUnits:1,disabledPlots:[]});
if(!oneStore.feasible)throw new Error('1-storage compact baseline should fit');
const areaOf=b=>(b?.w||0)*(b?.h||0),oneArea=areaOf(oneStore.bounds),threeArea=areaOf(storageBuilt.bounds);
if(threeArea>oneArea*1.45)throw new Error(`3 storage units exploded compact layout: ${threeArea.toFixed(1)} vs baseline ${oneArea.toFixed(1)}`);
console.log('storage compactness OK',{oneArea,threeArea});


const mixedClimateState={
  homelandLevel:9,oneRecipePerFacility:true,
  facilities:{farmland:{count:6,level:7},woodland:{count:2,level:6}},
  climateOptions:{cooling:true,heat:true,sunlamp:true}
};
const mixedClimatePlan={
  scenario:{cooling:'Cool',heat:'Scorching',sunlamp:true,generator:false},
  rows:[
    {facility:'farmland',units:2,perHour:100,recipe:{id:8101,env:'Cool',outputs:[{item:4001005,qty:8}]}},
    {facility:'woodland',units:2,perHour:100,recipe:{id:8102,env:'Cool',outputs:[{item:4001033,qty:8}]}},
    {facility:'farmland',units:2,perHour:100,recipe:{id:8103,env:'Adequate',outputs:[{item:4001007,qty:7}]}},
    {facility:'farmland',units:2,perHour:100,recipe:{id:8104,env:'Scorching',outputs:[{item:4001001,qty:6}]}}
  ]
};
mixedClimatePlan.climateLayout=evaluateClimateLayout(mixedClimatePlan,mixedClimateState,DATA);
if(!mixedClimatePlan.climateLayout.feasible||mixedClimatePlan.climateLayout.status!=='separate')throw new Error('mixed direct + Adequate climate fixture should be a feasible separate-zone plan');
const mixedBuilt=buildFullBaseLayout(mixedClimatePlan,mixedClimateState,DATA,{compact:true,shape:'auto',allowRotate:true,storageUnits:0,disabledPlots:[]});
if(!mixedBuilt.feasible)throw new Error('mixed direct + Adequate full layout should fit: '+mixedBuilt.reason);
const fieldOf=type=>mixedBuilt.fields.find(f=>f.type===type),coolField=fieldOf('cooling'),heatField=fieldOf('heating'),adequateField=fieldOf('adequate');
if(!coolField||!heatField||!adequateField)throw new Error('full layout lost one of the required Cool / Scorching / Adequate fields');
const hit=(r,f)=>Math.max(0,Math.min(r.x+r.w,f.x+f.w)-Math.max(r.x,f.x))*Math.max(0,Math.min(r.y+r.h,f.y+f.h)-Math.max(r.y,f.y))>1e-7;
for(const p of mixedBuilt.placements.filter(x=>x.kind==='plan'&&x.env)){
  const own=p.env==='Cool'?coolField:p.env==='Scorching'?heatField:p.env==='Adequate'?adequateField:null;
  if(!own||!hit(p,own))throw new Error(`${p.env} ${p.name} escaped its required climate field`);
  for(const other of [coolField,heatField,adequateField])if(other!==own&&hit(p,other))throw new Error(`${p.env} ${p.name} leaked into another climate field`);
}
for(const [a,b] of [[coolField,heatField],[coolField,adequateField],[heatField,adequateField]])if(hit(a,b))throw new Error('separate climate influence fields must not overlap');
console.log('mixed climate full-layout zones OK',{fields:mixedBuilt.fields.map(f=>f.type),placements:mixedBuilt.placements.filter(p=>p.env).map(p=>[p.facility,p.env,p.x,p.y])});


const inventoryState={
  homelandLevel:10,oneRecipePerFacility:true,
  facilities:{
    farmland:{count:3,level:5},
    woodland:{count:2,level:3},
    'nimbus-bed':{count:1,level:1},
    'bouncy-brew-keg':{count:1,level:2}
  }
};
const inventoryPlan={scenario:{},rows:[
  {facility:'farmland',units:1,perHour:100,recipe:{id:8801,outputs:[{item:4001004,qty:7}]}},
  {facility:'woodland',units:1,perHour:100,recipe:{id:8802,outputs:[{item:4001032,qty:8}]}}
]};
const inventoryItems=planPhysicalItems(inventoryPlan,inventoryState,DATA,{storageUnits:0});
if(inventoryItems.filter(x=>x.facility==='farmland').length!==3)throw new Error('full layout must include idle configured Farmlands');
if(inventoryItems.filter(x=>x.facility==='woodland').length!==2)throw new Error('full layout must include idle configured Woodlands');
if(inventoryItems.filter(x=>x.facility==='nimbus-bed').length!==1||inventoryItems.filter(x=>x.facility==='bouncy-brew-keg').length!==1)throw new Error('full layout must include configured idle facilities with no active recipe');
if(inventoryItems.filter(x=>x.kind==='idle').length!==5)throw new Error(`expected 5 idle physical structures, got ${inventoryItems.filter(x=>x.kind==='idle').length}`);
const inventoryBuilt=buildFullBaseLayout(inventoryPlan,inventoryState,DATA,{compact:true,shape:'auto',allowRotate:true,storageUnits:0,disabledPlots:[]});
if(!inventoryBuilt.feasible)throw new Error('configured-inventory layout should fit: '+inventoryBuilt.reason);
if(inventoryBuilt.placements.length!==inventoryItems.length)throw new Error('configured idle structures were lost during packing');
console.log('configured full Homeland inventory OK',{total:inventoryItems.length,idle:inventoryItems.filter(x=>x.kind==='idle').length});


const denseClimateState={
  homelandLevel:10,oneRecipePerFacility:true,
  facilities:{farmland:{count:11,level:5},woodland:{count:8,level:3}},
  climateOptions:{cooling:true,heat:true,sunlamp:false}
};
const denseClimatePlan={
  scenario:{cooling:'Cool',heat:'Scorching',sunlamp:false,generator:false},
  rows:[
    {facility:'farmland',units:6,perHour:100,recipe:{id:8951,env:'Cool',outputs:[{item:4001005,qty:8}]}},
    {facility:'farmland',units:5,perHour:90,recipe:{id:8952,env:'Scorching',outputs:[{item:4001001,qty:6}]}},
    {facility:'woodland',units:8,perHour:80,recipe:{id:8953,env:'Cool',outputs:[{item:4001032,qty:8}]}}
  ]
};
denseClimatePlan.climateLayout=evaluateClimateLayout(denseClimatePlan,denseClimateState,DATA);
if(!denseClimatePlan.climateLayout.feasible||denseClimatePlan.climateLayout.status!=='separate')throw new Error('dense Cool + Scorching fixture should use separate direct zones');
const denseItems=planPhysicalItems(denseClimatePlan,denseClimateState,DATA,{storageUnits:0});
const denseBuilt=buildFullBaseLayout(denseClimatePlan,denseClimateState,DATA,{compact:true,shape:'auto',allowRotate:true,storageUnits:0,disabledPlots:[]});
if(!denseBuilt.feasible)throw new Error('dense direct climate layout should fit at RV10: '+denseBuilt.reason);
if(denseBuilt.placements.length!==denseItems.length)throw new Error(`dense direct climate layout lost structures: ${denseBuilt.placements.length}/${denseItems.length}`);
const denseCool=denseBuilt.placements.filter(x=>x.kind==='plan'&&x.env==='Cool');
if(denseCool.length!==14)throw new Error(`expected 14 Cool structures in dense zone, got ${denseCool.length}`);
console.log('dense separate climate zones OK',{cool:denseCool.length,total:denseBuilt.placements.length,fields:denseBuilt.fields.map(f=>f.type)});
