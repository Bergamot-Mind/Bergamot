// Bergamot — Mind: a strong journal and notes, with the tasks, habits, the day log and the guided start that keep you moving.
// Split out of Citrus Maxima (16/11/2026), after Mandarin, Clementine and Calamansi. Bergamot owns the journal, notes, tasks,
// habits and the day log; goals stay in Citrus Plan (read from hub/citrus/plan.json › goals); shifts come from Mandarin
// (hub/mandarin/shifts.json). Vanilla ES modules, no build step.
import * as store from './store.js';
import { mergeStates } from './store.js';
import * as G from './google.js';
import * as R from './roster.js';
import * as D from './day.js';
import * as M from './mind.js';
import * as J from './journal.js';
import * as N from './notes.js';
import * as LK from './lock.js';
import * as CZ from './custom.js';
import * as HUB from './hub.js';
import * as MIG from './migrate.js';
import * as TU from './today-ui.js';
import * as JU from './journal-ui.js';
import * as NU from './notes-ui.js';
import * as KU from './tasks-ui.js';
import { ctx } from './bits.js';
import { checkBackup, describeCounts } from './backup-check.js';
import { h, toast, keyOf, fmtDate, pad2, DAY_NAMES, MONTHS, uid } from './util.js';

export const VERSION = '1.0.0';
const CITRUS_URL = 'https://amaerys.github.io/citrus-maxima/';
const MANDARIN_URL = 'https://mandarin-work.github.io/Mandarin/';

// ---------------- runtime state (not persisted) ----------------
const rt = {
  view: 'today',
  calendars: [],
  syncing: false,
  online: navigator.onLine,
  hub: { at: 0, shiftsAt: '', goals: null, goalsAt: '', apps: {}, inbox: {} },
  fromCitrus: false,
};
const $ = (s, el = document) => el.querySelector(s);
const S = () => store.get();

// ---------------- boot ----------------
async function boot() {
  applyTheme(); watchSheets(); applyTiming();
  for (const b of document.querySelectorAll('nav.tabs button')) b.addEventListener('click', () => go(b.dataset.view));
  $('#btnRefresh').addEventListener('click', () => refreshAll(true));
  $('#btnMore').addEventListener('click', () => show('more'));
  $('#btnSearch').addEventListener('click', () => openSearch());
  document.addEventListener('keydown', (e) => {
    LK.touch();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if (e.key === 'Escape') { const sr = document.querySelector('.search'); if (sr) { sr.remove(); e.stopImmediatePropagation(); return; } closeTopSheet(); return; }
    if (typing) return;
    if (e.key === '/' && !document.querySelector('.search')) { openSearch(); e.preventDefault(); return; }
    if (document.querySelector('.sheet-bg, .search')) return;   // tab shortcuts never switch the page behind a sheet
    const tabs = CZ.visibleTabs(S());
    if (/^[1-5]$/.test(e.key) && tabs[+e.key - 1]) { show(tabs[+e.key - 1]); e.preventDefault(); }
    else if (e.key === 'r') { if (!rt.online) toast('Offline — Bergamot syncs when you are back online'); else refreshAll(true); }
    else if (e.key === ',') show('more');
    else if (e.key === 'w') { JU.writeSheet('journal', { fresh: true }); e.preventDefault(); }
    else if (e.key === 'n') { NU.noteSheet(null); e.preventDefault(); }
    else if (e.key === 't') { KU.taskSheet(null); e.preventDefault(); }
    else if (e.key === 'h') { KU.habitSheet(null); e.preventDefault(); }
    else if (e.key === '?') { shortcutsSheet(); e.preventDefault(); }
  });
  for (const ev of ['pointerdown', 'touchstart']) document.addEventListener(ev, () => LK.touch(), { passive: true, capture: true });
  window.addEventListener('online', () => { rt.online = true; renderSync(); });
  window.addEventListener('offline', () => { rt.online = false; renderSync(); });
  Object.assign(ctx, { S, update: (fn) => store.update(fn), sheet: (c) => sheet(c), render: () => render(), go: (v, p) => go(v, p), undoTo, cheer,
    goals: () => rt.hub.goals || { aims: [], resolutions: [], time: [] }, apps: () => rt.hub.apps || {}, kinds: kindsOf, hasShifts: () => R.has(),
    journalOpen: () => LK.isOpen(), inbox: () => M.inboxPending(S(), rt.hub.inbox, new Date()), migrateNow,
    readEntry: (id) => JU.readSheet(id), openTask: (id) => KU.taskSheet(id), openNoteByTitle: (t) => NU.openByTitle(t) });
  store.subscribe(() => { applyTiming(); render(); publishSoon(); remindSoon(); linksSoon(); });
  store.onRemoteSync(scheduleRemoteSave);
  R.load(); loadHubCache();
  handleIncoming();
  if (!rt.handled) show(location.hash.replace('#', '') || CZ.custom(S()).start);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const cid = S().settings.clientId;
  G.onAuthChange(() => { renderSync(); render(); });
  G.renewOnTap(() => { render(); refreshAll(false); });   // the hourly token renews on your next tap (phones only allow Google's window inside a tap)
  if (cid && rt.online) {
    try { await G.init(cid); } catch (e) { console.warn(e); }
    if (G.isSignedIn()) refreshAll(false);
    else if (G.wasSignedIn()) { G.auth.needsSignIn = true; render(); }
  }
  navigator.storage?.persist?.().then(ok => { rt.storagePersisted = ok; }).catch(() => {});
  setInterval(() => {
    const busy = document.querySelector('.sheet-bg, .search') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((rt.view === 'today' || rt.view === 'journal') && document.visibilityState === 'visible' && !busy) render();
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { LK.hidden(); flushRemoteSave(); return; }
    if (!LK.isOpen() && document.querySelector('.sheet.writing, .sheet .read.serif')) for (const bg of document.querySelectorAll('.sheet-bg')) if (bg.querySelector('.writing, .read.serif')) bg.remove();   // a locked journal never stays on screen
    if (G.isSignedIn() && Date.now() - (S().google.lastSync || 0) > 2 * 60000) refreshAll(false);
    render();
  });
  window.addEventListener('pagehide', flushRemoteSave);
  setInterval(() => { if (document.visibilityState === 'visible' && G.isSignedIn() && rt.online && Date.now() - (S().google.lastSync || 0) > 5 * 60000) refreshAll(false); }, 60000);
  renderSync();
}
function applyTiming() { D.setTiming(CZ.custom(S()).day); applyLook(); }
/** Customise › Look: accent colour, bubbly or classic shapes, comfy or compact, celebrations, the journal's serif — synced, set on <html>. */
function applyLook() { const c = CZ.custom(S()), l = c.look, r = document.documentElement; r.dataset.accent = l.accent; r.dataset.shape = l.shape; r.dataset.density = l.density; r.dataset.fun = l.fun ? 'on' : 'off'; r.dataset.serif = c.journal.serif ? 'on' : 'off'; }
/** A small burst of leaves from where you tapped (when celebrations are on and motion is welcome). */
function cheer(from) {
  if (!CZ.custom(S()).look.fun || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = (from?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 }), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const colors = ['var(--orange)', 'var(--teal)', 'var(--honey)', '#e9f0b8', 'var(--sage)'];
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('i'), a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 80;
    p.className = 'confetti'; p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px;--r:${Math.random() * 540 - 270}deg;border-radius:${i % 2 ? '50% 0' : '50%'};`;
    document.body.append(p); setTimeout(() => p.remove(), 1000);
  }
}
/** Undo to an earlier copy, so that it holds on every device (tombstones for what was added since, fresh times for what came back). */
function undoTo(before) { store.replaceState(before, { bump: true, exact: S() }); render(); toast('Undone'); }
/** The kind of day it is from Mandarin's shifts: {kind, label, text}. */
function kindsOf(date) {
  try { const k = D.dayKind(date); return { kind: k.kind, label: D.KIND_LABEL[k.kind] || 'Day', text: k.shift?.status === 'work' ? D.shiftText(k.shift) : '' }; }
  catch { return { kind: 'unknown', label: 'Rota not known', text: '' }; }
}

// Arriving from another app or a link: ?from=citrus shows "← Citrus"; ?do=<action> (or #view) jumps straight there.
const DO = { today: ['today'], journal: ['journal'], write: ['journal', 'write'], entry: ['journal', 'write'], notes: ['notes'], note: ['notes', 'new'], tasks: ['tasks'], task: ['tasks', 'new'], habits: ['habits'], habit: ['habits', 'new'], search: ['today', 'search'] };
function handleIncoming() {
  try {
    const q = new URLSearchParams(location.search);
    const from = String(q.get('from') || '').toLowerCase(), action = String(q.get('do') || '').toLowerCase();
    if (from === 'citrus') { rt.fromCitrus = true; try { sessionStorage.setItem('bergamot.fromCitrus', '1'); } catch {} }
    else { try { if (sessionStorage.getItem('bergamot.fromCitrus')) rt.fromCitrus = true; } catch {} }   // kept over a reload
    if (from === 'mandarin') rt.fromMandarin = true;
    const capture = /^#capture=/.test(location.hash) ? decodeURIComponent(location.hash.slice(9)).slice(0, 2000) : '';
    const target = capture ? ['notes', 'capture'] : DO[action] || DO[location.hash.replace('#', '')] || null;
    if (q.toString() || capture) history.replaceState(null, '', location.pathname + (target ? `#${target[0]}` : location.hash || '#today'));
    if (!target) return;
    rt.handled = true; go(target[0]);
    const later = (fn) => setTimeout(fn, 300);
    if (target[1] === 'write') later(() => JU.writeSheet('journal', { fresh: true }));
    else if (target[1] === 'new' && target[0] === 'notes') later(() => NU.noteSheet(null));
    else if (target[1] === 'new' && target[0] === 'tasks') later(() => KU.taskSheet(null));
    else if (target[1] === 'new' && target[0] === 'habits') later(() => KU.habitSheet(null));
    else if (target[1] === 'search') later(() => openSearch());
    else if (target[1] === 'capture') later(() => { const [first, ...rest] = capture.split('\n'); NU.noteSheet(null, { title: rest.length ? first : '', body: rest.length ? rest.join('\n') : capture }); });
  } catch (e) { console.warn('incoming', e); }
}

