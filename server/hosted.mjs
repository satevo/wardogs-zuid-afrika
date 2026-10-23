import http from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {existsSync,readFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,extname,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAccounts} from './accounts.mjs';
import {createPayments} from './paypal.mjs';
import {TIERS} from './offers.mjs';

const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=realpathSync(resolve(appRoot,'dist'));
const inside=(parent,child)=>{const path=relative(parent,child);return path===''||(!path.startsWith('..'+sep)&&path!=='..'&&!isAbsolute(path));};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2'};

export function createHostedServer({env=process.env}={}){
  const site=new URL(env.SITE_URL||'https://www.wardogssa.co.za');
  if(site.protocol!=='https:'||site.username||site.password||site.pathname!=='/'||site.search||site.hash)throw Error('SITE_URL must be your public HTTPS origin, without a path or credentials.');
  if(env.PAYPAL_ENVIRONMENT&&env.PAYPAL_ENVIRONMENT!=='sandbox')throw Error('Live payments are disabled in this release.');
  const dataDirectory=env.WARDOGS_DATA_DIR||resolve(appRoot,'.local');
  if(!isAbsolute(dataDirectory))throw Error('WARDOGS_DATA_DIR must be an absolute private folder path.');
  if(inside(publicRoot,resolve(dataDirectory)))throw Error('Database storage must be outside the public dist folder.');
  mkdirSync(dataDirectory,{recursive:true,mode:0o700});
  const privateRoot=realpathSync(dataDirectory);
  if(inside(publicRoot,privateRoot))throw Error('Database storage must be outside the public dist folder.');
  const settingsFile=resolve(privateRoot,'paypal-sandbox.json');
  const settings=existsSync(settingsFile)?JSON.parse(readFileSync(settingsFile,'utf8')):{};
  let payments;
  const accounts=createAccounts({database:resolve(privateRoot,'accounts.sqlite'),siteUrl:site.origin,clientId:env.DISCORD_CLIENT_ID,clientSecret:env.DISCORD_CLIENT_SECRET,paymentStatus:()=>({provider:'paypal',mode:'sandbox',currency:'USD',ready:payments?.ready||false,liveEnabled:false})});
  try{
    payments=createPayments({database:resolve(privateRoot,'payments.sqlite'),siteUrl:site.origin,accounts,clientId:env.PAYPAL_CLIENT_ID,clientSecret:env.PAYPAL_CLIENT_SECRET,environment:'sandbox',planIds:Object.fromEntries(Object.keys(TIERS).map(id=>[id,env['PAYPAL_PLAN_'+id.toUpperCase().replaceAll('-','_')]||settings.plans?.[id]])),webhookId:env.PAYPAL_WEBHOOK_ID||settings.webhookId});
  }catch(error){accounts.close();throw error;}
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cache-Control','no-store');
    if(req.headers.host?.toLowerCase()!==site.host.toLowerCase()){json(res,403,{error:'Request host not allowed.'});return;}
    let path;
    try{path=decodeURIComponent(new URL(req.url,site.origin).pathname);}catch{json(res,400,{error:'Invalid address.'});return;}
    if(path.includes('\0')||path.includes('\\')||path.split('/').some(segment=>segment.startsWith('.'))||path.startsWith('/__local/')){json(res,404,{error:'Not found.'});return;}
    try{
      if(path==='/api/health'&&req.method==='GET'){json(res,200,{ok:true,hosting:'node',payments:'sandbox',liveEnabled:false});return;}
      if(await accounts.handle(req,res,path))return;
      if(await payments.handle(req,res,path))return;
      if(path.startsWith('/api/')||path.startsWith('/auth/')){json(res,404,{error:'Not found.'});return;}
      if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');json(res,405,{error:'Method not allowed.'});return;}
      const file=resolve(publicRoot,'.'+(path==='/'?'/index.html':path));
      if(!inside(publicRoot,file)){json(res,404,{error:'Not found.'});return;}
      let actual;
      try{actual=await realpath(file);if(!inside(publicRoot,actual)||!(await stat(actual)).isFile())throw Error('Not public');}catch{json(res,404,{error:'Not found.'});return;}
      const body=await readFile(actual);
      res.writeHead(200,{'Content-Type':mime[extname(actual)]||'application/octet-stream','Content-Length':body.length});
      res.end(req.method==='HEAD'?undefined:body);
    }catch{json(res,500,{error:'The request could not be completed.'});}
  });
  server.requestTimeout=30000;
  server.headersTimeout=15000;
  server.once('close',()=>{accounts.close();payments.close();});
  return server;
}
