import fc from 'fast-check';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import React from '../../apps/web/node_modules/react/index.js';
import { renderToStaticMarkup } from '../../apps/web/node_modules/react-dom/server.node.js';
import { Field } from '../../apps/web/src/shared/ui.tsx';
import { appointmentActions, buildAppointmentQueuePath } from '../../apps/web/src/features/clinic/frontDeskModel.ts';
import { invoiceLineIsValid } from '../../apps/web/src/features/clinic/InvoiceLineEditor.tsx';
import { decimalSubtract, decimalMultiply, decimalCeilDivide, decimalCompare } from '../../apps/web/src/features/inventory/inventoryContracts.ts';
import { resolveSubscriptionActionAttempt, subscriptionActionFailure, subscriptionActionResponse } from '../../apps/web/src/features/clinic/subscriptions/SubscriptionBilling.tsx';
// Imported app TSX is compiled with its own project configuration by tsx.
globalThis.React = React;

const cents = n => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
const amount = fc.integer({ min: 1, max: 100000 });
const blank = fc.constantFrom('', ' ', '\t', '\n', '  \t  ');
const properties = [];
const preciseLinks=JSON.parse(await readFile(new URL('workflow-links.json',import.meta.url),'utf8'));
const workflowCorrections = {
  'arrival never starts a second encounter':[28],
  'cancelled and no-show appointments require replacement':[26,27],
  'patient search text cannot alter queue parameters':[21,25],
  'inventory deduction retains exact hundredths':[37,38,40],
  'failed patient edit does not partially rename the patient':[18],
  'partial patient edit preserves omitted demographics':[18],
  'patient hard delete is unavailable through the clinic API':[18],
  'administration and exact retry deduct stock exactly once':[37,38,39],
  'insufficient stock rejects administration without partial deductions':[37,38],
  'payment replay creates only one allocation':[50,51,53],
  'overpayment cannot leave a payment event or allocation':[50,51,53],
  'required creation fields visibly distinguish required from optional':[3,4,5,9,13,14,15,16,17,21,31,45,49,56,65,73],
};
const add = (name, workflows, arbitrary, predicate, options={}) => properties.push({name, workflows:preciseLinks[name]||workflowCorrections[name]||workflows, arbitrary, predicate,...options});
const apiMode = process.argv.includes('--api');
let bridge;
let pending;
let ready;
let bridgeStopped = false;
let bridgeFailure;
function stopBridge() {
  if(!bridge||bridgeStopped)return;
  bridgeStopped = true;
  if(process.platform==='win32')spawn('taskkill',['/PID',String(bridge.pid),'/T','/F'],{stdio:'ignore'});
  else bridge.kill();
}

async function startBridge() {
  const command = JSON.parse(process.env.WORKFLOW_BRIDGE_COMMAND || 'null');
  assert.ok(Array.isArray(command), 'Use npm run test:api for an isolated database');
  bridge = spawn(command[0], command.slice(1), {cwd: process.env.WORKFLOW_BRIDGE_CWD, stdio: ['pipe','pipe','inherit']});
  const startup = new Promise((resolve, reject) => { ready = {resolve,reject}; });
  const startupTimeout=setTimeout(()=>{ready.reject(new Error('Harness startup timed out before ready'));stopBridge();},Number(process.env.FC_STARTUP_TIMEOUT_MS||180000));
  createInterface({input:bridge.stdout}).on('line', line => {
    if (!line.startsWith('{')) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.ready) { clearTimeout(startupTimeout);console.log('Isolated Rails bridge ready');ready.resolve(); return; }
    if (pending) {
      const next = pending; pending = null;
      message.error ? next.reject(new Error(`Bridge ${message.error}: ${message.message}\n${(message.backtrace||[]).join('\n')}`)) : next.resolve(message.result);
    }
  });
  bridge.on('error', error => { clearTimeout(startupTimeout);ready.reject(error); pending?.reject(error); });
  bridge.on('exit', (code,signal) => { clearTimeout(startupTimeout);bridgeStopped = true; const error = new Error(`Bridge exited ${code}; signal ${signal}`); ready.reject(error); pending?.reject(error); });
  await startup;
}