// Shown at the top of every screen when the Google session needs a tap to come back
function authBanner() {
  if (!G.auth.needsSignIn || !rt.online) return null;
  return h('div', { class: 'banner' }, h('span', { class: 'grow' }, 'Google needs a tap to reconnect — nothing is lost, sync resumes after.'),
    h('button', { class: 'btn sm primary', onClick: async () => { try { await G.signIn({ renew: G.wasSignedIn() }); refreshAll(true); } catch (e) { try { await G.signIn(); refreshAll(true); } catch (e2) { toast(e2.message, 'err'); } } } }, 'Reconnect'));
}
/** "← Citrus" while you came from Citrus: one tap back, and Citrus toasts "Back from Bergamot" and refreshes its hub. */
function backBar() {
  if (!rt.fromCitrus && !rt.fromMandarin) return null;
  const to = rt.fromCitrus ? ['Citrus', `${CITRUS_URL}?from=bergamot`] : ['Mandarin', `${MANDARIN_URL}?from=bergamot`];
  return h('div', { class: 'back-bar' }, h('a', { class: 'btn sm ghost', href: to[1] }, `← ${to[0]}`), h('button', { class: 'btn sm ghost', 'aria-label': 'Hide', onClick: () => { rt.fromCitrus = rt.fromMandarin = false; try { sessionStorage.removeItem('bergamot.fromCitrus'); } catch {} render(); } }, '✕'));
}

