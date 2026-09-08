import {appendPrevisitNote,previsitNoteBlock} from '../../../apps/web/src/features/clinic/PrevisitNoteImport.tsx';
import {filterVisits,waitingMinutes} from '../../../apps/web/src/features/clinic/trackingBoardData.ts';
export function registerFrontend({add,fc,assert,blank}) {
  const helper={layer:'frontend helper'};
  const note=fc.record({id:fc.integer({min:1,max:100000}),version_number:fc.integer({min:1,max:1000}),text:fc.stringMatching(/^[A-Za-z]{1,60}$/),submitted_at:fc.constant('2026-09-08T10:00:00Z')});
  add('previsit import preserves original subjective text and source attribution',[90],fc.tuple(fc.string({maxLength:80}),note),([subjective,n])=>{
    const result=appendPrevisitNote(subjective,n);assert.ok(result.startsWith(subjective));assert.ok(result.includes(previsitNoteBlock(n)));assert.ok(result.includes('Patient-provided pre-visit note'));
    assert.equal(appendPrevisitNote(result,n),result,'Import retry must not duplicate the same version');
  },helper);
  add('blank previsit import cannot replace existing clinician text',[90],fc.tuple(fc.string({maxLength:100}),blank),([subjective,text])=>{
    assert.equal(appendPrevisitNote(subjective,{id:1,version_number:1,text,submitted_at:'2026-09-08T10:00:00Z'}),subjective);
  },helper);
  add('tracking board stage filter cannot leak another stage or mutate source order',[92],fc.array(fc.constantFrom('waiting','intake','ready','checkout'),{minLength:1,maxLength:30}),stages=>{
    const visits=stages.map((stage,i)=>({id:String(i),firstName:'Property',lastName:'Patient',reason:'Visit',chiefComplaint:'Review',stage,arrivedAt:null,stageStartedAt:null}));
    const before=JSON.stringify(visits);const result=filterVisits(visits,'waiting','','wait','2026-09-08T12:00:00Z');
    assert.equal(result.length,stages.filter(s=>s==='waiting').length);assert.ok(result.every(v=>v.stage==='waiting'));assert.equal(JSON.stringify(visits),before);
  },helper);
  add('tracking board cannot show wait duration that predates arrival',[92],fc.tuple(fc.integer({min:1,max:1000}),fc.integer({min:1,max:1000})),([arrival,extra])=>{
    const now=Date.UTC(2026,8,8,12);const visit={stage:'waiting',arrivedAt:new Date(now-arrival*60000).toISOString(),stageStartedAt:new Date(now-(arrival+extra)*60000).toISOString()};
    assert.equal(waitingMinutes(visit,new Date(now).toISOString()),null);
  },helper);
}