async function request(kind,input) {
  if(bridgeStopped)throw bridgeFailure||new Error('Bridge stopped; remaining API cases cannot execute');
  assert.equal(pending, undefined);
  return new Promise((resolve,reject) => {
    const timeout = setTimeout(() => { pending = undefined; bridgeFailure = new Error('Harness bridge case timed out after 120000ms'); stopBridge(); reject(bridgeFailure); }, 120000);
    pending = {resolve: value => { clearTimeout(timeout); pending = undefined; resolve(value); }, reject: error => {clearTimeout(timeout); pending = undefined; reject(error);}};
    bridge.stdin.write(JSON.stringify({kind,input})+'\n');
  });
}

if (!apiMode) {
  add('required creation fields visibly distinguish required from optional', [3,4,17,21,27,41,49,61,65,73], fc.constantFrom('Name','Clinic reference','Location','Service description'), label => {
    const html=renderToStaticMarkup(React.createElement(Field,{name:'property',label,required:true}));
    const visible=html.match(/<label[^>]*>(.*?)<\/label>/)?.[1] || '';
    assert.match(visible,/required|\*/i,'Native required exists, but the visible field label does not mark it required');
  });
  add('arrival never starts a second encounter', [25,26,27], fc.record({status:fc.constantFrom('scheduled','confirmed','cancelled','no_show'),encounter_id:amount}), input => {
    const actions=appointmentActions({...input,updated_at:'2026-09-08T12:00:00Z'});
    assert.equal(actions.canStartVisit,false); assert.equal(actions.canReschedule,false); assert.equal(actions.canCancel,false);
  });
  add('cancelled and no-show appointments require replacement', [25,26], fc.constantFrom('cancelled','no_show'), status => {
    const actions=appointmentActions({status,encounter_id:null});
    assert.equal(actions.canStartVisit,false); assert.equal(actions.canScheduleReplacement,true);
  });
  add('patient search text cannot alter queue parameters', [21,25], fc.string({maxLength:150}), query => {
    const url=new URL(buildAppointmentQueuePath({date:'2026-09-08',siteId:'4',query,page:1}), 'http://localhost');
    assert.equal(url.searchParams.get('site_id'),'4'); assert.equal(url.searchParams.get('date'),'2026-09-08');
    assert.equal(url.searchParams.get('q'),query.trim() || null);
  });
  add('invoice creation rejects a blank service description', [49], blank, description_snapshot => {
    assert.equal(invoiceLineIsValid({kind:'custom',quantity:'1',unit_amount:'1.00',description_snapshot}),false);
  });
  add('invoice creation rejects zero and negative quantities', [49], fc.integer({min:-100000,max:0}), quantity => {
    assert.equal(invoiceLineIsValid({kind:'custom',quantity:String(quantity),unit_amount:'1.00',description_snapshot:'Visit'}),false);
  });
  add('invoice catalog references must be positive', [49], fc.integer({min:-1000,max:0}), id => {
    assert.equal(invoiceLineIsValid({kind:'catalog',billing_service_id:id,service_lock_version:0,quantity:'1'}),false);
  });
  add('recorded invoice line references must be positive', [49,53], fc.integer({min:-1000,max:0}), id => {
    assert.equal(invoiceLineIsValid({kind:'recorded',invoice_line_id:id,quantity:'1',unit_amount:'1',currency:'USD',description_snapshot:'Visit'}),false);
  });
  add('inventory deduction retains exact hundredths', [38,39,40], fc.tuple(amount,amount), ([a,b]) => {
    const high=Math.max(a,b),low=Math.min(a,b);
    assert.equal(decimalCompare(decimalSubtract(cents(high),cents(low)),cents(high-low)),0);
  });
  add('purchase package rounding never underorders', [61,62], fc.tuple(amount,amount), ([need,pack]) => {
    const count=BigInt(decimalCeilDivide(cents(need),cents(pack)));
    assert.ok(count*BigInt(pack)>=BigInt(need)); assert.ok((count-1n)*BigInt(pack)<BigInt(need));
  });
  add('purchase cost is exact for generated unit quantities', [61,62], fc.tuple(amount,fc.integer({min:1,max:1000})), ([price,quantity]) => {
    assert.equal(decimalCompare(decimalMultiply(cents(price),String(quantity)),cents(price*quantity)),0);
  });
  add('membership retry keeps the original action and request key', [57,58,59,60], fc.tuple(amount,fc.uuid(),fc.boolean(),fc.boolean()), ([id,key,approved,changed]) => {
    const first=resolveSubscriptionActionAttempt(null,id,'review',{approved},key);
    const failure=subscriptionActionFailure(first,new TypeError('Synthetic interrupted response'));
    const retry=resolveSubscriptionActionAttempt(failure.pendingAttempt,id,'review',{approved:changed},'replacement');
    assert.equal(retry,first); assert.equal(retry.body.request_key,key); assert.equal(retry.body.approved,approved);
  });
  add('membership unresolved action cannot move to another patient membership', [57,58,59,60], amount, id => {
    const first=resolveSubscriptionActionAttempt(null,id,'cancel',{},'original');
    assert.equal(resolveSubscriptionActionAttempt(first,id+1,'cancel',{},'other'),null);
    assert.throws(()=>subscriptionActionResponse({id:id+1,state:'active'},id));
  });
} else {
  await startBridge();
  for(const [model,fields,workflows] of [
    ['visit_type',['code'],[4]], ['supplier',['name'],[15]],
    ['location',['name'],[13]], ['product',['name','sku','stock_unit'],[14]],
    ['appointment',['starts_at','ends_at','status'],[21]],
    ['encounter',['started_at','status'],[28]],
    ['lab_report',['source_name'],[45]],
    ['observation',['code','observed_at','unit_code','numeric_value'],[31]],
    ['staff',['display_name','job_title'],[5,97]],
    ['employment',['effective_from'],[5,97]],
    ['drawer',['opening_float'],[56]],
    ['billing_service',['name','unit_amount','currency'],[9]],
    ['membership_package',['name'],[11]],
    ['office_item',['name','sku'],[16]],
    ['purchase_order',['number','destination','reason'],[63]],
    ['schedule',['week_start_on','timezone'],[81]],
    ['care_need',['description','effective_from','recorded_at'],[30]],
  ]) {
    for(const field of fields) add(`${model} model rejects missing ${field}`,workflows,fc.constantFrom(null,''),async value=>{
      const result=await request('model',{model,attributes:{[field]:value}}); assert.equal(result.valid,false); assert.ok(result.errors.includes(field));
    });
  }
  add('Scribe processing requires accepted unwithdrawn consent and an undeleted session', [41,42,43,44],fc.record({consent:fc.constantFrom('not_recorded','accepted','declined','withdrawn'),deleted:fc.boolean(),withdrawn:fc.boolean()}),async input=>{
    const result=await request('scribe',input);assert.equal(result.allowed,input.consent==='accepted'&&!input.deleted&&!input.withdrawn);
  });
  add('inventory location hard deletion is rejected', [13],amount,async suffix=>{
    const result=await request('location_delete',{suffix});assert.equal(result.destroyed,false);assert.equal(result.remaining,true);
  });
  add('product model rejects zero and negative package conversion', [13,14,61], fc.integer({min:-1000,max:0}), async package_size=>{
    const result=await request('model',{model:'product',attributes:{package_size}});assert.equal(result.valid,false);assert.ok(result.errors.includes('package_size'));
  });
  add('facility creation rejects missing identity or shipping address atomically', [3],fc.tuple(fc.constantFrom('code','name','address_line1','city','state','postal_code'),blank),async([field,value])=>{
    const result=await request('facility',{create:{[field]:value}});assert.ok(result.status>=400&&result.status<500,`HTTP ${result.status}`);assert.equal(result.created,0);
  });
  add('failed facility hours edit preserves facility name', [3],fc.integer({min:7,max:999}),async day_of_week=>{
    const result=await request('facility',{edit:{name:'Changed clinic',operating_hours:[{day_of_week,closed:true}]}});assert.equal(result.status,201);assert.ok(result.edit_status>=400&&result.edit_status<500);assert.equal(result.name,'Property clinic');
  });
  add('patient creation requires an explicit sex response', [17], fc.constantFrom(null,'','not_recorded'), async sex => {
    const result=await request('patient',{create:{sex}});
    assert.ok(result.status>=400 && result.status<500,`accepted unanswered sex with HTTP ${result.status}`); assert.equal(result.created,0);
  });
  add('patient creation rejects missing identity fields atomically', [17], fc.tuple(fc.constantFrom('display_name','reference'),blank), async ([field,value]) => {
    const result=await request('patient',{create:{[field]:value}}); assert.ok(result.status>=400 && result.status<500); assert.equal(result.created,0);
  });
  add('patient creation rejects an invalid sex enumeration atomically', [17], fc.string({minLength:1,maxLength:20}).map(s=>'invalid-'+s), async sex => {
    const result=await request('patient',{create:{sex}}); assert.ok(result.status>=400 && result.status<500); assert.equal(result.created,0);
  });
  add('patient creation rejects an explicitly provided impossible email', [17], fc.stringMatching(/^[a-z]{1,20}$/), async contact_value=>{
    const result=await request('patient',{create:{contact_type:'email',contact_value}});assert.ok(result.status>=400&&result.status<500,`invalid email accepted HTTP ${result.status}`);assert.equal(result.created,0);
  });
  add('patient creation rejects an explicitly provided phone with no digits', [17], fc.stringMatching(/^[a-z]{1,20}$/), async contact_value=>{
    const result=await request('patient',{create:{contact_type:'phone',contact_value}});assert.ok(result.status>=400&&result.status<500,`invalid phone accepted HTTP ${result.status}`);assert.equal(result.created,0);
  });
  add('failed patient edit does not partially rename the patient', [18,89], fc.integer({min:1,max:99999}), async suffix => {
    const result=await request('patient',{edit:{display_name:`Renamed ${suffix}`,reference:'PROPERTY-001',sex:'invalid'}});
    assert.ok(result.edit_status>=400 && result.edit_status<500); assert.equal(result.name,'Property Patient');
  });
  add('partial patient edit preserves omitted demographics', [18,89], fc.integer({min:1,max:99999}), async suffix => {
    const result=await request('patient',{edit:{display_name:`Renamed ${suffix}`,reference:'PROPERTY-001'}});
    assert.equal(result.edit_status,200); assert.equal(result.sex,'female'); assert.equal(result.dob,'1990-01-02');
  });
  add('patient hard delete is unavailable through the clinic API', [18,89], fc.constantFrom('female','male','intersex','unknown'), async sex => {
    const result=await request('patient',{create:{sex},delete:true}); assert.ok([404,405].includes(result.delete_status)); assert.equal(result.remaining,true);
  });
  const stock=fc.tuple(fc.integer({min:1,max:5000}),fc.integer({min:1,max:5000}));
  add('administration and exact retry deduct stock exactly once', [37,38,39,40], stock, async ([a,b]) => {
    const received=a+b,used=a;
    const result=await request('stock',{received:cents(received),used:cents(used),retry:true,changed:true});
    assert.equal(result.status,201); assert.equal(result.retry_status,201); assert.equal(result.replayed,true); assert.equal(result.changed_status,409);
    assert.equal(decimalCompare(result.quantity,cents(b)),0); assert.equal(result.movements,1); assert.equal(result.administrations,1);
  });
  add('insufficient stock rejects administration without partial deductions', [37,38,40], stock, async ([a,b]) => {
    const result=await request('stock',{received:cents(a),used:cents(a+b)});
    assert.equal(result.status,422); assert.equal(decimalCompare(result.quantity,cents(a)),0); assert.equal(result.movements,0); assert.equal(result.administrations,0);
  });
  add('payment replay creates only one allocation', [49,50,51,52], fc.tuple(amount,amount), async ([a,b]) => {
    const result=await request('payment',{charge:cents(a+b),paid:cents(a),retry:true});
    assert.equal(result.error,null); assert.equal(result.allocations,1); assert.equal(result.payments,1); assert.equal(decimalCompare(result.allocated,cents(a)),0);
  });
  add('overpayment cannot leave a payment event or allocation', [51,52,53], fc.tuple(amount,amount), async ([a,b]) => {
    const result=await request('payment',{charge:cents(a),paid:cents(a+b)});
    assert.ok(result.error); assert.equal(result.allocations,0); assert.equal(result.payments,0);
  });
}

