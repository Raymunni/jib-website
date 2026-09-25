// Jib on the web — mirrors the phone app (jib_jobs/lib/screens): Home with
// the spaces slider, Shopping, Gallery (grid + timeline), Toolbox and
// Settings (houses, house details, spaces). Reads and writes the same
// users/{uid} document the app syncs. Writes only touch `houses`,
// `updatedAt` and two display preferences (currencyCode,
// afterPhotoPromptEnabled) — never premium, tier or credit fields — and
// run in a transaction against the latest cloud copy, so a web edit can't
// clobber a change the phone pushed a moment earlier.
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
import { getStorage, ref as storageRef, getDownloadURL, uploadBytes } from 'firebase/storage';
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
  climate: string; ageNote: string; stories: string; squareMetres: string; ownedSince: string; photoPath?: string | null;
  rooms: Room[]; jobs: Job[]; extraShopping: ShoppingItem[]; galleryPhotos: GalleryPhoto[]; inventory: InventoryItem[];
  [k: string]: unknown;
}
export interface UserDoc {
  houses: House[]; activeHouseId?: string | null; premium?: boolean; tier?: string; currencyCode?: string;
  afterPhotoPromptEnabled?: boolean; updatedAt?: number;
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
const DEMO = new URLSearchParams(location.search).has('demo');

// ---------- Photos ----------
// Saved download URLs can carry stale tokens (re-uploading from the phone
// mints a new one), so the web never trusts the saved token: it takes the
// storage path and asks Storage for a fresh URL as the signed-in user.
// Grids use the small WebP thumbnail the app uploads alongside each photo.
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
  } ${opts.attrs ?? ''} draggable="false" />`;
}
function hydratePhotos() {
  document.querySelectorAll<HTMLImageElement>('img[data-photo]').forEach(async (img) => {
    if (img.getAttribute('src')) return;
    const u = await resolvePhoto(img.dataset.photo!, img.dataset.thumb === '1');
    if (u) img.src = u;
    else img.classList.add('missing-photo');
  });
}

/** Scales an image down on a canvas and returns it as the given type, or null if the browser can't decode it. */
async function scaleImage(file: File, max: number, type: string, quality: number): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, type, quality));
  } catch {
    return null;
  }
}

/**
 * Uploads a photo the same way the app does (users/<uid>/photos/<name> plus
 * a small WebP thumbnail in thumbs/), and returns its download URL.
 */
async function uploadPhoto(file: File): Promise<string> {
  if (DEMO) return URL.createObjectURL(file);
  const uid = state.user!.uid;
  const base = `photo_${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const full = (await scaleImage(file, 2048, 'image/jpeg', 0.86)) ?? file;
  const ext = full === file ? (file.name.split('.').pop() || 'jpg').toLowerCase() : 'jpg';
  const path = `users/${uid}/photos/${base}.${ext}`;
  await uploadBytes(storageRef(storage, path), full, { contentType: full.type || 'image/jpeg' });
  const url = await getDownloadURL(storageRef(storage, path));
  resolved.set(path, url);
  const thumb = await scaleImage(file, 320, 'image/webp', 0.6);
  if (thumb) {
    const tp = `users/${uid}/thumbs/${base}.webp`;
    try {
      await uploadBytes(storageRef(storage, tp), thumb, { contentType: 'image/webp' });
    } catch {
      /* thumbnails are best-effort, like the app */
    }
  }
  return url;
}

