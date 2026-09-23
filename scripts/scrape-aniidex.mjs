import {BASE_PALS} from '../src/data/pals.js';

const ORIGIN='https://aniidex.com';
const extraNames=['Cheekie','Wavwal'];
const names=[...new Set([...BASE_PALS.map(p=>p.name),...extraNames])].sort((a,b)=>a.localeCompare(b));
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').trim();
const strip=s=>decode(String(s||'').replace(/<!--[^]*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' '));
const canonicalAbility=n=>({'carry':'Hauling','transport':'Hauling'}[String(n).trim().toLowerCase()]||String(n).trim());

async function fetchText(url){
  const res=await fetch(url,{headers:{'user-agent':'aniimo-homeland-optimizer/aniidex-audit','accept':'text/html'}});
  if(!res.ok)throw new Error(`${res.status} ${url}`);
  return res.text();
}
function parseHeadTiles(html,name){
  const out=[],seen=new Set(),prefix=`Aniimo ${name}`;
  for(const m of html.matchAll(/<img\b[^>]*>/gi)){
    const tag=m[0],hm=tag.match(/UI_PetHead_(\d+)\.webp/i),am=tag.match(/\balt=(?:"([^"]*)"|'([^']*)')/i);
    if(!hm||!am)continue;
    const alt=decode(am[1]??am[2]??'');if(!alt.startsWith(prefix))continue;
    const id=hm[1],tail=alt.slice(prefix.length).trim().replace(/\s+Form$/i,'').trim(),form=tail||'Basic',key=`${form}|${id}`;
    if(seen.has(key))continue;seen.add(key);out.push({form,headId:id});
  }
  // Prefer thumbnail/form-tile order. Duplicated large hero images collapse by form.
  const byForm=new Map();for(const x of out)if(!byForm.has(x.form))byForm.set(x.form,x.headId);
  return [...byForm].map(([form,headId])=>({form,headId}));
}
function parseAbilities(html){
  const marker=html.search(/Homeland Abilities/i);if(marker<0)return[];
  const tail=html.slice(marker),stop=tail.search(/(?:<h2[^>]*>|<h3[^>]*>)[^<]*(?:Evolution|Location|Drops|Recommended)/i),section=stop>0?tail.slice(0,stop):tail.slice(0,40000);
  const out=[],seen=new Set();
  // Current AniIDEX component form.
  for(const m of section.matchAll(/<article[^>]*class=(?:"[^"]*\bab-card\b[^"]*"|'[^']*\bab-card\b[^']*')[^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?(?:ab-pill--level[^>]*>|>\s*)\s*Lv\s*\.?\s*(\d+)/gi)){
    const name=canonicalAbility(strip(m[1])),level=Number(m[2]);if(name&&level&&!seen.has(name)){seen.add(name);out.push([name,level]);}
  }
  // Older SSR markup: heading + later Lv line.
  if(!out.length)for(const m of section.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]{0,1400}?\bLv\s*\.?\s*(\d+)/gi)){
    const name=canonicalAbility(strip(m[1])),level=Number(m[2]);if(name&&level&&!seen.has(name)&&!/^(stats?|details?|basic|skill|atk)/i.test(name)){seen.add(name);out.push([name,level]);}
  }
  return out;
}
async function one(name){
  const url=`${ORIGIN}/aniimo/${slug(name)}/`,html=await fetchText(url);
  return{name,url,tiles:parseHeadTiles(html,name),abilities:Object.fromEntries(parseAbilities(html))};
}
const results=[],errors=[];
let index=0;
async function worker(){
  while(index<names.length){
    const i=index++,name=names[i];
    try{results[i]=await one(name);process.stderr.write(`aniidex ${i+1}/${names.length} ${name}\n`);}
    catch(error){errors.push({name,message:String(error?.message||error)});}
  }
}
await Promise.all(Array.from({length:8},worker));
const good=results.filter(Boolean);
const current=new Map(BASE_PALS.map(p=>[p.name,p]));
const mismatches=[];
for(const row of good){
  const p=current.get(row.name);if(!p)continue;
  const a=JSON.stringify(Object.fromEntries(Object.entries(p.abilities||{}).sort())),b=JSON.stringify(Object.fromEntries(Object.entries(row.abilities||{}).sort()));
  if(a!==b)mismatches.push({name:row.name,current:p.abilities,aniidex:row.abilities});
}
const payload={source:'https://aniidex.com/aniimo/',scrapedAt:new Date().toISOString(),count:good.length,errors,mismatches,aniimo:good};
console.log('ANIIDEX_SYNC_JSON='+JSON.stringify(payload));
if(errors.length)process.exitCode=2;