for(const name of (await readdir(new URL('extensions/',import.meta.url))).filter(name=>name.endsWith('.mjs')).sort()){
  const extension=await import(new URL('extensions/'+name,import.meta.url));
  const register=apiMode?extension.register:extension.registerFrontend;
  if(register)register({add,fc,request,assert,amount,blank,cents});
}
const resultUrl=new URL(apiMode?'results-api.json':'results-frontend.json',import.meta.url);
const results=(process.env.FC_MATCH||process.env.FC_ONLY_NEW)?JSON.parse(await readFile(resultUrl,'utf8').catch(()=>'[]')):[];
const existingNames=new Set(results.map(row=>row.name));
try {
  for(const item of properties) {
    if (bridgeStopped) break;
    if(process.env.FC_STOP_FILE && await readFile(process.env.FC_STOP_FILE,'utf8').then(()=>true,()=>false)) {console.log('Checkpoint stop requested; completed results retained');break;}
    if(process.env.FC_FILTER && !item.name.includes(process.env.FC_FILTER)) continue;
    if(process.env.FC_MATCH && !new RegExp(process.env.FC_MATCH).test(item.name)) continue;
    if(process.env.FC_ONLY_NEW && existingNames.has(item.name) && !(process.env.FC_RERUN_MATCH && new RegExp(process.env.FC_RERUN_MATCH).test(item.name))) continue;
    const config={numRuns:Number(process.env.FC_RUNS || (apiMode?20:200)),seed:Number(process.env.FC_SEED || 20260908)};
    if(process.env.FC_PATH) {assert.ok(process.env.FC_FILTER,'FC_PATH requires FC_FILTER'); config.path=process.env.FC_PATH;}
    const result=await fc.check(fc.asyncProperty(item.arbitrary,item.predicate),config);
    const row={name:item.name,workflows:item.workflows,layer:item.layer||(!apiMode?'frontend helper / SSR':item.name.includes(' model ')?'ActiveRecord validation':item.name.startsWith('Scribe')?'model policy':item.name.includes('payment')?'application service':'Rails integration / persistence'),failed:result.failed,runs:result.numRuns,shrinks:result.numShrinks,seed:result.seed,path:result.counterexamplePath,counterexample:result.counterexample,error:result.errorInstance?.message};
    const previous=results.findIndex(r=>r.name===row.name);if(previous>=0)results.splice(previous,1);
    results.push(row); console.log(`${row.failed?'FAIL':'PASS'} ${row.name} (${row.runs} runs${row.failed?`, seed ${row.seed}, path ${row.path}: ${row.error}`:''})`);
    await writeFile(new URL(apiMode?'results-api.json':'results-frontend.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
  }
} finally {
  if(bridge && !bridgeStopped) { bridge.stdin.end(); await new Promise(resolve=>bridge.once('exit',resolve)); }
}
await writeFile(new URL(apiMode?'results-api.json':'results-frontend.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(`${results.filter(r=>!r.failed).length}/${results.length} properties passed`);
process.exitCode=results.some(r=>r.failed)?1:0;
