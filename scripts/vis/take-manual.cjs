// Ad screens captured by hand on the Pixel (screens ad_shots can't reach:
// the tradie sheet, quote request, inventory, a space plan), filed in
// jib_jobs/test/ad_shots/manual/<ad-id>.png. Covers the status bar's
// notification icons the same way take-shots.mjs does and writes
// public/images/jib/shots/<ad-id>.webp.
//   node scripts/vis/take-manual.cjs [ad-id ...]   (no ids: all of them)
const fs = require('fs');
const sharp = require('C:/Users/Thomas/Downloads/jib_website/node_modules/sharp');
const DIR = 'C:/Users/Thomas/Downloads/jib_jobs/test/ad_shots/manual/';
const OUT = 'C:/Users/Thomas/Downloads/jib_website/public/images/jib/shots/';
const ids = process.argv.slice(2);
(async () => {
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.png'))) {
    const id = f.replace('.png', '');
    if (ids.length && !ids.includes(id)) continue;
    const src = await sharp(DIR + f).resize(1080, 2400, { fit: 'cover', position: 'top' }).png().toBuffer();
    const patch = await sharp(src).extract({ left: 575, top: 0, width: 215, height: 108 }).toBuffer();
    const done = await sharp(src).composite([{ input: patch, left: 205, top: 0 }]).png().toBuffer();
    const info = await sharp(done).resize(540, 1200).webp({ quality: 88 }).toFile(OUT + id + '.webp');
    console.log(id, info.size);
  }
})();
