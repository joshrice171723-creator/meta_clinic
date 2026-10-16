'use strict';
const $ = id => document.getElementById(id);
const labels = {all:'All work',build:'Needs building',qa:'Needs QA',blocked:'Blocked',review:'Needs review'};
const explanations = {all:'Recorded work and evidence from this plan. Open an entry for its full context.',build:'Explicitly recorded missing or proposed implementation. Check the latest code before starting.',qa:'Recorded testing or verification gaps. Read the source context and confirm prerequisites before testing.',blocked:'An explicit dependency or approval is recorded. The source identifies what must happen first.',review:'The source does not establish an unambiguous current work state. Reconcile the dated evidence before building or marking complete.'};
let data, selected = new URLSearchParams(location.search).get('plan'), filter = 'qa';
function element(tag, text, cls) { const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(cls) node.className = cls; return node; }
function readable(text){return text.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*`]/g,'');}
function date(value){return value ? new Date(value).toLocaleString() : 'Not recorded';}
function count(plan, status){return plan.items.filter(item=>status==='all'||item.status===status).length;}
function render(){
  const query=$('search').value.toLowerCase();
  const plans=data.plans.filter(plan=>(plan.title+' '+plan.id+' '+plan.items.map(i=>i.text).join(' ')).toLowerCase().includes(query));
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
  $('filters').replaceChildren();
  for(const [key,label] of Object.entries(labels)){
    const button=element('button',`${label} (${count(plan,key)})`);button.setAttribute('aria-pressed',String(filter===key));button.onclick=()=>{filter=key;render();};$('filters').append(button);
  }
  $('explanation').textContent=explanations[filter];$('items').replaceChildren();
  const items=plan.items.filter(item=>filter==='all'||item.status===filter);
  if(!items.length)$('items').append(element('p','No entries explicitly recorded in this category. This does not establish completion.'));
  for(const item of items){
    const card=element('article',undefined,'work '+item.status);card.append(element('span',labels[item.status],'badge'),element('h3',item.title||item.section));
    const brief=item.text.length>360?item.text.slice(0,360)+'…':item.text;card.append(element('p',brief));
    if(item.text.length>360){const details=element('details');details.append(element('summary','Read full evidence and next steps'),element('p',item.text));card.append(details);}
    const button=element('button',item.status==='qa'?'View QA context':item.status==='blocked'?'View blocker context':'View in plan');button.onclick=()=>openDocument(plan.id,item.section);card.append(button);$('items').append(card);
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
    if(!data.plans.some(p=>p.id===selected)){selected=data.plans[0]?.id;const first=data.plans[0];filter=first?(['qa','build','blocked','review'].find(key=>count(first,key))||'all'):'all';}
    $('connection').textContent=`Records read ${date(data.readAt)} · Latest tracked document commit ${date(data.recordChangedAt)} · This is not live work status.`;
    $('source').textContent=`Repository branch: ${data.branch} · Commit: ${data.commit}. Status categories are conservative text extraction from source records; they are not new acceptance results.`;
    $('missing').textContent=data.missing.length?`${data.missing.length} missing source links: ${data.missing.join(', ')}`:'All discovered local Markdown links resolve.';
    $('history').replaceChildren(...data.history.map(item=>element('li',`${date(item.date)} · ${item.title} · ${item.commit}`)));
    render();
  }catch{
    data=null;$('plans').replaceChildren();$('plan-count').textContent='';$('history').replaceChildren();$('source').textContent='Source records unavailable.';$('missing').textContent='';$('content').hidden=true;$('empty').hidden=false;$('empty').textContent='Records unavailable. Start the tracker server and click Refresh records.';$('connection').textContent='Connection failed — no cached progress is being shown.';
  }finally{$('refresh').disabled=false;}
}
$('refresh').onclick=refresh;$('search').oninput=()=>{if(data)render();};$('close').onclick=()=>$('reader').close();$('register').onclick=()=>openDocument('APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md');refresh();
