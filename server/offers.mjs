import {readFileSync} from 'node:fs';
export const CATALOG=JSON.parse(readFileSync(new URL('../dist/offers.json',import.meta.url),'utf8'));
export const TIERS=Object.fromEntries(CATALOG.offers.flatMap(offer=>CATALOG.periods.map(months=>[`${offer.id}-${months}m`,{...offer,offerId:offer.id,months,amount:offer.prices[months]}])));
export const getTier=id=>Object.hasOwn(TIERS,id)?TIERS[id]:undefined;
export const billingLabel=months=>months===1?'month':`${months} months`;
