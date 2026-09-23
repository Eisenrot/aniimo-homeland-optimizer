import {BASE_PALS,FORM_CATALOG,FORM_PALS,PALS} from './src/data/pals.js';

if(BASE_PALS.length!==98)throw new Error(`base roster drifted: ${BASE_PALS.length}`);
if(FORM_PALS.length!==123)throw new Error(`regional/Prismana form count drifted: ${FORM_PALS.length}`);
if(PALS.length!==221)throw new Error(`expanded roster should have 221 entries, got ${PALS.length}`);
if(FORM_PALS.filter(p=>p.isPrismana).length!==26)throw new Error('Prismana form count drifted');
if(Object.keys(FORM_CATALOG).length!==61)throw new Error('multi-form species count drifted');

const ids=new Set();
for(const p of PALS){
  if(ids.has(String(p.id)))throw new Error(`duplicate Aniimo id ${p.id}`);
  ids.add(String(p.id));
  if(!p.abilities||!Object.keys(p.abilities).length)throw new Error(`missing abilities for ${p.name}`);
}
for(const p of FORM_PALS){
  if(!p.baseId||!p.form||!p.icon)throw new Error(`incomplete form metadata for ${p.name}`);
  if(Math.floor(Number(p.id)/1000)!==Math.floor(Number(p.baseId)/1000))throw new Error(`form family id escaped base family: ${p.name}`);
}
const baseByName=new Map(BASE_PALS.map(p=>[p.name,p]));
for(const p of FORM_PALS){
  const base=baseByName.get(p.speciesName);if(!base)throw new Error(`missing base species for ${p.name}`);
}
const glyn=FORM_PALS.find(p=>p.speciesName==='Glynsera'&&p.form==='Prismana');
if(!glyn||glyn.abilities.Ice!==4||glyn.abilities.Light!==3||glyn.abilities.Hauling!==4)throw new Error('Glynsera Prismana Homeland abilities drifted');
const night=FORM_PALS.find(p=>p.speciesName==='Glynsera'&&p.form==='Nighttime');
if(!night||night.abilities.Dark!==2||night.abilities.Ice!==3||night.abilities.Hauling!==3)throw new Error('Glynsera Nighttime Homeland abilities drifted');
const iris=FORM_PALS.find(p=>p.speciesName==='Iris'&&p.form==='Prismana');
if(!iris||iris.abilities.Grass!==1||iris.abilities.Leisure!==1)throw new Error('Iris Prismana should inherit Iris Homeland abilities');
const infer=FORM_PALS.find(p=>p.speciesName==='Inferlupa'&&p.form==='Prismana');
if(!infer||infer.abilities.Dark!==4||infer.abilities.Fire!==3||infer.abilities.Hauling!==4)throw new Error('Inferlupa Prismana Homeland abilities drifted');
console.log('Aniimo forms OK',{base:BASE_PALS.length,forms:FORM_PALS.length,prismana:FORM_PALS.filter(p=>p.isPrismana).length,total:PALS.length});
