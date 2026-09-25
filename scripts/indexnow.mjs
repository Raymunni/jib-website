// Tells IndexNow-enabled search engines (Bing, which also feeds ChatGPT
// search, DuckDuckGo and Copilot; Yandex; Seznam) about every URL in the
// live sitemap. Runs in CI after each deploy (see deploy.yml), or by hand:
// `node scripts/indexnow.mjs`.
import { readdirSync } from 'node:fs';

const HOST = 'jibapp.xyz';
const keyFile = readdirSync('public').find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('No IndexNow key file in public/');
const key = keyFile.replace('.txt', '');

// The live sitemap, so this works in CI after deploy without a local build.
const sitemap = await (await fetch(`https://${HOST}/sitemap-0.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);
