import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {paypalClient,TIERS,WEBHOOK_EVENTS,validatePlan} from './server/paypal.mjs';
const root=dirname(fileURLToPath(import.meta.url));
if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
try{
  const flag=process.argv.indexOf('--site-url');
  const siteUrl=new URL((flag>=0?process.argv[flag+1]:null)||process.env.WARDOGS_SITE_URL||process.env.SITE_URL||'http://localhost:1026').origin;
  if(!siteUrl.startsWith('https:'))throw Error('Set SITE_URL to your public HTTPS test address first.');
  if(!process.env.PAYPAL_CLIENT_ID||!process.env.PAYPAL_CLIENT_SECRET)throw Error('Add your PayPal SANDBOX client ID and secret to .env first.');
  const {api}=paypalClient({clientId:process.env.PAYPAL_CLIENT_ID,clientSecret:process.env.PAYPAL_CLIENT_SECRET,environment:process.env.PAYPAL_ENVIRONMENT||'sandbox'});
  const file=resolve(root,'.local/paypal-sandbox.json');mkdirSync(dirname(file),{recursive:true});
  const config=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{plans:{},requests:{}};
  config.requests||={};config.plans||={};
  const save=()=>writeFileSync(file,JSON.stringify(config,null,2));
  const requestId=key=>{if(!config.requests[key]){config.requests[key]=randomUUID();save();}return config.requests[key];};
  if(!config.donationProductId){const product=await api('/v1/catalogs/products',{method:'POST',requestId:requestId('donation-product-v1'),body:{name:'Wardogs Zuid Afrika Community Support',description:'Community donation subscriptions with access benefits · sandbox',type:'SERVICE'}});config.donationProductId=product.id;save();}
  for(const[tier,plan]of Object.entries(TIERS)){
    if(!config.plans[tier]){const created=await api('/v1/billing/plans',{method:'POST',requestId:requestId(tier),body:{product_id:config.donationProductId,name:`Wardogs ZA ${plan.name} · ${plan.months}m · SANDBOX`,status:'ACTIVE',billing_cycles:[{frequency:{interval_unit:'MONTH',interval_count:plan.months},tenure_type:'REGULAR',sequence:1,total_cycles:0,pricing_scheme:{fixed_price:{currency_code:'USD',value:plan.amount}}}],payment_preferences:{auto_bill_outstanding:true,setup_fee:{currency_code:'USD',value:'0.00'},setup_fee_failure_action:'CANCEL',payment_failure_threshold:1}}});config.plans[tier]=created.id;save();}
    validatePlan(await api('/v1/billing/plans/'+encodeURIComponent(config.plans[tier])),tier);
  }
  const webhookUrl=siteUrl+'/api/paypal/webhook';
  if(config.webhookId){await api('/v1/notifications/webhooks/'+encodeURIComponent(config.webhookId),{method:'PATCH',body:[{op:'replace',path:'/url',value:webhookUrl}]});}
  else{const hooks=await api('/v1/notifications/webhooks');const existing=hooks.webhooks?.find(h=>h.url===webhookUrl);const hook=existing||await api('/v1/notifications/webhooks',{method:'POST',body:{url:webhookUrl,event_types:WEBHOOK_EVENTS.map(name=>({name}))}});config.webhookId=hook.id;}
  config.webhookUrl=webhookUrl;save();console.log('PayPal SANDBOX donation product, all 12 current USD offer/period plans and webhook are configured. Restart Wardogs. No live payments were enabled.');
}catch(error){console.error(error.message);process.exitCode=1;}
