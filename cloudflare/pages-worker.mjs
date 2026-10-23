// Pages serves the pre-launch website. Local Node/SQLite services are not deployed here.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path.startsWith('/__local/'))return new Response('Not found.',{status:404});
    if(path==='/api/session'&&request.method==='GET')return json({user:null,loginAvailable:false,payments:{provider:'paypal',mode:'sandbox',currency:'USD',ready:false,liveEnabled:false},reservedAccessConnected:false,hosting:'cloudflare-pages',accountBackendConnected:false});
    if(path==='/api/billing/config'&&request.method==='GET')return json({provider:'paypal',mode:'sandbox',ready:false,currency:'USD',liveEnabled:false,hosting:'cloudflare-pages',accountBackendConnected:false});
    if(path==='/api/health'&&request.method==='GET')return json({site:'wardogs-zuid-afrika',hosting:'cloudflare-pages',accountsConnected:false,billingConnected:false,livePaymentsEnabled:false});
    if(path.startsWith('/api/')||path.startsWith('/auth/'))return json({error:'This service is not connected on the Cloudflare Pages site yet. No payment or membership change was made.'},503);
    return env.ASSETS.fetch(request);
  }
};
