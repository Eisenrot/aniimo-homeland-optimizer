import fs from 'node:fs';
import {BASE_PALS,FORM_CATALOG,FORM_IDS,FORM_PALS,PALS,aniidexHeadIcon} from './src/data/pals.js';

if(BASE_PALS.length!==98)throw new Error(`base roster drifted: ${BASE_PALS.length}`);
if(FORM_PALS.length!==123)throw new Error(`regional/Prismana form count drifted: ${FORM_PALS.length}`);
if(PALS.length!==221)throw new Error(`expanded roster should have 221 entries, got ${PALS.length}`);
if(FORM_PALS.filter(p=>p.isPrismana).length!==26)throw new Error('Prismana form count drifted');
if(Object.keys(FORM_CATALOG).length!==61||Object.keys(FORM_IDS).length!==61)throw new Error('form species catalogue drifted');

const ids=new Set(),legacyIds=new Set();
for(const p of PALS){
  if(ids.has(String(p.id)))throw new Error(`duplicate Aniimo id ${p.id}`);
  ids.add(String(p.id));
  if(!p.abilities||!Object.keys(p.abilities).length)throw new Error(`missing abilities for ${p.name}`);
  if(!String(p.icon||'').startsWith('https://aniidex.com/'))throw new Error(`non-AniIDEX Aniimo icon for ${p.name}: ${p.icon}`);
}
for(const p of BASE_PALS){
  if(p.isForm||p.form!=='Basic')throw new Error(`base metadata drifted for ${p.name}`);
  if(p.icon!==aniidexHeadIcon(p.id,false))throw new Error(`base AniIDEX icon mismatch for ${p.name}`);
}
for(const p of FORM_PALS){
  if(!p.baseId||!p.form||!p.icon||!p.aniidexUrl)throw new Error(`incomplete form metadata for ${p.name}`);
  if(Math.floor(Number(p.id)/1000)!==Math.floor(Number(p.baseId)/1000))throw new Error(`form family id escaped base family: ${p.name}`);
  if(legacyIds.has(String(p.legacyId)))throw new Error(`duplicate legacy form id ${p.legacyId}`);
  legacyIds.add(String(p.legacyId));
  if(!p.aniidexUrl.includes(`?form=${p.id}`))throw new Error(`AniIDEX form URL mismatch for ${p.name}`);
  if(p.icon!==aniidexHeadIcon(p.id,true))throw new Error(`AniIDEX form icon mismatch for ${p.name}`);
}
for(const [species,names] of Object.entries(FORM_CATALOG)){
  if(names.length!==(FORM_IDS[species]||[]).length)throw new Error(`form id/name count mismatch for ${species}`);
}
const form=(species,name)=>FORM_PALS.find(p=>p.speciesName===species&&p.form===name);
if(form('Emberpup','Highland')?.id!==1005101||form('Emberpup','Mountain Woods')?.id!==1005104)throw new Error('Emberpup AniIDEX form ids drifted');
if(form('Iris','Prismana')?.id!==1021104)throw new Error('Iris Prismana AniIDEX id drifted');
if(form('Thornblade','Thunderstorm')?.id!==1032301)throw new Error('Thornblade Thunderstorm AniIDEX id drifted');
const glyn=form('Glynsera','Prismana');
if(!glyn||glyn.id!==1013301||glyn.abilities.Ice!==4||glyn.abilities.Light!==3||glyn.abilities.Hauling!==4)throw new Error('Glynsera Prismana Homeland abilities drifted');
const night=form('Glynsera','Nighttime');
if(!night||night.id!==1013302||night.abilities.Dark!==2||night.abilities.Ice!==3||night.abilities.Hauling!==3)throw new Error('Glynsera Nighttime Homeland abilities drifted');
const iris=form('Iris','Prismana');
if(!iris||iris.abilities.Grass!==1||iris.abilities.Leisure!==1)throw new Error('Iris Prismana should inherit Iris Homeland abilities until AniIDEX supplies a different Homeland override');
const infer=form('Inferlupa','Prismana');
if(!infer||infer.id!==1005503||infer.abilities.Dark!==4||infer.abilities.Fire!==3||infer.abilities.Hauling!==4)throw new Error('Inferlupa Prismana Homeland abilities drifted');

const app=fs.readFileSync(new URL('./src/app.js',import.meta.url),'utf8');
if(app.includes('/images/aniimo/heads/'))throw new Error('Hideout Aniimo head URL remains in app.js');
if(app.includes('aniimoguide.com/images/aniimo'))throw new Error('AniimoGuide Aniimo artwork remains in app.js');
const data=fs.readFileSync(new URL('./src/data/pals.js',import.meta.url),'utf8');
if(data.includes('aniimoguide.com'))throw new Error('AniimoGuide artwork remains in pals.js');
console.log('AniIDEX Aniimo roster OK',{base:BASE_PALS.length,forms:FORM_PALS.length,prismana:FORM_PALS.filter(p=>p.isPrismana).length,total:PALS.length});
