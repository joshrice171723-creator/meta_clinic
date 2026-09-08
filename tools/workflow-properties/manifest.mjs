import fc from 'fast-check';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
const base=new URL('./',import.meta.url);
const rows=[];
for(const file of ['results-api.json','results-frontend.json'])rows.push(...JSON.parse(await readFile(new URL(file,base),'utf8')));
const add=(name,workflows,_arbitrary,_predicate,options={})=>{if(!rows.some(r=>r.name===name))rows.push({name,workflows,layer:options.layer,executed:false});};
const amount=fc.integer({min:1,max:100000}),blank=fc.constantFrom('',' ','\t','\n');
for(const file of (await readdir(new URL('extensions/',base))).filter(f=>f.endsWith('.mjs')).sort()){
  const module=await import(new URL('extensions/'+file,base));
  const context={add,fc,assert,request:()=>{throw new Error('Manifest must not execute properties');},amount,blank,cents:n=>(n/100).toFixed(2)};
  if(module.register)module.register(context);
  if(module.registerFrontend)module.registerFrontend(context);
}
await writeFile(new URL('manifest.json',base),JSON.stringify(rows.map(({name,workflows,layer,executed})=>({name,workflows,layer,executed:executed!==false})),null,2)+'\n');
const workflows=JSON.parse(await readFile(new URL('workflows.json',base),'utf8'));
console.log('Declared coverage only, NOT execution: '+rows.length+' properties');
console.log(workflows.filter(w=>!rows.some(r=>r.workflows.includes(w.id)&&!r.name.startsWith('required creation fields'))).map(w=>w.id+' '+w.name).join('\n'));
