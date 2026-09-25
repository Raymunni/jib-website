// Sample data for /web/?demo — lets the web app be tried (and tested)
// without an account. Nothing here is ever written anywhere.
import type { UserDoc } from './app';

const IMG = 'https://jibapp.xyz/images/blog';
const day = 86400000;

export function demoData(): UserDoc {
  const t = Date.now();
  const item = (name: string, retailer = '', bought = false) => ({ item: name, retailer, url: '', options: [], bought });
  const base = {
    timeEstimate: '', difficulty: 'moderate', tradeReason: null, directions: [] as string[], criticalFlags: [] as string[],
    verdict: null as string | null, verdictReason: null as string | null, photoPath: null as string | null, afterPhotoPath: null,
    priority: false, recurrence: '', lastDone: null, completedAt: null, reminderAt: null, reminderRecurrence: '',
    extraPhotos: [] as string[], thread: [], costLow: null as number | null, costHigh: null as number | null, costNote: null as string | null,
    aiQuickAdded: false, shoppingList: [] as ReturnType<typeof item>[], tools: [] as { name: string; owned: boolean; toBuy: boolean }[],
    status: 'not_started' as const, description: '',
  };
  return {
    currencyCode: 'AUD',
    premium: true,
    tier: 'homeFlipper',
    updatedAt: t,
    activeHouseId: 'demo1',
    houses: [
      {
        id: 'demo1',
        name: 'Paddington Queenslander',
        suburb: { name: 'Paddington', state: 'QLD', postcode: '4064' },
        rooms: [
          { id: 'r1', name: 'Kitchen' },
          { id: 'r2', name: 'Bathroom' },
          { id: 'r3', name: 'Garage' },
          { id: 'r4', name: 'Backyard' },
        ],
        inventory: ['Cordless drill', 'Spirit level', 'Claw hammer', 'Tape measure', 'Stud finder', 'Caulking gun', 'Step ladder', 'Utility knife'].map(
          (name, i) => ({ id: `i${i}`, name, createdAt: t - i * day }),
        ),
        extraShopping: [item('Sugar soap', 'Bunnings')],
        galleryPhotos: [
          { id: 'g1', roomId: 'r3', photoPath: `${IMG}/toolbox-garage-scan.jpg`, note: 'Garage wall scan', createdAt: t - 2 * day },
          { id: 'g2', roomId: 'r1', photoPath: `${IMG}/diy-or-tradie-flag.jpg`, note: 'Power point before', createdAt: t - 5 * day },
        ],
        jobs: [
          {
            ...base,
            id: 'j1',
            roomId: 'r1',
            title: 'Swap the splashback power point for a USB one',
            description: 'Double GPO next to the kettle is cracked. Want one with USB-C.',
            photoPath: `${IMG}/diy-or-tradie-flag.jpg`,
            verdict: 'tradie_required',
            verdictReason: 'Replacing a power point is licensed electrical work in Queensland — even like-for-like. You can buy the fitting; a licensed electrician must install it.',
            difficulty: 'trade_required',
            timeEstimate: '30 min (electrician)',
            costLow: 120,
            costHigh: 220,
            costNote: 'Mostly the electrician’s call-out fee. Batch other electrical jobs into the same visit.',
            priority: true,
            shoppingList: [item('Double GPO with USB-C', 'Bunnings')],
            criticalFlags: ['Do not remove the cover plate — the terminals behind it are live even with the switch off.'],
            createdAt: t - 5 * day,
            updatedAt: t - 1 * day,
          },
          {
            ...base,
            id: 'j2',
            roomId: 'r2',
            title: 'Regrout the shower recess',
            description: 'Grout is cracking along the floor line.',
            status: 'in_progress',
            verdict: 'diy_safe',
            verdictReason: 'Regrouting is non-structural and doesn’t touch plumbing, so it’s legal to DIY. If the waterproofing membrane is damaged, that part needs a licensed waterproofer in QLD.',
            timeEstimate: '1 day + 72 h cure',
            costLow: 60,
            costHigh: 110,
            tools: [
              { name: 'Grout saw', owned: false, toBuy: true },
              { name: 'Utility knife', owned: true, toBuy: false },
              { name: 'Grout float', owned: false, toBuy: false },
              { name: 'Caulking gun', owned: true, toBuy: false },
            ],
            shoppingList: [item('Epoxy grout 2 kg', 'Bunnings'), item('Neutral-cure silicone', 'Bunnings', true), item('Sponges', 'Bunnings')],
            directions: [
              'Rake out the old grout to two-thirds of the tile depth.',
              'Vacuum the joints and wipe with a damp sponge.',
              'Pack new grout diagonally across the joints with a float.',
              'Sponge off the haze after 20 minutes, then leave to cure.',
              'Re-silicone the internal corners and floor junction.',
            ],
            criticalFlags: ['Wear a P2 mask while raking out grout — the dust contains silica.'],
            createdAt: t - 9 * day,
            updatedAt: t - 2 * day,
          },
          {
            ...base,
            id: 'j3',
            roomId: 'r4',
            title: 'Clean the gutters',
            recurrence: 'quarterly',
            lastDone: t - 85 * day,
            verdict: 'diy_safe',
            verdictReason: 'No licence needed. Use a stable ladder and don’t work on the roof alone.',
            tools: [
              { name: 'Extension ladder', owned: false, toBuy: false },
              { name: 'Gutter scoop', owned: false, toBuy: false },
            ],
            createdAt: t - 200 * day,
            updatedAt: t - 85 * day,
          },
          {
            ...base,
            id: 'j4',
            roomId: 'r3',
            title: 'Hang the new pegboard',
            status: 'done',
            completedAt: t - 3 * day,
            photoPath: `${IMG}/toolbox-garage-scan.jpg`,
            verdict: 'diy_safe',
            createdAt: t - 20 * day,
            updatedAt: t - 3 * day,
          },
        ],
      },
    ],
  } as UserDoc;
}
