// Jib on the web. Reads and writes the same users/{uid} document the phone
// app syncs (see jib_jobs lib/app_state.dart _persist). Writes only ever
// touch `houses` and `updatedAt` — never premium, tier or credit fields —
// and run in a transaction against the latest cloud copy, so a web edit
// can't clobber a change the phone pushed a moment earlier.
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirestore, doc, onSnapshot, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';
import { demoData } from './demo';

// ---------- Types (mirror lib/models.dart) ----------
export interface SourceOption { retailer: string; variant: string; url: string }
export interface ShoppingItem { item: string; retailer: string; url: string; options: SourceOption[]; bought: boolean }
export interface JobTool { name: string; owned: boolean; toBuy: boolean }
export interface Room { id: string; name: string; photoPath?: string | null; hazards?: unknown[] }
export interface InventoryItem { id: string; name: string; createdAt: number }
export interface GalleryPhoto { id: string; roomId: string; photoPath: string; note: string; createdAt?: number; pairedPhotoPath?: string | null; photoDate?: number | null }
export interface Job {
  id: string; roomId: string; title: string; description: string;
  status: 'not_started' | 'in_progress' | 'done';
  timeEstimate: string; difficulty: string; tradeReason?: string | null;
  shoppingList: ShoppingItem[]; tools: JobTool[]; directions: string[]; criticalFlags: string[];
  verdict?: string | null; verdictReason?: string | null;
  photoPath?: string | null; afterPhotoPath?: string | null;
  priority: boolean; recurrence: string; lastDone?: number | null; completedAt?: number | null;
  reminderAt?: number | null; reminderRecurrence: string; extraPhotos: string[];
  thread: { role: string; message: string }[];
  createdAt: number; updatedAt: number;
  costLow?: number | null; costHigh?: number | null; costNote?: string | null; aiQuickAdded: boolean;
}
export interface House {
  id: string; name: string; suburb?: { name: string; state: string; postcode: string } | null;
  rooms: Room[]; jobs: Job[]; extraShopping: ShoppingItem[]; galleryPhotos: GalleryPhoto[]; inventory: InventoryItem[];
  [k: string]: unknown;
}
export interface UserDoc {
  houses: House[]; activeHouseId?: string | null; premium?: boolean; tier?: string; currencyCode?: string; updatedAt?: number;
  [k: string]: unknown;
}

// ---------- Firebase ----------
const firebaseApp = initializeApp({
  apiKey: 'AIzaSyBXHiAJNmHiAcIouCoX2rW7DKBt5Jr29iA',
  authDomain: 'jibjobs-2026.firebaseapp.com',
  projectId: 'jibjobs-2026',
  storageBucket: 'jibjobs-2026.firebasestorage.app',
  messagingSenderId: '26544625866',
  appId: '1:26544625866:web:6708c8bea5265c6297fc33',
});
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

// ---------- Photos ----------
// The download URLs saved in the cloud doc can carry stale access tokens:
// re-uploading a photo to the same path from the phone mints a new token
// and the old URL starts returning 403 (the phone never notices, since it
// caches photos on the device). So the web never trusts the saved token —
// it takes the storage path from the URL and asks Storage for a fresh
// signed URL as the signed-in user. Grids use the small WebP thumbnail the
// app uploads alongside each photo (users/<uid>/thumbs/<name>.webp),
// falling back to the full photo for older uploads that have none.
const resolved = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function storagePath(url: string): string | null {
  const m = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
const thumbPathFor = (path: string) => path.replace('/photos/', '/thumbs/').replace(/\.[^./]+$/, '.webp');

function resolvePath(path: string): Promise<string | null> {
  if (resolved.has(path)) return Promise.resolve(resolved.get(path)!);
  let p = pending.get(path);
  if (!p) {
    p = getDownloadURL(storageRef(storage, path))
      .catch(() => null)
      .then((u) => {
        resolved.set(path, u);
        pending.delete(path);
        return u;
      });
    pending.set(path, p);
  }
  return p;
}

/** Best URL we already know for a photo, without waiting (null if none yet). */
function knownUrl(url: string, thumb: boolean): string | null | undefined {
  const path = storagePath(url);
  if (!path || DEMO) return url;
  if (thumb) {
    const t = resolved.get(thumbPathFor(path));
    if (t) return t;
    if (t === null) return resolved.get(path);
    return undefined;
  }
  return resolved.get(path);
}

async function resolvePhoto(url: string, thumb: boolean): Promise<string | null> {
  const path = storagePath(url);
  if (!path || DEMO) return url;
  if (thumb) {
    const t = await resolvePath(thumbPathFor(path));
    if (t) return t;
  }
  return resolvePath(path);
}

/** An <img> for a stored photo; its src is filled in by hydratePhotos() after render. */
function photo(url: string, opts: { thumb?: boolean; cls?: string; alt?: string; attrs?: string } = {}) {
  const known = knownUrl(url, !!opts.thumb);
  return `<img ${opts.cls ? `class="${opts.cls}"` : ''} alt="${esc(opts.alt ?? '')}" data-photo="${esc(url)}" ${opts.thumb ? 'data-thumb="1"' : ''} ${
    known ? `src="${esc(known)}"` : ''
  } ${opts.attrs ?? ''} />`;
}

function hydratePhotos() {
  $app.querySelectorAll<HTMLImageElement>('img[data-photo]').forEach(async (img) => {
    if (img.getAttribute('src')) return;
    img.classList.add('loading-photo');
    const u = await resolvePhoto(img.dataset.photo!, img.dataset.thumb === '1');
    img.classList.remove('loading-photo');
    if (u) img.src = u;
    else img.classList.add('missing-photo');
  });
}

// localStorage can throw (private mode, blocked storage) — never let that break the app.
const store = {
  get(k: string) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(k, v); } catch { /* ignore */ }
  },
};

// ---------- State ----------
type View = 'jobs' | 'shopping' | 'toolbox' | 'gallery' | 'account';
const DEMO = new URLSearchParams(location.search).has('demo');
const state = {
  user: null as User | null,
  authReady: false,
  data: null as UserDoc | null,
  dataReady: false,
  loadError: '',
  houseId: store.get('jib.web.house') as string | null,
  view: (store.get('jib.web.view') as View) || 'jobs',
  jobId: null as string | null,
  statusFilter: 'todo' as 'all' | 'todo' | 'done' | 'priority',
  roomFilter: '' as string,
  toolboxQuery: '',
  lightbox: null as string | null,
  authError: '',
  authBusy: false,
  newJob: false,
};
let unsubDoc: Unsubscribe | null = null;

