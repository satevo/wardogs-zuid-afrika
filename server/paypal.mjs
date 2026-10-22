import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export const TIERS={'one-server':{amount:'3.00',name:'One Server'},'both-servers':{amount:'5.00',name:'Both Servers'}};
export const WEBHOOK_EVENTS=['BILLING.SUBSCRIPTION.ACTIVATED','BILLING.SUBSCRIPTION.UPDATED','BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.SUSPENDED','BILLING.SUBSCRIPTION.EXPIRED','BILLING.SUBSCRIPTION.PAYMENT.FAILED','PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'];
export function paypalClient({clientId,clientSecret,request=fetch,environment='sandbox'}){
  if(environment!=='sandbox')throw Error('Live payments are disabled in this release.');
  let token,expires=0;
  const base='https://api-m.sandbox.paypal.com';
  async function api(path,{method='GET',body,requestId}={}){
    if(!path.startsWith('/v1/'))throw Error('Invalid PayPal API path.');
    if(!clientId||!clientSecret)throw Error('PayPal sandbox credentials are missing.');
    if(!token||Date.now()>expires){
      const response=await request(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('PayPal sandbox authentication failed.');
      const data=await response.json();if(!data.access_token)throw Error('PayPal did not return an access token.');token=data.access_token;expires=Date.now()+(Number(data.expires_in)||300)*1000-30000;
    }
    const response=await request(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if(!response.ok){if(response.status===401){token=null;expires=0;}throw Error(`PayPal sandbox request failed (${response.status}).`);}
    return response.status===204?null:response.json();
  }
  return {api};
}
export function validatePlan(plan,tier){
  const p=TIERS[tier],cycles=plan.billing_cycles;
  if(!p||plan.status!=='ACTIVE'||!Array.isArray(cycles)||cycles.length!==1)throw Error('Unexpected PayPal plan.');
  const c=cycles[0],price=c.pricing_scheme?.fixed_price;
  if(c.tenure_type!=='REGULAR'||c.frequency?.interval_unit!=='MONTH'||c.frequency?.interval_count!==1||c.total_cycles!==0||price?.currency_code!=='USD'||Number(price.value)!==Number(p.amount)||Number(plan.payment_preferences?.setup_fee?.value||0)!==0||Number(plan.taxes?.percentage||0)!==0)throw Error('PayPal plan must match the fixed USD monthly price without extra fees.');
}
export function createPayments({database,siteUrl,accounts,clientId='',clientSecret='',planIds={},webhookId='',environment='sandbox',request=fetch,now=()=>Date.now()}){
  const client=paypalClient({clientId,clientSecret,request,environment});
  if(database!==':memory:')mkdirSync(dirname(database),{recursive:true});
  const db=new DatabaseSync(database),origin=new URL(siteUrl).origin;
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,member_id TEXT NOT NULL,tier TEXT NOT NULL,server_id TEXT,plan_id TEXT NOT NULL,provider_id TEXT UNIQUE,status TEXT NOT NULL DEFAULT 'CREATING',approval_url TEXT,next_billing TEXT,paid_until TEXT,review INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS payment_events(id TEXT PRIMARY KEY,received INTEGER NOT NULL);`);
  const ready=Boolean(clientId&&clientSecret&&planIds['one-server']&&planIds['both-servers']&&webhookId&&origin.startsWith('https:'));
  const view=row=>({id:row.id,plan:row.tier,name:TIERS[row.tier]?.name,amount:TIERS[row.tier]?.amount,currency:'USD',servers:row.tier==='both-servers'?['za-01','za-02']:[row.server_id],status:row.status,nextBilling:row.next_billing,paidUntil:row.paid_until,reviewRequired:Boolean(row.review),environment:'sandbox',accessConnected:false});
  const summary=member=>db.prepare('SELECT * FROM subscriptions WHERE member_id=? ORDER BY rowid DESC').all(member).map(view);
  const queues=new Map();
  async function serial(key,work){const previous=queues.get(key)||Promise.resolve();const current=previous.catch(()=>{}).then(work);queues.set(key,current);try{return await current;}finally{if(queues.get(key)===current)queues.delete(key);}}
  async function sync(row){
    if(!row.provider_id)return row;
    const remote=await client.api('/v1/billing/subscriptions/'+encodeURIComponent(row.provider_id));
    if(remote.id!==row.provider_id||remote.custom_id!==row.id||remote.plan_id!==row.plan_id)throw Error('Subscription identity did not match.');
    await client.api('/v1/billing/plans/'+encodeURIComponent(row.plan_id)).then(plan=>validatePlan(plan,row.tier));
    const allowed=['APPROVAL_PENDING','APPROVED','ACTIVE','SUSPENDED','CANCELLED','EXPIRED'];
    if(!allowed.includes(remote.status))throw Error('Unexpected subscription status.');
    const amount=remote.billing_info?.last_payment?.amount;
    const next=remote.billing_info?.next_billing_time||null;
    const proof=amount?.currency_code==='USD'&&Number(amount.value)===Number(TIERS[row.tier].amount);
    const until=proof&&next&&Date.parse(next)>now()?next:row.paid_until;
    db.prepare('UPDATE subscriptions SET status=?,next_billing=?,paid_until=? WHERE id=?').run(remote.status,next,until||null,row.id);
    return db.prepare('SELECT * FROM subscriptions WHERE id=?').get(row.id);
  }
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  async function body(req){const chunks=[];let size=0;for await(const chunk of req){const buffer=Buffer.from(chunk);size+=buffer.length;if(size>65536)throw Error('Request too large.');chunks.push(buffer);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
  async function handle(req,res,path){
    if(!path.startsWith('/api/billing/')&&path!=='/api/paypal/webhook')return false;
    if(path==='/api/billing/config'&&req.method==='GET'){json(res,200,{provider:'paypal',mode:'sandbox',ready,currency:'USD',liveEnabled:false});return true;}
    if(path==='/api/paypal/webhook'){
      if(req.method!=='POST'){json(res,405,{error:'POST required.'});return true;}
      if(!ready){json(res,503,{error:'Sandbox webhook is not configured.'});return true;}
      try{
        const event=await body(req),h=req.headers;
        if(!event.id||!WEBHOOK_EVENTS.includes(event.event_type)){json(res,400,{error:'Unsupported event.'});return true;}
        const required=['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'];
        if(required.some(k=>typeof h[k]!=='string')){json(res,400,{error:'Missing verification headers.'});return true;}
        // Headers are sent only to PayPal, never fetched as arbitrary certificate URLs.
        const result=await client.api('/v1/notifications/verify-webhook-signature',{method:'POST',body:{auth_algo:h['paypal-auth-algo'],cert_url:h['paypal-cert-url'],transmission_id:h['paypal-transmission-id'],transmission_sig:h['paypal-transmission-sig'],transmission_time:h['paypal-transmission-time'],webhook_id:webhookId,webhook_event:event}});
        if(result.verification_status!=='SUCCESS'){json(res,400,{error:'Invalid webhook signature.'});return true;}
        if(db.prepare('SELECT id FROM payment_events WHERE id=?').get(event.id)){json(res,200,{ok:true});return true;}
        const providerId=event.event_type.startsWith('BILLING.SUBSCRIPTION.')?event.resource?.id:event.resource?.billing_agreement_id;
        await serial(providerId||event.id,async()=>{
          const row=db.prepare('SELECT * FROM subscriptions WHERE provider_id=?').get(providerId||'');
          if(row){await sync(row);if(['PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'].includes(event.event_type))db.prepare('UPDATE subscriptions SET review=1 WHERE id=?').run(row.id);}
          // Unknown subscriptions never create membership records.
          db.prepare('INSERT OR IGNORE INTO payment_events VALUES (?,?)').run(event.id,now());
        });
        json(res,200,{ok:true});
      }catch{json(res,503,{error:'Webhook could not be processed. Retry required.'});}
      return true;
    }
    const member=accounts.user(req);
    if(!member){json(res,401,{error:'Sign in with Discord first.'});return true;}
    if(path==='/api/billing/subscriptions'&&req.method==='GET'){json(res,200,{subscriptions:summary(member.discordId),mode:'sandbox',ready});return true;}
    if(req.method!=='POST'){json(res,405,{error:'Method not allowed.'});return true;}
    if(req.headers.origin!==origin||req.headers['content-type']!=='application/json'){json(res,403,{error:'Request origin not allowed.'});return true;}
    if(!ready){json(res,503,{error:'PayPal sandbox setup is incomplete. No live payments are enabled.'});return true;}
    try{
      const input=await body(req);
      await serial('member:'+member.discordId,async()=>{
        if(path==='/api/billing/checkout'){
          if(!TIERS[input.plan]||(input.plan==='one-server'&&!['za-01','za-02'].includes(input.server))||input.acceptedSandboxTerms!==true){json(res,400,{error:'Choose a valid plan/server and acknowledge sandbox billing.'});return;}
          let row=db.prepare("SELECT * FROM subscriptions WHERE member_id=? AND status NOT IN ('CANCELLED','EXPIRED') ORDER BY rowid DESC LIMIT 1").get(member.discordId);
          if(row&&(row.tier!==input.plan||row.server_id!==(input.plan==='one-server'?input.server:null))){json(res,409,{error:'An existing subscription needs resolving before selecting another plan.'});return;}
          if(row?.provider_id){row=await sync(row);if(row.status!=='APPROVAL_PENDING'||!row.approval_url){json(res,409,{error:'You already have a subscription. Manage it in your account.'});return;}json(res,200,{approvalUrl:row.approval_url,mode:'sandbox'});return;}
          const planId=planIds[input.plan];await client.api('/v1/billing/plans/'+encodeURIComponent(planId)).then(plan=>validatePlan(plan,input.plan));
          if(!row){const id=randomUUID();db.prepare('INSERT INTO subscriptions(id,member_id,tier,server_id,plan_id) VALUES (?,?,?,?,?)').run(id,member.discordId,input.plan,input.plan==='one-server'?input.server:null,planId);row=db.prepare('SELECT * FROM subscriptions WHERE id=?').get(id);}
          const remote=await client.api('/v1/billing/subscriptions',{method:'POST',requestId:row.id,body:{plan_id:planId,custom_id:row.id,application_context:{brand_name:'Wardogs Zuid Afrika',shipping_preference:'NO_SHIPPING',user_action:'SUBSCRIBE_NOW',return_url:origin+'/?checkout=returned#account',cancel_url:origin+'/?checkout=cancelled#account'}}});
          const approval=remote.links?.find(l=>l.rel==='approve')?.href;
          if(!/^I-[A-Z0-9]+$/.test(remote.id)||!approval||new URL(approval).origin!=='https://www.sandbox.paypal.com')throw Error('Unexpected checkout response.');
          db.prepare('UPDATE subscriptions SET provider_id=?,approval_url=?,status=? WHERE id=?').run(remote.id,approval,'APPROVAL_PENDING',row.id);
          json(res,200,{approvalUrl:approval,mode:'sandbox'});return;
        }
        if(['/api/billing/refresh','/api/billing/cancel'].includes(path)){
          let row=db.prepare('SELECT * FROM subscriptions WHERE id=? AND member_id=?').get(String(input.id||''),member.discordId);
          if(!row?.provider_id){json(res,404,{error:'Subscription not found.'});return;}
          await serial(row.provider_id,async()=>{
            row=await sync(row);
            if(path.endsWith('/cancel')&&!['CANCELLED','EXPIRED'].includes(row.status)){
              await client.api('/v1/billing/subscriptions/'+encodeURIComponent(row.provider_id)+'/cancel',{method:'POST',body:{reason:'Cancelled by the signed-in member.'}});
              row=await sync(row);
            }
          });
          json(res,200,{subscription:view(row),mode:'sandbox'});return;
        }
        json(res,404,{error:'Billing endpoint not found.'});
      });
    }catch{json(res,502,{error:'PayPal sandbox could not complete the request. Check your account before retrying.'});}
    return true;
  }
  return {handle,summary,ready,close:()=>db.close()};
}
