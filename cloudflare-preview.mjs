import {spawn,execFileSync} from 'node:child_process';
import {existsSync,writeFileSync,mkdirSync,watchFile,unwatchFile} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const executable=existsSync(resolve(root,'.local/cloudflared.exe'))?resolve(root,'.local/cloudflared.exe'):'cloudflared';
let app,publicUrl,stopping=false,initializing=false,reloading=false;
const watched=['.env','.local/paypal-sandbox.json'].map(file=>resolve(root,file));
const tunnel=spawn(executable,['tunnel','--url','http://127.0.0.1:1026','--no-autoupdate'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
const timeout=setTimeout(()=>{console.error('The test tunnel did not become ready. Check Cloudflare connectivity.');shutdown(1);},60000);
async function initialize(url){
  initializing=true;
  try{
    execFileSync(process.execPath,['stop-local.mjs'],{cwd:root,stdio:'pipe'});
    // Override only the public origin for the child, never copy secrets into logs.
    app=spawn(process.execPath,['local-server.mjs'],{cwd:root,env:{...process.env,WARDOGS_SITE_URL:url},windowsHide:true,stdio:['ignore','pipe','pipe']});
    app.stderr.on('data',d=>process.stderr.write(d));
    for(let i=0;i<30;i++){
      if(stopping)return;
      try{const r=await fetch('http://127.0.0.1:1026/__local/health',{signal:AbortSignal.timeout(1000)});if(r.ok)break;}catch{}
      await new Promise(r=>setTimeout(r,150));
    }
    const response=await fetch('http://127.0.0.1:1026/',{headers:{host:new URL(url).host},signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error('The local website did not start correctly.');
    publicUrl=url;mkdirSync(resolve(root,'.local'),{recursive:true});writeFileSync(resolve(root,'.local/cloudflare-preview.json'),JSON.stringify({url,started:new Date().toISOString()}));
    for(const file of watched)watchFile(file,{interval:1000},async(current,previous)=>{if(current.mtimeMs===previous.mtimeMs||reloading||stopping)return;reloading=true;try{execFileSync(process.execPath,['stop-local.mjs'],{cwd:root,stdio:'pipe'});app=spawn(process.execPath,['local-server.mjs'],{cwd:root,env:{...process.env,WARDOGS_SITE_URL:url},windowsHide:true,stdio:['ignore','ignore','pipe']});app.stderr.on('data',d=>process.stderr.write(d));console.log('Wardogs restarted after local configuration changed.');}catch{console.error('Could not restart Wardogs. Restart the preview launcher.');}finally{reloading=false;}});
    clearTimeout(timeout);
    console.log(`\nCloudflare SANDBOX preview: ${url}\n\nAnyone with this link can view the site. No live payments are enabled.\nKeep this window and computer running. Ctrl+C stops the tunnel and website.\n\nDiscord redirect: ${url}/auth/discord/callback\nPayPal webhook: ${url}/api/paypal/webhook\n\nAfter saving sandbox credentials in .env, run:\n  node setup-paypal.mjs --site-url ${url}\nThen restart the website using the steps in SETUP-PAYMENTS.md.\n`);
  }catch(error){console.error(error.message);shutdown(1);}
}
const output=chunk=>{const text=chunk.toString();if(!initializing){const match=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match)initialize(match[0]);}};
tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);
tunnel.on('error',()=>{console.error('cloudflared was not found. Install it from Cloudflare’s official downloads page, or place cloudflared.exe in .local/.');shutdown(1);});
tunnel.on('exit',code=>{if(!stopping){console.error('Cloudflare tunnel stopped.');shutdown(code||0);}});
function shutdown(code=0){if(stopping)return;stopping=true;clearTimeout(timeout);for(const file of watched)unwatchFile(file);tunnel.kill();if(app){try{execFileSync(process.execPath,['stop-local.mjs'],{cwd:root,stdio:'pipe'});}catch{}app.kill();}if(publicUrl)writeFileSync(resolve(root,'.local/cloudflare-preview.json'),JSON.stringify({url:publicUrl,stopped:new Date().toISOString()}));setTimeout(()=>process.exit(code),500).unref();}
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
