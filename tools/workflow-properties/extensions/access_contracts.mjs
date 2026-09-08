export function register({add,fc,request,assert,blank,amount,cents}) {
  const opts={layer:'application service'};
  add('clinic creation model requires a nonblank clinic name',[1],blank,async name=>{
    const r=await request('access_clinic',{name}); assert.equal(r.valid,false); assert.ok(r.errors.includes('name'));
  },{layer:'ActiveRecord validation'});
  add('portal invitation refuses an inactive patient account',[19],fc.integer({min:1,max:999}),async suffix=>{
    const r=await request('access_portal',{mode:'inactive_invite',suffix}); assert.ok(r.error); assert.equal(r.identities,0); assert.equal(r.sessions,0);
  },opts);
  add('portal activation requires affirmative terms acceptance',[19],fc.constantFrom(false,null),async accepted=>{
    const r=await request('access_portal',{mode:'terms',accepted}); assert.ok(r.error); assert.equal(r.status,'invited'); assert.equal(r.sessions,0);
  },opts);
  add('portal activation refuses missing terms version',[19],blank,async version=>{
    const r=await request('access_portal',{mode:'version',version}); assert.ok(r.error); assert.equal(r.status,'invited'); assert.equal(r.sessions,0);
  },opts);
  add('expired portal invitation cannot create a session',[19],fc.integer({min:0,max:86400}),async seconds=>{
    const r=await request('access_portal',{mode:'expired',seconds}); assert.ok(r.error); assert.equal(r.status,'invited'); assert.equal(r.sessions,0);
  },opts);
  add('portal activation token cannot be reused after success',[19],fc.integer({min:1,max:999}),async suffix=>{
    const r=await request('access_portal',{mode:'replay',suffix}); assert.ok(r.error); assert.equal(r.status,'active'); assert.equal(r.sessions,1); assert.equal(r.token_cleared,true);
  },opts);
  add('portal revocation removes all sessions and invitation token',[20],fc.integer({min:1,max:999}),async suffix=>{
    const r=await request('access_portal',{mode:'revoke',suffix}); assert.equal(r.error,null); assert.equal(r.status,'revoked'); assert.equal(r.sessions,0); assert.equal(r.token_cleared,true);
  },opts);
  for(const mode of ['inactive','revoked','expired']) add(`${mode} staff access cannot read clinic patients`,[7],fc.integer({min:1,max:3600}),async seconds=>{
    assert.equal((await request('access_grant',{mode,seconds})).denied,true);
  },opts);
  add('membership retirement preserves published terms and blocks republishing',[12],amount,async n=>{
    const r=await request('access_retire_membership',{amount:cents(n)}); assert.ok(r.error); assert.equal(r.retired,true); assert.equal(r.versions,1); assert.equal(r.snapshot_preserved,true);
  },opts);
}

