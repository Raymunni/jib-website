// A plain-text map of the site for AI assistants and answer engines
// (the llms.txt convention): what Jib is, and every guide and tool.
import { getCollection } from 'astro:content';
import { SITE, HUBS, type HubKey } from '../config';
import { guideUrl } from '../lib/guides';

export async function GET() {
  const guides = await getCollection('guides');
  const lines = [
    '# Jib',
    '',
    `> ${SITE.description}`,
    '',
    'Jib is a home-improvement planner app for iPhone and Android. Photograph a home job and it drafts the steps, materials list, tools (checked against your AI Toolbox) and a cost range, and flags each job DIY safe or tradie required based on the licensing rules where the house is. It also tracks jobs by room, reminds you about recurring maintenance, and keeps before-and-after photos.',
    '',
    'Every guide on this site cites the regulator, standard or manufacturer it is based on and shows the date its rules were last checked.',
    '',
    '## Tools',
    `- [DIY legality checker](${SITE.url}/tools/diy-legality-checker/): whether a job is legal to DIY in each Australian state`,
    `- [Bathroom floor calculator](${SITE.url}/tools/bathroom-floor-calculator/): tiles, adhesive, grout and waterproofing quantities`,
    `- [Unit converter](${SITE.url}/tools/unit-converter/): inches to cm/mm (incl. fractions), area, volume, weight, temperature`,
    `- [Paint calculator](${SITE.url}/tools/paint-calculator/): litres of paint and tins for a room`,
    `- [Concrete calculator](${SITE.url}/tools/concrete-calculator/): m³ and 20 kg bags for slabs, footings and post holes`,
    `- [Soil, mulch & gravel calculator](${SITE.url}/tools/soil-mulch-gravel-calculator/): m³, tonnes and bags`,
    `- [Fence calculator](${SITE.url}/tools/fence-calculator/): palings, rails, posts and concrete`,
    `- [Wall tile calculator](${SITE.url}/tools/wall-tile-calculator/): tiles, adhesive, grout and trim for walls and splashbacks`,
    `- [Plasterboard calculator](${SITE.url}/tools/plasterboard-calculator/): plasterboard sheets, screws, tape and cornice`,
    `- [Decking calculator](${SITE.url}/tools/decking-calculator/): decking boards, joists and screws`,
    `- [Stair calculator](${SITE.url}/tools/stair-calculator/): risers, goings and stringer length checked against the NCC`,
    `- [Roof pitch calculator](${SITE.url}/tools/roof-pitch-calculator/): degrees, ratio and percent, rafter length and roof area`,
    `- [Home maintenance planner](${SITE.url}/guides/home-maintenance/): a personalised maintenance schedule`,
    '',
  ];
  for (const key of Object.keys(HUBS) as HubKey[]) {
    const items = guides.filter((g) => g.data.hub === key).sort((a, b) => Number(b.data.pillar) - Number(a.data.pillar) || a.data.order - b.data.order);
    if (!items.length) continue;
    lines.push(`## ${HUBS[key].title}`);
    for (const g of items) lines.push(`- [${g.data.title}](${SITE.url}${guideUrl(g)}): ${g.data.description}`);
    lines.push('');
  }
  lines.push('## Get the app', `- [Jib for iPhone and Android](${SITE.url}/app/)`, '');
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