// ---------- Helpers ----------
const $app = document.getElementById('app')!;
const $top = document.getElementById('w-top-slot')!;
const $tabs = document.getElementById('w-tabs-bar')!;
const $toast = document.getElementById('w-toast')!;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const isUrl = (p?: string | null): p is string => !!p && /^https:\/\//.test(p);
const newId = () => crypto.randomUUID().slice(0, 8);
const now = () => Date.now();

let toastTimer = 0;
function toast(msg: string) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => $toast.classList.remove('show'), 2600);
}

function house(): House | null {
  const hs = state.data?.houses ?? [];
  return hs.find((h) => h.id === state.houseId) ?? hs.find((h) => h.id === state.data?.activeHouseId) ?? hs[0] ?? null;
}
const roomName = (h: House, id: string) => h.rooms.find((r) => r.id === id)?.name ?? 'Other';

function money(n?: number | null) {
  if (n == null) return '';
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: state.data?.currencyCode || 'AUD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

const RECUR_DAYS: Record<string, number> = { daily: 1, weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91, yearly: 365 };
function dueInDays(j: Job): number | null {
  const d = RECUR_DAYS[j.recurrence];
  if (!d) return null;
  const due = (j.lastDone ?? j.createdAt) + d * 86400000;
  return Math.ceil((due - now()) / 86400000);
}
const hasRealFlags = (j: Job) => j.criticalFlags.length > 0 && j.criticalFlags[0] !== 'None for this job.';

// Same loose matching the app uses (widgets/job_tools.dart toolboxHas).
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function toolboxHas(h: House, name: string) {
  const n = norm(name);
  return h.inventory.some((i) => {
    const m = norm(i.name);
    return m === n || (m.length > 3 && n.includes(m)) || (n.length > 3 && m.includes(n));
  });
}

/** Fill any fields an older app version didn't write, so the UI never trips on undefined. */
function normalise(d: UserDoc): UserDoc {
  d.houses = (d.houses ?? []).map((h) => ({
    ...h,
    rooms: h.rooms ?? [],
    extraShopping: (h.extraShopping ?? []).map(normItem),
    galleryPhotos: h.galleryPhotos ?? [],
    inventory: h.inventory ?? [],
    jobs: (h.jobs ?? []).map((j) => ({
      ...j,
      title: j.title ?? 'Untitled job',
      description: j.description ?? '',
      status: j.status ?? 'not_started',
      shoppingList: (j.shoppingList ?? []).map(normItem),
      tools: j.tools ?? [],
      directions: j.directions ?? [],
      criticalFlags: j.criticalFlags ?? [],
      extraPhotos: j.extraPhotos ?? [],
      thread: j.thread ?? [],
      recurrence: j.recurrence ?? '',
      reminderRecurrence: j.reminderRecurrence ?? '',
      priority: j.priority ?? false,
      aiQuickAdded: j.aiQuickAdded ?? false,
      timeEstimate: j.timeEstimate ?? '',
      difficulty: j.difficulty ?? 'moderate',
      createdAt: j.createdAt ?? now(),
      updatedAt: j.updatedAt ?? now(),
    })),
  }));
  return d;
}
function normItem(s: Partial<ShoppingItem>): ShoppingItem {
  return { item: s.item ?? '', retailer: s.retailer ?? '', url: s.url ?? '', options: s.options ?? [], bought: s.bought ?? false };
}
const primaryRetailer = (s: ShoppingItem) => (s.options.length ? s.options[0].retailer : s.retailer) || '';
const primaryUrl = (s: ShoppingItem) => (s.options.length ? s.options[0].url : s.url) || '';

// ---------- Writes ----------
/**
 * Applies [change] to the current house inside a transaction on the
 * latest cloud copy, and writes back only `houses` + `updatedAt`. The
 * change is applied locally first so the UI responds instantly; the
 * snapshot listener then confirms (or corrects) it.
 */
async function mutate(change: (h: House) => void, okMsg?: string) {
  const h = house();
  if (!h || !state.data) return;
  const houseId = h.id;
  change(h);
  render();
  if (DEMO) {
    if (okMsg) toast(okMsg);
    return;
  }
  const ref = doc(db, 'users', state.user!.uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('missing');
      const fresh = normalise(snap.data() as UserDoc);
      const target = fresh.houses.find((x) => x.id === houseId);
      if (!target) throw new Error('house gone');
      change(target);
      tx.update(ref, { houses: fresh.houses, updatedAt: now() });
    });
    if (okMsg) toast(okMsg);
  } catch (e) {
    console.error(e);
    toast('Couldn’t save that — check your connection and try again');
  }
}

function mutateJob(jobId: string, change: (j: Job, h: House) => void, okMsg?: string) {
  return mutate((h) => {
    const j = h.jobs.find((x) => x.id === jobId);
    if (!j) return;
    change(j, h);
    j.updatedAt = now();
  }, okMsg);
}

/** Finds a list entry by index, falling back to its name if the list shifted underneath us. */
function findIdx<T>(list: T[], idx: number, key: (t: T) => string, name: string) {
  if (list[idx] && key(list[idx]) === name) return idx;
  return list.findIndex((t) => key(t) === name);
}

function addToToolbox(h: House, name: string) {
  const t = name.trim();
  if (!t || h.inventory.some((i) => i.name.toLowerCase() === t.toLowerCase())) return;
  h.inventory = [...h.inventory, { id: newId(), name: t, createdAt: now() }];
}

// ---------- Auth ----------
if (DEMO) {
  state.authReady = true;
  state.user = { uid: 'demo', email: 'demo@jibapp.xyz', providerData: [{ providerId: 'google.com' }] } as unknown as User;
  state.data = normalise(demoData());
  state.dataReady = true;
} else {
  onAuthStateChanged(auth, (user) => {
    state.user = user;
    state.authReady = true;
    unsubDoc?.();
    unsubDoc = null;
    state.data = null;
    state.dataReady = false;
    state.loadError = '';
    if (user) {
      unsubDoc = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          state.data = snap.exists() ? normalise(snap.data() as UserDoc) : null;
          state.dataReady = true;
          render();
        },
        (err) => {
          console.error(err);
          state.loadError = 'We couldn’t load your Jib data. Check your connection and refresh.';
          state.dataReady = true;
          render();
        },
      );
    }
    render();
  });
}

