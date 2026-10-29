// A Jib "Visualise" screen for a guide ad, from a before and after photo
// pair (896x1200, made in the Gemini app): the real Visualise screen from the
// phone (raw/vis2.png) with its photo swapped for the pair, the slider part
// way across, a clean status bar and the space's name. Writes the ad's
// screenshot (540x1200 webp) where apply-ads expects it.
//   node make-vis-shot.cjs <ad-id> <space name> [slider 0..1]
// reads jib_website/scripts/vis/<ad-id>-before.jpg and -after.jpg
const CA = 'C:/Users/Thomas/Downloads/jib_store_images/creative_assets/';
const sharp = require(CA + 'node_modules/sharp');
const { P, statusBar } = require('./make-store.cjs');
sharp.cache(false);

const SITE = 'C:/Users/Thomas/Downloads/jib_website/';
const [id, space, at = '0.42'] = process.argv.slice(2);
const BG = '#121c2b';
const F = "font-family=\"Segoe UI, Roboto, Arial, sans-serif\"";

(async () => {
  const X = 48, Y = 584, W = 984, H = 1318, R = 34;
  const before = await sharp(`${SITE}scripts/vis/${id}-before.jpg`).resize(W, H, { fit: 'cover' }).png().toBuffer();
  const after = await sharp(`${SITE}scripts/vis/${id}-after.jpg`).resize(W, H, { fit: 'cover' }).png().toBuffer();
  const cut = Math.round(W * Number(at));
  // Before on the left of the slider, the AI picture on the right.
  const left = await sharp(before).extract({ left: 0, top: 0, width: cut, height: H }).png().toBuffer();
  let photo = await sharp(after).composite([{ input: left, left: 0, top: 0 }]).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${R}" fill="#fff"/></svg>`);
  photo = await sharp(photo).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

  const chipW = (label, icon) => label.length * 18 + (icon ? 80 : 44);
  const chip = (x, y, label, icon) => {
    const w = chipW(label, icon);
    return `<rect x="${x}" y="${y}" width="${w}" height="64" rx="16" fill="#1c2430" fill-opacity="0.72"/>
      ${icon ? `<path transform="translate(${x + 32} ${y + 32}) scale(0.9)" d="M0 -12 C1.3 -3.5 3.5 -1.3 12 0 C3.5 1.3 1.3 3.5 0 12 C-1.3 3.5 -3.5 1.3 -12 0 C-3.5 -1.3 -1.3 -3.5 0 -12Z" fill="#fff"/>` : ''}
      <text x="${x + (icon ? 56 : 22)}" y="${y + 42}" ${F} font-size="30" font-weight="700" fill="#fff">${label}</text>`;
  };
  const lx = X + cut, hy = Y + Math.round(H * 0.47);
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400"><defs>
    <linearGradient id="ln" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b6ff0"/><stop offset="0.5" stop-color="#8b4fe0"/><stop offset="1" stop-color="#e2569c"/></linearGradient>
    <linearGradient id="hd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5cf0"/><stop offset="1" stop-color="#e2569c"/></linearGradient></defs>
    <rect x="0" y="0" width="1080" height="150" fill="${BG}"/>
    <rect x="0" y="290" width="1080" height="160" fill="${BG}"/>
    <text x="540" y="332" text-anchor="middle" ${F} font-size="34" fill="#c3cbd6">${space}, 1 job planned</text>
    ${chip(X + 32, Y + 34, 'Now')}
    ${chip(X + W - 32 - chipW('AI preview', true), Y + 34, 'AI preview', true)}
    <rect x="${lx - 3}" y="${Y}" width="6" height="${H}" fill="url(#ln)"/>
    <circle cx="${lx}" cy="${hy}" r="52" fill="url(#hd)"/>
    ${[-1, 0, 1].map((r) => [-1, 1].map((c) => `<circle cx="${lx + c * 10}" cy="${hy + r * 13}" r="4.5" fill="#fff"/>`).join('')).join('')}
    ${statusBar(1080, 128, 'iphone')}</svg>`);
  // The template's own photo goes first so its rounded corners and shadow stay.
  const out = await sharp(P('raw', 'vis2.png')).composite([{ input: photo, left: X, top: Y }, { input: over }]).png().toBuffer();
  await sharp(out).resize(540, 1200).webp({ quality: 86 }).toFile(`${SITE}public/images/jib/shots/${id}.webp`);
  await sharp(out).resize(540).png().toFile(`${SITE}scripts/vis/${id}-shot.png`);
  console.log('ok', id);
})();
