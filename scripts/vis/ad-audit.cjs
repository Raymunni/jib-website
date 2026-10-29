// Contact sheets of every guide ad: the phone screenshot beside its headline
// and text, so each one can be checked against what it promises.
//   node scripts/vis/ad-audit.cjs   -> scripts/vis/audit/sheet-N.jpg + ads.json
const fs = require('fs');
const path = require('path');
const sharp = require('C:/Users/Thomas/Downloads/jib_store_images/creative_assets/node_modules/sharp');
const ROOT = 'C:/Users/Thomas/Downloads/jib_website/';
const OUT = ROOT + 'scripts/vis/audit/';
fs.mkdirSync(OUT, { recursive: true });

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.mdx') ? [path.join(d, e.name)] : []);
const ads = [];
for (const f of walk(ROOT + 'src/content/guides')) {
  const s = fs.readFileSync(f, 'utf8');
  const guide = path.relative(ROOT + 'src/content/guides', f).replace(/\\/g, '/').replace('.mdx', '');
  for (const m of s.matchAll(/<AppCta[^>]*>/g)) {
    const a = (k) => (m[0].match(new RegExp(k + '="([^"]*)"')) || [])[1] || '';
    if (a('shot')) ads.push({ guide, id: path.basename(a('shot'), '.webp'), headline: a('headline'), text: a('text') });
  }
  const fm = (k) => (s.match(new RegExp('^' + k + ': "?(.*?)"?$', 'm')) || [])[1] || '';
  if (fm('ctaShot')) ads.push({ guide, id: path.basename(fm('ctaShot'), '.webp'), headline: fm('ctaHeadline'), text: fm('cta') });
}
fs.writeFileSync(OUT + 'ads.json', JSON.stringify(ads, null, 1));
const esc = (t) => t.replace(/&quot;/g, '"').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const wrap = (t, n) => { const w = t.split(' '), r = []; let c = ''; for (const x of w) { if ((c + ' ' + x).length > n) { r.push(c); c = x; } else c = c ? c + ' ' + x : x; } if (c) r.push(c); return r; };
(async () => {
  const per = 12, cw = 500, ch = 300;
  for (let p = 0; p * per < ads.length; p++) {
    const page = ads.slice(p * per, p * per + per);
    const comp = [];
    for (const [i, ad] of page.entries()) {
      const x = (i % 3) * cw, y = Math.floor(i / 3) * ch;
      const shot = ROOT + 'public/images/jib/shots/' + ad.id + '.webp';
      if (fs.existsSync(shot)) comp.push({ input: await sharp(shot).resize({ height: ch - 10 }).png().toBuffer(), left: x + 5, top: y + 5 });
      const lines = [`${p * per + i + 1}. ${ad.id}`, ...wrap(ad.headline, 30).map((l) => '#' + l), ...wrap(ad.text, 34)].slice(0, 13);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw - 150}" height="${ch}">${lines.map((l, j) => `<text x="4" y="${20 + j * 21}" font-family="Arial" font-size="${j === 0 ? 13 : 15}" font-weight="${l[0] === '#' || j === 0 ? 700 : 400}" fill="${j === 0 ? '#c00' : '#111'}">${esc(l.replace(/^#/, ''))}</text>`).join('')}</svg>`;
      comp.push({ input: Buffer.from(svg), left: x + 145, top: y });
    }
    await sharp({ create: { width: cw * 3, height: ch * 4, channels: 3, background: '#fff' } }).composite(comp).jpeg({ quality: 80 }).toFile(OUT + `sheet-${p + 1}.jpg`);
  }
  console.log(ads.length, 'ads,', Math.ceil(ads.length / per), 'sheets');
})();
