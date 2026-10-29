// Body text for the Visualise ads, so the words match the before and after
// on the phone. Inline ads: the AppCta text; end ads: the cta frontmatter.
//   node scripts/vis/vis-text.cjs
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/Thomas/Downloads/jib_website/src/content/guides/';
const text = {
  'deck-joists-end': 'Photograph the spot in Jib and see the deck finished before you start, then get every joist, bearer and board sized for it.',
  'deck-list-inline': 'Snap where the deck is going and Jib shows it finished, then sizes this list to your deck and checks it against the tools you own.',
  'garden-bed-end': 'Snap the spot in Jib and see the bed built and growing, then get the sleepers, fixings and soil for that size on one list.',
  'pavers-end': 'Photograph the area in Jib and see the patio laid before you start, then get the road base, sand and pavers for your size.',
  'tile-floor-end': 'Snap your bathroom in Jib and see the new tiles down first, then get the tiles, adhesive and grout for your room on one list.',
  'paint-own-house-end': 'Snap a room in Jib and see it in the new colour before you buy a tin, with the paint, the prep and the time worked out.',
  'before-after-inline': 'Snap the job to add it and Jib can picture the after straight away. Tick it off, and your real before and after sit side by side.',
  'before-after-end': 'Snap the before and Jib pictures how it could look done. Finish the job and your real after joins it on the timeline.',
  'photo-plan-end': 'Snap the job that has been bugging you. Jib writes the whole plan and shows you how it looks done, in seconds.',
  'pre-sale-end': 'Photograph each room before you list. Jib shows how each refresh could look, with costs, so you only spend where it counts.',
  'deck-nsw-end': 'Photograph the spot in Jib and see the deck finished before you start, with the plan, the materials list and a cost range.',
  'plasterboard-end': 'Photograph the hole in Jib and see the wall patched and painted, with the right repair, materials and tools for it.',
  'quote-brief-inline': 'Tap Write a quote request on any tradie job and Jib writes the brief, photos attached.',
  'quote-brief-end': 'Mark a job as tradie, tap Write a quote request, and Jib writes a brief you can share with every tradie, photos attached.',
  'power-point-inline': 'Snap the power point and Jib flags it as licensed electrical work where you live, then writes the quote request for your sparky.',
  'mould-end': 'Photograph the mould in Jib and see the ceiling clean again, with the fix planned and a reminder so it stays gone.',
};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.mdx') ? [path.join(d, e.name)] : []);
let n = 0;
for (const f of walk(ROOT)) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [id, t] of Object.entries(text)) {
    // Inline: the AppCta whose shot is this ad's.
    s = s.replace(new RegExp(`(<AppCta[^>]*?text=")[^"]*("[^>]*shot="/images/jib/shots/${id}\\.webp")`), (m, a, b) => { n++; return a + t + b; });
    // End: the frontmatter cta, when ctaShot is this ad's.
    if (s.includes(`ctaShot: /images/jib/shots/${id}.webp`)) s = s.replace(/^cta: .*$/m, () => { n++; return 'cta: "' + t + '"'; });
  }
  if (s !== before) fs.writeFileSync(f, s);
}
console.log('rewrote', n, 'of', Object.keys(text).length);
