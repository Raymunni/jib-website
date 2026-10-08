// Puts a real Jib screen, in a phone frame, into a guide's hero photo, so a
// hero that shows the app shows the actual app (never a drawn one).
// The frame is drawn as vectors at 3x and scaled down, so its edges stay
// clean under magnification.
// Usage: node scripts/compose-hero.mjs <photo.jpg> <shot id> <out name> [--left]
//   photo: a Gemini download already filed in public/images/blog/
//   shot:  an ad screen id from public/images/jib/shots/<id>.webp
import sharp from 'sharp';

const [photo, shotId, outName] = process.argv.slice(2);
const left = process.argv.includes('--left');
if (!outName) throw new Error('usage: compose-hero.mjs <photo.jpg> <shot id> <out name> [--left]');

const W = 1376;
const H = 768;
const S = 3; // supersampling for the frame's edges
const phoneH = Math.round(H * 0.86);
const phoneW = Math.round((phoneH * 9) / 20) + 12;
const bezel = 9;
const r = 44;
const x = left ? 70 : W - phoneW - 70;
const y = Math.round((H - phoneH) / 2);

const base = await sharp(`public/images/blog/${photo}`).resize(W, H, { fit: 'cover' }).toBuffer();

// Shadow under the phone.
const shadow = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${x + 6}" y="${y + 14}" width="${phoneW}" height="${phoneH}" rx="${r}" fill="#000" fill-opacity="0.45"/></svg>`,
  ),
)
  .blur(18)
  .png()
  .toBuffer();

// The frame, drawn big and scaled down.
const frame = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${phoneW * S}" height="${phoneH * S}">
      <rect x="0" y="0" width="${phoneW * S}" height="${phoneH * S}" rx="${r * S}" fill="#0d0f12"/>
      <rect x="${1.5 * S}" y="${1.5 * S}" width="${(phoneW - 3) * S}" height="${(phoneH - 3) * S}" rx="${(r - 1.5) * S}" fill="none" stroke="#3a3f47" stroke-width="${1.2 * S}"/>
    </svg>`,
  ),
)
  .resize(phoneW, phoneH)
  .png()
  .toBuffer();

// The screen, with rounded corners cut by an antialiased mask.
const sw = phoneW - bezel * 2;
const sh = phoneH - bezel * 2;
const sr = r - bezel;
const mask = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sw * S}" height="${sh * S}"><rect width="${sw * S}" height="${sh * S}" rx="${sr * S}" fill="#fff"/></svg>`,
  ),
)
  .resize(sw, sh)
  .png()
  .toBuffer();
const screen = await sharp(`public/images/jib/shots/${shotId}.webp`)
  .resize(sw, sh, { fit: 'cover', position: 'top' })
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const info = await sharp(base)
  .composite([
    { input: shadow, left: 0, top: 0 },
    { input: frame, left: x, top: y },
    { input: screen, left: x + bezel, top: y + bezel },
  ])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(`public/images/blog/${outName}.jpg`);
console.log(`public/images/blog/${outName}.jpg (${info.size} bytes)`);