const VIEWS = ['today', 'journal', 'notes', 'tasks', 'habits', 'more'];
const VIEW_NAMES = { today: 'Today', journal: 'Journal', notes: 'Notes', tasks: 'Tasks', habits: 'Habits', more: 'Settings' };
const OLD = { mind: 'today', reflect: 'journal', write: 'journal', settings: 'more' };
/** Bottom tabs / rail in your order; hidden ones disappear (Settings › Customise). Today and Settings always stay. */
function applyTabs(c) {
  const nav = document.querySelector('nav.tabs'); if (!nav) return;
  for (const id of c.tabs.order) { const b = nav.querySelector(`button[data-view="${id}"]`); if (b) nav.insertBefore(b, nav.querySelector('button[data-view="more"]')); }
  for (const b of nav.querySelectorAll('button[data-view]')) b.hidden = c.tabs.hidden.includes(b.dataset.view);
  nav.style.setProperty('--tabs', String(CZ.TABS.length - c.tabs.hidden.length));
}
function go(view, part) {
  if (view === 'journal' && part) JU.journalPart(part);
  if (view === 'notes' && part) NU.notesPart(part);
  show(view);
}
function show(view) {
  view = OLD[view] || view;
  if (!VIEWS.includes(view)) view = 'today';
  document.documentElement.dataset.view = view;
  rt.view = view;
  for (const s of document.querySelectorAll('section.view')) s.classList.toggle('active', s.id === `view-${view}`);
  for (const b of document.querySelectorAll('nav.tabs button')) { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  history.replaceState(null, '', `#${view}`);
  render();
  window.scrollTo(0, 0);
}
function render() {
  applyTabs(CZ.custom(S()));
  const fn = { today: TU.renderToday, journal: JU.renderJournal, notes: NU.renderNotes, tasks: KU.renderTasks, habits: KU.renderHabits, more: renderMore }[rt.view] || TU.renderToday;
  const el = $(`#view-${rt.view}`); if (!el) return;
  const y = window.scrollY, act = document.activeElement, keep = ctx.refocus || (act && el.contains(act) && act.matches('input[type=search], .cap-in, .nc-in') ? (act.matches('.cap-in') ? '.cap-in' : act.matches('.nc-in') ? '.nc-in' : `.${[...act.classList].find(c => /search|filter/.test(c)) || 'x'}`) : null);
  const caret = act?.selectionStart ?? null;
  ctx.refocus = null;
  let body;
  try { body = fn(); } catch (e) { console.error(e); body = crashCard(e); }   // one broken screen never blanks the app
  el.replaceChildren(...[backBar(), authBanner(), body].flat(Infinity).filter(Boolean));
  if (!el.querySelector('h1')) el.prepend(h('h1', { class: 'sr-only' }, VIEW_NAMES[rt.view] || 'Bergamot'));
  if (keep) { const i = el.querySelector(keep); if (i) { i.focus({ preventScroll: true }); try { const p = caret ?? i.value.length; i.setSelectionRange(p, p); } catch {} } }
  if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
  const pt = document.getElementById('pageTitle'), d = new Date(); if (pt) pt.textContent = rt.view === 'today' ? '' : `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function crashCard(e) {
  return h('div', { class: 'card warn' }, h('div', { class: 'title' }, 'This screen hit a problem'), h('div', { class: 'small' }, 'Your data is safe. Try another tab, sync, or download a backup and tell Claude what you tapped.'),
    h('div', { class: 'tiny dim', style: { marginTop: '6px' } }, String(e?.message || e).slice(0, 160)),
    h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onClick: () => location.reload() }, 'Reload'), h('button', { class: 'btn sm', onClick: downloadBackup }, '⬇ Backup')));
}

// Interfaces (Orange 8.12 pattern): Arcade / Clean / Paper + text size, chosen per device (localStorage, never synced); index.html applies them before first paint.
const UI_KEY = 'bergamot.ui';
function getUi() { let u = {}; try { u = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch {} if (!u.ui) u.ui = 'paper'; if (!u.size) u.size = 'normal'; return u; }
function setUi(patch) { const u = { ...getUi(), ...patch }; try { localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch {} applyTheme(); render(); if (rt.view === 'more') document.querySelector('#view-more .ui-pick')?.scrollIntoView({ block: 'nearest' }); }
const THEME_COLOR = { paper: '#f4f6e8', arcade: '#0d1b1b', clean: '#0b1716' };
function applyTheme() { const u = getUi(), r = document.documentElement; r.dataset.ui = u.ui; r.dataset.size = u.size; r.dataset.theme = u.ui === 'paper' ? 'light' : 'dark'; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = THEME_COLOR[u.ui] || THEME_COLOR.clean; }

// ---------------- sync ----------------
function renderSync() {
  const dot = $('#syncDot'), txt = $('#syncText'), signed = G.isSignedIn();
  dot.className = 'sync ' + (rt.syncing ? 'busy' : signed && rt.online ? 'on' : '');
  txt.textContent = !rt.online ? 'offline' : rt.syncing ? 'syncing…' : signed ? (S().google.email || 'Google') : '';
}
// state.json is written at most every 2.5 s, only when its content changed, and only if no other device wrote it since we
// read it — otherwise Bergamot pulls, merges and writes the merged copy. Drive answers "anything new?" through its changes
// feed, so a sync where nothing moved is a single request; only what changed is read again.
let saveTimer = null, saving = null;
function scheduleRemoteSave() {
  if (!G.wasSignedIn()) return;
  rt.saveDirty = true;
  clearTimeout(saveTimer);
  if (!G.isSignedIn() || !rt.online) return;   // stays dirty: the next sync saves it
  saveTimer = setTimeout(() => saveStateNow().catch(e => console.warn('remote save failed', e.message)), 2500);
}
function flushRemoteSave() { if (rt.saveDirty && G.isSignedIn() && rt.online) { clearTimeout(saveTimer); saveStateNow().catch(() => {}); } }
async function saveStateNow() {
  if (saving) { await saving.catch(() => {}); if (!rt.saveDirty) return; }
  saving = (async () => {
    const root = S().settings.driveFolder;
    rt.saveDirty = false;
    if (store.needsMerge()) await pullState(true);              // a copy recovered from damage never goes out before Drive's is merged in
    try { await G.saveRemoteState(root, stripForRemote(S())); }
    catch (e) {
      if (!e.conflict) { rt.saveDirty = true; throw e; }
      await pullState(true);                                   // someone else saved first: take theirs in, then write the union
      try { await G.saveRemoteState(root, stripForRemote(S()), { force: true }); } catch (e2) { rt.saveDirty = true; throw e2; }
    }
    rt.lastSave = Date.now();
  })().finally(() => { saving = null; });
  return saving;
}
// what goes to Drive: everything except what belongs to this device (sync bookkeeping, calendar outbox)
function stripForRemote(s) { const { outbox, google, ...rest } = s; return rest; }
const comparable = (s) => G.fingerprint(stripForRemote(s || {}), ['updatedAt']);
/** Read state.json and merge it in. Writes back only if the merged copy holds something Drive doesn't. */
async function pullState(fromConflict = false) {
  const remote = await G.loadRemoteState(S().settings.driveFolder);
  if (!remote) { store.merged(); scheduleRemoteSave(); return false; }
  if (typeof remote !== 'object' || (remote.app && remote.app !== 'bergamot')) throw new Error('state.json on Drive is not Bergamot’s — kept your copy (backups are in hub/bergamot/backups)');
  const force = fromConflict || store.needsMerge(); store.merged();
  if ((!force && (remote.updatedAt || 0) === (S().updatedAt || 0)) || comparable(remote) === comparable(S())) return false;
  const merged = mergeStates(S(), remote);
  merged.updatedAt = Math.max(S().updatedAt || 0, remote.updatedAt || 0) + (comparable({ ...merged, updatedAt: 0 }) !== comparable({ ...remote, updatedAt: 0 }) ? 1 : 0);
  store.replaceState(merged);
  if (comparable(merged) !== comparable(remote)) { if (fromConflict) rt.saveDirty = true; else scheduleRemoteSave(); }
  rt.lastPull = Date.now();
  return true;
}
const WATCH_KEY = 'bergamot.drive.watch';
function loadWatch() { try { const w = JSON.parse(localStorage.getItem(WATCH_KEY) || 'null'); return w && w.root === S().settings.driveFolder ? w : null; } catch { return null; } }
function saveWatch(w) { rt.watch = w; try { w ? localStorage.setItem(WATCH_KEY, JSON.stringify(w)) : localStorage.removeItem(WATCH_KEY); } catch {} }

async function refreshAll(manual, { full = false } = {}) {
  if (!rt.online && manual) { toast('Offline — Bergamot syncs when you are back online'); return; }
  if (!G.isSignedIn()) { if (manual) toast(G.wasSignedIn() ? 'Google needs a tap to reconnect' : S().settings.clientId ? 'Sign in to Google in Settings' : 'Add your Google client ID in Settings'); render(); return; }
  if (!rt.online) { if (manual) toast('You are offline'); return; }
  if (rt.syncing) { if (manual) toast('Already syncing…'); return; }   // one sync at a time
  rt.syncing = true; renderSync();
  const root = S().settings.driveFolder, problems = [];
  const step = async (label, fn) => { try { await fn(); } catch (e) { problems.push(`${label}: ${e.message}`); } };
  const t0 = performance.now();
  try {
    // 1. what moved on Drive since last time?
    let watch = loadWatch(), plan = null, newToken = '';
    const stale = !watch?.token || Date.now() - (watch.fullAt || 0) > 12 * 3600000;   // a full pass at least twice a day, whatever the feed says
    if (!full && !manual && !stale) {
      try { const ch = await G.changesSince(watch.token); if (ch) { newToken = ch.token; plan = classifyChanges(ch.changes, watch); if (ch.more) plan = null; } }
      catch (e) { if (e.auth) throw e; }
    }
    if (!plan) { G.reverify(); newToken = await G.startToken().catch(() => ''); plan = { full: true, state: true, hub: true }; }
    if (!G.seenStateRev() && !rt.stateLoaded) plan.state = true;   // read state.json once per app session at least
    rt.syncMode = plan.full ? 'full' : plan.state || plan.hub ? 'changes' : 'nothing new';
    // 2. state first (the merge decides what everything else shows), then the hub
    if (plan.state) await step('state', async () => { await pullState(); rt.stateLoaded = true; });
    await Promise.all([
      step('account', async () => { if (!S().google.email) { const u = await G.userInfo(); store.update(s => ({ ...s, google: { ...s.google, email: u.email } }), { remote: false, silent: true }); } }),
      plan.hub || !rt.hub.at || Date.now() - rt.hub.at > 10 * 60000 ? step('hub', () => syncHub({ full: plan.full })) : null,
    ]);
    // 3. calendar alarms, unsaved local changes
    await step('reminders', reconcileReminders);
    if (rt.saveDirty) await step('save', saveStateNow);
    // 4. remember where we are in the feed — only when everything worked, so a failed step is retried next time
    if (!problems.length && newToken) {
      const next = { ...(watch || {}), root, token: newToken };
      if (plan.full) Object.assign(next, await G.watchedFolders(root).catch(() => ({})), { fullAt: Date.now() });
      saveWatch(next);
    }
    // 5. a daily snapshot on Drive (14 kept), then tell the other apps
    if (!problems.length) G.backupDaily(root, stripForRemote(S()), keyOf(new Date())).catch(e => console.warn('backup', e.message));
    await step('publish', publish);
    store.update(s => ({ ...s, google: { ...s.google, lastSync: Date.now() } }), { remote: false, silent: true });
    rt.lastProblems = problems; rt.lastSyncMs = Math.round(performance.now() - t0);
    if (manual) toast(problems.length ? 'Synced with issues — see Settings › Diagnostics' : 'Synced', problems.length ? 'err' : 'ok');
    else if (problems.length) console.warn(problems);
  } catch (e) {
    rt.lastProblems = [e.message];
    if (manual) toast(e.message, 'err');
  } finally { rt.syncing = false; renderSync(); render(); }
}
/** Turn a page of Drive changes into the smallest sync that covers them. null = can't tell, do a full pass. */
function classifyChanges(changes, w) {
  const plan = { state: false, hub: false };
  const roots = new Set([w.hub, w.me].filter(Boolean));
  for (const c of changes) {
    if (roots.has(c.id) && (c.removed || c.trashed || !(c.parents || []).length)) { G.forgetFolders(); return null; }   // one of our folders vanished: rebuild
    const par = c.parents || [];
    if (par.includes(w.me) && c.name === 'state.json' && (c.props?.rev || '') !== G.seenStateRev()) plan.state = true;
    if (w.mandarin && par.includes(w.mandarin) && c.name === 'shifts.json') plan.hub = true;
    if (w.citrus && par.includes(w.citrus) && c.name === 'plan.json') plan.hub = true;
    if (c.name === 'status.json' && !par.includes(w.me)) plan.hub = true;   // the inbox (hub/claude) or an app a habit counts from
    if (par.includes(w.hub) && c.mimeType === 'application/vnd.google-apps.folder' && (c.name === 'mandarin' || c.name === 'citrus') && c.id !== w.mandarin && c.id !== w.citrus) return null;   // a folder Bergamot reads appeared: full pass
  }
  return plan;
}

// ---------------- the hub: what Bergamot reads from other apps, and what it publishes ----------------
const HUB_KEY = 'bergamot.hub';
function loadHubCache() { try { const j = JSON.parse(localStorage.getItem(HUB_KEY) || 'null'); if (j && typeof j === 'object') rt.hub = { ...rt.hub, ...j, goals: j.goals ? M.cleanGoals(j.goals) : null }; } catch {} }
function saveHubCache() { try { localStorage.setItem(HUB_KEY, JSON.stringify(rt.hub)); } catch {} }
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** Only what Bergamot uses from another app's status.json: today, metrics, title (linked habits) and inbox (hub/claude). */
const slimStatus = (j) => isObj(j) ? { app: String(j.app || '').slice(0, 30), title: String(j.title || '').slice(0, 40), today: isObj(j.today) ? { date: String(j.today.date || ''), done: !!j.today.done } : null, metrics: Array.isArray(j.metrics) ? j.metrics.slice(0, 12).filter(isObj).map(m => ({ key: String(m.key || ''), label: String(m.label || m.key || '').slice(0, 60), value: +m.value || 0, goal: +m.goal || 0, date: String(m.date || '') })) : [], inbox: Array.isArray(j.inbox) ? j.inbox.slice(0, 25) : [] } : null;
/** Read Mandarin's shifts.json, Citrus's plan.json (goals), the inbox (hub/claude/status.json), the apps your habits count
 *  from, and — until Mind is taken over — Citrus's state (once). Read only. */
async function syncHub() {
  const root = S().settings.driveFolder, linked = M.linkedApps(S());
  const [sh, pl, cl, ...apps] = await Promise.all([G.readOtherFile(root, 'mandarin', 'shifts.json').catch(() => null), G.readOtherFile(root, 'citrus', 'plan.json').catch(() => null), G.readOtherFile(root, 'claude', 'status.json').catch(() => null), ...linked.map(a => G.readOtherFile(root, a, 'status.json').catch(() => null))]);
  if (sh?.data) { if (R.set(sh.data)) { rt.hub.shiftsAt = sh.modifiedTime || ''; rt.hub.shiftsError = ''; } else rt.hub.shiftsError = 'Mandarin’s shifts.json could not be read'; }
  else rt.hub.shiftsError = 'Mandarin has not published shifts.json yet';
  if (pl?.data && isObj(pl.data)) { rt.hub.goals = M.cleanGoals(pl.data.goals); rt.hub.goalsAt = pl.modifiedTime || ''; rt.hub.goalsError = pl.data.goals ? '' : 'Citrus’s plan.json has no goals yet'; }
  else rt.hub.goalsError = 'Citrus has not published plan.json yet';
  rt.hub.inbox = cl?.data ? { claude: slimStatus(cl.data) } : {};
  rt.hub.apps = {}; linked.forEach((a, i) => { const st = slimStatus(apps[i]?.data); if (st) rt.hub.apps[a] = st; });
  rt.hub.at = Date.now();
  if (!S().migrated) {
    const citrus = await G.readOtherFile(root, 'citrus', 'state.json').catch(() => null);
    if (citrus?.data && !S().migrated) offerMigration(citrus.data, 'Citrus on Drive');
  }
  saveHubCache();
}
// A habit newly linked to an app (or brought over from Citrus): read that app's status.json now, not at the next full sync
let linksTimer = null;
function linksSoon() {
  const want = M.linkedApps(S()).sort().join(), have = Object.keys(rt.hub.apps || {}).sort().join();
  if (want === (rt.linksAsked ?? have) || !G.isSignedIn() || !rt.online) return;
  rt.linksAsked = want; clearTimeout(linksTimer);
  linksTimer = setTimeout(() => syncHub().then(render).catch(e => console.warn('hub', e.message)), 1200);
}
// Taking over Mind from Citrus: offered once, with an Undo and a copy kept on Drive before it runs
let migrationOffered = false;
function offerMigration(citrus, source) {
  const { counts } = MIG.mindPart(citrus); if (MIG.describe(counts) === 'nothing of Mind') { if (source !== 'Citrus on Drive') toast(`Nothing of Mind in ${source}`); return; } if (migrationOffered) return;
  migrationOffered = true;
  setTimeout(() => {
    const { close } = sheet([h('h2', {}, 'Bring your Mind over from Citrus?'),
      h('p', { class: 'small' }, `Found in ${source}: ${MIG.describe(counts)}${counts.ticks ? `, with ${counts.ticks} habit ticks` : ''}.`),
      h('p', { class: 'small muted' }, 'Bergamot copies them and owns them from now on: reflections and Citrus’s day notes become journal entries, memos become notes. Your goals (aims, resolutions, the year) stay in Citrus Plan, and the Library stays in Citrus for now. Nothing is deleted in Citrus. Anything you already changed here is kept: for each item the newest edit wins. A copy of your Bergamot data as it is now is kept on Drive first, and you can Undo.'),
      h('div', { class: 'row wrap sh-foot' }, h('button', { class: 'btn primary grow', onClick: () => { close(); runMigration(citrus, source); } }, 'Bring them over'), h('button', { class: 'btn ghost', onClick: () => { close(); store.update(s => ({ ...s, migrated: { from: 'skipped', at: Date.now(), counts: {} } })); toast('Skipped. You can do it later in Settings › Backup and data.'); } }, 'Not now'))]);
  }, 300);
}
function backupBefore(what) { if (G.isSignedIn()) G.backupBefore(S().settings.driveFolder, stripForRemote(S()), what).catch(e => console.warn('backup before', e.message)); }
function runMigration(citrus, source) {
  const before = S(), r = MIG.applyMigration(before, citrus);
  if (!r.changed) { toast('Nothing to bring over'); return; }
  backupBefore('migration');
  try { store.replaceState(r.state, { bump: true }); smokeRender(); }
  catch (e) { console.warn(e); store.replaceState(before, { bump: true, exact: S() }); toast(`That copy would break the app (${String(e.message).slice(0, 60)}). Nothing was changed.`, 'err'); return; }
  render(); toast(`Brought over: ${MIG.describe(r.counts)}`, 'ok', { action: { label: 'Undo', run: () => { store.replaceState(before, { bump: true, exact: S() }); render(); toast('Undone: back to before the migration'); } } });
}
async function migrateNow() {
  if (!G.isSignedIn()) { show('more'); return toast('Sign in with Google first, or restore a Citrus backup file here'); }
  try { const c = await G.readOtherFile(S().settings.driveFolder, 'citrus', 'state.json'); if (!c?.data) return toast('No Citrus data found on Drive'); migrationOffered = false; offerMigration(c.data, 'Citrus on Drive'); }
  catch (e) { toast(e.message, 'err'); }
}
// What Bergamot publishes: status.json for Citrus. At most every few seconds, only when it changed.
let pubTimer = null;
function publishSoon() { clearTimeout(pubTimer); if (!G.isSignedIn() || !rt.online) return; pubTimer = setTimeout(() => publish().catch(e => console.warn('publish', e.message)), 4000); }
async function publish() {
  if (!G.isSignedIn() || !rt.online) return;
  await G.writeOwnFile(S().settings.driveFolder, 'status.json', HUB.buildStatus(S(), new Date(), { apps: rt.hub.apps }), { omit: ['updatedAt'] });
  rt.publishedAt = Date.now();
}

// ---------------- alarms: Google Calendar pop-up reminders (your phone rings them even when Bergamot is closed) ----------------
const hashOf = (t) => { let x = 5381; for (let i = 0; i < t.length; i++) x = ((x << 5) + x + t.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
let remBusy = false, remTimer = null;
function remindSoon() { if (!G.isSignedIn() || !rt.online) return; clearTimeout(remTimer); remTimer = setTimeout(() => { if (M.reminderDrift(S())) reconcileReminders().catch(e => console.warn('reminders', e.message)); }, 2500); }
async function reconcileReminders() {
  if (remBusy || !G.isSignedIn() || !rt.online || !M.reminderDrift(S())) return; remBusy = true;
  try {
    const s = S(), cal = s.settings.planCalendarId || 'primary', want = M.wantedReminders(s), cur = { ...(s.reminders || {}) }; let changed = false;
    for (const [k, r] of Object.entries(cur)) if (!want[k] || want[k].sig !== r.sig) {
      if (r.eventId) { try { await G.deleteEvent(r.calendarId || cal, r.eventId); } catch (e) { if (e.network) return; } }
      delete cur[k]; changed = true;
    }
    for (const [k, w] of Object.entries(want)) {
      if (cur[k]) continue;
      const key = `rem-${k}-${hashOf(w.sig)}`.replace(/[^\w-]/g, '-');
      try {
        let ev = await G.findEventByKey(cal, key, w.window[0], w.window[1]).catch(() => null);   // another device may have made it
        if (!ev) ev = await G.createEvent(cal, { title: w.title, start: w.start, end: w.end, description: w.desc, tag: 'reminder', key, reminders: [0], recurrence: w.recurrence || null });
        cur[k] = { eventId: ev.id, sig: w.sig, calendarId: cal, at: Date.now() }; changed = true;
      } catch (e) { console.warn('reminder', k, e.message); }
    }
    if (changed) store.update(x => {
      // the store keeps reminders as records: what went away gets a tombstone so another device does not bring it back
      const deleted = { ...(x.deleted || {}) }; for (const k of Object.keys(x.reminders || {})) if (!cur[k]) deleted[`rem:${k}`] = Date.now();
      return { ...x, reminders: cur, deleted };
    }, { silent: true });
  } finally { remBusy = false; }
}

// ---------------- sheets ----------------
const topSheet = () => [...document.querySelectorAll('.sheet-bg, body > .search')].pop() || null;
const sheetOpeners = new WeakMap();
function sheet(content) {
  const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const bg = h('div', { class: 'sheet-bg', onClick: (e) => { if (e.target === bg) closeTopSheet(); } });
  const x = h('button', { class: 'sheet-x', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onClick: () => { if (topSheet() === bg) closeTopSheet(); else close(); } }, '✕');
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, h('div', { class: 'handle' }), x, ...[content].flat());
  const title = box.querySelector('h2'); if (title) { title.id ||= 'sh-' + uid(); box.setAttribute('aria-labelledby', title.id); } else box.setAttribute('aria-label', 'Details');
  // remember typed edits, so Escape asks before throwing them away (the note editor saves itself, so it opts out)
  box.addEventListener('input', (e) => { if (e.target.matches?.('textarea:not([data-nodirty]), input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=search]):not([type=file]):not([data-nodirty])')) bg.dataset.dirty = '1'; });
  bg.append(box); document.body.append(bg); sheetOpeners.set(bg, opener);
  const close = () => bg.remove();
  queueMicrotask(() => { if (!bg.isConnected || box.contains(document.activeElement)) return; const f = box.querySelector('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=date]):not([data-nofocus]), textarea:not([data-nofocus])'); (f && !matchMedia('(hover: none)').matches ? f : box).focus({ preventScroll: true }); });
  return { close, box };
}
/** Escape: close the top sheet; with unsaved typing, the first Escape only warns. */
function closeTopSheet() {
  const bg = topSheet(); if (!bg) return false;
  if (bg.dataset.dirty && !bg.dataset.warned) { bg.dataset.warned = '1'; toast('Unsaved writing: press Esc (or ✕) again to discard'); setTimeout(() => { delete bg.dataset.warned; }, 4000); return true; }
  bg.remove(); return true;
}
function shortcutsSheet() {
  const rows = [['1 – 5', 'Today, Journal, Notes, Tasks, Habits (in your tab order)'], [',', 'Settings'], ['/', 'Search notes and the journal'], ['w', 'Write in the journal'], ['n', 'New note'], ['t', 'New task'], ['h', 'New habit'], ['Ctrl + Enter', 'save what you are writing'], ['r', 'Sync with Google now'], ['Esc', 'close the top sheet or the search'], ['?', 'this list']];
  sheet([h('h2', {}, 'Keyboard shortcuts'), h('div', { class: 'kv keys' }, rows.flatMap(([k, v]) => [h('kbd', {}, k), h('span', {}, v)]))]);
}
// Back button closes the top sheet: one history entry guards all open sheets.
let sheetGuard = false, sheetSelfBack = false, lastSheetClose = 0;
// the second tap of a double-tap on Save lands on whatever was under the sheet (the bottom tabs): swallow it
document.addEventListener('click', (e) => { if (Date.now() - lastSheetClose < 280 && !e.target.closest?.('.sheet, .toast')) { e.preventDefault(); e.stopPropagation(); } }, true);
function watchSheets() {
  new MutationObserver((muts) => {
    const removed = muts.flatMap(m => [...m.removedNodes]).filter(n => n.classList?.contains('sheet-bg') || n.classList?.contains('search')), open = document.querySelectorAll('.sheet-bg, body > .search').length;
    if (removed.length) lastSheetClose = Date.now();
    document.documentElement.classList.toggle('sheet-open', open > 0);
    for (const bg of removed) { const o = sheetOpeners.get(bg); if (o?.isConnected && !topSheet()) o.focus({ preventScroll: true }); }
    if (open && !sheetGuard) { history.pushState({ cSheet: 1 }, '', location.href); sheetGuard = true; }
    else if (!open && sheetGuard && !sheetSelfBack && history.state?.cSheet) { sheetSelfBack = true; history.back(); }
  }).observe(document.body, { childList: true });
  addEventListener('popstate', () => {
    if (sheetSelfBack) { sheetSelfBack = false; sheetGuard = false; if (topSheet()) { history.pushState({ cSheet: 1 }, '', location.href); sheetGuard = true; } return; }
    sheetGuard = false; const bg = topSheet(); if (bg) { bg.remove(); if (topSheet()) { history.pushState({ cSheet: 1 }, '', location.href); sheetGuard = true; } }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return; const bg = topSheet(); if (!bg) return;
    const f = [...bg.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) { e.preventDefault(); return; }
    const i = f.indexOf(document.activeElement);
    if (!bg.contains(document.activeElement) || (e.shiftKey && i <= 0) || (!e.shiftKey && i === f.length - 1)) { e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0]).focus(); }
  });
}

// ---------------- search: notes and the journal together (the journal only while it is open), tasks and habits by name
function openSearch() {
  if (document.querySelector('.search')) return;
  let sel = 0, hits = [];
  const list = h('div', { class: 'res' });
  const paint = (q) => {
    const s = S(), qq = q.trim().toLowerCase(), open = LK.isOpen();
    if (!qq) {
      hits = [...N.noteList(s).slice(0, 6).map(n => ({ name: `📝 ${N.titleOf(n)}`, sub: n.folder || (n.tags || []).map(t => '#' + t).join(' ') || 'note', open: () => NU.noteSheet(n.id) })),
        ...(open ? J.entriesList(s).slice(0, 4).map(e => ({ name: `📔 ${fmtDate(new Date(e.date + 'T12:00'))} · ${J.methodOf(e.method).name}`, sub: J.preview(e, 80), open: () => JU.readSheet(e.id) })) : [])];
    } else {
      hits = N.searchAll(s, q, { journal: open, limit: 24 }).map(x => ({ name: `${x.kind === 'note' ? '📝' : '📔'} ${x.title}`, sub: x.snippet, open: () => x.kind === 'note' ? NU.noteSheet(x.id) : JU.readSheet(x.id) }));
      for (const t of Object.values(s.tasks || {})) if (t.title.toLowerCase().includes(qq)) hits.push({ name: `${t.done ? '☑' : '☐'} ${t.title}`, sub: `task${t.due ? ` · due ${fmtDate(new Date(t.due + 'T12:00'))}` : ''}`, open: () => KU.taskSheet(t.id) });
      for (const x of M.activeHabits(s)) if (x.name.toLowerCase().includes(qq)) hits.push({ name: `🔁 ${x.name}`, sub: `habit · ${M.habitFreqLabel(x)}`, open: () => KU.habitSheet(x.id) });
      hits = hits.slice(0, 30);
    }
    sel = 0;
    list.replaceChildren(...(hits.length ? hits.map((x, i) => h('button', { class: `item ${i === sel ? 'hl' : ''}`, onClick: () => { box.remove(); x.open(); } }, h('div', { class: 'grow' }, h('div', { class: 'name' }, x.name), h('div', { class: 'meta' }, String(x.sub).slice(0, 110))))) : [h('div', { class: 'empty small' }, qq ? 'Nothing found' : 'Nothing yet')]),
      !open ? h('div', { class: 'tiny dim', style: { padding: '8px 12px' } }, '🔒 The journal is locked, so only notes, tasks and habits are searched.') : null);
  };
  const inp = h('input', { type: 'search', placeholder: 'Search notes, the journal, tasks · #tag @person', 'aria-label': 'Search', onInput: (e) => paint(e.target.value), onKeydown: (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { sel = Math.max(0, Math.min(hits.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); [...list.querySelectorAll('.item')].forEach((c, i) => c.classList.toggle('hl', i === sel)); list.querySelectorAll('.item')[sel]?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[sel]) { box.remove(); hits[sel].open(); }
  } });
  const box = h('div', { class: 'search', onClick: (e) => { if (e.target === box) box.remove(); } }, h('div', { class: 'box', role: 'dialog', 'aria-label': 'Search' }, inp, list));
  document.body.append(box); paint(''); setTimeout(() => inp.focus(), 30);
}

// ---------------- backups, restore, Drive check ----------------
async function backupsSheet() {
  let list = [];
  try { list = await G.listBackups(S().settings.driveFolder); } catch (e) { return toast(e.message, 'err'); }
  const { close } = sheet([h('h2', {}, 'Restore a daily backup'),
    h('p', { class: 'small muted' }, 'Bergamot keeps one snapshot of your journal, notes, tasks and habits per day on Drive (hub/bergamot/backups, newest 14). Restoring replaces this copy and syncs it to your other devices.'),
    list.length ? h('div', { class: 'list' }, ...list.map(b => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, b.name.replace(/^state-|\.json$/g, '')), h('div', { class: 'meta' }, `${Math.max(1, Math.round(b.size / 1024))} KB`)),
      h('button', { class: 'btn sm', onClick: async () => { try { const j = await G.readBackup(b.id); close(); restoreSheet(j, { source: `Drive backup ${b.name}` }); } catch (e) { toast(e.message, 'err'); } } }, 'Restore')))) : h('div', { class: 'muted small' }, 'No backups yet — the first is made after today\'s sync.')]);
}
const PRE_KEY = 'bergamot.preRestore';
function preRestore() { if (rt.preRestore) return rt.preRestore; try { return JSON.parse(localStorage.getItem(PRE_KEY) || 'null'); } catch { return null; } }
function keepPreRestore() { const snap = { at: Date.now(), state: S() }; rt.preRestore = snap; try { localStorage.setItem(PRE_KEY, JSON.stringify(snap)); return true; } catch { return false; } }
function dropPreRestore() { rt.preRestore = null; try { localStorage.removeItem(PRE_KEY); } catch {} }
/** Draw every main screen off-page; a state that throws anywhere is rolled back before anyone sees an empty app. */
function smokeRender() { for (const fn of [TU.renderToday, JU.renderJournal, NU.renderNotes, KU.renderTasks, KU.renderHabits]) fn(); HUB.buildStatus(S(), new Date()); }
const when = (t) => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown date';
function restoreSheet(json, { source = 'Backup file' } = {}) {
  const chk = checkBackup(json); if (!chk.ok) { toast(`${source}: ${chk.error}`, 'err'); return; }
  const sm = chk.summary, cur = checkBackup({ ...S(), app: 'bergamot' }).summary, older = sm.savedAt && (S().updatedAt || 0) > sm.savedAt;
  const kv = (rows) => h('div', { class: 'kv' }, ...rows.flatMap(([a, b]) => [h('b', {}, a), h('span', {}, b)]));
  const { close } = sheet([h('h2', {}, 'Restore this backup?'), h('div', { class: 'small muted', style: { marginBottom: '10px' } }, source),
    h('div', { class: 'rs-cols' }, h('div', { class: 'card rs-in' }, h('div', { class: 'title' }, 'In the backup'), kv([['Saved', when(sm.savedAt)], ['Holds', describeCounts(sm.counts)]])), h('div', { class: 'card' }, h('div', { class: 'title' }, 'On this device now'), kv([['Saved', when(S().updatedAt)], ['Holds', describeCounts(cur?.counts)]]))),
    older ? h('div', { class: 'small late', style: { margin: '8px 0' } }, 'This backup is older than the data on this device.') : null,
    chk.dropped.length ? h('div', { class: 'card warn' }, h('div', { class: 'title' }, `Left out: ${chk.dropped.length} part${chk.dropped.length > 1 ? 's' : ''}`), h('div', { class: 'tiny' }, chk.dropped.slice(0, 8).join(' · '))) : null,
    h('p', { class: 'small muted' }, 'Replace puts the backup in place of everything here, then on your other devices. Merge keeps both: for each item the newest edit wins. Either way Bergamot keeps a copy of your data as it is now, so you can undo.'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn danger grow', onClick: () => { close(); applyRestore(chk.state, { merge: false }); } }, 'Replace everything'), h('button', { class: 'btn primary grow', onClick: () => { close(); applyRestore(chk.state, { merge: true }); } }, 'Merge into mine'), h('button', { class: 'btn ghost', onClick: () => close() }, 'Cancel'))]);
}
function applyRestore(next, { merge = false } = {}) {
  const before = S(), kept = keepPreRestore();
  backupBefore(merge ? 'merge' : 'restore');
  const target = merge ? { ...mergeStates(before, next), updatedAt: Math.max(before.updatedAt || 0, next.updatedAt || 0) } : { ...next, outbox: before.outbox, google: before.google };
  try { store.replaceState(target); smokeRender(); }
  catch (e) { console.warn('restore rolled back', e); store.replaceState(before); dropPreRestore(); render(); toast(`That backup would break the app (${String(e.message).slice(0, 60)}). Nothing was changed.`, 'err'); return false; }
  store.replaceState(S(), { bump: true, exact: merge ? null : before });
  render();
  toast(`${merge ? 'Merged' : 'Restored'}${kept ? '' : ' (undo copy kept until you close the app)'}`, 'ok', { action: { label: 'Undo', run: undoRestore } });
  return true;
}
function undoRestore() { const snap = preRestore(); if (!snap?.state) { toast('Nothing to undo'); return; } store.replaceState(snap.state, { bump: true, exact: S() }); dropPreRestore(); render(); toast(`Back to your data from ${when(snap.at)}`, 'ok'); }
async function repairSheet() {
  const body = h('div', {}, h('div', { class: 'muted small' }, 'Looking through Drive › ' + S().settings.driveFolder + '…'));
  const { close } = sheet([h('h2', {}, 'Check Drive'), body]);
  let rep; try { rep = await G.scanDrive(S().settings.driveFolder); } catch (e) { body.replaceChildren(h('div', { class: 'small' }, e.message)); return; }
  const issues = [...rep.twinFolders, ...rep.twinFiles].filter(t => t.fixable).length;
  body.replaceChildren(...[
    h('div', { class: 'small' }, `${rep.folders} folders · ${rep.files} files · ${issues ? `${issues} duplicate${issues > 1 ? 's' : ''}` : 'no duplicates'}`),
    ...rep.twinFolders.map(t => h('div', { class: 'small', style: { marginTop: '6px' } }, t.fixable ? `▸ ${t.path} ×${t.items.length} — contents will be merged into the oldest` : `▸ ${t.path} ×${t.items.length} — belongs to its own app; open that app to tidy it`)),
    ...rep.twinFiles.filter(t => t.fixable).map(t => h('div', { class: 'small', style: { marginTop: '6px' } }, `· ${t.path} ×${t.items.length} — newest kept, others to the trash`)),
    h('pre', { class: 'tiny', style: { background: 'var(--bg2)', padding: '10px', borderRadius: '10px', overflow: 'auto', marginTop: '10px', maxHeight: '40vh' } }, rep.tree.join('\n') || '(empty)'),
    issues ? h('button', { class: 'btn primary', style: { marginTop: '10px' }, onClick: async (e) => { e.target.disabled = true; e.target.textContent = 'Fixing…'; try { const r = await G.repairDrive(rep); saveWatch(null); close(); toast(`Fixed: ${r.moved} moved, ${r.trashed} to the trash (restorable for 30 days)`, 'ok'); refreshAll(false, { full: true }); } catch (err) { toast(err.message, 'err'); e.target.disabled = false; e.target.textContent = 'Fix duplicates'; } } }, 'Fix duplicates') : null].filter(Boolean));
}

// ---------------- SETTINGS ----------------
const czOpen = new Set(['Journal', 'Look']);
const hhmm = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
const hmIn = (m, label, onChange) => h('input', { type: 'time', value: hhmm(m % 1440), 'aria-label': label, step: 900, onChange: (e) => { const [a, b] = e.target.value.split(':').map(Number); if (Number.isFinite(a)) onChange(a * 60 + (b || 0)); } });
function customiseCard() {
  const c = CZ.custom(S()), set = (part, patch) => store.update(s => CZ.setCustom(s, part, patch));
  const sec = (title, sub, ...kids) => h('details', { class: 'cz-sec', open: czOpen.has(title), onToggle: (e) => { e.currentTarget.open ? czOpen.add(title) : czOpen.delete(title); } }, h('summary', {}, h('b', {}, title), h('small', {}, sub)), ...kids);
  const chip = (on, label, onClick, extra = {}) => h('button', { class: `chip ${on ? 'sel' : ''}`, 'aria-pressed': on ? 'true' : 'false', onClick, ...extra }, label);
  const tabRow = ([id, label]) => { const hidden = c.tabs.hidden.includes(id), i = c.tabs.order.indexOf(id);
    return h('div', { class: 'cz-row' }, h('span', { class: 'grow' }, label), h('button', { class: 'btn sm ghost', 'aria-label': `Move ${label} up`, disabled: i === 0, onClick: () => set('tabs', { order: CZ.move(c.tabs.order, id, -1) }) }, '↑'), h('button', { class: 'btn sm ghost', 'aria-label': `Move ${label} down`, disabled: i === c.tabs.order.length - 1, onClick: () => set('tabs', { order: CZ.move(c.tabs.order, id, 1) }) }, '↓'),
      id === 'today' ? h('span', { class: 'tiny dim cz-fixed' }, 'always') : chip(!hidden, hidden ? 'Hidden' : 'Shown', () => set('tabs', { hidden: CZ.toggleIn(c.tabs.hidden, id) }))); };
  return h('div', { class: 'card cz' }, h('div', { class: 'title' }, 'Customise'), h('div', { class: 'tiny dim' }, 'Synced to all your devices.'),
    sec('Journal', 'prompts, on this day, the writing face, dictation',
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Prompts that know your shifts'), chip(c.journal.prompts, c.journal.prompts ? 'On' : 'Off', () => set('journal', { prompts: !c.journal.prompts }))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'On this day (a month and a year ago)'), chip(c.journal.onThisDay, c.journal.onThisDay ? 'On' : 'Off', () => set('journal', { onThisDay: !c.journal.onThisDay }))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'A serif for writing'), chip(c.journal.serif, c.journal.serif ? 'On' : 'Off', () => set('journal', { serif: !c.journal.serif }))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, '“Write” starts with'), h('select', { 'aria-label': 'Write starts with', onChange: (e) => set('journal', { defaultMethod: e.target.value }) }, [['journal', 'The prompt / free write'], ['daily', 'Evening check-in'], ['gratitude', 'Gratitude'], ['stoic', 'Stoic review']].map(([v, l]) => h('option', { value: v, selected: c.journal.defaultMethod === v }, l)))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Dictation language'), h('select', { 'aria-label': 'Dictation language', onChange: (e) => set('journal', { voice: e.target.value }) }, CZ.VOICE_LANGS.map(([v, l]) => h('option', { value: v, selected: c.journal.voice === v }, l))))),
    sec('Today', 'which cards, in what order',
      ...c.today.sections.order.map((id, i) => { const lab = CZ.SECTIONS.find(x => x[0] === id)[1], hidden = c.today.sections.hidden.includes(id);
        return h('div', { class: 'cz-row' }, h('span', { class: 'grow' }, lab), h('button', { class: 'btn sm ghost', 'aria-label': `Move ${lab} up`, disabled: i === 0, onClick: () => set('today', { sections: { ...c.today.sections, order: CZ.move(c.today.sections.order, id, -1) } }) }, '↑'), h('button', { class: 'btn sm ghost', 'aria-label': `Move ${lab} down`, disabled: i === c.today.sections.order.length - 1, onClick: () => set('today', { sections: { ...c.today.sections, order: CZ.move(c.today.sections.order, id, 1) } }) }, '↓'),
          chip(!hidden, hidden ? 'Hidden' : 'Shown', () => set('today', { sections: { ...c.today.sections, hidden: CZ.toggleIn(c.today.sections.hidden, id) } }))); })),
    sec('Look', 'colour, shapes, spacing, celebrations',
      h('div', { class: 'tiny dim' }, 'Accent colour'), h('div', { class: 'cz-accents', role: 'radiogroup', 'aria-label': 'Accent colour' }, CZ.ACCENTS.map(([id, l, hex]) => h('button', { class: `cz-acc ${c.look.accent === id ? 'sel' : ''}`, role: 'radio', 'aria-checked': String(c.look.accent === id), style: { '--c': hex }, onClick: () => set('look', { accent: id }) }, h('i'), l))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Shapes'), h('div', { class: 'seg' }, [['bubbly', 'Bubbly'], ['classic', 'Classic']].map(([k, l]) => h('button', { class: c.look.shape === k ? 'active' : '', 'aria-pressed': String(c.look.shape === k), onClick: () => set('look', { shape: k }) }, l)))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Spacing'), h('div', { class: 'seg' }, [['comfy', 'Comfy'], ['compact', 'Compact']].map(([k, l]) => h('button', { class: c.look.density === k ? 'active' : '', 'aria-pressed': String(c.look.density === k), onClick: () => set('look', { density: k }) }, l)))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Celebrations (a few leaves when you finish something)'), chip(c.look.fun, c.look.fun ? 'On' : 'Off', () => set('look', { fun: !c.look.fun })))),
    sec('Your day', 'when your day starts and ends',
      h('div', { class: 'tiny dim' }, 'Used for the shift-aware prompts. After a night Bergamot assumes you sleep first.'),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Up from'), hmIn(c.day.wake, 'Up from', (m) => set('day', { wake: m }))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Bed by'), hmIn(c.day.late, 'Bed by', (m) => set('day', { late: m <= 6 * 60 ? m + 1440 : m })))),
    sec('Tabs', 'order, hide, start tab', ...[...c.tabs.order].map(id => tabRow(CZ.TABS.find(t => t[0] === id))), h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Open on'), h('select', { 'aria-label': 'Open on', onChange: (e) => set('start', e.target.value) }, CZ.TABS.filter(([id]) => !c.tabs.hidden.includes(id)).map(([id, l]) => h('option', { value: id, selected: c.start === id }, l))))),
    h('button', { class: 'btn sm ghost', style: { marginTop: '8px' }, onClick: () => { const before = S(); store.update(s => ({ ...s, settings: { ...s.settings, custom: {} } })); toast('Customise back to the defaults', '', { action: { label: 'Undo', run: () => undoTo(before) } }); } }, 'Reset Customise'));
}
function lockCard() {
  const on = LK.isOn(), st = LK.settings();
  const pin = h('input', { type: 'password', placeholder: on ? 'New PIN or passphrase' : 'PIN or passphrase (4+ characters)', autocomplete: 'new-password', 'aria-label': 'New PIN', 'data-nodirty': '1' }), pin2 = h('input', { type: 'password', placeholder: 'Once more', autocomplete: 'new-password', 'aria-label': 'Repeat the PIN', 'data-nodirty': '1' });
  const setIt = async () => { if (pin.value !== pin2.value) return toast('The two do not match', 'err'); try { await LK.setPin(pin.value, st?.after ?? 5); toast(on ? 'PIN changed' : 'The journal is locked on this device', 'ok'); render(); } catch (e) { toast(e.message, 'err'); } };
  const open = LK.isOpen();
  return h('div', { class: 'card' }, h('div', { class: 'title' }, 'Journal lock'),
    h('div', { class: 'small muted' }, 'An optional PIN in front of the journal only, on this device. Notes, tasks and habits stay open, and Citrus never shows your words. It is a privacy screen, not encryption: forget the PIN and “Turn off” clears it (your entries are safe).'),
    on && !open ? h('div', { class: 'small', style: { marginTop: '8px' } }, 'Unlock the journal to change these.') : h('div', {},
      h('div', { class: 'grid2', style: { marginTop: '8px' } }, pin, pin2), h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn sm primary', onClick: setIt }, on ? 'Change PIN' : 'Lock the journal'),
        on ? h('select', { 'aria-label': 'Lock again after', onChange: (e) => { LK.setAfter(+e.target.value); toast('Saved', 'ok'); } }, [[0, 'Lock when I leave the app'], [1, 'After 1 minute idle'], [5, 'After 5 minutes idle'], [15, 'After 15 minutes idle'], [60, 'After an hour idle']].map(([v, l]) => h('option', { value: v, selected: st.after === v }, l))) : null,
        on ? h('button', { class: 'btn sm ghost', onClick: () => { LK.turnOff(); toast('Lock turned off on this device'); render(); } }, 'Turn off') : null)),
    on && !open ? h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm ghost', onClick: () => { if (confirm('Turn the lock off on this device without the PIN? Your entries stay as they are.')) { LK.turnOff(); render(); } } }, 'Forgot the PIN: turn off')) : null);
}
function uiPicker() {
  const u = getUi(), opt = (id, name, note) => h('button', { class: `ui-opt ${u.ui === id ? 'sel' : ''}`, 'aria-pressed': u.ui === id ? 'true' : 'false', onClick: () => setUi({ ui: id }) }, h('span', { class: `ui-thumb ui-${id}` }, h('i'), h('i'), h('b', {}, 'Aa')), h('b', {}, name), h('small', {}, note));
  return h('div', { class: 'ui-pick' }, h('div', { class: 'title' }, 'Interface on this device'), h('div', { class: 'ui-opts' }, opt('arcade', 'Arcade', '8-bit, the family look'), opt('clean', 'Clean', 'Deep teal, for the evening'), opt('paper', 'Paper', 'Pale bergamot, for daylight')),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('span', { class: 'small grow' }, 'Text size'), h('div', { class: 'seg ui-size' }, [['small', 'S'], ['normal', 'M'], ['large', 'L']].map(([k, l]) => h('button', { class: u.size === k ? 'active' : '', 'aria-label': `Text size ${k}`, 'aria-pressed': String(u.size === k), onClick: () => setUi({ size: k }) }, l)))));
}
function diagnosticsCard() {
  const s = S(), n = (k) => Object.keys(s[k] || {}).length, g = rt.hub.goals;
  const rows = [
    ['Google', G.isSignedIn() ? `signed in as ${G.accountEmail() || s.google.email || '?'}` : G.wasSignedIn() ? 'session expired — tap Sign in' : 'not signed in'],
    ['Session', G.isSignedIn() ? `${G.tokenMinutesLeft()} min left · renews on your next tap` : '—'],
    ['Last sync', s.google.lastSync ? `${new Date(s.google.lastSync).toLocaleString('en-GB')}${rt.syncMode ? ` · ${rt.syncMode}` : ''}${rt.lastSyncMs ? ` · ${(rt.lastSyncMs / 1000).toFixed(1)} s` : ''}` : 'never'],
    ['Drive requests', `${G.stats.requests} sent · ${G.stats.retries} retried · ${G.stats.errors} failed · ${G.stats.skippedWrites} unchanged writes skipped`],
    ['Last Google error', G.stats.lastError ? `${G.stats.lastError} (${new Date(G.stats.lastErrorAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})` : 'none'],
    ['Unsaved to Drive', rt.saveDirty ? 'yes — saves on the next sync' : 'no'],
    ['This device', `${store.persistence.ok ? 'saved' : '⚠ ' + store.persistence.lastError} · ${Math.round(store.persistence.bytes / 1024)} KB${rt.storagePersisted ? ' · protected from clean-up' : ''}`],
    ['Sync issues', (rt.lastProblems || []).length ? rt.lastProblems.join(' · ') : 'none'],
    ['Shifts from Mandarin', R.has() ? `you: ${R.meName() || 'not picked in Mandarin'} · to ${R.coverEnd() ? fmtDate(R.coverEnd()) : '?'} · published ${R.updatedAt() ? new Date(R.updatedAt()).toLocaleString('en-GB') : '?'}` : (rt.hub.shiftsError || 'not read yet')],
    ['Goals from Citrus Plan', g ? `${g.aims.length} aims · ${g.resolutions.length} resolutions${rt.hub.goalsError ? ` · ${rt.hub.goalsError}` : ''}` : (rt.hub.goalsError || 'not read yet')],
    ['Inbox (hub/claude)', rt.hub.inbox?.claude ? `${(rt.hub.inbox.claude.inbox || []).length} items · ${ctx.inbox().length} waiting` : 'nothing published'],
    ['Apps habits count from', Object.keys(rt.hub.apps || {}).join(', ') || 'none'],
    ['Published to the hub', rt.publishedAt ? `status.json at ${new Date(rt.publishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'not yet this session'],
    ['Your data', `${n('journal')} journal entries · ${n('notes')} notes · ${n('tasks')} tasks · ${n('habits')} habits · ${n('dayLog')} rated days`],
    ['Alarms on the calendar', String(n('reminders'))],
    ['Taken over from Citrus', s.migrated ? (s.migrated.from === 'skipped' ? 'skipped' : `${new Date(s.migrated.at).toLocaleDateString('en-GB')} · ${MIG.describe(s.migrated.counts || {})}`) : 'not yet'],
    ['Journal lock', LK.isOn() ? (LK.isOpen() ? 'on · open now' : 'on · locked') : 'off'],
    ['Version', VERSION], ['Online', rt.online ? 'yes' : 'no'], ['Installed', window.matchMedia('(display-mode: standalone)').matches ? 'yes (home screen)' : 'browser tab'],
  ];
  return h('div', { class: 'card' }, h('div', { class: 'title' }, 'Diagnostics'), h('div', { class: 'kv' }, ...rows.flatMap(([a, b]) => [h('b', {}, a), h('span', {}, b)])),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onClick: () => refreshAll(true) }, 'Sync now'), h('button', { class: 'btn sm', onClick: async () => { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; for (const r of regs) await r.unregister(); const ks = await caches.keys(); for (const k of ks) await caches.delete(k); location.reload(); } }, 'Reinstall app files')));
}
function renderMore() {
  const s = S(), signed = G.isSignedIn();
  const out = [h('h1', {}, 'Settings'), h('div', { class: 'card' }, uiPicker()), customiseCard(), lockCard()];
  const cid = h('input', { type: 'text', value: s.settings.clientId, placeholder: '1234567890-xxxx.apps.googleusercontent.com', spellcheck: false, 'aria-label': 'OAuth client ID' });
  out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, 'Google'),
    h('div', { class: 'small muted' }, 'Drive keeps Bergamot in step on all your devices and with your other apps (My Apps › hub › bergamot), brings your shifts from Mandarin and your goals from Citrus Plan. Calendar rings the alarms on your tasks and habits.'),
    h('div', { class: 'row wrap', style: { marginTop: '8px' } },
      signed ? h('button', { class: 'btn', onClick: () => { G.signOut(); saveWatch(null); render(); } }, 'Sign out') : h('button', { class: 'btn primary', onClick: async () => { try { if (cid.value.trim() !== s.settings.clientId) { store.update(x => ({ ...x, settings: { ...x.settings, clientId: cid.value.trim() } }), { remote: false }); } await G.init(cid.value.trim() || s.settings.clientId); await G.signIn({ renew: G.wasSignedIn() }).catch(() => G.signIn()); toast('Signed in', 'ok'); refreshAll(true, { full: true }); } catch (e) { toast(e.message, 'err'); } } }, G.wasSignedIn() ? 'Reconnect Google' : 'Sign in with Google'),
      signed ? h('button', { class: 'btn', onClick: () => refreshAll(true) }, '↻ Sync now') : null),
    signed ? h('div', { class: 'small muted', style: { marginTop: '8px' } }, `${s.google.email || 'signed in'}${s.google.lastSync ? ` · last sync ${new Date(s.google.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`) : null,
    h('details', { class: 'adv' }, h('summary', { class: 'small' }, 'Advanced'), h('div', { class: 'field' }, h('label', {}, 'OAuth client ID (the one Google Cloud client all your apps share)'), cid, h('div', { class: 'tiny dim' }, 'Only the client ID, never the secret. This site must be in the client’s "Authorised JavaScript origins".')),
      h('button', { class: 'btn sm', onClick: async () => { store.update(x => ({ ...x, settings: { ...x.settings, clientId: cid.value.trim() } }), { remote: false }); try { await G.init(cid.value.trim()); toast('Saved', 'ok'); } catch (e) { toast(e.message, 'err'); } } }, 'Save ID'),
      h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', {}, 'Drive folder'), h('input', { value: s.settings.driveFolder, 'aria-label': 'Drive folder', onChange: (e) => { const v = e.target.value.trim() || 'My Apps'; if (/[\/\\]/.test(v) || v.length > 60) { e.target.value = s.settings.driveFolder; return toast('One folder name only (no “/”)', 'err'); } if (v !== 'My Apps' && !confirm(`Your apps share one folder, “My Apps”. Use “${v}” for Bergamot anyway? Mandarin's shifts and Citrus will not be found there.`)) { e.target.value = s.settings.driveFolder; return; } store.update(x => ({ ...x, settings: { ...x.settings, driveFolder: v } })); } }), h('div', { class: 'tiny dim' }, 'Keep “My Apps”: every app reads the hub there. Bergamot keeps its files in My Apps/hub/bergamot/.')))));
  if (signed) {
    out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, 'Alarms'),
      h('div', { class: 'small muted' }, 'A web page cannot ring a closed phone, so Bergamot puts the alarms you set on tasks and habits in Google Calendar, and your Calendar app rings them.'),
      h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', {}, 'Put alarms on'), (() => { const sel = h('select', { 'aria-label': 'Put alarms on', onChange: (e) => store.update(x => ({ ...x, settings: { ...x.settings, planCalendarId: e.target.value } })) }, h('option', { value: 'primary' }, 'Your main calendar'), ...rt.calendars.filter(c => !c.primary && /owner|writer/.test(c.accessRole || '')).map(c => h('option', { value: c.id, selected: s.settings.planCalendarId === c.id }, c.name)));
        if (!rt.calendars.length) G.listCalendars().then(l => { rt.calendars = l; if (l.length > 1 && rt.view === 'more' && !document.querySelector('.sheet-bg')) render(); }).catch(() => {}); return sel; })()),
      h('div', { class: 'tiny dim' }, `${Object.keys(s.reminders || {}).length} alarms on the calendar now.`),
      h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onClick: backupsSheet }, '⟲ Daily backups'), h('button', { class: 'btn sm', onClick: repairSheet }, '🩺 Check Drive'))));
  }
  out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, 'Your apps'),
    h('div', { class: 'small muted' }, 'Bergamot owns your journal, notes, tasks, habits and the day log. It writes hub/bergamot/status.json (what Citrus shows: tasks today, habits left, whether you wrote, your mood numbers — never your words — and what moves each of your goals). It reads Mandarin’s shifts, the goals in Citrus Plan, the inbox in hub/claude, and the apps your habits count from, and never writes into another app’s files.'),
    R.has() ? null : h('div', { class: 'small', style: { marginTop: '6px' } }, rt.hub.shiftsError ? `Shifts: ${rt.hub.shiftsError}.` : 'Shifts: sign in to read them from Mandarin.'),
    h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('a', { class: 'btn sm', href: `${CITRUS_URL}?from=bergamot`, target: '_blank', rel: 'noopener' }, '🍊 Open Citrus'), h('a', { class: 'btn sm', href: `${MANDARIN_URL}?from=bergamot`, target: '_blank', rel: 'noopener' }, '🍊 Open Mandarin'), signed ? h('button', { class: 'btn sm', onClick: () => publish().then(() => toast('Published', 'ok')).catch(e => toast(e.message, 'err')) }, 'Publish now') : null)));
  out.push(diagnosticsCard());
  out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, 'Backup and data'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onClick: downloadBackup }, '⬇ Backup'),
      (() => { const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; let j; try { j = JSON.parse(await f.text()); } catch { return toast(`${f.name} is not a backup file (it isn’t JSON)`, 'err'); } if (MIG.looksLikeCitrus(j)) { migrationOffered = false; offerMigration(j, f.name); return; } restoreSheet(j, { source: f.name }); } }); return h('span', {}, inp, h('button', { class: 'btn', title: 'A Bergamot backup, or a Citrus backup to bring Mind over', onClick: () => inp.click() }, '⬆ Restore or import')); })(),
      preRestore() ? h('button', { class: 'btn', onClick: undoRestore }, '↶ Undo restore') : null,
      signed ? h('button', { class: 'btn', onClick: migrateNow }, '🍊 Bring Mind over from Citrus') : null,
      h('button', { class: 'btn danger', onClick: eraseSheet }, 'Erase this device…')),
    h('div', { class: 'tiny dim', style: { marginTop: '10px' } }, `Bergamot ${VERSION} · Mind · your data lives in this browser and your own Google Drive.`)));
  return out;
}
function downloadBackup() { const blob = new Blob([store.exportJSON()], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `bergamot-backup-${keyOf(new Date())}.json` }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
const ownKeys = () => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('bergamot.')) out.push(k); } } catch {} return out; };
function eraseSheet() {
  const signed = G.isSignedIn() || G.wasSignedIn();
  const { close } = sheet([h('h2', {}, 'Erase Bergamot on this device?'),
    h('p', { class: 'small' }, `This removes Bergamot's data from this browser only: the journal, notes, tasks, habits, the day log, settings, the journal lock and the interface choice (${ownKeys().length} saved items).`),
    h('p', { class: 'small muted' }, signed ? 'Your Google Drive copy is not touched. If you sign in again here, the next sync brings everything back from Drive.' : 'You are not using Google sync, so nothing else holds a copy: download a backup first if you may want it back.'),
    h('div', { class: 'row wrap sh-foot' }, h('button', { class: 'btn', onClick: downloadBackup }, '⬇ Backup first'), h('button', { class: 'btn danger grow', onClick: () => { for (const k of ownKeys()) try { localStorage.removeItem(k); } catch {} close(); location.reload(); } }, 'Erase this device'), h('button', { class: 'btn ghost', onClick: () => close() }, 'Cancel'))]);
}

window.__bergamot = { refreshAll, publish, saveStateNow, pullState, store, G, R, rt, VERSION, HUB, M, J, N, LK };   // for the console and the tests
boot();
