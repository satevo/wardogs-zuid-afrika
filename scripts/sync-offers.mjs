import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../dist/',import.meta.url);
const json=readFileSync(new URL('offers.json',root),'utf8');
JSON.parse(json);
writeFileSync(new URL('offers.js',root),'// Generated from offers.json by scripts/sync-offers.mjs.\nwindow.WARDOGS_OFFERS = '+json.trim()+';\n');
console.log('Browser donation offers updated.');
