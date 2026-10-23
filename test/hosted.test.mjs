import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createHostedServer} from '../server/hosted.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const tempRoot=resolve(root,'.local/hosted-tests');
const {mkdirSync,rmSync}=await import('node:fs');
mkdirSync(tempRoot,{recursive:true});
const clean=data=>{const target=resolve(data);if(!target.startsWith(tempRoot+sep))throw Error('Test cleanup target outside hosted test directory.');rmSync(target,{recursive:true,force:true});};
async function fixture(t,extra={}){
  const data=mkdtempSync(resolve(tempRoot,'case-'));
  const env={SITE_URL:'https://www.wardogs-test.example',WARDOGS_DATA_DIR:data,...extra};
  let server=createHostedServer({env});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise((done,reject)=>server.close(error=>error?reject(error):done()));clean(data);});
  const request=(path,options={})=>new Promise((done,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method:options.method||'GET',headers:{host:'www.wardogs-test.example',...options.headers}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
    });req.on('error',reject);req.end();
  });return {data,request,async restart(){await new Promise(done=>server.close(done));server=createHostedServer({env});server.listen(0,'127.0.0.1');await once(server,'listening');}};
}

test('hosted site serves public assets with correct headers and HEAD semantics',async t=>{
  const {request}=await fixture(t);
  const home=await request('/');assert.equal(home.status,200);assert.match(home.body,/Wardogs/);assert.equal(home.headers['x-content-type-options'],'nosniff');
  const offers=await request('/offers.json');assert.equal(offers.status,200);const catalog=JSON.parse(offers.body);assert.equal(catalog.offers.length,2);assert.ok(catalog.offers.every(offer=>offer.benefit==='reserved'));
  const head=await request('/offers.json',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,'');assert.equal(head.headers['content-length'],offers.headers['content-length']);
});
test('hosted site blocks private paths, local controls and unknown API routes',async t=>{
  const {request}=await fixture(t);
  for(const path of ['/.env','/.git/config','/.local/accounts.sqlite','/server/paypal.mjs','/app.cjs','/package.json','/__local/health','/__local/stop','/%2e%2e%2f.env','/%00','/api/missing','/auth/missing'])assert.equal((await request(path)).status,404,path);
  assert.equal((await request('/%ZZ')).status,400);
  assert.equal((await request('/',{method:'POST'})).status,405);
  assert.equal((await request('/',{headers:{host:'attacker.example','x-forwarded-host':'www.wardogs-test.example'}})).status,403);
});
test('hosted accounts use private persistent files and fail closed without credentials',async t=>{
  const {request,data}=await fixture(t);
  const session=JSON.parse((await request('/api/session')).body);assert.equal(session.loginAvailable,false);assert.equal(session.payments.liveEnabled,false);assert.equal(session.reservedAccessConnected,false);
  assert.equal((await request('/auth/discord')).status,503);
  const billing=JSON.parse((await request('/api/billing/config')).body);assert.equal(billing.mode,'sandbox');assert.equal(billing.ready,false);assert.equal(billing.liveEnabled,false);
  assert.equal((await request('/api/billing/checkout',{method:'POST'})).status,401);
  assert.equal((await request('/api/paypal/webhook',{method:'POST'})).status,503);
  assert.ok(existsSync(resolve(data,'accounts.sqlite')));assert.ok(existsSync(resolve(data,'payments.sqlite')));
});
test('hosted startup refuses live payments, insecure origins and public database storage',()=>{
  for(const SITE_URL of ['http://www.wardogs-test.example','https://user:secret@wardogs-test.example','https://wardogs-test.example/path'])assert.throws(()=>createHostedServer({env:{SITE_URL}}),/HTTPS origin/);
  assert.throws(()=>createHostedServer({env:{PAYPAL_ENVIRONMENT:'live'}}),/Live payments are disabled/);
  assert.throws(()=>createHostedServer({env:{WARDOGS_DATA_DIR:resolve(root,'dist/private')}}),/outside the public/);
  assert.throws(()=>createHostedServer({env:{WARDOGS_DATA_DIR:'relative-folder'}}),/absolute/);
});

test('member sessions survive a hosted application restart',async t=>{
  const {request,data,restart}=await fixture(t);
  const token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
  const db=new DatabaseSync(resolve(data,'accounts.sqlite'));
  db.prepare('INSERT INTO members VALUES (?,?)').run('123456789','Persistent member');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash,'123456789',Date.now()+60000);db.close();
  const session=()=>request('/api/session',{headers:{cookie:'wd_session='+token}}).then(r=>JSON.parse(r.body));
  assert.equal((await session()).user.displayName,'Persistent member');await restart();assert.equal((await session()).user.displayName,'Persistent member');
});

test('Plesk startup entry starts and stops using an isolated hosting environment',async t=>{
  const data=mkdtempSync(resolve(tempRoot,'entry-'));
  const child=spawn(process.execPath,['app.cjs'],{cwd:root,env:{...process.env,SITE_URL:'https://www.wardogs-test.example',WARDOGS_DATA_DIR:data,PORT:'0',PAYPAL_ENVIRONMENT:'sandbox'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  const exited=once(child,'exit');
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill();await exited;}clean(data);});
  await new Promise((done,reject)=>{
    const timer=setTimeout(()=>reject(Error('Hosted entry did not start: '+stderr)),5000);
    child.stdout.on('data',chunk=>{if(String(chunk).includes('hosted site started')){clearTimeout(timer);done();}});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',()=>{clearTimeout(timer);reject(Error('Hosted entry exited early: '+stderr));});
  });
  assert.ok(existsSync(resolve(data,'accounts.sqlite')));assert.ok(existsSync(resolve(data,'payments.sqlite')));
});
