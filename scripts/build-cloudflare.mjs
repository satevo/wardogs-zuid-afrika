import {mkdir,copyFile,readdir,writeFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'dist-cloudflare');
await mkdir(output,{recursive:true});
// Copy only the explicit browser assets, never the repository or local configuration.
const assets=['index.html','styles.css','content.js','app.js','billing.js','offers.js','offers.json','mark.svg'];
for(const name of assets)await copyFile(resolve(root,'dist',name),resolve(output,name));
await copyFile(resolve(root,'cloudflare/pages-worker.mjs'),resolve(output,'_worker.js'));
await writeFile(resolve(output,'_routes.json'),JSON.stringify({version:1,include:['/api/*','/auth/*','/__local/*'],exclude:[]},null,2));
await writeFile(resolve(output,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — Wardogs Zuid Afrika</title><link rel="stylesheet" href="/styles.css"><main class="section"><p class="eyebrow">WARDOGS ZUID AFRIKA</p><h1>This page is off the map.</h1><p>The page could not be found.</p><a class="button primary" href="/">Return home ↗</a></main></html>');
await writeFile(resolve(output,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n/*.js\n  Cache-Control: no-cache\n/styles.css\n  Cache-Control: no-cache\n/offers.json\n  Cache-Control: no-cache\n');
const allowed=new Set([...assets,'_worker.js','_routes.json','404.html','_headers']);
for(const name of await readdir(output))if(!allowed.has(name)||!(await stat(resolve(output,name))).isFile())throw Error('Unexpected file in Cloudflare output. Review it before deployment.');
console.log('Cloudflare Pages build ready: dist-cloudflare (public browser assets only; account and payment services stay unconfigured).');
