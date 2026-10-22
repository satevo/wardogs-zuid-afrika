import test from 'node:test';
import assert from 'node:assert/strict';
import {createPayments,paypalClient,validatePlan,TIERS} from '../server/paypal.mjs';
const origin='https://wardogs-test.example';
const plan=(value='2.00',months=1)=>({status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',frequency:{interval_unit:'MONTH',interval_count:months},total_cycles:0,pricing_scheme:{fixed_price:{currency_code:'USD',value}}}],payment_preferences:{setup_fee:{value:'0.00'}}});
function response(){return {status:200,body:'',writeHead(status){this.status=status;},end(body=''){this.body=body;}};}
const planIds=Object.fromEntries(Object.keys(TIERS).map(id=>[id,'P-'+id.toUpperCase()]));
function setup(t,options={}){
  const state={creates:0,reads:0,remote:null,signature:'SUCCESS',...options};
  const service=createPayments({database:':memory:',siteUrl:origin,accounts:{user:req=>req.headers.cookie?{discordId:req.headers.cookie}:null},clientId:'fake-id',clientSecret:'fake-secret',planIds,webhookId:'HOOK-TEST',request:async(url,request)=>{
    assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'),'Only sandbox calls allowed');
    const path=new URL(url).pathname;let data;
    if(path==='/v1/oauth2/token')data={access_token:'fake-token',expires_in:300};
    else if(path.startsWith('/v1/billing/plans/')){const id=Object.keys(planIds).find(id=>path.endsWith(planIds[id]));data=plan(state.wrongPrice?'0.01':TIERS[id].amount,TIERS[id].months);}
    else if(path==='/v1/billing/subscriptions'&&request.method==='POST'){state.creates++;state.lastCreate=JSON.parse(request.body);state.remote={id:'I-TEST',plan_id:state.lastCreate.plan_id,custom_id:state.lastCreate.custom_id,status:'APPROVAL_PENDING'};data={id:'I-TEST',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/approve?token=test'}]};}
    else if(path==='/v1/notifications/verify-webhook-signature')data={verification_status:state.signature};
    else if(path.endsWith('/cancel')){state.remote.status='CANCELLED';return {ok:true,status:204};}
    else if(path==='/v1/billing/subscriptions/I-TEST'){state.reads++;data=state.remote;}
    else throw Error('Unexpected mock request: '+path);
    return {ok:true,status:200,json:async()=>data};
  }});t.after(()=>service.close());return {service,state};
}
async function call(service,path,data,{member='member-a',origin:requestOrigin=origin,headers={}}={}){
  const request={method:data===undefined?'GET':'POST',headers:{...(member?{cookie:member}:{}),origin:requestOrigin,'content-type':'application/json',...headers},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(data));}};
  const res=response();await service.handle(request,res,path);return {status:res.status,body:JSON.parse(res.body||'{}')};
}
const checkout=service=>call(service,'/api/billing/checkout',{plan:'whitelist-one-server-1m',server:'za-01',acceptedSandboxTerms:true,amount:'0.01',plan_id:'ATTACKER'});
const webhook=(service,id='EV-1')=>call(service,'/api/paypal/webhook',{id,event_type:'BILLING.SUBSCRIPTION.ACTIVATED',resource:{id:'I-TEST',status:'ACTIVE'}},{member:null,headers:{'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.paypal.com/cert','paypal-transmission-id':'TX-1','paypal-transmission-sig':'test','paypal-transmission-time':'2026-10-22T00:00:00Z'}});
test('live mode cannot be enabled',()=>assert.throws(()=>paypalClient({environment:'live'}),/disabled/));
test('plan validation rejects wrong amount, currency and billing interval',()=>{assert.throws(()=>validatePlan(plan('0.01'),'whitelist-one-server-1m')); const wrong=plan();wrong.billing_cycles[0].pricing_scheme.fixed_price.currency_code='ZAR';assert.throws(()=>validatePlan(wrong,'whitelist-one-server-1m')); const annual=plan();annual.billing_cycles[0].frequency.interval_unit='YEAR';assert.throws(()=>validatePlan(annual,'whitelist-one-server-1m')); });
test('checkout requires authentication, same origin, valid server and sandbox consent',async t=>{const {service,state}=setup(t);assert.equal((await call(service,'/api/billing/checkout',{}, {member:null})).status,401);assert.equal((await call(service,'/api/billing/checkout',{}, {origin:'https://evil.example'})).status,403);assert.equal((await call(service,'/api/billing/checkout',{plan:'whitelist-one-server-1m',server:'evil',acceptedSandboxTerms:true})).status,400);assert.equal((await call(service,'/api/billing/checkout',{plan:'whitelist-one-server-1m',server:'za-01'})).status,400);assert.equal(state.creates,0);});
test('server controls price and plan; concurrent checkout clicks reuse one subscription',async t=>{const {service,state}=setup(t);const results=await Promise.all([checkout(service),checkout(service)]);assert.ok(results.every(r=>r.status===200));assert.equal(state.creates,1);assert.equal(state.lastCreate.plan_id,planIds['whitelist-one-server-1m']);assert.equal(state.lastCreate.amount,undefined);assert.equal(state.lastCreate.plan,undefined);assert.equal(service.summary('member-a')[0].status,'APPROVAL_PENDING');});
test('wrong configured price fails before subscription creation',async t=>{const {service,state}=setup(t,{wrongPrice:true});assert.equal((await checkout(service)).status,502);assert.equal(state.creates,0);});
test('another member cannot cancel a subscription',async t=>{const {service}=setup(t);await checkout(service);const id=service.summary('member-a')[0].id;assert.equal((await call(service,'/api/billing/cancel',{id},{member:'member-b'})).status,404);});
test('unverified webhook cannot change a subscription',async t=>{const {service,state}=setup(t,{signature:'FAILURE'});await checkout(service);assert.equal((await webhook(service)).status,400);assert.equal(service.summary('member-a')[0].status,'APPROVAL_PENDING');assert.equal(state.reads,0);});
test('verified webhooks fetch current provider state and deduplicate replays',async t=>{const {service,state}=setup(t);await checkout(service);assert.equal((await webhook(service)).status,200);assert.equal(service.summary('member-a')[0].status,'APPROVAL_PENDING','Untrusted event status must not activate membership');state.remote.status='ACTIVE';state.remote.billing_info={last_payment:{amount:{currency_code:'USD',value:'2.00'}},next_billing_time:'2099-01-01T00:00:00Z'};assert.equal((await webhook(service,'EV-2')).status,200);const reads=state.reads;assert.equal((await webhook(service,'EV-2')).status,200);assert.equal(state.reads,reads);assert.equal(service.summary('member-a')[0].status,'ACTIVE');assert.equal(service.summary('member-a')[0].accessConnected,false);});
test('cancellation is confirmed with PayPal and keeps ownership',async t=>{const {service,state}=setup(t);await checkout(service);state.remote.status='ACTIVE';const id=service.summary('member-a')[0].id;assert.equal((await call(service,'/api/billing/cancel',{id})).status,200);assert.equal(service.summary('member-a')[0].status,'CANCELLED');});
test('changed provider identity is rejected',async t=>{const {service,state}=setup(t);await checkout(service);state.remote.custom_id='different';const id=service.summary('member-a')[0].id;assert.equal((await call(service,'/api/billing/refresh',{id})).status,502);assert.equal(service.summary('member-a')[0].status,'APPROVAL_PENDING');});

const expectedPrices={
  'whitelist-one-server-1m':'2.00','whitelist-one-server-3m':'5.50','whitelist-one-server-6m':'10.00',
  'whitelist-both-servers-1m':'3.00','whitelist-both-servers-3m':'8.00','whitelist-both-servers-6m':'15.00',
  'reserved-one-server-1m':'4.00','reserved-one-server-3m':'11.00','reserved-one-server-6m':'21.00',
  'reserved-both-servers-1m':'6.00','reserved-both-servers-3m':'16.50','reserved-both-servers-6m':'31.50'
};
for(const[id,amount]of Object.entries(expectedPrices))test('offer '+id+' charges '+amount+' USD at its exact interval',async t=>{const {service,state}=setup(t);assert.equal(TIERS[id].amount,amount);const result=await call(service,'/api/billing/checkout',{plan:id,server:'za-02',acceptedSandboxTerms:true});assert.equal(result.status,200);assert.equal(state.lastCreate.plan_id,planIds[id]);const item=service.summary('member-a')[0];assert.equal(item.amount,amount);assert.equal(item.months,Number(id.match(/-(\d)m$/)[1]));assert.equal(item.servers.length,TIERS[id].servers);if(TIERS[id].servers===1)assert.deepEqual(item.servers,['za-02']);});
test('removed offers and invented intervals cannot be purchased',async t=>{const {service,state}=setup(t);for(const id of ['one-server','both-servers','whitelist-one-server-12m','constructor','__proto__'])assert.equal((await call(service,'/api/billing/checkout',{plan:id,server:'za-01',acceptedSandboxTerms:true})).status,400);assert.equal(state.creates,0);});
test('removed plans are no longer valid for billing',()=>{assert.throws(()=>validatePlan(plan('3.00',1),'one-server'));assert.throws(()=>validatePlan(plan('5.00',1),'both-servers'));});
test('multi-month offers reject a monthly PayPal plan even with the same amount',()=>{assert.throws(()=>validatePlan(plan('5.50',1),'whitelist-one-server-3m'));validatePlan(plan('5.50',3),'whitelist-one-server-3m');assert.throws(()=>validatePlan(plan('31.50',3),'reserved-both-servers-6m'));validatePlan(plan('31.50',6),'reserved-both-servers-6m');});
