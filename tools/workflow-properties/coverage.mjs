import {readFile,writeFile} from 'node:fs/promises';

const folder=new URL('./',import.meta.url);
let workflows;
try {workflows=JSON.parse(await readFile(new URL('workflows.json',folder),'utf8'));}
catch {
  const raw=await readFile(new URL('../../../APPly Workflow Guide/workflows.txt',folder),'utf8');
  workflows=raw.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map((line,index)=>({id:index+1,name:line.split('|')[0]}));
  await writeFile(new URL('workflows.json',folder),JSON.stringify(workflows,null,2)+'\n');
}
if(workflows.length!==100)throw new Error('Expected the documented 100-workflow inventory');
const results=[];
const preciseLinks=JSON.parse(await readFile(new URL('workflow-links.json',folder),'utf8'));
for(const file of ['results-frontend.json','results-api.json']){
  try {
    const rows=JSON.parse(await readFile(new URL(file,folder),'utf8'));
    for(const row of rows){
      row.workflows=preciseLinks[row.name]||row.workflows;
      if(row.name.startsWith('membership publication'))row.workflows=[11];
      if(row.name.startsWith('posted invoice rejects'))row.workflows=[49];
      if(/^(inactive|revoked|expired) staff access/.test(row.name))row.workflows=[7];
      if(row.name==='inventory location deletion preserves custody history')row.name='inventory location hard deletion is rejected';
    }
    await writeFile(new URL(file,folder),JSON.stringify(rows,null,2)+'\n');
    results.push(...rows);
  }
  catch(error){if(error.code!=='ENOENT')throw error;}
}
const external=new Set([1,10,19,20,85,86,87,88]);
const lines=['# 100-workflow property coverage','',
  'Generated from actual result files. Partial means only the named invariant was exercised; no row represents a complete browser workflow. Cross-cutting shared required-label checks do not count as direct workflow coverage. Unlisted create/edit/delete branches remain untested. External/admin labels describe this local suite, not absence of the feature.','',
  '| ID | Workflow | Coverage | Creation / edit / delete limits | Executed properties |','|---|---|---|---|---|'];
for(const workflow of workflows){
 const confirmedCrash=r=>/exception review/.test(r.name)&&/normalized_attributes/.test(r.error||'');
 const found=results.filter(r=>r.workflows.includes(workflow.id)&&!r.name.startsWith('required creation fields')&&(confirmedCrash(r)||!/Bridge|Harness|Invalid baseline|Test login|React is not defined/.test(r.error||'')));
 const status=found.length?'Partial':external.has(workflow.id)?'External/admin/provider gap':'Uncovered';
 const create=found.some(r=>/creat|missing|package conversion/.test(r.name));
 const edit=found.some(r=>/edit/.test(r.name));
 const del=found.some(r=>/delet/.test(r.name));
 const limits=`Create: ${create?'partial':'not exercised'}; edit: ${edit?'partial':'not exercised'}; delete/retire: ${del?'partial':'not exercised'}`;
 const evidence=found.map(r=>`${confirmedCrash(r)?'APPLICATION CRASH — invariant not reached':r.failed?'FAIL':'PASS'}: ${r.name} (${r.layer||'see README'})`).join('<br>')||'No executed fast-check property';
 lines.push(`| ${workflow.id} | ${workflow.name} | ${status} | ${limits} | ${evidence} |`);
}
await writeFile(new URL('coverage.md',folder),lines.join('\n')+'\n');
console.log(`${results.length} property results mapped to 100 workflows. Consult rows for partial coverage and gaps; harness failures excluded.`);
