import {GAME_DATA as DATA} from './src/data.js';
import {climateAllows,evaluateClimateLayout,searchOverlapLayout} from './src/climate.js';

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
