// Proposed clinic operating requirement, intentionally stricter than today's
// amount-only refund service. A failure is an acceptance gap, not a regression.
export function register({add,request,assert,amount,cents}) {
  add('proposed acceptance cash refund requires a recorded reason',[55],amount,async n=>{
    const r=await request('billing_cash_contract',{amount:cents(n),tender:cents(n),refund:cents(n)});
    assert.ok(r.error,'Cash refund was accepted with no reason; current service has no reason field');
    assert.equal(r.refunds,0,'Unexplained refund must not persist under proposed acceptance requirement');
    assert.equal(r.receipts,1,'Only original payment receipt should exist when refund is rejected');
  },{layer:'proposed operational acceptance / real application service'});
}
