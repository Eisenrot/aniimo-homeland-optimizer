import {GAME_DATA as DATA} from './src/data.js';
import {climateAllows,evaluateClimateLayout,searchOverlapLayout,climateDemands,productionPlacementCounts} from './src/climate.js';
import {optimizePlan} from './src/optimizer.js';

const demand=(facility,env,count,w,h)=>({key:facility+'|'+env,facility,name:facility,env,count,units:count,w,h,canRotate:true});

const hotImpossible=[demand('farmland','Scorching',3,2,2),demand('woodland','Warm',10,4,4)];
const hotTwo=[demand('farmland','Scorching',2,2,2),demand('woodland','Warm',10,4,4)];
const hotNine=[demand('farmland','Scorching',3,2,2),demand('woodland','Warm',9,4,4)];

if(searchOverlapLayout(hotImpossible,'hot').feasible)throw new Error('3 Scorching Farmlands + 10 Warm Woodlands should not fit');
if(!searchOverlapLayout(hotTwo,'hot').feasible)throw new Error('2 Scorching Farmlands + 10 Warm Woodlands should fit');
if(!searchOverlapLayout(hotNine,'hot').feasible)throw new Error('3 Scorching Farmlands + 9 Warm Woodlands should fit');

const coldImpossible=[demand('farmland','Freeze',3,2,2),demand('woodland','Cool',10,4,4)];
const coldTwo=[demand('farmland','Freeze',2,2,2),demand('woodland','Cool',10,4,4)];
const coldNine=[demand('farmland','Freeze',3,2,2),demand('woodland','Cool',9,4,4)];
if(searchOverlapLayout(coldImpossible,'cold').feasible)throw new Error('3 Freeze Farmlands + 10 Cool Woodlands should not fit');
if(!searchOverlapLayout(coldTwo,'cold').feasible)throw new Error('2 Freeze Farmlands + 10 Cool Woodlands should fit');
if(!searchOverlapLayout(coldNine,'cold').feasible)throw new Error('3 Freeze Farmlands + 9 Cool Woodlands should fit');

const threeTier=[
  demand('woodland','Freeze',3,4,4),
  demand('woodland','Cool',4,4,4),
  demand('woodland','Warm',3,4,4)
];
if(!searchOverlapLayout(threeTier,'cold').feasible)throw new Error('Freeze + Cool + Warm 3/4/3 Woodland layout should fit');

if(!climateAllows('Cool',{cooling:'Freeze',heat:'Warm'}))throw new Error('Freeze + Warm overlap should produce Cool');
if(!climateAllows('Warm',{cooling:'Cool',heat:'Scorching'}))throw new Error('Cool + Scorching overlap should produce Warm');
if(climateAllows('Scorching',{cooling:'Freeze',heat:'Warm'}))throw new Error('Freeze + Warm must not magically produce Scorching');
if(climateAllows('Freeze',{cooling:'Cool',heat:'Scorching'}))throw new Error('Cool + Scorching must not magically produce Freeze');

const state={facilities:{farmland:{count:20,level:5},woodland:{count:10,level:3}}};
const plan={
  scenario:{cooling:'Cool',heat:'Scorching',sunlamp:false,generator:false},
  rows:[
    {facility:'farmland',units:3,recipe:{env:'Scorching'}},
    {facility:'woodland',units:10,recipe:{env:'Warm'}}
  ]
};
const checked=evaluateClimateLayout(plan,state,DATA);
if(checked.feasible)throw new Error('User example should be rejected by physical climate layout');
if(checked.status!=='overlap-pack')throw new Error('User example should fail specifically at overlap packing');

const rescued=evaluateClimateLayout({...plan,rows:[
  {facility:'farmland',units:2,recipe:{env:'Scorching'}},
  {facility:'woodland',units:10,recipe:{env:'Warm'}}
]},state,DATA);
if(!rescued.feasible||rescued.status!=='overlap')throw new Error('Reduced Sugarcane placement should produce an overlap layout');

console.log('climate layout regression OK',{
  hotTwo:searchOverlapLayout(hotTwo,'hot').offset,
  hotNine:searchOverlapLayout(hotNine,'hot').offset,
  coldThreeTier:searchOverlapLayout(threeTier,'cold').offset
});


