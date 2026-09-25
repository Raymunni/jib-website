export const SITE = {
  name: 'Jib',
  domain: 'jibapp.xyz',
  url: 'https://jibapp.xyz',
  tagline: 'Snap a photo, get the full job.',
  description:
    'Jib is the home-improvement planner that tells you what you can legally DIY, what you need to buy, and what it will cost — then helps you plan and track the job.',
  email: 'hello@jibapp.xyz',
  author: {
    name: 'Thomas Horsey',
    role: 'Founder of Jib',
    url: '/about/',
  },
};

// Flip these to true the day each store listing goes live. While false,
// every download button becomes a "coming soon" state instead of sending
// people to a store page that doesn't exist yet.
export const STORES = {
  ios: {
    live: false,
    appId: '6814005599',
    // App Store Connect → Analytics → Acquisition → Campaigns → "Generate a
    // campaign link" shows your provider token (pt). Without it, the ct
    // campaign parameter isn't attributed.
    providerToken: '',
  },
  android: {
    live: false,
    packageName: 'com.jibjobs.app',
  },
};

// Campaigns are grouped by content cluster rather than per page: Apple only
// reports a campaign once it reaches 5 installs, so per-page campaigns would
// mostly never show up.
export type Campaign = 'home' | 'diy-legal' | 'council-approval' | 'materials' | 'features' | 'home-maintenance' | 'tools' | 'general';

export function iosUrl(campaign: Campaign = 'general'): string {
  const base = `https://apps.apple.com/app/apple-store/id${STORES.ios.appId}`;
  const params = new URLSearchParams({ mt: '8', ct: `web-${campaign}` });
  if (STORES.ios.providerToken) params.set('pt', STORES.ios.providerToken);
  return `${base}?${params.toString()}`;
}

export function androidUrl(campaign: Campaign = 'general'): string {
  const referrer = `utm_source=jibapp.xyz&utm_medium=web&utm_campaign=${campaign}`;
  return `https://play.google.com/store/apps/details?id=${STORES.android.packageName}&referrer=${encodeURIComponent(referrer)}`;
}

export const anyStoreLive = STORES.ios.live || STORES.android.live;

export const HUBS = {
  'diy-legal': {
    title: 'Can I legally DIY it?',
    blurb: 'What electrical, plumbing, gas and waterproofing work you can legally do yourself — and what needs a licensed tradie.',
  },
  'council-approval': {
    title: 'Do I need council approval?',
    blurb: 'Decks, sheds, fences, retaining walls and pergolas: the size and height limits for building without approval.',
  },
  materials: {
    title: 'What do I need to buy?',
    blurb: 'Exact materials lists and quantities for common DIY jobs, in Australian sizes.',
  },
  'home-maintenance': {
    title: 'Home maintenance, made simple',
    blurb: 'What to check, clean and service around your home — and how often — so small jobs never become big bills.',
  },
  features: {
    title: 'Jib features, explained',
    blurb: 'How Jib works on real jobs: the AI Toolbox, the DIY-or-tradie verdict, photo-to-plan and more.',
  },
} as const;

export type HubKey = keyof typeof HUBS;
