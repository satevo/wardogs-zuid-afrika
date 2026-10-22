import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('hex');
const cookieValue=(req,name)=>{const part=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));return part?.slice(name.length+1)||'';};
export function createAccounts({database,siteUrl,clientId='',clientSecret='',request=fetch,now=()=>Date.now(),paymentStatus=()=>({mode:'disconnected',currency:'USD',ready:false})}){
  if(database!==':memory:')mkdirSync(dirname(database),{recursive:true});
  const origin=new URL(siteUrl).origin;
  if(new URL(origin).protocol!=='https:'&&!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Accounts require HTTPS outside localhost.');
  const secure=origin.startsWith('https:');
  const db=new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS members(discord_id TEXT PRIMARY KEY, display_name TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, expires INTEGER NOT NULL);`);
  const enabled=Boolean(clientId&&clientSecret);
  const cookie=(name,value,maxAge)=>`${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
  const clean=()=>{db.prepare('DELETE FROM sessions WHERE expires < ?').run(now());db.prepare('DELETE FROM oauth_states WHERE expires < ?').run(now());};
  const user=req=>{const session=cookieValue(req,'wd_session');if(!/^[a-f0-9]{64}$/.test(session))return null;return db.prepare('SELECT m.discord_id AS discordId,m.display_name AS displayName FROM sessions s JOIN members m ON m.discord_id=s.discord_id WHERE s.token_hash=? AND s.expires>?').get(hash(session),now())||null;};
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  const redirect=(res,path)=>{res.writeHead(302,{'Location':path,'Cache-Control':'no-store'});res.end();};
  async function handle(req,res,path){
    if(!['/api/session','/auth/discord','/auth/discord/callback','/api/logout'].includes(path))return false;
    clean();
    if(path==='/api/session'&&req.method==='GET'){json(res,200,{user:user(req),loginAvailable:enabled,payments:paymentStatus(),reservedAccessConnected:false});return true;}
    if(path==='/api/logout'&&req.method==='POST'){
      if(req.headers.origin!==origin||req.headers['content-type']!=='application/json'){json(res,403,{error:'Request not allowed.'});return true;}
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(cookieValue(req,'wd_session')));
      res.setHeader('Set-Cookie',cookie('wd_session','',0));json(res,200,{ok:true});return true;
    }
    if(!enabled){json(res,503,{error:'Discord sign-in has not been configured yet.'});return true;}
    if(req.method!=='GET'){json(res,405,{error:'Method not allowed.'});return true;}
    if(path==='/auth/discord'){
      const state=secret(),browser=secret();
      db.prepare('INSERT INTO oauth_states VALUES (?,?,?)').run(hash(state),hash(browser),now()+600000);
      res.setHeader('Set-Cookie',cookie('wd_oauth',browser,600));
      const params=new URLSearchParams({client_id:clientId,response_type:'code',scope:'identify',redirect_uri:origin+'/auth/discord/callback',state});
      redirect(res,'https://discord.com/oauth2/authorize?'+params);return true;
    }
    if(path==='/auth/discord/callback'){
      const url=new URL(req.url,origin),state=url.searchParams.get('state')||'',browser=cookieValue(req,'wd_oauth');
      const saved=db.prepare('SELECT * FROM oauth_states WHERE state_hash=? AND browser_hash=? AND expires>?').get(hash(state),hash(browser),now());
      if(!saved||!url.searchParams.get('code')||(url.searchParams.has('iss')&&url.searchParams.get('iss')!=='https://discord.com')){json(res,400,{error:'Sign-in expired or could not be verified. Please start again.'});return true;}
      db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(hash(state));
      try{
        const response=await request('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:origin+'/auth/discord/callback'}),signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error('OAuth failed');
        const tokens=await response.json();if(typeof tokens.access_token!=='string')throw Error('No access token');
        const profileResponse=await request('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(10000)});
        if(!profileResponse.ok)throw Error('Profile failed');
        const profile=await profileResponse.json();
        if(!/^\d{1,25}$/.test(profile.id)||typeof profile.username!=='string')throw Error('Invalid profile');
        const displayName=String(profile.global_name||profile.username).slice(0,100);
        db.prepare('INSERT INTO members VALUES (?,?) ON CONFLICT(discord_id) DO UPDATE SET display_name=excluded.display_name').run(profile.id,displayName);
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(cookieValue(req,'wd_session')));
        const session=secret();db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(session),profile.id,now()+7*86400000);
        // OAuth access tokens are used only for this request and are never persisted.
        res.setHeader('Set-Cookie',[cookie('wd_session',session,7*86400),cookie('wd_oauth','',0)]);
        redirect(res,'/#account');
      }catch{res.setHeader('Set-Cookie',cookie('wd_oauth','',0));redirect(res,'/?login=failed#account');}
      return true;
    }
    json(res,405,{error:'Method not allowed.'});return true;
  }
  return {handle,user,close:()=>db.close()};
}
