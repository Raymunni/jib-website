// A Jib "Visualise" screen for a guide ad, in the Nov 2026 look: the real
// Visualise screen from the phone (store_v2/raw/vis2.png, navy, blue glass
// tags, AI slider) with its photo swapped for a before and after pair (made
// in the Gemini app), the slider moved, the subtitle set to the space and
// the status bar's notification icons covered, as take-shots.mjs does.
//   node scripts/vis/make-vis-shot-v2.cjs <ad-id> <pair-id> <space> [slider 0..1]
// reads scripts/vis/<pair-id>-before.jpg and -after.jpg, writes
// public/images/jib/shots/<ad-id>.webp and scripts/vis/<ad-id>-shot.png
const sharp = require('C:/Users/Thomas/Downloads/jib_store_images/creative_assets/node_modules/sharp');
sharp.cache(false);

const SITE = 'C:/Users/Thomas/Downloads/jib_website/';
const TEMPLATE = 'C:/Users/Thomas/Downloads/jib_store_images/store_v2/raw/vis2.png';
const [id, pair, space, at = '0.5'] = process.argv.slice(2);
const BG = '#020d1c';
// Measured on vis2.png (1080x2400).
const X = 81, Y = 376, W = 918, H = 1646, R = 40;
const LINE_X0 = 566, LINE_X1 = 570, KNOB = { cx: 568, cy: 1198, r: 53 };
const CHIPS = [{ x: 113, y: 408, w: 132, h: 82 }, { x: 699, y: 408, w: 268, h: 82 }];

(async () => {
  const tpl = await sharp(TEMPLATE).png().toBuffer();
  const before = await sharp(`${SITE}scripts/vis/${pair}-before.jpg`).resize(W, H, { fit: 'cover' }).png().toBuffer();
  const after = await sharp(`${SITE}scripts/vis/${pair}-after.jpg`).resize(W, H, { fit: 'cover' }).png().toBuffer();
  const cut = Math.round(W * Number(at));
  const left = await sharp(before).extract({ left: 0, top: 0, width: cut, height: H }).png().toBuffer();
  let photo = await sharp(after).composite([{ input: left, left: 0, top: 0 }]).png().toBuffer();

  // Blue glass tags: the photo blurred under them, a navy tint, a Jib blue
  // ring, and the template's own white words lifted out by brightness.
  const tags = [];
  for (const c of CHIPS) {
    const lx = c.x - X, ly = c.y - Y;
    const blur = await sharp(photo).extract({ left: lx, top: ly, width: c.w, height: c.h }).blur(14).png().toBuffer();
    const words = await sharp(tpl).extract({ left: c.x + 6, top: c.y + 6, width: c.w - 12, height: c.h - 12 }).greyscale().linear(255 / 85, -170 * 255 / 85).toColourspace('b-w').raw().toBuffer();
    const white = await sharp({ create: { width: c.w - 12, height: c.h - 12, channels: 3, background: '#ffffff' } }).joinChannel(words, { raw: { width: c.w - 12, height: c.h - 12, channels: 1 } }).png().toBuffer();
    const shadow = await sharp(white).blur(3).linear([0, 0, 0, 0.55], [0, 0, 0, 0]).png().toBuffer().catch(() => null);
    const glass = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}">
      <rect x="1.5" y="1.5" width="${c.w - 3}" height="${c.h - 3}" rx="24" fill="#1e3250" fill-opacity="0.55" stroke="#72a2ec" stroke-width="3"/></svg>`);
    const clip = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}"><rect width="${c.w}" height="${c.h}" rx="25" fill="#fff"/></svg>`);
    let tag = await sharp(blur).ensureAlpha().composite([{ input: clip, blend: 'dest-in' }, { input: glass }]).png().toBuffer();
    tag = await sharp(tag).composite([...(shadow ? [{ input: shadow, left: 6, top: 7 }] : []), { input: white, left: 6, top: 6 }]).png().toBuffer();
    tags.push({ input: tag, left: lx, top: ly });
  }
  photo = await sharp(photo).composite(tags).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${R}" fill="#fff"/></svg>`);
  photo = await sharp(photo).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

  // The app's own AI slider line and knob, moved to the cut.
  const line = await sharp(tpl).extract({ left: LINE_X0, top: Y, width: LINE_X1 - LINE_X0 + 1, height: H }).png().toBuffer();
  const d = KNOB.r * 2 + 2;
  const knobMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${KNOB.r - 1.5}" fill="#fff"/></svg>`);
  const knob = await sharp(tpl).extract({ left: KNOB.cx - d / 2, top: KNOB.cy - d / 2, width: d, height: d }).ensureAlpha().composite([{ input: knobMask, blend: 'dest-in' }]).png().toBuffer();
  const nx = X + cut;

  // Status bar: cover the notification icons with the empty strip right of
  // the camera; subtitle: the space, as the app writes it for a space preview.
  const strip = await sharp(tpl).extract({ left: 575, top: 0, width: 215, height: 108 }).png().toBuffer();
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sub = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="120">
    <rect width="1080" height="120" fill="${BG}"/>
    <text x="540" y="64" text-anchor="middle" font-family="Roboto, 'Segoe UI', Arial, sans-serif" font-size="33" letter-spacing="0.6" fill="#b1b5ba">${esc(space)}, 1 job done</text></svg>`);
  const plate = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W + 8}" height="${H + 8}"><rect width="${W + 8}" height="${H + 8}" fill="${BG}"/></svg>`);

  const out = await sharp(tpl).composite([
    { input: strip, left: 205, top: 0 },
    { input: sub, left: 0, top: 255 },
    { input: plate, left: X - 4, top: Y - 4 },
    { input: photo, left: X, top: Y },
    { input: line, left: nx - 2, top: Y },
    { input: knob, left: Math.round(nx - d / 2), top: KNOB.cy - d / 2 },
  ]).png().toBuffer();
  await sharp(out).resize(540, 1200).webp({ quality: 88 }).toFile(`${SITE}public/images/jib/shots/${id}.webp`);
  await sharp(out).resize(540).png().toFile(`${SITE}scripts/vis/${id}-shot.png`);
  console.log('ok', id);
})();
