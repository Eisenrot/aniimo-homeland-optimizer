import {GAME_DATA as DATA} from './src/data.js';
import {climateAllows,evaluateClimateLayout,searchOverlapLayout} from './src/climate.js';
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
