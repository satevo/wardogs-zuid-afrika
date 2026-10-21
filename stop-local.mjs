import {readFile} from 'node:fs/promises';
const file=new URL('./.local/runtime.json',import.meta.url);
try{
  const runtime=JSON.parse(await readFile(file,'utf8'));
  if(runtime.app!=='wardogs-zuid-afrika-local'||runtime.port!==1026)throw Error('Invalid local server information.');
  const response=await fetch('http://127.0.0.1:1026/__local/stop',{method:'POST',headers:{'X-Wardogs-Local-Token':runtime.token},signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw Error('The local server did not accept the shutdown request.');
  console.log(await response.text());
}catch(error){if(error.code==='ENOENT'||error.cause?.code==='ECONNREFUSED')console.log('Wardogs is not running.');else{console.error(error.message);process.exitCode=1;}}