function authMessage(e: unknown) {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'That email and password don’t match a Jib account.';
  if (code.includes('too-many-requests')) return 'Too many attempts — wait a minute and try again.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the sign-in popup. Allow popups for jibapp.xyz and try again.';
  if (code.includes('network')) return 'No connection — check your internet and try again.';
  return 'Sign-in didn’t work. Please try again.';
}

// ---------- Render ----------
function render() {
  renderTop();
  if (!state.authReady) return;
  if (!state.user) return renderSignIn();
  if (!state.dataReady) {
    $app.innerHTML = `<div class="w-loading"><span class="spinner" aria-hidden="true"></span> Loading your home…</div>`;
    return;
  }
  if (state.loadError) {
    $app.innerHTML = `<div class="w-empty">${esc(state.loadError)}</div>`;
    return;
  }
  const h = house();
  if (!h) {
    $app.innerHTML = `
      <div class="w-empty">
        <h2>No home set up yet</h2>
        <p>Open Jib on your phone, sign in with <strong>${esc(state.user.email ?? 'this account')}</strong> and set up your home — it’ll appear here straight away.</p>
        <p><a class="w-btn primary" href="/app/">Get the Jib app</a></p>
      </div>`;
    return;
  }
  let html = '';
  if (state.view === 'jobs') html = viewJobs(h);
  else if (state.view === 'shopping') html = viewShopping(h);
  else if (state.view === 'toolbox') html = viewToolbox(h);
  else if (state.view === 'gallery') html = viewGallery(h);
  else html = viewAccount();
  if (state.jobId) {
    const j = h.jobs.find((x) => x.id === state.jobId);
    if (j) html += viewJob(h, j);
    else state.jobId = null;
  }
  if (state.newJob) html += viewNewJob(h);
  if (state.lightbox) html += `<div class="w-lightbox" data-act="close-lightbox">${photo(state.lightbox, { alt: 'Photo' })}</div>`;

  // Preserve focus and scroll across re-renders (snapshots arrive while typing).
  const active = document.activeElement as HTMLInputElement | null;
  const focusKey = active?.dataset?.key;
  const typed = focusKey ? active!.value : null;
  const sel = focusKey ? [active!.selectionStart, active!.selectionEnd] : null;
  const drawerScroll = document.querySelector('.w-drawer')?.scrollTop ?? 0;
  $app.innerHTML = html;
  hydratePhotos();
  const drawer = document.querySelector('.w-drawer');
  if (drawer) drawer.scrollTop = drawerScroll;
  if (focusKey) {
    const el = $app.querySelector<HTMLInputElement>(`[data-key="${focusKey}"]`);
    if (el) {
      // Keep whatever was being typed — a live update mustn't wipe it.
      if (typed != null && 'value' in el) el.value = typed;
      el.focus();
      if (sel && el.setSelectionRange && sel[0] != null) {
        try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ }
      }
    }
  }
}

