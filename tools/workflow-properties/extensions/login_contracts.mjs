export function register({add,fc,request,assert,blank}) {
  const options={layer:'Rails integration / independent authenticated session'};
  for(const field of ['email_address','password']) add(`standard login rejects blank ${field} without creating session`,[2],blank,async value=>{
    const r=await request('isolated_login_contract',{mode:'missing',changes:{[field]:value}});
    assert.equal(r.status,401);assert.equal(r.sessions,0);
  },options);
  for(const mode of ['inactive','logout']) add(`standard login ${mode} cannot retain authenticated access`,[2],fc.constant(null),async()=>{
    const r=await request('isolated_login_contract',{mode});assert.equal(r.status,401);assert.equal(r.sessions,0);
  },options);
}
