'use strict';
const $ = id => document.getElementById(id);
const labels = {all:'All work',build:'Needs building',qa:'Needs QA',blocked:'Blocked',review:'Needs review'};
const explanations = {all:'Recorded work and evidence from this plan. Open an entry for its full context.',build:'Explicitly recorded missing or proposed implementation. Check the latest code before starting.',qa:'Recorded testing or verification gaps. Read the source context and confirm prerequisites before testing.',blocked:'An explicit dependency or approval is recorded. The source identifies what must happen first.',review:'The source does not establish an unambiguous current work state. Reconcile the dated evidence before building or marking complete.'};
let data, selected = new URLSearchParams(location.search).get('plan'), filter = 'qa';
function element(tag, text, cls) { const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(cls) node.className = cls; return node; }
function readable(text){return text.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*`]/g,'');}
function date(value){return value ? new Date(value).toLocaleString() : 'Not recorded';}
function count(plan, status){return plan.items.filter(item=>status==='all'||item.status===status).length;}
function progress(value, label, key){
  const bar=element('progress',undefined,key);bar.max=100;bar.value=value;bar.setAttribute('aria-label',label);return bar;
}
function showPlan(id){
  selected=id;const plan=data.plans.find(p=>p.id===id);
  if(!plan)return;
  filter=['qa','build','blocked','review'].find(key=>count(plan,key))||'all';
  $('search').value='';history.replaceState(null,'','?plan='+encodeURIComponent(id));
  $('plan-details').open=true;render();$('plan-details').scrollIntoView({block:'start'});
}
let relationshipMilestone='MC-01';
function renderRelationships(){
  const table=$('relation-table');table.querySelectorAll('thead,tbody').forEach(node=>node.remove());
  const head=element('thead'),header=element('tr');header.append(element('th','Plan or review'));
  for(const milestone of data.overview.milestones){
    const th=element('th');th.scope='col';const button=element('button',String(Number(milestone.id.slice(3))));
    button.title=milestone.title;button.setAttribute('aria-label',milestone.id+': '+milestone.title);button.setAttribute('aria-pressed',String(milestone.id===relationshipMilestone));
    button.onclick=()=>{relationshipMilestone=milestone.id;renderRelationships();};th.append(button);header.append(th);
  }
  head.append(header);table.append(head);const body=element('tbody');
  for(const plan of data.plans){
    const row=element('tr',undefined,'relation-'+plan.group),label=element('th');label.scope='row';const button=element('button',plan.title+' ↗');button.onclick=()=>showPlan(plan.id);label.append(button);if(!plan.milestones.length)label.append(element('small','Not mapped','unmapped'));button.title=plan.coverageSource;row.append(label);
    for(const milestone of data.overview.milestones){
      const cell=element('td'),covered=plan.milestones.includes(milestone.id);const block=element('span',undefined,covered?'coverage-cell covered':'coverage-cell');
      block.setAttribute('role','img');block.setAttribute('aria-label',plan.title+' / '+milestone.title+': '+(covered?'Recorded connection':'No recorded connection'));block.title=milestone.title+': '+(covered?'covered':'not mapped');cell.append(block);row.append(cell);
    }
    body.append(row);
  }
  table.append(body);table.querySelector('caption').textContent=`All ${data.plans.length} plans · Same inventory as the plan list · Pale cells mean no recorded connection, not absence of work.`;
  const selected=data.overview.milestones.find(row=>row.id===relationshipMilestone);const panel=$('relationship-selection');panel.replaceChildren();
  if(selected){
    const title=element('div');title.append(element('span',selected.id+' · SELECTED MILESTONE','eyebrow'),element('h3',selected.title),element('p',data.plans.filter(plan=>plan.milestones.includes(selected.id)).length+' mapped plans reference this milestone.'));
    const evidence=element('div');evidence.append(element('span','CURRENT EVIDENCE','eyebrow'),element('p',selected.evidence));
    const remaining=element('div');remaining.append(element('span','STILL OPEN','eyebrow'),element('p',selected.remaining));panel.append(title,evidence,remaining);
  }
}
function renderOverview(){
  $('scorecards').replaceChildren();$('milestone-chart').replaceChildren();
  $('overview-error').textContent=data.overview.error||'';
  const rows=data.overview.milestones;
  if(!rows.length)return;
  const core=rows.filter(row=>row.id!=='MC-16');
  const dimensions=[['build','Built','Recorded implementation coverage.'],['qa','Local QA','Recorded local verification coverage.'],['external','External / human','Recorded external or human acceptance. Zero means none recorded, not necessarily blocked.']];
  for(const [key,title,description] of dimensions){
    const average=core.reduce((sum,row)=>sum+row[key],0)/core.length;
    const card=element('article',undefined,'scorecard');card.append(element('h3',title),element('strong',average.toFixed(1)+'%'),progress(average,title+' estimate',key),element('p',description));$('scorecards').append(card);
  }
  for(const row of rows){
    const detail=element('details',undefined,'milestone');const summary=element('summary');const name=element('div',undefined,'milestone-name');name.append(element('span',row.id+(row.id==='MC-16'?' · OPTIONAL':'') ,'milestone-code'),document.createTextNode(row.title));
    const bars=element('div');
    for(const [key,label] of [['build','Built'],['qa','QA'],['external','External']]){
      const line=element('div',undefined,'bar-line');line.append(element('span',label),progress(row[key],row.title+' '+label,key),element('span',row[key]+'%'));bars.append(line);
    }
    summary.append(name,bars);const body=element('div',undefined,'milestone-body');
    body.append(element('h3','What’s left'),element('p',row.remaining),element('h3','Next step'),element('p',row.next));
    const evidence=element('details');evidence.append(element('summary','Evidence & acceptance limits'),element('p',row.evidence));body.append(evidence);
    const related=data.plans.filter(plan=>plan.milestones.includes(row.id));
    if(related.length){body.append(element('h3','Plans that reference this milestone'));const links=element('div',undefined,'related-plans');for(const plan of related){const button=element('button',plan.title+' →');button.onclick=()=>showPlan(plan.id);links.append(button);}body.append(links);}
    else {const button=element('button','Read milestone in tracker');button.onclick=()=>openDocument('APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md');body.append(button);}
    detail.append(summary,body);$('milestone-chart').append(detail);
  }
  $('detail-count').textContent=`${data.plans.length} plans · ${data.plans.reduce((n,p)=>n+p.supportingDocuments.length,0)} supporting documents · Open the detailed view ↓`;
}
function render(){
  const query=$('search').value.toLowerCase();
  const plans=data.plans.filter(plan=>(plan.title+' '+plan.id+' '+plan.supportingDocuments.map(d=>d.title).join(' ')+' '+plan.items.map(i=>i.text).join(' ')).toLowerCase().includes(query));
  $('plan-count').textContent=`${plans.length} of ${data.plans.length} plans`;
  $('plans').replaceChildren();
  for(const plan of plans){
    const button=element('button',plan.title);button.setAttribute('aria-current',String(plan.id===selected));
    button.append(element('small',Object.keys(labels).filter(key=>key!=='all'&&count(plan,key)).map(key=>`${count(plan,key)} ${labels[key].toLowerCase()}`).join(' · ')));
    button.onclick=()=>{selected=plan.id;filter=['qa','build','blocked','review'].find(key=>count(plan,key))||'all';history.replaceState(null,'','?plan='+encodeURIComponent(selected));render();};$('plans').append(button);
  }
  const plan=data.plans.find(p=>p.id===selected);
  $('empty').hidden=!!plan;$('content').hidden=!plan;
  if(!plan){$('empty').textContent='Choose a plan to see its remaining work.';return;}
  $('title').textContent=plan.title;$('path').textContent=`Document committed ${date(plan.lastChanged)} · Latest dated section: ${plan.latestMentionedDate||'Not recorded'} · ${plan.id}`;
  $('tracker-note').hidden=!plan.trackerNotes.length;$('tracker-note-body').replaceChildren(...plan.trackerNotes.map(note=>element('p',note)));
  const support=$('supporting-documents');support.replaceChildren();
  if(plan.supportingDocuments.length){const details=element('details');details.append(element('summary',`Supporting documents (${plan.supportingDocuments.length})`));for(const doc of plan.supportingDocuments){const button=element('button',doc.title);button.onclick=()=>openDocument(doc.id);details.append(button);}support.append(details);}
  $('filters').replaceChildren();
  for(const [key,label] of Object.entries(labels)){
    const button=element('button',`${label} (${count(plan,key)})`);button.setAttribute('aria-pressed',String(filter===key));button.onclick=()=>{filter=key;render();};$('filters').append(button);
  }
  $('explanation').textContent=explanations[filter];$('items').replaceChildren();
  const items=plan.items.filter(item=>filter==='all'||item.status===filter);
  if(!items.length)$('items').append(element('p','No entries explicitly recorded in this category. This does not establish completion.'));
  for(const item of items){
    const card=element('article',undefined,'work '+item.status);card.append(element('span',labels[item.status],'badge'),element('h3',item.title||item.section));
    const brief=item.text.length>360?item.text.slice(0,360)+'…':item.text;card.append(element('p',brief));if(item.source!==plan.id)card.append(element('small','From: '+item.sourceTitle));
    if(item.text.length>360){const details=element('details');details.append(element('summary','Read full evidence and next steps'),element('p',item.text));card.append(details);}
    const button=element('button',item.status==='qa'?'View QA context':item.status==='blocked'?'View blocker context':'View in plan');button.onclick=()=>openDocument(item.source,item.section);card.append(button);$('items').append(card);
  }
  $('document').onclick=()=>openDocument(plan.id);
}
async function openDocument(path, section){
  $('reader-title').textContent=section||'Plan source';$('reader-content').textContent='Reading plan…';if(!$('reader').open)$('reader').showModal();
  try{
    const response=await fetch('/api/document?path='+encodeURIComponent(path));if(!response.ok)throw Error();
    const text=await response.text();$('reader-content').replaceChildren();let target;
    let headers=[];
    for(const line of text.split('\n')){
      if(/^\|[\s:|\-]+\|\s*$/.test(line))continue;
      if(/^\|/.test(line)){
        const cells=line.replace(/^\||\|\s*$/g,'').split('|').map(s=>s.trim());
        if(!headers.length){headers=cells;continue;}
        const row=element('div',undefined,'table-row');cells.forEach((cell,i)=>{const p=element('p');p.append(element('strong',(headers[i]||'Detail')+': '),document.createTextNode(readable(cell)));row.append(p);});$('reader-content').append(row);continue;
      }
      headers=[];
      const heading=/^#{1,6}\s+(.+)/.exec(line);const node=element(heading?'h3':'p',readable(heading?heading[1]:line));
      if(section&&heading&&heading[1].includes(section))target=node;$('reader-content').append(node);
    }
    if(target)target.scrollIntoView({block:'start'});else $('reader').scrollTop=0;
  }catch{$('reader-content').textContent='Unable to load this plan. Close and try again.';}
}
async function refresh(){
  $('refresh').disabled=true;$('connection').textContent='Reading repository records…';
  try{
    const response=await fetch('/api/tracker');if(!response.ok)throw Error();data=await response.json();
    const owner=data.plans.find(p=>p.supportingDocuments.some(doc=>doc.id===selected));if(owner){selected=owner.id;history.replaceState(null,'','?plan='+encodeURIComponent(selected));}
    const shared=$('shared-documents');shared.replaceChildren();for(const doc of data.sharedDocuments){const button=element('button',doc.title);button.onclick=()=>openDocument(doc.id);shared.append(button);}
    if(!data.plans.some(p=>p.id===selected)){selected=data.plans[0]?.id;const first=data.plans[0];filter=first?(['qa','build','blocked','review'].find(key=>count(first,key))||'all'):'all';}
    $('connection').textContent=`Records read ${date(data.readAt)} · Latest tracked document commit ${date(data.recordChangedAt)} · This is not live work status.`;
    $('source').textContent=`Repository branch: ${data.branch} · Commit: ${data.commit}. Status categories are conservative text extraction from source records; they are not new acceptance results.`;
    $('missing').textContent=data.missing.length?`${data.missing.length} missing source links: ${data.missing.join(', ')}`:'All discovered local Markdown links resolve.';
    $('history').replaceChildren(...data.history.map(item=>element('li',`${date(item.date)} · ${item.title} · ${item.commit}`)));
    renderOverview();renderRelationships();render();
  }catch{
    data=null;$('shared-documents').replaceChildren();$('detail-count').textContent='Plans unavailable';$('relationship-selection').replaceChildren();$('relation-table').querySelectorAll('thead,tbody').forEach(node=>node.remove());$('scorecards').replaceChildren();$('milestone-chart').replaceChildren();$('overview-error').textContent='Progress unavailable. Refresh when the repository connection is restored.';$('plans').replaceChildren();$('plan-count').textContent='';$('history').replaceChildren();$('source').textContent='Source records unavailable.';$('missing').textContent='';$('content').hidden=true;$('empty').hidden=false;$('empty').textContent='Records unavailable. Start the tracker server and click Refresh records.';$('connection').textContent='Connection failed — no cached progress is being shown.';
  }finally{$('refresh').disabled=false;}
}
$('browse-plans').onclick=()=>{$('plan-details').open=true;};
$('refresh').onclick=refresh;$('search').oninput=()=>{if(data)render();};$('close').onclick=()=>$('reader').close();$('register').onclick=()=>openDocument('APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md');refresh();
