import fs from 'node:fs';
import {BASE_PALS,FORM_CATALOG,FORM_IDS,FORM_PALS,PALS,aniidexHeadIcon} from './src/data/pals.js';

if(BASE_PALS.length!==100)throw new Error(`AniIDEX basic roster drifted: ${BASE_PALS.length}`);
if(FORM_PALS.length!==123)throw new Error(`regional/Prismana form count drifted: ${FORM_PALS.length}`);
if(PALS.length!==223)throw new Error(`expanded roster should have 223 entries, got ${PALS.length}`);
if(FORM_PALS.filter(p=>p.isPrismana).length!==26)throw new Error('Prismana form count drifted');
if(Object.keys(FORM_CATALOG).length!==61||Object.keys(FORM_IDS).length!==61)throw new Error('form species catalogue drifted');

const ids=new Set(),legacyIds=new Set();
for(const p of PALS){
  if(ids.has(String(p.id)))throw new Error(`duplicate Aniimo id ${p.id}`);
  ids.add(String(p.id));
  if(!p.abilities||!Object.keys(p.abilities).length)throw new Error(`missing abilities for ${p.name}`);
  if(!String(p.icon||'').startsWith('https://aniidex.com/images/aniimo/UI_PetHead_'))throw new Error(`non-direct AniIDEX Aniimo icon for ${p.name}: ${p.icon}`);
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
const base=name=>BASE_PALS.find(p=>p.name===name);
const cheekie=base('Cheekie'),wavwal=base('Wavwal');
if(!cheekie||cheekie.id!==1046100||!cheekie.unavailable||cheekie.abilities.Ice!==1||cheekie.abilities.Hauling!==1)throw new Error('Cheekie AniIDEX basic Homeland data drifted');
if(!wavwal||wavwal.id!==1046300||!wavwal.unavailable||wavwal.abilities.Ice!==3||wavwal.abilities.Hauling!==1)throw new Error('Wavwal AniIDEX basic Homeland data drifted');
const ember=base('Emberpup');
if(!ember||ember.abilities.Fire!==1||ember.abilities.Hauling!==1||Object.keys(ember.abilities).length!==2)throw new Error('Emberpup AniIDEX Homeland abilities drifted');
const glameep=base('Glameep');
if(!glameep||glameep.abilities.Grass!==3||glameep.abilities.Water!==3||Object.keys(glameep.abilities).length!==2)throw new Error('Glameep AniIDEX Homeland abilities drifted');
const popapus=base('Popapus');
if(!popapus||popapus.abilities.Water!==3||Object.keys(popapus.abilities).length!==1)throw new Error('Popapus AniIDEX Homeland abilities drifted');
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
if(app.includes("ANIIDEX_HEADS='https://aniidex.com/_ipx"))throw new Error('Aniimo head fallback still uses AniIDEX IPX instead of direct images');
if(!app.includes('function aniimoHex('))throw new Error('shared AniIDEX hex portrait renderer missing');
const data=fs.readFileSync(new URL('./src/data/pals.js',import.meta.url),'utf8');
if(data.includes('aniimoguide.com'))throw new Error('AniimoGuide artwork remains in pals.js');
if(data.includes('/_ipx/')&&data.includes('UI_PetHead_'))throw new Error('Aniimo heads should use direct AniIDEX image URLs, not the IPX proxy');
console.log('AniIDEX Aniimo roster OK',{base:BASE_PALS.length,forms:FORM_PALS.length,prismana:FORM_PALS.filter(p=>p.isPrismana).length,total:PALS.length});

const css=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
if(!css.includes("https://aniidex.com/images/aniimo/ui/hex-bg.webp"))throw new Error('AniIDEX hex background styling missing');

const cssPortrait=fs.readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const portraitCss=cssPortrait.slice(cssPortrait.indexOf('/* --- AniIDEX Aniimo hex portraits --- */'));
if(/aniimo\/ui\/hex-mask\.webp/.test(portraitCss))throw new Error('AniIDEX portrait CSS must not depend on a cross-origin mask image');
if(!portraitCss.includes('clip-path:polygon('))throw new Error('AniIDEX portrait local hex clipping is missing');
if(!portraitCss.includes('.aniimo-hex.active .aniimo-hex-ring'))throw new Error('AniIDEX active colored ring styling is missing');