// The top row (site links) is static in the page; this fills the right-hand
// account area and the app's own tab row underneath.
function renderTop() {
  if (!state.user) {
    $top.innerHTML = state.authReady ? `<span class="w-spacer"></span><a class="w-btn small primary" href="/app/" data-get-app>Get the app</a>` : '';
    $tabs.hidden = true;
    $tabs.innerHTML = '';
    return;
  }
  $top.innerHTML = `<span class="w-spacer"></span><button class="w-btn small" data-act="signout">Sign out</button>`;
  if (!state.dataReady || !state.data) {
    $tabs.hidden = true;
    return;
  }
  const hs = state.data.houses;
  const h = house();
  const tabs: [View, string][] = [
    ['jobs', 'Jobs'],
    ['shopping', 'Shopping'],
    ['toolbox', 'Toolbox'],
    ['gallery', 'Gallery'],
    ['account', 'Account'],
  ];
  $tabs.hidden = false;
  $tabs.innerHTML = `
    <nav class="w-tabs" aria-label="Your Jib">
      ${tabs.map(([v, l]) => `<button data-act="view" data-v="${v}" ${state.view === v ? 'aria-current="page"' : ''}>${l}</button>`).join('')}
    </nav>
    <span class="w-spacer"></span>
    ${
      hs.length > 1
        ? `<label class="sr-only" for="w-house">Home</label>
           <select id="w-house" class="w-select" data-change="house">
             ${hs.map((x) => `<option value="${esc(x.id)}" ${x.id === h?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
           </select>`
        : `<span class="w-note hide-sm">${esc(h?.name ?? '')}</span>`
    }`;
}

function renderSignIn() {
  $app.innerHTML = `
    <section class="w-auth">
      <h1>Sign in to Jib</h1>
      <p class="muted">Manage your jobs, tools, shopping list and Toolbox from your computer. Use the same account you use in the app.</p>
      <button class="w-btn w-google" data-act="google" ${state.authBusy ? 'disabled' : ''}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continue with Google
      </button>
      <div class="w-or">or with email</div>
      <form data-form="email" novalidate>
        <label class="sr-only" for="w-email">Email</label>
        <input id="w-email" class="w-input" type="email" name="email" autocomplete="email" placeholder="Email" required />
        <label class="sr-only" for="w-pass">Password</label>
        <input id="w-pass" class="w-input" type="password" name="password" autocomplete="current-password" placeholder="Password" required />
        <button class="w-btn primary" type="submit" ${state.authBusy ? 'disabled' : ''}>${state.authBusy ? 'Signing in…' : 'Sign in'}</button>
        ${state.authError ? `<p class="w-err" role="alert">${esc(state.authError)}</p>` : ''}
        <p class="w-note"><button type="button" class="w-link" data-act="reset">Forgot your password?</button></p>
      </form>
      <p class="w-note">Signed up with Apple? Sign in with Apple is coming to the web soon — until then, manage your jobs in the app.</p>
      <p class="w-note">New to Jib? Create your account in the app first: <a href="/app/">get Jib for iPhone or Android</a>.</p>
    </section>`;
}

// ----- Jobs -----
function jobCard(h: House, j: Job) {
  const due = dueInDays(j);
  const thumb = isUrl(j.photoPath) ? j.photoPath : isUrl(j.afterPhotoPath) ? j.afterPhotoPath : null;
  const status =
    j.status === 'done' ? '<span class="pill ok">Done</span>' : j.status === 'in_progress' ? '<span class="pill blue">In progress</span>' : '';
  const verdict =
    j.verdict === 'tradie_required' ? '<span class="pill bad">Tradie required</span>' : j.verdict === 'diy_safe' ? '<span class="pill ok">DIY safe</span>' : '';
  const dueTxt = due == null ? '' : due < 0 ? `<span class="pill bad">Overdue ${-due}d</span>` : due <= 7 ? `<span class="pill warn">Due in ${due}d</span>` : '';
  return `
    <button class="job-card ${j.status === 'done' ? 'done' : ''}" data-act="open-job" data-id="${esc(j.id)}">
      ${thumb ? photo(thumb, { thumb: true, cls: 'jc-thumb' }) : `<span class="jc-thumb" aria-hidden="true">🔧</span>`}
      <span class="jc-body">
        <span class="jc-title">${j.priority ? '★ ' : ''}${esc(j.title)}</span>
        <span class="jc-meta">
          ${status}${verdict}${dueTxt}
          ${j.costLow != null && j.costHigh != null ? `<span class="pill">${money(j.costLow)}–${money(j.costHigh)}</span>` : ''}
        </span>
      </span>
    </button>`;
}

function viewJobs(h: House) {
  const f = state.statusFilter;
  let jobs = h.jobs.filter((j) =>
    f === 'all' ? true : f === 'done' ? j.status === 'done' : f === 'priority' ? j.priority && j.status !== 'done' : j.status !== 'done',
  );
  if (state.roomFilter) jobs = jobs.filter((j) => j.roomId === state.roomFilter);
  jobs.sort((a, b) => Number(b.priority) - Number(a.priority) || b.updatedAt - a.updatedAt);

  const groups = new Map<string, Job[]>();
  for (const j of jobs) {
    const k = roomName(h, j.roomId);
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  const chips: [typeof f, string][] = [
    ['todo', 'To do'],
    ['priority', 'Priority'],
    ['done', 'Done'],
    ['all', 'All'],
  ];
  const open = h.jobs.filter((j) => j.status !== 'done').length;
  return `
    <div class="w-bar">
      <h1>Jobs</h1>
      ${chips.map(([v, l]) => `<button class="chip" data-act="filter" data-v="${v}" aria-pressed="${f === v}">${l}</button>`).join('')}
      <label class="sr-only" for="w-room">Room</label>
      <select id="w-room" class="w-select" data-change="room-filter">
        <option value="">All rooms</option>
        ${h.rooms.map((r) => `<option value="${esc(r.id)}" ${state.roomFilter === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
      </select>
      <span class="w-spacer"></span>
      <button class="w-btn primary" data-act="new-job">+ New job</button>
    </div>
    <div class="w-home">
      ${isUrl(h.photoPath as string) ? photo(h.photoPath as string, { cls: 'w-home-img', alt: h.name, attrs: `data-act="lightbox" data-src="${esc(h.photoPath as string)}"` }) : ''}
      <div>
        <strong>${esc(h.name)}</strong>
        <span class="w-note">${h.suburb ? `${esc(h.suburb.name)}, ${esc(h.suburb.state)} · ` : ''}${open} open job${open === 1 ? '' : 's'} · ${h.rooms.length} room${h.rooms.length === 1 ? '' : 's'}</span>
      </div>
    </div>
    ${
      jobs.length === 0
        ? `<div class="w-empty">${f === 'done' ? 'No finished jobs yet.' : 'Nothing here. Add a job, or snap one in the app.'}</div>`
        : [...groups.entries()]
            .map(([room, js]) => `<section class="w-group"><h2>${esc(room)}</h2><div class="w-jobs">${js.map((j) => jobCard(h, j)).join('')}</div></section>`)
            .join('')
    }`;
}

function viewJob(h: House, j: Job) {
  const sash =
    j.verdict === 'tradie_required'
      ? '<div class="sash tradie"><span>TRADIE REQUIRED</span></div>'
      : j.verdict === 'diy_safe'
        ? '<div class="sash diy"><span>DIY SAFE</span></div>'
        : '<div class="sash none"><span>DIY OR TRADIE?</span></div>';
  const photos = [j.photoPath, j.afterPhotoPath, ...j.extraPhotos].filter(isUrl);
  const statusBtn = (v: Job['status'], l: string) =>
    `<button data-act="status" data-v="${v}" aria-pressed="${j.status === v}">${l}</button>`;
  const toolsOwned = j.tools.filter((t) => t.owned || toolboxHas(h, t.name)).length;

  return `
    <div class="w-scrim" data-act="close-job"></div>
    <aside class="w-drawer" role="dialog" aria-modal="true" aria-label="${esc(j.title)}">
      ${sash}
      <div class="w-drawer-inner">
        <div class="w-drawer-top">
          <button class="icon-btn" data-act="close-job" aria-label="Close">✕</button>
          <span class="w-note">${esc(roomName(h, j.roomId))}</span>
        </div>
        ${photos.length ? photo(photos[0], { cls: 'w-hero', alt: 'Job photo', attrs: `data-act="lightbox" data-src="${esc(photos[0])}"` }) : ''}
        ${
          photos.length > 1
            ? `<div class="w-photos">${photos
                .slice(1)
                .map((p) => photo(p, { thumb: true, alt: 'Job photo', attrs: `data-act="lightbox" data-src="${esc(p)}"` }))
                .join('')}</div>`
            : ''
        }
        <label class="sr-only" for="w-jt">Job title</label>
        <input id="w-jt" class="w-input w-title-input" data-key="title" data-blur="title" value="${esc(j.title)}" />

        <div class="w-row">
          <div class="seg" role="group" aria-label="Status">
            ${statusBtn('not_started', 'To do')}${statusBtn('in_progress', 'In progress')}${statusBtn('done', 'Done')}
          </div>
          <button class="chip" data-act="priority" aria-pressed="${j.priority}">★ Priority</button>
          <label class="sr-only" for="w-jroom">Room</label>
          <select id="w-jroom" class="w-select" data-change="job-room">
            ${h.rooms.map((r) => `<option value="${esc(r.id)}" ${r.id === j.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
          </select>
        </div>

        <div class="w-section">
          <h3>DIY or tradie</h3>
          ${
            j.verdict === 'tradie_required'
              ? `<div class="verdict-box tradie"><strong style="color:#ff9c96">Tradie required</strong><p style="margin:6px 0 0">${esc(j.verdictReason || 'Part of this job legally needs a licensed tradesperson.')}</p></div>`
              : j.verdict === 'diy_safe'
                ? `<div class="verdict-box diy"><strong style="color:#7ee2a2">DIY safe</strong><p style="margin:6px 0 0">${esc(j.verdictReason || 'Nothing in this job legally needs a licence where your house is.')}</p></div>`
                : `<div class="verdict-box"><p style="margin:0">Not checked yet. Open this job in the Jib app to get a DIY safe or tradie required verdict.</p></div>`
          }
          <p class="w-note">General guidance, not legal advice — confirm with your state regulator.</p>
        </div>

        <div class="w-section">
          <h3>Description</h3>
          <label class="sr-only" for="w-jd">Description</label>
          <textarea id="w-jd" class="w-textarea" data-key="desc" data-blur="desc" placeholder="What needs doing?">${esc(j.description)}</textarea>
        </div>

        ${
          j.costLow != null || j.timeEstimate
            ? `<div class="w-section"><div class="w-cost">
                ${j.costLow != null && j.costHigh != null ? `<div class="w-stat"><strong>${money(j.costLow)}–${money(j.costHigh)}</strong><span>Estimated cost</span></div>` : ''}
                ${j.timeEstimate ? `<div class="w-stat"><strong>${esc(j.timeEstimate)}</strong><span>Time</span></div>` : ''}
                ${j.difficulty ? `<div class="w-stat"><strong>${esc(j.difficulty.replace('_', ' '))}</strong><span>Difficulty</span></div>` : ''}
              </div>${j.costNote ? `<p class="w-note">${esc(j.costNote)}</p>` : ''}</div>`
            : ''
        }

        ${
          hasRealFlags(j)
            ? `<div class="w-section"><h3>Job warnings</h3><div class="w-warn"><ul>${j.criticalFlags.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div></div>`
            : ''
        }

        <div class="w-section">
          <h3>Tools ${j.tools.length ? `<span class="pill">${toolsOwned}/${j.tools.length} in your toolbox</span>` : ''}</h3>
          <ul class="w-list">
            ${j.tools
              .map((t, i) => {
                const owned = t.owned || toolboxHas(h, t.name);
                const status = owned
                  ? '<span class="pill ok">In your toolbox</span>'
                  : t.toBuy
                    ? `<button class="pill warn" data-act="tool-unbuy" data-i="${i}" data-name="${esc(t.name)}" title="Remove from shopping list">On shopping list ✕</button>`
                    : `<button class="w-btn small" data-act="tool-buy" data-i="${i}" data-name="${esc(t.name)}">Buy</button>`;
                return `<li class="w-item"><span class="grow name">${esc(t.name)}</span>${status}
                  <button class="icon-btn" data-act="tool-del" data-i="${i}" data-name="${esc(t.name)}" aria-label="Remove ${esc(t.name)}">✕</button></li>`;
              })
              .join('')}
          </ul>
          <form class="w-add" data-form="add-tool">
            <label class="sr-only" for="w-addtool">Add a tool</label>
            <input id="w-addtool" class="w-input" name="name" list="w-toolbox-list" placeholder="Add a tool (pick from your Toolbox or type one)" data-key="addtool" />
            <datalist id="w-toolbox-list">${h.inventory.map((i) => `<option value="${esc(i.name)}"></option>`).join('')}</datalist>
            <button class="w-btn" type="submit">Add</button>
          </form>
        </div>

        <div class="w-section">
          <h3>Materials</h3>
          <ul class="w-list">
            ${j.shoppingList
              .map(
                (s, i) => `
              <li class="w-item ${s.bought ? 'bought' : ''}">
                <button class="check ${s.bought ? 'on' : ''}" data-act="mat-toggle" data-i="${i}" data-name="${esc(s.item)}" aria-label="${s.bought ? 'Mark not bought' : 'Mark bought'}">${s.bought ? '✓' : ''}</button>
                <span class="grow"><span class="name">${esc(s.item)}</span>${primaryRetailer(s) ? `<span class="sub">${esc(primaryRetailer(s))}</span>` : ''}</span>
                ${primaryUrl(s) ? `<a class="w-link" href="${esc(primaryUrl(s))}" target="_blank" rel="noopener">Shop</a>` : ''}
                <button class="icon-btn" data-act="mat-del" data-i="${i}" data-name="${esc(s.item)}" aria-label="Remove ${esc(s.item)}">✕</button>
              </li>`,
              )
              .join('')}
          </ul>
          <form class="w-add" data-form="add-mat">
            <label class="sr-only" for="w-addmat">Add material</label>
            <input id="w-addmat" class="w-input" name="name" placeholder="Add material" data-key="addmat" />
            <button class="w-btn" type="submit">Add</button>
          </form>
        </div>

        ${
          j.directions.length
            ? `<div class="w-section"><h3>Steps</h3><ol class="w-steps">${j.directions.map((d) => `<li>${esc(d)}</li>`).join('')}</ol></div>`
            : ''
        }

        <div class="w-section">
          <p class="w-note">Want an AI plan, a tools check or a new verdict? Open this job in the Jib app — AI features run on your phone.</p>
          <button class="w-btn danger" data-act="delete-job">Delete job</button>
        </div>
      </div>
    </aside>`;
}

function viewNewJob(h: House) {
  return `
    <div class="w-scrim" data-act="close-new"></div>
    <aside class="w-drawer" role="dialog" aria-modal="true" aria-label="New job">
      <div class="w-drawer-inner">
        <div class="w-drawer-top"><button class="icon-btn" data-act="close-new" aria-label="Close">✕</button><strong>New job</strong></div>
        <form data-form="new-job" style="display:grid;gap:12px">
          <label>Title<br /><input class="w-input" style="width:100%" name="title" required placeholder="e.g. Regrout the shower" data-key="nj-title" /></label>
          <label>Room<br />
            <select class="w-select" name="room" style="width:100%">
              ${h.rooms.map((r) => `<option value="${esc(r.id)}" ${state.roomFilter === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
            </select></label>
          <label>Description<br /><textarea class="w-textarea" name="description" placeholder="What needs doing? (optional)"></textarea></label>
          <label class="w-row"><input type="checkbox" name="priority" /> Priority</label>
          <button class="w-btn primary" type="submit">Add job</button>
          <p class="w-note">Tip: open the job in the Jib app afterwards for an AI plan, tools list and DIY-or-tradie verdict.</p>
        </form>
      </div>
    </aside>`;
}

// ----- Shopping -----
interface Entry {
  item: ShoppingItem;
  source: string;
  jobId?: string;
  kind: 'mat' | 'tool' | 'extra';
  idx: number;
}
function shoppingEntries(h: House): Entry[] {
  const out: Entry[] = [];
  for (const j of h.jobs) {
    j.shoppingList.forEach((s, i) => out.push({ item: s, source: j.title, jobId: j.id, kind: 'mat', idx: i }));
    j.tools.forEach((t, i) => {
      if (t.toBuy && !t.owned) out.push({ item: normItem({ item: t.name }), source: `${j.title} · tool`, jobId: j.id, kind: 'tool', idx: i });
    });
  }
  h.extraShopping.forEach((s, i) => out.push({ item: s, source: 'General', kind: 'extra', idx: i }));
  return out;
}
function entryRow(e: Entry) {
  const attrs = `data-kind="${e.kind}" data-i="${e.idx}" data-name="${esc(e.item.item)}" ${e.jobId ? `data-job="${esc(e.jobId)}"` : ''}`;
  return `
    <li class="w-item ${e.item.bought ? 'bought' : ''}">
      <button class="check ${e.item.bought ? 'on' : ''}" data-act="shop-toggle" ${attrs} aria-label="${e.item.bought ? 'Mark not bought' : 'Mark bought'}">${e.item.bought ? '✓' : ''}</button>
      <span class="grow"><span class="name">${esc(e.item.item)}</span><span class="sub">${esc(e.source)}</span></span>
      ${primaryUrl(e.item) ? `<a class="w-link" href="${esc(primaryUrl(e.item))}" target="_blank" rel="noopener">Shop</a>` : ''}
      <button class="icon-btn" data-act="shop-del" ${attrs} aria-label="Remove ${esc(e.item.item)}">✕</button>
    </li>`;
}
function viewShopping(h: House) {
  const all = shoppingEntries(h);
  const active = all.filter((e) => !e.item.bought);
  const bought = all.filter((e) => e.item.bought);
  const by = new Map<string, Entry[]>();
  for (const e of active) {
    const k = e.kind === 'tool' ? 'Tools to buy' : primaryRetailer(e.item) || 'Anywhere';
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  return `
    <div class="w-bar"><h1>Shopping</h1><span class="w-note">${active.length} to buy</span></div>
    <form class="w-add" data-form="add-extra" style="max-width:560px;margin-bottom:18px">
      <label class="sr-only" for="w-addx">Add to shopping list</label>
      <input id="w-addx" class="w-input" name="name" placeholder="Add something to the list" data-key="addextra" />
      <button class="w-btn" type="submit">Add</button>
    </form>
    ${
      active.length === 0
        ? '<div class="w-empty">Your shopping list is empty. Materials from your jobs and tools you choose to buy show up here.</div>'
        : `<div class="w-cols">${[...by.entries()]
            .map(([k, es]) => `<section class="w-retailer"><h2>${esc(k)}</h2><ul class="w-list">${es.map(entryRow).join('')}</ul></section>`)
            .join('')}</div>`
    }
    ${bought.length ? `<details class="w-bought"><summary>Bought (${bought.length})</summary><ul class="w-list">${bought.map(entryRow).join('')}</ul></details>` : ''}
    <p class="w-note" style="margin-top:20px">Ticking off a tool moves it into your Toolbox, so no future job asks you to buy it again.</p>`;
}

// ----- Toolbox -----
function viewToolbox(h: House) {
  const q = state.toolboxQuery.toLowerCase();
  const items = [...h.inventory].filter((i) => !q || i.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  return `
    <div class="w-bar"><h1>Toolbox</h1><span class="w-note">${h.inventory.length} tool${h.inventory.length === 1 ? '' : 's'}</span></div>
    <p class="w-note" style="margin-top:-8px">Every job checks this list, so you only buy what you’re missing. To scan a whole garage wall in one photo, use Toolbox in the app.</p>
    <div class="w-row" style="margin:14px 0 18px">
      <form class="w-add" data-form="add-inv" style="margin:0;flex:1;min-width:260px">
        <label class="sr-only" for="w-addinv">Add a tool</label>
        <input id="w-addinv" class="w-input" name="name" placeholder="Add a tool you own" data-key="addinv" />
        <button class="w-btn primary" type="submit">Add</button>
      </form>
      <label class="sr-only" for="w-tq">Search</label>
      <input id="w-tq" class="w-input" style="flex:1;min-width:200px" type="search" placeholder="Search your Toolbox" value="${esc(state.toolboxQuery)}" data-key="tq" data-input="tq" />
    </div>
    ${
      items.length === 0
        ? `<div class="w-empty">${q ? 'No tools match that search.' : 'Your Toolbox is empty. Add tools here, or scan your garage in the app.'}</div>`
        : `<ul class="w-list" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">${items
            .map(
              (i) =>
                `<li class="w-item"><span class="grow">${esc(i.name)}</span><button class="icon-btn" data-act="inv-del" data-id="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">✕</button></li>`,
            )
            .join('')}</ul>`
    }`;
}

// ----- Gallery -----
function viewGallery(h: House) {
  const photos = h.galleryPhotos.filter((g) => isUrl(g.photoPath)).sort((a, b) => (b.photoDate ?? b.createdAt ?? 0) - (a.photoDate ?? a.createdAt ?? 0));
  const by = new Map<string, GalleryPhoto[]>();
  for (const p of photos) {
    const k = roomName(h, p.roomId);
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  return `
    <div class="w-bar"><h1>Gallery</h1><span class="w-note">${photos.length} photo${photos.length === 1 ? '' : 's'}</span></div>
    ${
      photos.length === 0
        ? '<div class="w-empty">No synced photos yet. Photos you take in the app appear here once they’ve synced.</div>'
        : [...by.entries()]
            .map(
              ([room, ps]) => `<section class="w-group"><h2>${esc(room)}</h2><div class="w-gallery">${ps
                .map(
                  (p) =>
                    `<button data-act="lightbox" data-src="${esc(p.photoPath)}">${photo(p.photoPath, { thumb: true, alt: p.note || room })}${p.note ? `<span class="cap">${esc(p.note)}</span>` : ''}</button>`,
                )
                .join('')}</div></section>`,
            )
            .join('')
    }`;
}

// ----- Account -----
function viewAccount() {
  const u = state.user!;
  const provider = u.providerData?.[0]?.providerId ?? '';
  const via = provider.includes('google') ? 'Google' : provider.includes('apple') ? 'Apple' : 'email and password';
  const d = state.data!;
  const tiers: Record<string, string> = { homeOwner: 'Home Owner', homeFlipper: 'Home Flipper', masterBuilder: 'Master Builder' };
  const plan = d.premium ? (tiers[d.tier ?? ''] ?? 'Premium') : 'Free';
  return `
    <div class="w-bar"><h1>Account</h1></div>
    <div class="w-account">
      <div class="card"><strong>Signed in</strong><p>${esc(u.email ?? '')} · via ${via}</p></div>
      <div class="card"><strong>Plan</strong><p>${esc(plan)}</p>
        <p class="w-note">Subscriptions are managed through the App Store or Google Play on your phone.</p></div>
      <div class="card"><strong>Homes</strong><p>${d.houses.map((h) => esc(h.name)).join(', ')}</p>
        <p class="w-note">Add homes, rooms and photos in the app.</p></div>
      <div class="card"><strong>Syncing with your phone</strong>
        <p class="w-note">Changes you make here save to your account straight away. Your phone picks them up the next time you open Jib. If you’re editing the same job on both at once, the most recent save wins.</p></div>
      <div class="w-row">
        <button class="w-btn" data-act="signout">Sign out</button>
        <a class="w-link" href="/privacy/">Privacy</a>
        <a class="w-link" href="/contact/">Help</a>
      </div>
      <p class="w-note">To delete your account, go to Settings → Delete account in the app.</p>
    </div>`;
}

// ---------- Events ----------
document.addEventListener('click', async (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!t) return;
  const act = t.dataset.act!;
  const h = house();
  const jobId = state.jobId;
  const i = Number(t.dataset.i);
  const name = t.dataset.name ?? '';

  switch (act) {
    case 'view':
      state.view = t.dataset.v as View;
      state.jobId = null;
      store.set('jib.web.view', state.view);
      window.scrollTo(0, 0);
      return render();
    case 'filter':
      state.statusFilter = t.dataset.v as typeof state.statusFilter;
      return render();
    case 'open-job':
      state.jobId = t.dataset.id!;
      return render();
    case 'close-job':
      state.jobId = null;
      return render();
    case 'new-job':
      state.newJob = true;
      render();
      $app.querySelector<HTMLInputElement>('[name="title"]')?.focus();
      return;
    case 'close-new':
      state.newJob = false;
      return render();
    case 'lightbox':
      state.lightbox = t.dataset.src!;
      return render();
    case 'close-lightbox':
      state.lightbox = null;
      return render();
    case 'signout':
      if (DEMO) return toast('This is the demo — nothing to sign out of');
      await signOut(auth);
      return;
    case 'google':
      state.authBusy = true;
      state.authError = '';
      render();
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (e) {
        state.authError = authMessage(e);
      }
      state.authBusy = false;
      return render();
    case 'reset': {
      const email = ($app.querySelector<HTMLInputElement>('#w-email')?.value ?? '').trim();
      if (!email) {
        state.authError = 'Type your email above first, then tap “Forgot your password?”.';
        return render();
      }
      try {
        await sendPasswordResetEmail(auth, email);
        toast('Password reset email sent — check your inbox');
      } catch (e) {
        state.authError = authMessage(e);
        render();
      }
      return;
    }
  }
  if (!h) return;

  if (jobId) {
    switch (act) {
      case 'status':
        return mutateJob(jobId, (j) => {
          const v = t.dataset.v as Job['status'];
          const wasDone = j.status === 'done';
          j.status = v;
          if (v === 'done' && !wasDone) {
            j.completedAt = now();
            j.lastDone = now();
          }
        }, t.dataset.v === 'done' ? 'Nice work — job done' : undefined);
      case 'priority':
        return mutateJob(jobId, (j) => (j.priority = !j.priority));
      case 'tool-buy':
        return mutateJob(jobId, (j) => {
          const k = findIdx(j.tools, i, (x) => x.name, name);
          if (k >= 0) j.tools[k].toBuy = true;
        }, `${name} added to your shopping list`);
      case 'tool-unbuy':
        return mutateJob(jobId, (j) => {
          const k = findIdx(j.tools, i, (x) => x.name, name);
          if (k >= 0) j.tools[k].toBuy = false;
        });
      case 'tool-del':
        return mutateJob(jobId, (j) => {
          const k = findIdx(j.tools, i, (x) => x.name, name);
          if (k >= 0) j.tools.splice(k, 1);
        });
      case 'mat-toggle':
        return mutateJob(jobId, (j) => {
          const k = findIdx(j.shoppingList, i, (x) => x.item, name);
          if (k >= 0) j.shoppingList[k].bought = !j.shoppingList[k].bought;
        });
      case 'mat-del':
        return mutateJob(jobId, (j) => {
          const k = findIdx(j.shoppingList, i, (x) => x.item, name);
          if (k >= 0) j.shoppingList.splice(k, 1);
        });
      case 'delete-job': {
        const j = h.jobs.find((x) => x.id === jobId);
        if (!j || !confirm(`Delete “${j.title}”? This removes it from the app too.`)) return;
        state.jobId = null;
        return mutate((hh) => (hh.jobs = hh.jobs.filter((x) => x.id !== jobId)), 'Job deleted');
      }
    }
  }

  switch (act) {
    case 'shop-toggle':
    case 'shop-del': {
      const kind = t.dataset.kind;
      const jid = t.dataset.job;
      const del = act === 'shop-del';
      if (kind === 'extra') {
        return mutate((hh) => {
          const k = findIdx(hh.extraShopping, i, (x) => x.item, name);
          if (k < 0) return;
          if (del) hh.extraShopping.splice(k, 1);
          else hh.extraShopping[k].bought = !hh.extraShopping[k].bought;
        });
      }
      if (kind === 'mat' && jid) {
        return mutateJob(jid, (j) => {
          const k = findIdx(j.shoppingList, i, (x) => x.item, name);
          if (k < 0) return;
          if (del) j.shoppingList.splice(k, 1);
          else j.shoppingList[k].bought = !j.shoppingList[k].bought;
        });
      }
      if (kind === 'tool' && jid) {
        // Same as the app's Shopping screen: buying a tool moves it into the Toolbox.
        return mutateJob(jid, (j, hh) => {
          const k = findIdx(j.tools, i, (x) => x.name, name);
          if (k < 0) return;
          j.tools[k].toBuy = false;
          if (!del) {
            j.tools[k].owned = true;
            addToToolbox(hh, name);
          }
        }, del ? undefined : `${name} added to your Toolbox`);
      }
      return;
    }
    case 'inv-del': {
      const id = t.dataset.id!;
      return mutate((hh) => (hh.inventory = hh.inventory.filter((x) => x.id !== id)));
    }
  }
});

document.addEventListener('submit', async (ev) => {
  const form = ev.target as HTMLFormElement;
  const kind = form.dataset.form;
  if (!kind) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const val = String(fd.get('name') ?? '').trim();
  if (kind !== 'email') form.reset();

  if (kind === 'email') {
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    if (!email || !password) {
      state.authError = 'Enter your email and password.';
      return render();
    }
    state.authBusy = true;
    state.authError = '';
    render();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      state.authError = authMessage(e);
    }
    state.authBusy = false;
    return render();
  }

  const h = house();
  if (!h) return;
  const jobId = state.jobId;

  if (kind === 'add-tool' && jobId && val) {
    const owned = toolboxHas(h, val);
    return mutateJob(jobId, (j) => {
      if (j.tools.some((t) => t.name.toLowerCase() === val.toLowerCase())) return;
      j.tools = [...j.tools, { name: val, owned, toBuy: false }];
    });
  }
  if (kind === 'add-mat' && jobId && val) {
    return mutateJob(jobId, (j) => (j.shoppingList = [...j.shoppingList, normItem({ item: val })]));
  }
  if (kind === 'add-extra' && val) {
    return mutate((hh) => (hh.extraShopping = [...hh.extraShopping, normItem({ item: val })]), 'Added to your shopping list');
  }
  if (kind === 'add-inv' && val) {
    if (h.inventory.some((x) => x.name.toLowerCase() === val.toLowerCase())) return toast(`${val} is already in your Toolbox`);
    return mutate((hh) => addToToolbox(hh, val), `${val} added to your Toolbox`);
  }
  if (kind === 'new-job') {
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    const job: Job = {
      id: newId(),
      roomId: String(fd.get('room') ?? h.rooms[0]?.id ?? ''),
      title,
      description: String(fd.get('description') ?? '').trim(),
      status: 'not_started',
      timeEstimate: '',
      difficulty: 'moderate',
      tradeReason: null,
      shoppingList: [],
      tools: [],
      directions: [],
      criticalFlags: [],
      verdict: null,
      verdictReason: null,
      photoPath: null,
      afterPhotoPath: null,
      priority: fd.get('priority') === 'on',
      recurrence: '',
      lastDone: null,
      completedAt: null,
      reminderAt: null,
      reminderRecurrence: '',
      extraPhotos: [],
      thread: [],
      createdAt: now(),
      updatedAt: now(),
      costLow: null,
      costHigh: null,
      costNote: null,
      aiQuickAdded: false,
    };
    state.newJob = false;
    state.jobId = job.id;
    state.statusFilter = state.statusFilter === 'done' ? 'todo' : state.statusFilter;
    return mutate((hh) => (hh.jobs = [...hh.jobs, structuredClone(job)]), 'Job added');
  }
});

// Text fields save when you leave them, not on every keystroke.
document.addEventListener(
  'blur',
  (ev) => {
    const el = ev.target as HTMLInputElement | HTMLTextAreaElement;
    const field = el?.dataset?.blur;
    const jobId = state.jobId;
    if (!field || !jobId) return;
    const h = house();
    const j = h?.jobs.find((x) => x.id === jobId);
    if (!j) return;
    const v = field === 'title' ? el.value.trim() : el.value;
    // Deferred so a click that caused this blur lands before the re-render replaces its target.
    const save = (fn: () => void) => setTimeout(fn, 150);
    if (field === 'title') {
      if (!v || v === j.title) return;
      save(() => mutateJob(jobId, (jj) => (jj.title = v), 'Saved'));
    } else if (field === 'desc') {
      if (v === j.description) return;
      save(() => mutateJob(jobId, (jj) => (jj.description = v), 'Saved'));
    }
  },
  true,
);

document.addEventListener('change', (ev) => {
  const el = ev.target as HTMLSelectElement;
  const kind = el?.dataset?.change;
  if (!kind) return;
  if (kind === 'house') {
    state.houseId = el.value;
    state.roomFilter = '';
    state.jobId = null;
    store.set('jib.web.house', el.value);
    return render();
  }
  if (kind === 'room-filter') {
    state.roomFilter = el.value;
    return render();
  }
  if (kind === 'job-room' && state.jobId) {
    const v = el.value;
    return mutateJob(state.jobId, (j) => (j.roomId = v), 'Moved');
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el?.dataset?.input === 'tq') {
    state.toolboxQuery = el.value;
    render();
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (state.lightbox) state.lightbox = null;
  else if (state.newJob) state.newJob = false;
  else if (state.jobId) state.jobId = null;
  else return;
  render();
});

render();
