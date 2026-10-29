// An ad screenshot from a frame of a real screen recording (the app tips
// recordings), with the status bar's notification icons replaced by a clean
// bar. Writes public/images/jib/shots/<ad-id>.webp.
//   node scripts/vis/grab-shot.cjs <ad-id> <recording.mp4> <seconds>
const { execFileSync } = require('child_process');
const sharp = require('C:/Users/Thomas/Downloads/jib_store_images/creative_assets/node_modules/sharp');
const { statusBar } = require('C:/Users/Thomas/Downloads/jib_store_images/store_v2/make-store.cjs');
const FF = 'C:/Users/Thomas/Downloads/jib_store_images/creative_assets/node_modules/ffmpeg-static/ffmpeg.exe';
const [id, video, t] = process.argv.slice(2);
(async () => {
  const png = execFileSync(FF, ['-loglevel', 'error', '-ss', t, '-i', video, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 64 << 20 });
  const { data } = await sharp(png).resize(1080, 2400, { fit: 'fill' }).extract({ left: 540, top: 20, width: 2, height: 2 }).raw().toBuffer({ resolveWithObject: true });
  const bg = `rgb(${data[0]},${data[1]},${data[2]})`;
  const bar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400"><rect width="1080" height="128" fill="${bg}"/>${statusBar(1080, 128, 'iphone')}</svg>`);
  const frame = await sharp(png).resize(1080, 2400, { fit: 'fill' }).png().toBuffer();
  const done = await sharp(frame).composite([{ input: bar }]).png().toBuffer();
  await sharp(done).resize(540, 1200).webp({ quality: 86 }).toFile(`C:/Users/Thomas/Downloads/jib_website/public/images/jib/shots/${id}.webp`);
  console.log('ok', id);
})();
