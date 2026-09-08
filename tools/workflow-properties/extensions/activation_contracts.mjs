export function register({add,fc,request,assert}) {
  const service={layer:'application service'};
  add('employee activation rejects expired invitation without creating an account',[6],fc.integer({min:0,max:10080}),async minutes=>{
    const r=await request('activation_contract',{operation:'expired',minutes});assert.equal(r.error,'Clinic::Workforce::EmployeeOnboarding::InvalidInvitation');assert.equal(r.users,0);assert.equal(r.employments,0);assert.equal(r.status,'pending');
  },service);
  add('employee activation rejects short password without partial employment',[6],fc.stringMatching(/^[A-Za-z]{0,11}$/),async password=>{
    const r=await request('activation_contract',{operation:'password',password});assert.equal(r.error,'Clinic::Workforce::EmployeeOnboarding::InvalidPassword');assert.equal(r.users,0);assert.equal(r.employments,0);assert.equal(r.status,'pending');
  },service);
  add('employee activation rejects mismatched password confirmation atomically',[6],fc.constant(null),async()=>{
    const r=await request('activation_contract',{operation:'mismatch'});assert.equal(r.error,'Clinic::Workforce::EmployeeOnboarding::InvalidPassword');assert.equal(r.users,0);assert.equal(r.employments,0);assert.equal(r.status,'pending');
  },service);
  add('employee activation consumes invitation once and links employment sites',[6],fc.constant(null),async()=>{
    const r=await request('activation_contract',{operation:'valid'});assert.equal(r.error,null);assert.equal(r.users,1);assert.equal(r.employments,1);assert.equal(r.site_links,1);assert.equal(r.status,'activated');assert.equal(r.token_cleared,true);assert.equal(r.replay_error,'Clinic::Workforce::EmployeeOnboarding::InvalidInvitation');
  },service);
}