/** Opens the file picker and resolves with the chosen images (empty if cancelled). */
function pickImages(multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

async function withUpload(files: File[], then: (urls: string[]) => Promise<void> | void) {
  if (!files.length) return;
  state.uploading = files.length;
  render();
  try {
    const urls: string[] = [];
    for (const f of files) urls.push(await uploadPhoto(f));
    await then(urls);
  } catch (e) {
    console.error(e);
    toast('Couldn’t upload that photo — try again');
  } finally {
    state.uploading = 0;
    render();
  }
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
type View = 'home' | 'shopping' | 'gallery' | 'toolbox' | 'settings';
type Modal =
  | { kind: 'add-space' }
  | { kind: 'space-menu'; roomId: string | null }
  | { kind: 'rename-space'; roomId: string }
  | { kind: 'add-house' }
  | { kind: 'gallery-add' }
  | { kind: 'move-to' }
  | { kind: 'set-date' }
  | { kind: 'confirm'; title: string; body: string; action: string; danger?: boolean; onYes: () => void };

const state = {
  user: null as User | null,
  authReady: false,
  data: null as UserDoc | null,
  dataReady: false,
  loadError: '',
  houseId: store.get('jib.web.house') as string | null,
  view: ((): View => {
    const v = store.get('jib.web.view');
    return v === 'shopping' || v === 'gallery' || v === 'toolbox' || v === 'settings' ? v : 'home';
  })(),
  room: null as string | null, // shared space filter for Home and Gallery, like the app's homeRoomFilter
  expanded: new Set<string>(),
  completedOpen: false,
  summaryOpen: false,
  jobId: null as string | null,
  newJob: false,
  galleryMode: 'grid' as 'grid' | 'timeline',
  selecting: false,
  selected: new Set<string>(),
  shopBy: 'store' as 'store' | 'job',
  toolboxQuery: '',
  lightbox: null as null | { src: string } | { before: string; after: string },
  modal: null as Modal | null,
  uploading: 0,
  authError: '',
  authBusy: false,
  draftPhotos: [] as string[],
};
let unsubDoc: Unsubscribe | null = null;

// ---------- Helpers ----------
const $app = document.getElementById('app')!;
const $top = document.getElementById('w-top-slot')!;
const $tabs = document.getElementById('w-tabs-bar')!;
const $toast = document.getElementById('w-toast')!;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const isPhoto = (p?: string | null): p is string => !!p && (/^https:\/\//.test(p) || /^blob:/.test(p));
const newId = () => crypto.randomUUID().slice(0, 8);
const now = () => Date.now();
const RECURRENCE = ['daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
const RECUR_DAYS: Record<string, number> = { daily: 1, weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91, yearly: 365 };
const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD'];

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
const roomOf = (h: House, id: string | null | undefined) => h.rooms.find((r) => r.id === id) ?? null;
const roomName = (h: House, id: string) => roomOf(h, id)?.name ?? 'Other';

function money(n?: number | null) {
  if (n == null) return '';
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: state.data?.currencyCode || 'AUD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const isoDate = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function dueInDays(j: Job): number | null {
  const d = RECUR_DAYS[j.recurrence];
  if (!d) return null;
  const due = (j.lastDone ?? j.createdAt) + d * 86400000;
  return Math.ceil((due - now()) / 86400000);
}
const hasRealFlags = (j: Job) => j.criticalFlags.length > 0 && j.criticalFlags[0] !== 'None for this job.';

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
function seasonLabel(ms: number) {
  const d = new Date(ms);
  const m = d.getMonth() + 1;
  if (m === 12) return `Summer ${d.getFullYear()}`;
  if (m <= 2) return `Summer ${d.getFullYear() - 1}`;
  if (m <= 5) return `Autumn ${d.getFullYear()}`;
  if (m <= 8) return `Winter ${d.getFullYear()}`;
  return `Spring ${d.getFullYear()}`;
}

/** Fill any fields an older app version didn't write, so the UI never trips on undefined. */
function normalise(d: UserDoc): UserDoc {
  d.houses = (d.houses ?? []).map((h) => ({
    ...h,
    name: h.name ?? 'Home',
    climate: h.climate ?? '',
    ageNote: h.ageNote ?? '',
    stories: h.stories ?? '',
    squareMetres: h.squareMetres ?? '',
    ownedSince: h.ownedSince ?? '',
    rooms: (h.rooms ?? []).map((r) => ({ ...r, hazards: r.hazards ?? [] })),
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
/** Applies [change] to the whole document in a transaction on the latest cloud copy. */
async function mutateDoc(change: (d: UserDoc) => void, okMsg?: string) {
  if (!state.data) return;
  change(state.data);
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
      change(fresh);
      const patch: Record<string, unknown> = { houses: fresh.houses, updatedAt: now() };
      if (fresh.activeHouseId !== undefined) patch.activeHouseId = fresh.activeHouseId;
      if (fresh.currencyCode !== undefined) patch.currencyCode = fresh.currencyCode;
      if (fresh.afterPhotoPromptEnabled !== undefined) patch.afterPhotoPromptEnabled = fresh.afterPhotoPromptEnabled;
      tx.update(ref, patch);
    });
    if (okMsg) toast(okMsg);
  } catch (e) {
    console.error(e);
    toast('Couldn’t save that — check your connection and try again');
  }
}
/** Applies [change] to the current house only. */
function mutate(change: (h: House) => void, okMsg?: string) {
  const h = house();
  if (!h) return Promise.resolve();
  const houseId = h.id;
  return mutateDoc((d) => {
    const target = d.houses.find((x) => x.id === houseId);
    if (target) change(target);
  }, okMsg);
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
/** Mirrors the app: a photo attached anywhere also gets a gallery entry for its space. */
function addToGallery(h: House, roomId: string, url: string, note: string, photoDate?: number | null) {
  if (h.galleryPhotos.some((g) => g.photoPath === url && !g.pairedPhotoPath)) return;
  h.galleryPhotos = [...h.galleryPhotos, { id: newId(), roomId, photoPath: url, note, createdAt: now(), pairedPhotoPath: null, photoDate: photoDate ?? null }];
}
function newHouse(name: string): House {
  return {
    id: newId(), name, suburb: null, climate: '', ageNote: '', stories: '', squareMetres: '', ownedSince: '', photoPath: null,
    rooms: [{ id: newId(), name: 'Whole house', photoPath: null, hazards: [] }],
    jobs: [], extraShopping: [], galleryPhotos: [], inventory: [],
  };
}
function blankJob(roomId: string, title: string): Job {
  return {
    id: newId(), roomId, title, description: '', status: 'not_started', timeEstimate: '', difficulty: 'moderate', tradeReason: null,
    shoppingList: [], tools: [], directions: [], criticalFlags: [], verdict: null, verdictReason: null, photoPath: null, afterPhotoPath: null,
    priority: false, recurrence: '', lastDone: null, completedAt: null, reminderAt: null, reminderRecurrence: '', extraPhotos: [], thread: [],
    createdAt: now(), updatedAt: now(), costLow: null, costHigh: null, costNote: null, aiQuickAdded: false,
  };
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
  if (state.room && !roomOf(h, state.room)) state.room = null;

  let html = '';
  if (state.view === 'home') html = viewHome(h);
  else if (state.view === 'shopping') html = viewShopping(h);
  else if (state.view === 'gallery') html = viewGallery(h);
  else if (state.view === 'toolbox') html = viewToolbox(h);
  else html = viewSettings(h);
  if (state.jobId) {
    const j = h.jobs.find((x) => x.id === state.jobId);
    if (j) html += viewJob(h, j);
    else state.jobId = null;
  }
  if (state.newJob) html += viewNewJob(h);
  if (state.modal) html += viewModal(h, state.modal);
  if (state.lightbox) html += viewLightbox(state.lightbox);
  if (state.uploading) html += `<div class="w-uploading"><span class="spinner"></span> Uploading ${state.uploading} photo${state.uploading === 1 ? '' : 's'}…</div>`;

  // Preserve focus, typing and scroll across re-renders (snapshots arrive while typing).
  const active = document.activeElement as HTMLInputElement | null;
  const focusKey = active?.dataset?.key;
  const typed = focusKey ? active!.value : null;
  const sel = focusKey ? [active!.selectionStart, active!.selectionEnd] : null;
  const drawerScroll = document.querySelector('.w-drawer')?.scrollTop ?? 0;
  const barScroll = document.querySelector('.space-bar')?.scrollLeft ?? 0;
  $app.innerHTML = html;
  hydratePhotos();
  const drawer = document.querySelector('.w-drawer');
  if (drawer) drawer.scrollTop = drawerScroll;
  const bar = document.querySelector<HTMLElement>('.space-bar');
  if (bar) {
    bar.scrollLeft = barScroll;
    bar.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (focusKey) {
    const el = $app.querySelector<HTMLInputElement>(`[data-key="${focusKey}"]`);
    if (el) {
      if (typed != null && 'value' in el) el.value = typed;
      el.focus();
      if (sel && el.setSelectionRange && sel[0] != null) {
        try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ }
      }
    }
  }
}

// The site links row is static in the page; this fills the account area and the app's own tab row.
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
  const tabs: [View, string, string][] = [
    ['home', 'Home', '⌂'],
    ['shopping', 'Shopping', '🛒'],
    ['gallery', 'Gallery', '▦'],
    ['toolbox', 'Toolbox', '🧰'],
    ['settings', 'Settings', '⚙'],
  ];
  $tabs.hidden = false;
  $tabs.innerHTML = `
    <nav class="w-tabs" aria-label="Your Jib">
      ${tabs
        .map(([v, l, i]) => `<button data-act="view" data-v="${v}" ${state.view === v ? 'aria-current="page"' : ''}><span aria-hidden="true">${i}</span> ${l}</button>`)
        .join('')}
    </nav>
    <span class="w-spacer"></span>
    <button class="w-btn small primary" data-act="new-job">+ New job</button>`;
}

function renderSignIn() {
  $app.innerHTML = `
    <section class="w-auth">
      <h1>Sign in to Jib</h1>
      <p class="muted">Manage your jobs, spaces, shopping list, gallery and Toolbox from your computer. Use the same account you use in the app.</p>
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
      <p class="w-note">New to Jib? Create your account in the app first: <a href="/app/">get Jib for iPhone or Android</a>. Or <a href="/web/?demo">try the web demo</a>.</p>
    </section>`;
}

// ----- Shared pieces -----
/** The spaces slider, shared by Home and Gallery exactly like the app's SpaceTabBar. */
function spaceBar(h: House, allLabel: string) {
  const tab = (id: string | null, label: string) => {
    const active = state.room === id;
    return `<button class="space-tab" data-act="space" data-id="${esc(id ?? '')}" ${active ? 'aria-current="true"' : ''}>${esc(label)}${
      active ? `<span class="space-more" data-act="space-menu" data-id="${esc(id ?? '')}" title="Space options" role="button" aria-label="Options for ${esc(label)}">⋯</span>` : ''
    }</button>`;
  };
  return `
    <div class="space-bar" role="tablist" aria-label="Spaces">
      <button class="space-tab add" data-act="add-space">+ Add space</button>
      ${tab(null, allLabel)}
      ${h.rooms.map((r) => tab(r.id, r.name)).join('')}
    </div>`;
}
function spacePhoto(h: House): string | null {
  const r = roomOf(h, state.room);
  return (r && isPhoto(r.photoPath) ? r.photoPath : null) ?? (isPhoto(h.photoPath as string) ? (h.photoPath as string) : null);
}
function chips<T extends string>(name: string, options: [T, string][], value: T, act: string) {
  return `<div class="w-chips" role="radiogroup" aria-label="${esc(name)}">${options
    .map(([v, l]) => `<button type="button" class="chip" data-act="${act}" data-v="${esc(v)}" aria-pressed="${v === value}">${esc(l)}</button>`)
    .join('')}</div>`;
}

// ----- Home -----
function jobTile(h: House, j: Job, showRoom: boolean) {
  const done = j.status === 'done';
  const open = state.expanded.has(j.id);
  const due = dueInDays(j);
  const photos = [j.photoPath, j.afterPhotoPath, ...j.extraPhotos].filter(isPhoto);
  return `
    <div class="tile ${done ? 'done' : ''} ${open ? 'open' : ''}">
      <div class="tile-row">
        <button class="tick ${done ? 'on' : ''}" data-act="toggle-done" data-id="${esc(j.id)}" aria-label="${done ? 'Mark not done' : 'Mark done'}">${done ? '✓' : ''}</button>
        <button class="tile-main" data-act="expand" data-id="${esc(j.id)}" aria-expanded="${open}">
          <span class="tile-title">${esc(j.title)}</span>
          ${j.recurrence ? `<span class="ico" title="Repeats ${esc(j.recurrence)}">↻</span>` : ''}
          ${j.aiQuickAdded ? `<span class="ico spark" title="Added by AI from a photo">✦</span>` : ''}
          ${j.verdict === 'tradie_required' ? `<span class="pill bad">Tradie</span>` : ''}
          ${due != null && due < 0 && !done ? `<span class="pill bad">Overdue</span>` : due != null && due <= 7 && !done ? `<span class="pill warn">Due ${due}d</span>` : ''}
          <span class="w-spacer"></span>
          ${showRoom ? `<span class="tile-meta">${esc(roomName(h, j.roomId))}</span>` : ''}
          <span class="chev">${open ? '▴' : '›'}</span>
        </button>
      </div>
      ${
        open
          ? `<div class="tile-body">
          ${photos.length ? `<div class="tile-photos">${photos.map((p) => photo(p, { thumb: true, attrs: `data-act="lightbox" data-src="${esc(p)}"` })).join('')}</div>` : ''}
          <p class="tile-line">⌂ ${esc([roomName(h, j.roomId), j.recurrence || 'One-off'].join(' · '))}${j.timeEstimate ? ` · ⏱ ${esc(j.timeEstimate)}` : ''}</p>
          ${j.reminderAt ? `<p class="tile-line">🔔 ${esc(fmtDateTime(j.reminderAt))}${j.reminderRecurrence ? ` · ${esc(j.reminderRecurrence)}` : ''}</p>` : ''}
          ${j.description ? `<p class="tile-desc">${esc(j.description)}</p>` : ''}
          ${j.directions.length ? `<p class="tile-h">Steps</p><ol class="tile-list">${j.directions.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>` : ''}
          ${
            j.shoppingList.length
              ? `<p class="tile-h">Shopping list 🛒</p><ul class="tile-list">${j.shoppingList
                  .map((s) => `<li class="${s.bought ? 'struck' : ''}">${esc(s.item || 'Untitled item')}</li>`)
                  .join('')}</ul>`
              : ''
          }
          ${j.costLow != null && j.costHigh != null ? `<p class="tile-line strong">💲 ${money(j.costLow)}–${money(j.costHigh)}</p>` : ''}
          ${j.thread.length ? `<p class="tile-line">✦ AI · ${j.thread.length} message${j.thread.length === 1 ? '' : 's'}</p>` : ''}
          <button class="w-link tile-open" data-act="open-job" data-id="${esc(j.id)}">✎ Open job</button>
        </div>`
          : ''
      }
    </div>`;
}

function viewHome(h: House) {
  const scope = state.room == null ? h.jobs : h.jobs.filter((j) => j.roomId === state.room);
  const showRoom = state.room == null;
  const priority = scope.filter((j) => j.priority && j.status !== 'done');
  const active = scope.filter((j) => j.status !== 'done').sort((a, b) => b.updatedAt - a.updatedAt);
  const completed = scope.filter((j) => j.status === 'done').sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  const hs = state.data!.houses;
  const built = h.ageNote && h.suburb ? `Built in ${h.ageNote}, in ${h.suburb.name}` : h.ageNote ? `Built in ${h.ageNote}` : h.suburb ? `${h.suburb.name}, ${h.suburb.state}` : '';
  const headline = [built, h.stories ? `${h.stories} ${h.stories === '1' ? 'storey' : 'storeys'}` : '', h.squareMetres ? `${h.squareMetres}m²` : ''].filter(Boolean).join(' · ');
  const bg = spacePhoto(h);
  const room = roomOf(h, state.room);
  return `
    <section class="home-head">
      <div class="houses">
        ${hs.map((x) => `<button class="chip" data-act="switch-house" data-id="${esc(x.id)}" aria-pressed="${x.id === h.id}">${esc(x.name)}</button>`).join('')}
        <button class="chip ghost" data-act="add-house">+ Add house</button>
      </div>
      <button class="house-name" data-act="toggle-summary" aria-expanded="${state.summaryOpen}">${esc(h.name)} <span>${state.summaryOpen ? '▴' : '▾'}</span></button>
      ${headline ? `<p class="house-facts">${esc(headline)}</p>` : ''}
      ${
        state.summaryOpen
          ? `<div class="summary">
          <label class="sr-only" for="w-sum">House summary</label>
          <textarea id="w-sum" class="w-textarea" data-key="summary" data-blur="summary" placeholder="Write your own summary of the house (the app can also generate one with AI)">${esc(h.climate)}</textarea>
        </div>`
          : ''
      }
    </section>
    ${spaceBar(h, 'All jobs')}
    <div class="swipe" data-swipe>
      ${
        bg
          ? `<div class="space-banner">${photo(bg, { alt: room ? room.name : h.name })}<span>${esc(room ? room.name : h.name)}</span></div>`
          : room
            ? `<button class="space-banner empty" data-act="space-photo" data-id="${esc(room.id)}">+ Add a background photo for ${esc(room.name)}</button>`
            : ''
      }
      <section class="card group">
        <h2><span class="gi">★</span> Priority</h2>
        ${priority.length ? priority.map((j) => jobTile(h, j, showRoom)).join('') : '<p class="faint">Star a job to pin it here</p>'}
      </section>
      <section class="card group">
        <h2><span class="gi">☰</span> All jobs <span class="count">${active.length}</span></h2>
        ${active.length ? active.map((j) => jobTile(h, j, showRoom)).join('') : `<p class="faint">Nothing on the list${room ? ` for ${esc(room.name)}` : ''} yet — add a job, or snap one in the app.</p>`}
      </section>
      ${
        completed.length
          ? `<section class="card group">
          <button class="group-toggle" data-act="toggle-completed" aria-expanded="${state.completedOpen}"><span class="gi">✓</span> Completed <span class="count">${completed.length}</span> <span class="chev">${state.completedOpen ? '▴' : '▾'}</span></button>
          ${state.completedOpen ? completed.map((j) => jobTile(h, j, showRoom)).join('') : ''}
        </section>`
          : ''
      }
    </div>`;
}

// ----- Job editor -----
function viewJob(h: House, j: Job) {
  const done = j.status === 'done';
  const sash =
    j.verdict === 'tradie_required'
      ? '<div class="sash tradie"><span>TRADIE REQUIRED</span></div>'
      : j.verdict === 'diy_safe'
        ? '<div class="sash diy"><span>DIY SAFE</span></div>'
        : '<div class="sash none"><span>DIY OR TRADIE?</span></div>';
  const before = isPhoto(j.photoPath) ? j.photoPath : null;
  const after = isPhoto(j.afterPhotoPath) ? j.afterPhotoPath : null;
  const extras = j.extraPhotos.filter(isPhoto);
  const toolsOwned = j.tools.filter((t) => t.owned || toolboxHas(h, t.name)).length;
  const due = dueInDays(j);
  const ph = (p: string, label: string, kind: string) =>
    `<figure class="jp">${photo(p, { thumb: true, alt: label, attrs: `data-act="lightbox" data-src="${esc(p)}"` })}<figcaption>${label}</figcaption>
      <button class="jp-x" data-act="remove-photo" data-kind="${kind}" data-src="${esc(p)}" aria-label="Remove photo">✕</button></figure>`;

  return `
    <div class="w-scrim" data-act="close-job"></div>
    <aside class="w-drawer" role="dialog" aria-modal="true" aria-label="${esc(j.title)}">
      ${sash}
      <div class="w-drawer-inner">
        <div class="w-drawer-top">
          <button class="icon-btn" data-act="close-job" aria-label="Close">✕</button>
          <span class="w-note">${esc(roomName(h, j.roomId))}</span>
        </div>

        <div class="jp-row">
          ${before ? ph(before, 'Before', 'before') : ''}
          ${after ? ph(after, 'After', 'after') : ''}
          ${extras.map((p) => ph(p, 'Photo', 'extra')).join('')}
          <button class="jp-add" data-act="add-job-photo" data-kind="${before ? 'extra' : 'before'}">＋<span>Add photo</span></button>
          ${!after ? `<button class="jp-add" data-act="add-job-photo" data-kind="after">＋<span>After photo</span></button>` : ''}
        </div>
        ${before && after ? `<button class="w-link" data-act="compare" data-before="${esc(before)}" data-after="${esc(after)}">⇆ Compare before & after</button>` : ''}

        <label class="sr-only" for="w-jt">Job title</label>
        <input id="w-jt" class="w-input w-title-input" data-key="title" data-blur="title" value="${esc(j.title)}" />

        <div class="w-row">
          <button class="done-btn ${done ? 'on' : ''}" data-act="toggle-done" data-id="${esc(j.id)}">${done ? '✓ Done' : 'Mark done'}</button>
          ${
            done && j.completedAt
              ? `<label class="w-note">Completed <input type="date" class="w-input small" data-change="completed-date" value="${isoDate(j.completedAt)}" /></label>`
              : ''
          }
          <button class="chip" data-act="priority" aria-pressed="${j.priority}">★ Priority</button>
        </div>

        <div class="w-section">
          <h3>Space</h3>
          ${chips('Space', h.rooms.map((r) => [r.id, r.name] as [string, string]), j.roomId, 'job-room')}
        </div>

        <div class="w-section">
          <h3>Repeat ${due != null ? `<span class="pill ${due < 0 ? 'bad' : due <= 7 ? 'warn' : ''}">${due < 0 ? `overdue ${-due}d` : `due in ${due}d`}</span>` : ''}</h3>
          ${chips('Repeat', [['', 'One-off'], ...RECURRENCE.map((r) => [r, r] as [string, string])], j.recurrence, 'recurrence')}
          ${j.recurrence ? `<button class="w-link" data-act="reset-cycle">↻ Reset cycle (done today)</button>` : ''}
        </div>

        <div class="w-section">
          <h3>Reminder</h3>
          <p class="w-note">${j.reminderAt ? `🔔 ${esc(fmtDateTime(j.reminderAt))}${j.reminderRecurrence ? ` · ${esc(j.reminderRecurrence)}` : ''}. ` : 'No reminder set. '}Reminders are notifications on your phone, so set or change them in the Jib app.</p>
        </div>

        <div class="w-section">
          <h3>DIY or tradie</h3>
          ${
            j.verdict === 'tradie_required'
              ? `<div class="verdict-box tradie"><strong style="color:#ff9c96">Tradie required</strong><p>${esc(j.verdictReason || 'Part of this job legally needs a licensed tradesperson.')}</p></div>`
              : j.verdict === 'diy_safe'
                ? `<div class="verdict-box diy"><strong style="color:#7ee2a2">DIY safe</strong><p>${esc(j.verdictReason || 'Nothing in this job legally needs a licence where your house is.')}</p></div>`
                : `<div class="verdict-box"><p>Not checked yet. Open this job in the Jib app to get a DIY safe or tradie required verdict.</p></div>`
          }
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
        ${hasRealFlags(j) ? `<div class="w-section"><h3>Job warnings</h3><div class="w-warn"><ul>${j.criticalFlags.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div></div>` : ''}

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
            <input class="w-input narrow" name="retailer" placeholder="Store (optional)" />
            <button class="w-btn" type="submit">Add</button>
          </form>
        </div>

        <div class="w-section">
          <h3>Directions</h3>
          <ol class="steps-edit">
            ${j.directions
              .map(
                (d, i) => `<li>
                <textarea class="w-textarea step" rows="2" data-key="step-${i}" data-blur="step" data-i="${i}" aria-label="Step ${i + 1}">${esc(d)}</textarea>
                <span class="step-btns">
                  <button class="icon-btn" data-act="step-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move step up">↑</button>
                  <button class="icon-btn" data-act="step-del" data-i="${i}" aria-label="Delete step">✕</button>
                </span>
              </li>`,
              )
              .join('')}
          </ol>
          <form class="w-add" data-form="add-step">
            <label class="sr-only" for="w-addstep">Add a step</label>
            <input id="w-addstep" class="w-input" name="name" placeholder="Add a step" data-key="addstep" />
            <button class="w-btn" type="submit">Add</button>
          </form>
          <p class="w-note">The app can write every step for you with AI from the job photo.</p>
        </div>

        ${
          j.thread.length
            ? `<div class="w-section"><h3>✦ Ask AI history</h3><div class="thread">${j.thread
                .map((m) => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}">${esc(m.message)}</div>`)
                .join('')}</div><p class="w-note">Ask follow-up questions in the app.</p></div>`
            : ''
        }

        <div class="w-section">
          <button class="w-btn danger" data-act="delete-job">Delete job</button>
        </div>
      </div>
    </aside>`;
}

function viewNewJob(h: House) {
  const roomId = state.room ?? h.rooms[0]?.id ?? '';
  return `
    <div class="w-scrim" data-act="close-new"></div>
    <aside class="w-drawer" role="dialog" aria-modal="true" aria-label="New job">
      <div class="w-drawer-inner">
        <div class="w-drawer-top"><button class="icon-btn" data-act="close-new" aria-label="Close">✕</button><strong>New job</strong></div>
        <form data-form="new-job" class="stack">
          <label>Title<input class="w-input full" name="title" required placeholder="e.g. Regrout the shower" data-key="nj-title" /></label>
          <fieldset class="bare"><legend>Space</legend>
            <div class="w-chips">${h.rooms
              .map((r) => `<label class="chip-radio"><input type="radio" name="room" value="${esc(r.id)}" ${r.id === roomId ? 'checked' : ''} /><span>${esc(r.name)}</span></label>`)
              .join('')}</div>
          </fieldset>
          <label>Description<textarea class="w-textarea" name="description" placeholder="What needs doing? (optional)"></textarea></label>
          <fieldset class="bare"><legend>Repeat</legend>
            <div class="w-chips">${[['', 'One-off'], ...RECURRENCE.map((r) => [r, r])]
              .map(([v, l]) => `<label class="chip-radio"><input type="radio" name="recurrence" value="${v}" ${v === '' ? 'checked' : ''} /><span>${l}</span></label>`)
              .join('')}</div>
          </fieldset>
          <label class="w-row"><input type="checkbox" name="priority" /> ★ Priority</label>
          <div>
            <button type="button" class="w-btn" data-act="new-job-photo">📷 Add photos</button>
            <div class="jp-row">${state.draftPhotos.map((p) => photo(p, { thumb: true, cls: 'mini' })).join('')}</div>
          </div>
          <button class="w-btn primary" type="submit">Add job</button>
          <p class="w-note">Tip: in the app, snap a photo and AI writes the title, steps, materials, tools, cost and a DIY-or-tradie verdict for you.</p>
        </form>
      </div>
    </aside>`;
}

// ----- Shopping -----
interface Entry { item: ShoppingItem; job?: Job; kind: 'mat' | 'tool' | 'extra'; idx: number }
function shoppingEntries(h: House): Entry[] {
  const out: Entry[] = [];
  for (const j of h.jobs) {
    j.shoppingList.forEach((s, i) => out.push({ item: s, job: j, kind: 'mat', idx: i }));
    j.tools.forEach((t, i) => {
      if (t.toBuy && !t.owned) out.push({ item: normItem({ item: t.name }), job: j, kind: 'tool', idx: i });
    });
  }
  h.extraShopping.forEach((s, i) => out.push({ item: s, kind: 'extra', idx: i }));
  return out;
}
function entryRow(h: House, e: Entry, showJob: boolean) {
  const attrs = `data-kind="${e.kind}" data-i="${e.idx}" data-name="${esc(e.item.item)}" ${e.job ? `data-job="${esc(e.job.id)}"` : ''}`;
  const src = e.job ? `${e.kind === 'tool' ? 'Tool · ' : ''}For: ${e.job.title} · ${roomName(h, e.job.roomId)}` : 'General';
  return `
    <li class="w-item ${e.item.bought ? 'bought' : ''}">
      <button class="check ${e.item.bought ? 'on' : ''}" data-act="shop-toggle" ${attrs} aria-label="${e.item.bought ? 'Mark not bought' : 'Mark bought'}">${e.item.bought ? '✓' : ''}</button>
      <span class="grow"><span class="name">${esc(e.item.item || 'Untitled item')}</span>${
        showJob ? `<span class="sub">${esc(src)}</span>` : primaryRetailer(e.item) ? `<span class="sub">${esc(primaryRetailer(e.item))}</span>` : ''
      }</span>
      ${e.job ? `<button class="w-link small" data-act="open-job" data-id="${esc(e.job.id)}">Job</button>` : ''}
      ${primaryUrl(e.item) ? `<a class="w-link" href="${esc(primaryUrl(e.item))}" target="_blank" rel="noopener">Shop</a>` : ''}
      <button class="icon-btn" data-act="shop-del" ${attrs} aria-label="Remove ${esc(e.item.item)}">✕</button>
    </li>`;
}
function viewShopping(h: House) {
  const all = shoppingEntries(h);
  const active = all.filter((e) => !e.item.bought);
  const bought = all.filter((e) => e.item.bought);
  const groups = new Map<string, Entry[]>();
  for (const e of active) {
    const k =
      state.shopBy === 'store'
        ? e.kind === 'tool'
          ? 'Tools to buy'
          : primaryRetailer(e.item) || 'Anywhere'
        : e.job
          ? `${e.job.title} · ${roomName(h, e.job.roomId)}`
          : 'General';
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return `
    <div class="w-bar"><h1>Shopping</h1><span class="pill">${active.length} to buy</span>
      <span class="w-spacer"></span>
      ${chips('Group by', [['store', 'By store'], ['job', 'By job']], state.shopBy, 'shop-by')}
    </div>
    <p class="w-note" style="margin-top:-8px">Materials from every job, plus tools you chose to buy, in one list. Open it in the aisle and you'll know what each thing is for.</p>
    <form class="w-add" data-form="add-extra" style="max-width:560px;margin:14px 0 18px">
      <label class="sr-only" for="w-addx">Add to shopping list</label>
      <input id="w-addx" class="w-input" name="name" placeholder="Add something to the list" data-key="addextra" />
      <button class="w-btn" type="submit">Add</button>
    </form>
    ${
      active.length === 0
        ? '<div class="w-empty">Your shopping list is empty. Materials from your jobs and tools you choose to buy show up here.</div>'
        : `<div class="w-cols">${[...groups.entries()]
            .map(([k, es]) => `<section class="w-retailer card"><h2>${esc(k)} <span class="count">${es.length}</span></h2><ul class="w-list">${es.map((e) => entryRow(h, e, state.shopBy === 'store')).join('')}</ul></section>`)
            .join('')}</div>`
    }
    ${bought.length ? `<details class="w-bought"><summary>Bought (${bought.length})</summary><ul class="w-list">${bought.map((e) => entryRow(h, e, true)).join('')}</ul></details>` : ''}
    <p class="w-note" style="margin-top:20px">Ticking off a tool moves it into your Toolbox, so no future job asks you to buy it again.</p>`;
}

// ----- Gallery -----
interface GEntry { key: string; photo: string; paired?: string | null; title: string; roomId: string; date: number; jobId?: string; galleryId?: string }
function galleryEntries(h: House): GEntry[] {
  const gPaths = new Set(h.galleryPhotos.map((g) => g.photoPath));
  const out: GEntry[] = [];
  for (const j of h.jobs.filter((x) => x.status === 'done')) {
    const p = j.afterPhotoPath ?? j.photoPath;
    if (isPhoto(p) && !gPaths.has(p)) out.push({ key: `j:${j.id}`, photo: p, title: j.title, roomId: j.roomId, date: j.completedAt ?? j.updatedAt, jobId: j.id });
  }
  for (const g of h.galleryPhotos) {
    if (!isPhoto(g.photoPath)) continue;
    out.push({ key: `g:${g.id}`, photo: g.photoPath, paired: isPhoto(g.pairedPhotoPath) ? g.pairedPhotoPath : null, title: g.note, roomId: g.roomId, date: g.photoDate ?? g.createdAt ?? 0, galleryId: g.id });
  }
  return out.sort((a, b) => b.date - a.date);
}
function viewGallery(h: House) {
  const entries = galleryEntries(h).filter((e) => state.room == null || e.roomId === state.room);
  const sel = [...state.selected].map((k) => entries.find((e) => e.key === k)).filter((e): e is GEntry => !!e);
  const selGallery = sel.filter((e) => e.galleryId);
  const combinable = sel.length === 2 && sel.every((e) => !e.paired);
  const toolbar = state.selecting
    ? `<div class="sel-bar">
        <strong>${sel.length} selected</strong>
        <span class="w-spacer"></span>
        <button class="w-btn small" data-act="g-combine" ${combinable ? '' : 'disabled'} title="Pick exactly two photos">⇆ Before & after</button>
        <button class="w-btn small" data-act="g-move" ${selGallery.length ? '' : 'disabled'}>Move to space</button>
        <button class="w-btn small" data-act="g-background" ${sel.length === 1 ? '' : 'disabled'}>Set as background</button>
        <button class="w-btn small" data-act="g-date" ${selGallery.length ? '' : 'disabled'}>Set date</button>
        <button class="w-btn small danger" data-act="g-delete" ${selGallery.length ? '' : 'disabled'}>Delete</button>
        <button class="w-btn small" data-act="g-select">Done</button>
      </div>`
    : '';
  let body = '';
  if (state.galleryMode === 'timeline') {
    const done = h.jobs
      .filter((j) => j.status === 'done' && j.completedAt && (state.room == null || j.roomId === state.room))
      .sort((a, b) => b.completedAt! - a.completedAt!);
    if (!done.length) body = `<div class="w-empty">${state.room == null ? 'Complete a job and it lands here, on the timeline of your home.' : 'Nothing completed for this space yet.'}</div>`;
    else {
      const groups = new Map<string, Job[]>();
      for (const j of done) groups.set(seasonLabel(j.completedAt!), [...(groups.get(seasonLabel(j.completedAt!)) ?? []), j]);
      let side = 0;
      body = `<div class="timeline">${[...groups.entries()]
        .map(
          ([label, js]) => `<h3 class="season">${esc(label)}</h3>${js
            .map((j) => {
              const p = [j.afterPhotoPath, j.photoPath].find(isPhoto);
              return `<button class="tl-row ${side++ % 2 ? 'right' : 'left'}" data-act="open-job" data-id="${esc(j.id)}">
                ${p ? photo(p, { thumb: true, cls: 'tl-img' }) : '<span class="tl-img blank">✓</span>'}
                <span><strong>${esc(j.title)}</strong><span class="sub">${esc(roomName(h, j.roomId))} · ${esc(fmtDate(j.completedAt!))}</span></span>
              </button>`;
            })
            .join('')}`,
        )
        .join('')}<div class="tl-end">⌂</div></div>`;
    }
  } else if (!entries.length) {
    body = `<div class="w-empty">No photos${state.room ? ' for this space' : ''} yet. Add one here, or finish a job with a photo in the app.</div>`;
  } else {
    body = `<div class="w-gallery">${entries
      .map((e) => {
        const on = state.selected.has(e.key);
        const inner = e.paired
          ? `<span class="pair">${photo(e.photo, { thumb: true, cls: 'pb' })}${photo(e.paired, { thumb: true, cls: 'pa' })}<span class="pair-tag">Before · After</span></span>`
          : photo(e.photo, { thumb: true, alt: e.title });
        return `<button class="g-tile ${on ? 'on' : ''}" data-act="g-tile" data-key="${esc(e.key)}">${inner}
          ${e.title ? `<span class="cap">${esc(e.title)}</span>` : ''}
          ${state.selecting ? `<span class="g-check">${on ? '✓' : ''}</span>` : ''}</button>`;
      })
      .join('')}</div>`;
  }
  return `
    <div class="w-bar"><h1>Gallery</h1>
      <span class="w-spacer"></span>
      ${chips('View', [['grid', '▦ Grid'], ['timeline', '⋮ Timeline of jobs']], state.galleryMode, 'g-mode')}
      ${state.galleryMode === 'grid' && !state.selecting ? `<button class="w-btn small" data-act="g-select">Select</button>` : ''}
      <button class="w-btn small primary" data-act="g-add">📷 Add photos</button>
    </div>
    ${spaceBar(h, 'All')}
    ${toolbar}
    <div class="swipe" data-swipe>${body}</div>`;
}

// ----- Toolbox -----
function viewToolbox(h: House) {
  const q = state.toolboxQuery.toLowerCase();
  const items = [...h.inventory].filter((i) => !q || i.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  return `
    <div class="w-bar"><h1>Your AI Toolbox</h1><span class="pill">${h.inventory.length} tool${h.inventory.length === 1 ? '' : 's'}</span></div>
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
            .map((i) => `<li class="w-item"><span class="grow">${esc(i.name)}</span><button class="icon-btn" data-act="inv-del" data-id="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">✕</button></li>`)
            .join('')}</ul>`
    }`;
}

// ----- Settings -----
function viewSettings(h: House) {
  const u = state.user!;
  const d = state.data!;
  const provider = u.providerData?.[0]?.providerId ?? '';
  const via = provider.includes('google') ? 'Google' : provider.includes('apple') ? 'Apple' : 'email and password';
  const tiers: Record<string, string> = { homeOwner: 'Home Owner', homeFlipper: 'Home Flipper', masterBuilder: 'Master Builder' };
  const plan = d.premium ? (tiers[d.tier ?? ''] ?? 'Premium') : 'Free';
  const field = (label: string, key: string, value: string, ph = '', type = 'text') =>
    `<label class="set-field"><span>${label}</span><input class="w-input" type="${type}" data-key="hf-${key}" data-blur="house-field" data-field="${key}" value="${esc(value)}" placeholder="${esc(ph)}" /></label>`;
  return `
    <div class="w-bar"><h1>Settings</h1></div>
    <div class="settings">
      <section class="card">
        <h2>Account</h2>
        <p>${esc(u.email ?? '')} · signed in with ${via}</p>
        <p class="w-note">Plan: <strong>${esc(plan)}</strong>. Subscriptions are managed through the App Store or Google Play on your phone.</p>
        <button class="w-btn small" data-act="signout">Sign out</button>
      </section>

      <section class="card">
        <h2>Houses</h2>
        <div class="w-chips">${d.houses
          .map((x) => `<button class="chip" data-act="switch-house" data-id="${esc(x.id)}" aria-pressed="${x.id === h.id}">${esc(x.name)}</button>`)
          .join('')}<button class="chip ghost" data-act="add-house">+ Add house</button></div>
      </section>

      <section class="card">
        <h2>House details</h2>
        <div class="house-photo">
          ${isPhoto(h.photoPath as string) ? photo(h.photoPath as string, { alt: h.name }) : '<span class="blank">No house photo</span>'}
          <button class="w-btn small" data-act="house-photo">${isPhoto(h.photoPath as string) ? 'Change photo' : 'Add photo'}</button>
        </div>
        <div class="set-grid">
          ${field('Name of house', 'name', h.name)}
          ${field('Suburb', 'suburb', h.suburb?.name ?? '', 'e.g. Paddington')}
          ${field('State', 'state', h.suburb?.state ?? '', 'e.g. QLD')}
          ${field('Postcode', 'postcode', h.suburb?.postcode ?? '', 'e.g. 4064')}
          ${field('Built in', 'ageNote', h.ageNote, 'e.g. 1960s')}
          ${field('Storeys', 'stories', h.stories, 'e.g. 2')}
          ${field('Square metres', 'squareMetres', h.squareMetres, 'e.g. 180')}
          ${field('Owned since', 'ownedSince', h.ownedSince, 'e.g. 2019')}
        </div>
        <label class="set-field full"><span>House summary</span><textarea class="w-textarea" data-key="hf-summary" data-blur="summary" placeholder="Write your own, or generate one with AI in the app">${esc(h.climate)}</textarea></label>
        ${d.houses.length > 1 ? `<button class="w-btn small danger" data-act="remove-house">Remove this house</button>` : ''}
      </section>

      <section class="card">
        <h2>Spaces</h2>
        <ul class="w-list">
          ${h.rooms
            .map(
              (r) => `<li class="w-item">
              ${isPhoto(r.photoPath) ? photo(r.photoPath, { thumb: true, cls: 'room-thumb' }) : '<span class="room-thumb blank">⌂</span>'}
              <input class="w-input grow" data-key="rn-${esc(r.id)}" data-blur="room-name" data-id="${esc(r.id)}" value="${esc(r.name)}" aria-label="Space name" />
              <button class="w-btn small" data-act="space-photo" data-id="${esc(r.id)}">Photo</button>
              <button class="icon-btn" data-act="space-delete" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">✕</button>
            </li>`,
            )
            .join('')}
        </ul>
        <form class="w-add" data-form="add-space"><input class="w-input" name="name" placeholder="New space, e.g. Garage" data-key="addspace-settings" /><button class="w-btn" type="submit">+ Add space</button></form>
      </section>

      <section class="card">
        <h2>Preferences</h2>
        <label class="set-field"><span>Currency</span>
          <select class="w-select" data-change="currency">${CURRENCIES.map((c) => `<option ${c === (d.currencyCode || 'AUD') ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </label>
        <label class="w-row"><input type="checkbox" data-change="after-photo" ${d.afterPhotoPromptEnabled !== false ? 'checked' : ''} /> Ask for an after photo when a job is completed</label>
      </section>

      <section class="card">
        <h2>Syncing with your phone</h2>
        <p class="w-note">Changes save to your account straight away, and your phone picks them up next time you open Jib. AI features (photo-to-plan, the tradie verdict, Toolbox scans, Ask AI) run in the app.</p>
        <p class="w-note"><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · <a href="/contact/">Help</a> · To delete your account, use Settings → Delete account in the app.</p>
      </section>
    </div>`;
}

// ----- Modals and lightbox -----
function viewModal(h: House, m: Modal) {
  let inner = '';
  if (m.kind === 'add-space' || m.kind === 'rename-space' || m.kind === 'add-house') {
    const room = m.kind === 'rename-space' ? roomOf(h, m.roomId) : null;
    const title = m.kind === 'add-space' ? 'New space' : m.kind === 'add-house' ? 'New house' : 'Rename space';
    inner = `<h2>${title}</h2>
      <form data-form="modal-name" class="stack">
        <input class="w-input full" name="name" required value="${esc(room?.name ?? '')}" placeholder="${m.kind === 'add-house' ? 'e.g. Beach house' : 'e.g. Garage, Study'}" data-key="modal-name" autofocus />
        <button class="w-btn primary" type="submit">${m.kind === 'rename-space' ? 'Save' : m.kind === 'add-house' ? 'Add house' : 'Add space'}</button>
      </form>`;
  } else if (m.kind === 'space-menu') {
    const room = roomOf(h, m.roomId);
    inner = room
      ? `<h2>${esc(room.name)}</h2><div class="menu">
          <button data-act="space-photo" data-id="${esc(room.id)}">🖼 ${isPhoto(room.photoPath) ? 'Change' : 'Add'} background image for ${esc(room.name)}</button>
          <button data-act="space-rename" data-id="${esc(room.id)}">✎ Rename space</button>
          <button class="danger" data-act="space-delete" data-id="${esc(room.id)}">🗑 Delete space</button>
        </div>`
      : `<h2>${esc(h.name)}</h2><div class="menu"><button data-act="house-photo">🖼 Edit background image for ${esc(h.name)}</button></div>`;
  } else if (m.kind === 'gallery-add') {
    const rid = state.room ?? h.rooms[0]?.id ?? '';
    inner = `<h2>Add photos</h2>
      <form data-form="gallery-add" class="stack">
        <fieldset class="bare"><legend>Which space?</legend><div class="w-chips">${h.rooms
          .map((r) => `<label class="chip-radio"><input type="radio" name="room" value="${esc(r.id)}" ${r.id === rid ? 'checked' : ''} /><span>${esc(r.name)}</span></label>`)
          .join('')}</div></fieldset>
        <label>Caption (optional)<input class="w-input full" name="note" placeholder="e.g. New deck finished" /></label>
        <label>Date taken (optional, for the timeline)<input class="w-input" type="date" name="date" /></label>
        <button class="w-btn primary" type="submit">Choose photos…</button>
      </form>`;
  } else if (m.kind === 'move-to') {
    inner = `<h2>Move to…</h2><div class="menu">${h.rooms.map((r) => `<button data-act="g-move-to" data-id="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>`;
  } else if (m.kind === 'set-date') {
    inner = `<h2>Set date</h2><form data-form="set-date" class="stack"><input class="w-input" type="date" name="date" required /><button class="w-btn primary" type="submit">Save</button>
      <p class="w-note">The photo then appears in the right place on the timeline.</p></form>`;
  } else if (m.kind === 'confirm') {
    inner = `<h2>${esc(m.title)}</h2><p>${esc(m.body)}</p><div class="w-row"><button class="w-btn ${m.danger ? 'danger' : 'primary'}" data-act="confirm-yes">${esc(m.action)}</button><button class="w-btn" data-act="close-modal">Cancel</button></div>`;
  }
  return `<div class="w-scrim top" data-act="close-modal"></div><div class="w-modal" role="dialog" aria-modal="true"><button class="icon-btn modal-x" data-act="close-modal" aria-label="Close">✕</button>${inner}</div>`;
}
function viewLightbox(lb: { src: string } | { before: string; after: string }) {
  if ('src' in lb) return `<div class="w-lightbox" data-act="close-lightbox">${photo(lb.src, { alt: 'Photo' })}</div>`;
  return `<div class="w-lightbox compare-wrap" data-act="close-lightbox">
    <button class="icon-btn lb-x" data-act="close-lightbox" aria-label="Close">✕</button>
    <div class="compare" style="--pos:50%">
      ${photo(lb.before, { alt: 'Before', cls: 'cmp-before' })}
      <div class="cmp-after">${photo(lb.after, { alt: 'After' })}</div>
      <span class="cmp-label l">Before</span><span class="cmp-label r">After</span>
      <input class="cmp-range" type="range" min="0" max="100" value="50" data-input="compare" aria-label="Slide between before and after" />
    </div>
  </div>`;
}

// ---------- Actions ----------
function setView(v: View) {
  state.view = v;
  state.jobId = null;
  state.selecting = false;
  state.selected.clear();
  store.set('jib.web.view', v);
  window.scrollTo(0, 0);
  render();
}
function setRoom(id: string | null) {
  state.room = id;
  state.selected.clear();
  render();
}
function stepRoom(dir: 1 | -1) {
  const h = house();
  if (!h) return;
  const pages = [null, ...h.rooms.map((r) => r.id)];
  const i = pages.indexOf(state.room);
  const n = i + dir;
  if (n >= 0 && n < pages.length) setRoom(pages[n]);
}
function toggleDone(jobId: string) {
  const h = house();
  const j = h?.jobs.find((x) => x.id === jobId);
  if (!j) return;
  const wasDone = j.status === 'done';
  mutateJob(
    jobId,
    (jj) => {
      jj.status = wasDone ? 'not_started' : 'done';
      if (!wasDone) {
        jj.completedAt = now();
        jj.lastDone = now();
      }
    },
    wasDone ? undefined : 'Nice work — job done 🎉',
  );
  if (!wasDone && !j.afterPhotoPath && state.data?.afterPhotoPromptEnabled !== false) {
    state.modal = {
      kind: 'confirm',
      title: 'Nice. Photo for the record?',
      body: 'Add an after photo and it goes in the gallery, next to the before.',
      action: '📷 Add after photo',
      onYes: () => addJobPhoto(jobId, 'after'),
    };
    render();
  }
}
async function addJobPhoto(jobId: string, kind: string) {
  const files = await pickImages(kind !== 'after' && kind !== 'before');
  await withUpload(files, (urls) =>
    mutateJob(jobId, (j, h) => {
      urls.forEach((u, i) => {
        if (kind === 'after' && i === 0) j.afterPhotoPath = u;
        else if (kind === 'before' && i === 0 && !j.photoPath) j.photoPath = u;
        else j.extraPhotos = [...j.extraPhotos, u];
        addToGallery(h, j.roomId, u, j.title);
      });
    }, 'Photo added'),
  );
}
async function setSpacePhoto(roomId: string) {
  const files = await pickImages();
  await withUpload(files, (urls) =>
    mutate((h) => {
      const r = roomOf(h, roomId);
      if (!r) return;
      r.photoPath = urls[0];
      addToGallery(h, roomId, urls[0], r.name);
    }, 'Background updated'),
  );
}

document.addEventListener('click', async (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!t) return;
  const act = t.dataset.act!;
  const h = house();
  const jobId = state.jobId;
  const i = Number(t.dataset.i);
  const name = t.dataset.name ?? '';
  const id = t.dataset.id ?? '';

  switch (act) {
    case 'view':
      return setView(t.dataset.v as View);
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
    case 'close-lightbox':
      if ((ev.target as HTMLElement).closest('.compare') && !(ev.target as HTMLElement).closest('.lb-x')) return;
      state.lightbox = null;
      return render();
    case 'lightbox':
      ev.stopPropagation();
      state.lightbox = { src: t.dataset.src! };
      return render();
    case 'compare':
      state.lightbox = { before: t.dataset.before!, after: t.dataset.after! };
      return render();
    case 'close-modal':
      state.modal = null;
      return render();
    case 'confirm-yes': {
      const m = state.modal;
      state.modal = null;
      render();
      if (m?.kind === 'confirm') m.onYes();
      return;
    }
  }
  if (!h) return;

  switch (act) {
    // --- navigation and houses ---
    case 'new-job':
      state.newJob = true;
      state.draftPhotos = [];
      render();
      $app.querySelector<HTMLInputElement>('[name="title"]')?.focus();
      return;
    case 'close-new':
      state.newJob = false;
      return render();
    case 'new-job-photo': {
      const files = await pickImages(true);
      await withUpload(files, (urls) => {
        state.draftPhotos = [...state.draftPhotos, ...urls];
      });
      return;
    }
    case 'switch-house':
      state.houseId = id;
      state.room = null;
      state.jobId = null;
      store.set('jib.web.house', id);
      return render();
    case 'add-house':
      state.modal = { kind: 'add-house' };
      return render();
    case 'remove-house':
      state.modal = {
        kind: 'confirm',
        title: `Remove "${h.name}"?`,
        body: 'This removes the house and every space, job and photo record in it, on every device. No undo.',
        action: 'Remove house',
        danger: true,
        onYes: () => {
          const gone = h.id;
          state.houseId = null;
          mutateDoc((d) => {
            d.houses = d.houses.filter((x) => x.id !== gone);
            if (d.activeHouseId === gone) d.activeHouseId = d.houses[0]?.id ?? null;
          }, 'House removed');
        },
      };
      return render();
    case 'toggle-summary':
      state.summaryOpen = !state.summaryOpen;
      return render();
    case 'house-photo': {
      state.modal = null;
      const files = await pickImages();
      await withUpload(files, (urls) => mutate((hh) => { hh.photoPath = urls[0]; }, 'House photo updated'));
      return;
    }

    // --- spaces ---
    case 'space':
      return setRoom(id || null);
    case 'space-menu':
      ev.stopPropagation();
      state.modal = { kind: 'space-menu', roomId: id || null };
      return render();
    case 'add-space':
      state.modal = { kind: 'add-space' };
      return render();
    case 'space-rename':
      state.modal = { kind: 'rename-space', roomId: id };
      return render();
    case 'space-photo':
      state.modal = null;
      render();
      return setSpacePhoto(id);
    case 'space-delete': {
      const r = roomOf(h, id);
      if (!r) return;
      state.modal = {
        kind: 'confirm',
        title: 'Delete this space?',
        body: `"${r.name}" and its photo will be removed. Jobs in this space are not deleted.`,
        action: 'Delete',
        danger: true,
        onYes: () => {
          if (state.room === id) state.room = null;
          mutate((hh) => { hh.rooms = hh.rooms.filter((x) => x.id !== id); }, 'Space deleted');
        },
      };
      return render();
    }

    // --- home ---
    case 'expand':
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      return render();
    case 'toggle-done':
      return toggleDone(id);
    case 'toggle-completed':
      state.completedOpen = !state.completedOpen;
      return render();
    case 'open-job': {
      state.jobId = id;
      const j = h.jobs.find((x) => x.id === id);
      render();
      // The app clears the "added by AI" sparkle the first time the job is opened.
      if (j?.aiQuickAdded) mutateJob(id, (jj) => { jj.aiQuickAdded = false; });
      return;
    }
    case 'close-job':
      state.jobId = null;
      return render();

    // --- shopping (works from the Shopping view and the job drawer) ---
    case 'shop-by':
      state.shopBy = t.dataset.v as 'store' | 'job';
      return render();
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
    case 'inv-del':
      return mutate((hh) => { hh.inventory = hh.inventory.filter((x) => x.id !== id); });

    // --- gallery ---
    case 'g-mode':
      state.galleryMode = t.dataset.v as 'grid' | 'timeline';
      state.selecting = false;
      state.selected.clear();
      return render();
    case 'g-select':
      state.selecting = !state.selecting;
      state.selected.clear();
      return render();
    case 'g-add':
      state.modal = { kind: 'gallery-add' };
      return render();
    case 'g-tile': {
      const key = t.dataset.key!;
      if (state.selecting) {
        if (state.selected.has(key)) state.selected.delete(key);
        else state.selected.add(key);
        return render();
      }
      const e = galleryEntries(h).find((x) => x.key === key);
      if (!e) return;
      state.lightbox = e.paired ? { before: e.photo, after: e.paired } : { src: e.photo };
      return render();
    }
    case 'g-delete': {
      const ids = [...state.selected].filter((k) => k.startsWith('g:')).map((k) => k.slice(2));
      state.modal = {
        kind: 'confirm',
        title: `Delete ${ids.length} photo${ids.length === 1 ? '' : 's'}?`,
        body: 'They’re removed from the gallery and from any job or space that uses them.',
        action: 'Delete',
        danger: true,
        onYes: () => {
          state.selected.clear();
          state.selecting = false;
          mutate((hh) => {
            for (const gid of ids) {
              const target = hh.galleryPhotos.find((g) => g.id === gid);
              hh.galleryPhotos = hh.galleryPhotos.filter((g) => g.id !== gid);
              if (!target) continue;
              // Same clean-up as the app, so the phone doesn't re-add it on next launch.
              for (const j of hh.jobs) {
                if (j.photoPath === target.photoPath) j.photoPath = null;
                if (j.afterPhotoPath === target.photoPath) j.afterPhotoPath = null;
                j.extraPhotos = j.extraPhotos.filter((p) => p !== target.photoPath);
              }
              for (const r of hh.rooms) if (r.photoPath === target.photoPath) r.photoPath = null;
            }
          }, 'Deleted');
        },
      };
      return render();
    }
    case 'g-move':
      state.modal = { kind: 'move-to' };
      return render();
    case 'g-move-to': {
      const ids = [...state.selected].filter((k) => k.startsWith('g:')).map((k) => k.slice(2));
      state.modal = null;
      state.selected.clear();
      state.selecting = false;
      return mutate((hh) => {
        for (const g of hh.galleryPhotos) if (ids.includes(g.id)) g.roomId = id;
      }, `Moved to ${roomName(h, id)}`);
    }
    case 'g-date':
      state.modal = { kind: 'set-date' };
      return render();
    case 'g-background': {
      const e = galleryEntries(h).find((x) => x.key === [...state.selected][0]);
      const target = state.room ?? e?.roomId;
      if (!e || !target) return;
      state.selected.clear();
      state.selecting = false;
      return mutate((hh) => {
        const r = roomOf(hh, target);
        if (r) r.photoPath = e.photo;
      }, `Background set for ${roomName(h, target)}`);
    }
    case 'g-combine': {
      const es = [...state.selected].map((k) => galleryEntries(h).find((x) => x.key === k)).filter((e): e is GEntry => !!e);
      if (es.length !== 2) return;
      const [a, b] = es.sort((x, y) => x.date - y.date); // older photo is "before"
      state.selected.clear();
      state.selecting = false;
      await mutate((hh) => {
        hh.galleryPhotos = [
          ...hh.galleryPhotos,
          { id: newId(), roomId: state.room ?? a.roomId, photoPath: a.photo, pairedPhotoPath: b.photo, note: 'Before & After', createdAt: now(), photoDate: null },
        ];
      }, 'Before & after created');
      state.lightbox = { before: a.photo, after: b.photo };
      return render();
    }

    // --- job drawer ---
    case 'add-job-photo':
      if (jobId) await addJobPhoto(jobId, t.dataset.kind ?? 'extra');
      return;
    case 'remove-photo': {
      if (!jobId) return;
      const src = t.dataset.src!;
      const kind = t.dataset.kind;
      return mutateJob(jobId, (j) => {
        if (kind === 'before' && j.photoPath === src) j.photoPath = null;
        else if (kind === 'after' && j.afterPhotoPath === src) j.afterPhotoPath = null;
        else j.extraPhotos = j.extraPhotos.filter((p) => p !== src);
      }, 'Photo removed from the job (it stays in the gallery)');
    }
  }

  if (jobId) {
    switch (act) {
      case 'priority':
        return mutateJob(jobId, (j) => { j.priority = !j.priority; });
      case 'job-room':
        return mutateJob(jobId, (j) => { j.roomId = t.dataset.v!; }, `Moved to ${roomName(h, t.dataset.v!)}`);
      case 'recurrence':
        return mutateJob(jobId, (j) => { j.recurrence = t.dataset.v!; });
      case 'reset-cycle':
        return mutateJob(jobId, (j) => {
          j.lastDone = now();
          j.status = 'not_started';
        }, 'Cycle reset');
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
      case 'step-up':
        return mutateJob(jobId, (j) => {
          if (i <= 0 || i >= j.directions.length) return;
          [j.directions[i - 1], j.directions[i]] = [j.directions[i], j.directions[i - 1]];
        });
      case 'step-del':
        return mutateJob(jobId, (j) => { j.directions.splice(i, 1); });
      case 'delete-job': {
        const j = h.jobs.find((x) => x.id === jobId);
        if (!j) return;
        state.modal = {
          kind: 'confirm',
          title: 'Delete this job?',
          body: `“${j.title}” will be deleted everywhere. This can’t be undone.`,
          action: 'Delete',
          danger: true,
          onYes: () => {
            state.jobId = null;
            mutate((hh) => { hh.jobs = hh.jobs.filter((x) => x.id !== jobId); }, 'Job deleted');
          },
        };
        return render();
      }
    }
  }
});

// Right-click a space tab = the app's long-press menu.
document.addEventListener('contextmenu', (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('.space-tab[data-act="space"]');
  if (!t) return;
  ev.preventDefault();
  state.modal = { kind: 'space-menu', roomId: t.dataset.id || null };
  render();
});

document.addEventListener('submit', async (ev) => {
  const form = ev.target as HTMLFormElement;
  const kind = form.dataset.form;
  if (!kind) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const val = String(fd.get('name') ?? '').trim();

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
  form.reset();
  const h = house();
  if (!h) return;
  const jobId = state.jobId;

  if (kind === 'modal-name' && val) {
    const m = state.modal;
    state.modal = null;
    if (m?.kind === 'add-space') {
      const rid = newId();
      state.room = rid;
      return mutate((hh) => { hh.rooms = [...hh.rooms, { id: rid, name: val, photoPath: null, hazards: [] }]; }, `${val} added`);
    }
    if (m?.kind === 'rename-space') {
      return mutate((hh) => {
        const r = roomOf(hh, m.roomId);
        if (r) r.name = val;
      }, 'Renamed');
    }
    if (m?.kind === 'add-house') {
      const nh = newHouse(val);
      state.houseId = nh.id;
      state.room = null;
      store.set('jib.web.house', nh.id);
      return mutateDoc((d) => { d.houses = [...d.houses, structuredClone(nh)]; }, `${val} added`);
    }
    return render();
  }
  if (kind === 'add-space' && val) {
    return mutate((hh) => { hh.rooms = [...hh.rooms, { id: newId(), name: val, photoPath: null, hazards: [] }]; }, `${val} added`);
  }
  if (kind === 'gallery-add') {
    const rid = String(fd.get('room') ?? state.room ?? h.rooms[0]?.id ?? '');
    const note = String(fd.get('note') ?? '').trim();
    const date = String(fd.get('date') ?? '');
    state.modal = null;
    render();
    const files = await pickImages(true);
    return withUpload(files, (urls) =>
      mutate((hh) => {
        for (const u of urls) addToGallery(hh, rid, u, note, date ? new Date(date).getTime() : null);
      }, `${urls.length} photo${urls.length === 1 ? '' : 's'} added`),
    );
  }
  if (kind === 'set-date') {
    const date = String(fd.get('date') ?? '');
    const ids = [...state.selected].filter((k) => k.startsWith('g:')).map((k) => k.slice(2));
    state.modal = null;
    state.selected.clear();
    state.selecting = false;
    if (!date) return render();
    const ms = new Date(date).getTime();
    return mutate((hh) => {
      for (const g of hh.galleryPhotos) if (ids.includes(g.id)) g.photoDate = ms;
    }, 'Date set');
  }
  if (kind === 'add-tool' && jobId && val) {
    const owned = toolboxHas(h, val);
    return mutateJob(jobId, (j) => {
      if (j.tools.some((t) => t.name.toLowerCase() === val.toLowerCase())) return;
      j.tools = [...j.tools, { name: val, owned, toBuy: false }];
    });
  }
  if (kind === 'add-mat' && jobId && val) {
    const retailer = String(fd.get('retailer') ?? '').trim();
    return mutateJob(jobId, (j) => { j.shoppingList = [...j.shoppingList, normItem({ item: val, retailer })]; });
  }
  if (kind === 'add-step' && jobId && val) {
    return mutateJob(jobId, (j) => { j.directions = [...j.directions, val]; });
  }
  if (kind === 'add-extra' && val) {
    return mutate((hh) => { hh.extraShopping = [...hh.extraShopping, normItem({ item: val })]; }, 'Added to your shopping list');
  }
  if (kind === 'add-inv' && val) {
    if (h.inventory.some((x) => x.name.toLowerCase() === val.toLowerCase())) return toast(`${val} is already in your Toolbox`);
    return mutate((hh) => addToToolbox(hh, val), `${val} added to your Toolbox`);
  }
  if (kind === 'new-job') {
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    const job = blankJob(String(fd.get('room') ?? h.rooms[0]?.id ?? ''), title);
    job.description = String(fd.get('description') ?? '').trim();
    job.priority = fd.get('priority') === 'on';
    job.recurrence = String(fd.get('recurrence') ?? '');
    const [first, ...rest] = state.draftPhotos;
    job.photoPath = first ?? null;
    job.extraPhotos = rest;
    const photos = [...state.draftPhotos];
    state.newJob = false;
    state.draftPhotos = [];
    state.jobId = job.id;
    return mutate((hh) => {
      hh.jobs = [...hh.jobs, structuredClone(job)];
      for (const p of photos) addToGallery(hh, job.roomId, p, job.title);
    }, 'Job added');
  }
});

// Text fields save when you leave them, not on every keystroke. Deferred so a
// click that caused the blur lands before the re-render replaces its target.
document.addEventListener(
  'blur',
  (ev) => {
    const el = ev.target as HTMLInputElement | HTMLTextAreaElement;
    const field = el?.dataset?.blur;
    if (!field) return;
    const h = house();
    if (!h) return;
    const v = el.value;
    const save = (fn: () => void) => setTimeout(fn, 150);
    const jobId = state.jobId;
    const j = jobId ? h.jobs.find((x) => x.id === jobId) : null;
    if (field === 'title' && j && v.trim() && v.trim() !== j.title) save(() => mutateJob(j.id, (jj) => { jj.title = v.trim(); }, 'Saved'));
    else if (field === 'desc' && j && v !== j.description) save(() => mutateJob(j.id, (jj) => { jj.description = v; }, 'Saved'));
    else if (field === 'step' && j) {
      const i = Number(el.dataset.i);
      if (j.directions[i] !== undefined && j.directions[i] !== v) save(() => mutateJob(j.id, (jj) => { if (v.trim()) jj.directions[i] = v; else jj.directions.splice(i, 1); }));
    } else if (field === 'summary' && v !== h.climate) save(() => mutate((hh) => { hh.climate = v; }, 'Saved'));
    else if (field === 'room-name') {
      const r = roomOf(h, el.dataset.id);
      if (r && v.trim() && v.trim() !== r.name) save(() => mutate((hh) => { const rr = roomOf(hh, el.dataset.id); if (rr) rr.name = v.trim(); }, 'Renamed'));
    } else if (field === 'house-field') {
      const f = el.dataset.field!;
      const val = v.trim();
      save(() =>
        mutate((hh) => {
          if (f === 'suburb' || f === 'state' || f === 'postcode') {
            const s = hh.suburb ?? { name: '', state: '', postcode: '' };
            const next = { ...s, [f === 'suburb' ? 'name' : f]: val };
            hh.suburb = next.name || next.state || next.postcode ? next : null;
          } else if (f === 'name') {
            if (val) hh.name = val;
          } else {
            (hh as Record<string, unknown>)[f] = val;
          }
        }),
      );
    }
  },
  true,
);

document.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement;
  const kind = el?.dataset?.change;
  if (!kind) return;
  if (kind === 'completed-date' && state.jobId && el.value) {
    const ms = new Date(el.value).getTime();
    return void mutateJob(state.jobId, (j) => { j.completedAt = ms; }, 'Completion date updated');
  }
  if (kind === 'currency') return void mutateDoc((d) => { d.currencyCode = el.value; }, 'Currency updated');
  if (kind === 'after-photo') return void mutateDoc((d) => { d.afterPhotoPromptEnabled = el.checked; });
});

document.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el?.dataset?.input === 'tq') {
    state.toolboxQuery = el.value;
    render();
  } else if (el?.dataset?.input === 'compare') {
    el.closest<HTMLElement>('.compare')?.style.setProperty('--pos', `${el.value}%`);
  }
});

document.addEventListener('keydown', (ev) => {
  const tgt = ev.target instanceof Element ? ev.target : null;
  const typing = tgt?.closest('input, textarea, select');
  if (ev.key === 'Escape') {
    if (state.lightbox) state.lightbox = null;
    else if (state.modal) state.modal = null;
    else if (state.newJob) state.newJob = false;
    else if (state.jobId) state.jobId = null;
    else if (state.selecting) { state.selecting = false; state.selected.clear(); }
    else return;
    return render();
  }
  // Arrow keys move between spaces, like swiping in the app.
  if (!typing && !state.jobId && !state.modal && !state.lightbox && (state.view === 'home' || state.view === 'gallery')) {
    if (ev.key === 'ArrowRight') stepRoom(1);
    else if (ev.key === 'ArrowLeft') stepRoom(-1);
  }
});

// Swipe left/right on the content to move between spaces, like the app's PageView.
let swipeStart: { x: number; y: number } | null = null;
document.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'mouse') return;
  if ((ev.target as HTMLElement).closest('[data-swipe]')) swipeStart = { x: ev.clientX, y: ev.clientY };
});
document.addEventListener('pointerup', (ev) => {
  if (!swipeStart) return;
  const dx = ev.clientX - swipeStart.x;
  const dy = ev.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && !state.jobId && !state.modal) stepRoom(dx < 0 ? 1 : -1);
});

render();
