import http from 'node:http';
import {readFile,writeFile,mkdir,unlink,stat} from 'node:fs/promises';
import {resolve,relative,extname,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {execFile} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createAccounts} from './server/accounts.mjs';
import {createPayments} from './server/paypal.mjs';

const directory=dirname(fileURLToPath(import.meta.url));
if(existsSync(resolve(directory,'.env')))process.loadEnvFile(resolve(directory,'.env'));
const siteUrl=new URL(process.env.WARDOGS_SITE_URL||process.env.SITE_URL||'http://localhost:1026').origin;
let savedPayPal={};const paymentSettings=resolve(directory,'.local/paypal-sandbox.json');
if(existsSync(paymentSettings))savedPayPal=JSON.parse(readFileSync(paymentSettings,'utf8'));
let payments;
const accounts=createAccounts({database:resolve(directory,'.local/accounts.sqlite'),siteUrl,clientId:process.env.DISCORD_CLIENT_ID,clientSecret:process.env.DISCORD_CLIENT_SECRET,paymentStatus:()=>({provider:'paypal',mode:'sandbox',currency:'USD',ready:payments?.ready||false,liveEnabled:false})});
payments=createPayments({database:resolve(directory,'.local/payments.sqlite'),siteUrl,accounts,clientId:process.env.PAYPAL_CLIENT_ID,clientSecret:process.env.PAYPAL_CLIENT_SECRET,environment:process.env.PAYPAL_ENVIRONMENT||'sandbox',planIds:{'one-server':process.env.PAYPAL_ONE_SERVER_PLAN_ID||savedPayPal.plans?.['one-server'],'both-servers':process.env.PAYPAL_BOTH_SERVERS_PLAN_ID||savedPayPal.plans?.['both-servers']},webhookId:process.env.PAYPAL_WEBHOOK_ID||savedPayPal.webhookId});
const root=resolve(directory,'dist');
const runtimeFile=resolve(directory,'.local/runtime.json');
const host='127.0.0.1', port=1026, url=`http://localhost:${port}`;
const app='wardogs-zuid-afrika-local';
const token=randomBytes(32).toString('hex');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2'};
let stopping=false;
const open=()=>{if(!process.argv.includes('--open'))return;if(process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],()=>{});else console.log(`Open ${url} in your browser.`);};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  // Only requests addressed to this local listener are accepted.
  if(![`localhost:${port}`,`127.0.0.1:${port}`,new URL(siteUrl).host].includes(req.headers.host)){res.writeHead(403);res.end('Request host not allowed.');return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,url).pathname);}catch{res.writeHead(400);res.end('Invalid address.');return;}
  if(pathname.startsWith('/__local/')&&req.headers.host!==`localhost:${port}`&&req.headers.host!==`127.0.0.1:${port}`){res.writeHead(404);res.end('Not found.');return;}
  try{if(await accounts.handle(req,res,pathname))return;if(await payments.handle(req,res,pathname))return;}catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The request could not be completed.'}));return;}
  if(pathname==='/__local/health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({app,port}));return;}
  if(pathname==='/__local/stop'&&req.method==='POST'){
    const supplied=Buffer.from(String(req.headers['x-wardogs-local-token']||''));const expected=Buffer.from(token);
    if(req.headers.origin||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(403);res.end('Not authorised.');return;}
    res.end('Wardogs stopped.');setImmediate(shutdown);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end('Method not allowed.');return;}
  const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  const inside=relative(root,file);
  if(inside.startsWith('..'+sep)||inside==='..'||inside.split(/[\\/]/).some(p=>p.startsWith('.'))||pathname.includes('\0')){res.writeHead(404);res.end('Not found.');return;}
  try{
    if(!(await stat(file)).isFile())throw Error('Not a file');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':data.length});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found.');}
});
async function shutdown(){
  if(stopping)return;stopping=true;
  try{const saved=JSON.parse(await readFile(runtimeFile,'utf8'));if(saved.token===token)await unlink(runtimeFile);}catch{}
  server.close(()=>{accounts.close();payments.close();process.exit(0);});server.closeIdleConnections();
  setTimeout(()=>{server.closeAllConnections();process.exit(0);},2000).unref();
}
server.on('error',async error=>{
  if(error.code==='EADDRINUSE'){
    try{const response=await fetch(`http://${host}:${port}/__local/health`,{signal:AbortSignal.timeout(1500)});const existing=await response.json();if(existing.app===app){console.log(`Wardogs is already running at ${url}`);accounts.close();payments.close();open();return;}}catch{}
    console.error(`Port ${port} is in use by another application. Wardogs did not stop or change it.`);
  }else console.error(`Could not start Wardogs: ${error.message}`);
  accounts.close();payments.close();process.exitCode=1;
});
server.listen(port,host,async()=>{
  try{await mkdir(dirname(runtimeFile),{recursive:true});await writeFile(runtimeFile,JSON.stringify({app,port,pid:process.pid,token}));}
  catch(error){console.error(`Could not save local shutdown information: ${error.message}`);await shutdown();return;}
  console.log(`\nWardogs Zuid Afrika\n${url}\n\nLocal computer only. Press Ctrl+C or use Stop Wardogs.cmd to stop.\n`);
  open();
});
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