const tinyData={
  items:{
    '1':{name:'Hot Crop',value:100},
    '2':{name:'Warm Wood',value:100}
  },
  facilities:[
    {slug:'farmland',name:'Farmland',kind:'production',footprint:{w:2,h:2},canRotate:true,outputLimit:{1:99}},
    {slug:'woodland',name:'Woodland',kind:'production',footprint:{w:4,h:4},canRotate:true,outputLimit:{1:99}},
    {slug:'cooling-unit',name:'Cooling Unit',kind:'utility',footprint:{w:2,h:2},influence:{w:9,h:9}},
    {slug:'heat-furnace',name:'Heat Furnace',kind:'utility',footprint:{w:1,h:1},influence:{w:9,h:9}}
  ],
  recipes:[
    {id:1,facility:'farmland',level:1,inputs:[],outputs:[{item:1,qty:1}],growSeconds:3600,env:'Scorching'},
    {id:2,facility:'woodland',level:1,inputs:[],outputs:[{item:2,qty:1}],growSeconds:3600,env:'Warm'}
  ],
  pals:[],abilities:{}
};
const tinyState={
  homelandLevel:9,workerSlots:0,teamSlots:0,abilityLevel:4,target:'coin',guarantees:[],
  facilities:{farmland:{count:3,level:1},woodland:{count:10,level:1}},
  modules:{},speeds:{},recipeNotes:{},owned:{},climateOptions:{cooling:true,heat:true,sunlamp:false},
  generatorAvailable:false,hungry:false,manualSpeeds:false,collectHours:0,oneRecipePerFacility:false
};
const climateAware=optimizePlan(tinyState,tinyData);
if(climateAware.infeasible)throw new Error('climate-aware optimizer failed to find the next-best physical plan');
if(!climateAware.climateLayout?.feasible)throw new Error('climate-aware optimizer returned a physically invalid plan');
const hotUnits=climateAware.rows.find(r=>r.facility==='farmland')?.units||0,warmUnits=climateAware.rows.find(r=>r.facility==='woodland')?.units||0;
if(!(hotUnits<=2.000001||warmUnits<=9.000001))throw new Error(`optimizer did not back off the impossible 3+10 layout: ${hotUnits} + ${warmUnits}`);
console.log('climate optimizer branch',hotUnits,warmUnits,climateAware.scenarioLabel);


const placementState={facilities:{farmland:{count:20,level:5},woodland:{count:10,level:3}}};
const placementRows=[
  {facility:'farmland',units:6.55,perHour:4865,recipe:{id:9101,env:'Adequate'}},
  {facility:'farmland',units:6.70,perHour:2870,recipe:{id:9102}},
  {facility:'farmland',units:1.35,perHour:908,recipe:{id:9103,env:'Scorching'}},
  {facility:'farmland',units:3.65,perHour:539,recipe:{id:9104}},
  {facility:'farmland',units:.94,perHour:239,recipe:{id:9105}},
  {facility:'woodland',units:10,perHour:4285,recipe:{id:9201,env:'Warm'}}
];
const farmCounts=productionPlacementCounts('farmland',placementRows,placementState,DATA);
const displayed=placementRows.filter(r=>r.facility==='farmland').map(r=>farmCounts.get(r)||0);
if(displayed.join(',')!=='7,7,1,4,1')throw new Error(`whole-placement apportionment drifted: ${displayed.join(',')}`);
const placementDemands=climateDemands({rows:placementRows},placementState,DATA);
const demandKey=new Map(placementDemands.map(d=>[`${d.facility}|${d.env}`,d.count]));
if(demandKey.get('farmland|Adequate')!==7)throw new Error(`Adequate climate count must match displayed Lavender 7x, got ${demandKey.get('farmland|Adequate')}`);
if(demandKey.get('farmland|Scorching')!==1)throw new Error(`Scorching climate count must match displayed Sugarcane 1x, got ${demandKey.get('farmland|Scorching')}`);
if(demandKey.get('woodland|Warm')!==10)throw new Error(`Warm climate count must match displayed Woodland 10x, got ${demandKey.get('woodland|Warm')}`);
console.log('climate/display placement counts aligned',Object.fromEntries(demandKey));


const expectedCropClimate={
  'Rose':'Cool',
  'Strawberry':'Cool',
  'Lavender':'Adequate',
  'Sugarcane':'Scorching',
  'Cherry Blossom':'Warm',
  'Apple':'Cool',
  'Maple Syrup':'Freeze',
  'Ginseng':'Cool',
  'Grapes':'Adequate',
  'Cranberry':'Freeze',
  'Agave':'Scorching',
  'Palm Bark':'Scorching',
  'Chestnut':'Warm',
  'Walnut':'Adequate',
  'Natural Rubber':'Scorching',
  'Coconut':'Scorching',
  'Cocoa':'Scorching',
  'Orange Flower':'Adequate'
};
for(const [name,env] of Object.entries(expectedCropClimate)){
  const matching=DATA.recipes.filter(r=>['farmland','woodland'].includes(r.facility)&&(r.outputs||[]).some(o=>DATA.items?.[String(o.item)]?.name===name));
  if(!matching.length)throw new Error(`missing climate recipe for ${name}`);
  if(matching.some(r=>r.env!==env))throw new Error(`${name} climate drifted: expected ${env}, got ${[...new Set(matching.map(r=>r.env||'none'))].join(', ')}`);
}
console.log('all climate crop/tree metadata OK',expectedCropClimate);
