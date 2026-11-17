// Bergamot against an in-memory Google (Drive + Calendar + sign-in): the first sign-in offers to bring Mind over from Citrus's
// state.json (with Undo), shifts come from Mandarin's shifts.json and goals from Citrus's plan.json, the inbox from
// hub/claude/status.json, a habit counts from another app's status.json, status.json is written to hub/bergamot only (with no
// journal text), alarms land in the calendar, and two devices converge. Made-up data only. Run: node test/hub.mjs
import { chromium, serve, sleep, checker } from './helpers.mjs';
import { createFakeGoogle } from './fake-google.mjs';
import { shifts, goals } from './fixture.mjs';

const { server, url } = await serve(), browser = await chromium.launch(), { check, bad } = checker();
const at = Date.parse('2026-11-10T10:00:00Z');
const citrusState = { app: 'citrus', updatedAt: at, me: { id: '1', name: 'Dr Test Me' }, rotas: { r: { id: 'r', people: [], legend: {} } }, chores: { c1: { id: 'c1', title: 'not mind', at } },
  tasks: { ct1: { id: 'ct1', title: 'Test task from Citrus', done: false, due: '2026-11-17', est: 30, aimId: 'aim1', at } },
  habits: { ch1: { id: 'ch1', name: 'Gym', emoji: '💪', freq: { type: 'weekly', n: 3 }, link: 'orange', at, createdAt: at } }, habitLog: { ch1: { '2026-11-12': { v: 1, at } } },
  reflections: { 'daily:2026-11-12': { id: 'daily:2026-11-12', method: 'daily', date: '2026-11-12', mood: 4, energy: 3, answers: { wins: ['A secret test win'] }, at } },
  notes: { '2026-11-11': 'A private Citrus day note' }, memos: { m1: { id: 'm1', title: 'Test memo', body: 'Memo body text', tags: [], at } },
  dayLog: { '2026-11-12': { key: '2026-11-12', score: 4, at } },
  aims: { aim1: { id: 'aim1', title: 'stays in Citrus', at } }, media: { x: { id: 'x', title: 'a book' } }, settings: { alarmPlan: 10 } };
const plan = { app: 'citrus', updatedAt: '2026-11-16T05:00:00Z', days: {}, goals };
const claude = { app: 'claude', title: 'Claude', updatedAt: '2026-11-16T05:00:00Z', inbox: [{ id: 'cl-1', type: 'task', title: 'Read the test guideline', date: '2026-11-17', minutes: 20 }, { id: 'cl-2', type: 'note', title: 'A test idea', text: 'More words about the idea' }, { id: 'cl-3', type: 'event', title: 'not for Bergamot', date: '2026-11-17', start: '10:00' }] };
const orange = { app: 'orange', title: 'Orange', updatedAt: '2026-11-16T05:00:00Z', today: { date: '2026-11-16', done: true } };

const g = createFakeGoogle();
g.put('state.json', g.path(['My Apps', 'hub', 'citrus']), citrusState);
g.put('plan.json', g.path(['My Apps', 'hub', 'citrus']), plan);
g.put('shifts.json', g.path(['My Apps', 'hub', 'mandarin']), shifts);
g.put('status.json', g.path(['My Apps', 'hub', 'claude']), claude);
g.put('status.json', g.path(['My Apps', 'hub', 'orange']), orange);

async function device(label, { width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700, hasTouch: width < 700, serviceWorkers: 'block', timezoneId: 'Asia/Riyadh' });
  await g.attach(ctx);
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await p.clock.install({ time: new Date('2026-11-16T09:30:00+03:00') });
  await p.addInitScript(() => { if (!localStorage.getItem('bergamot.google')) localStorage.setItem('bergamot.google', JSON.stringify({ access_token: 'tok', exp: Date.now() + 3600e3, email: 'tester@example.com' })); });
  await p.goto(url); await p.waitForSelector('#view-today.active'); p.label = label;
  return { ctx, p };
}
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('bergamot.state.v1') || 'null'));
const until = async (p, fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn).catch(() => false)) return true; await sleep(150); } return false; };
const sync = async (p) => { await until(p, () => !window.__bergamot.rt.syncing); await p.evaluate(() => window.__bergamot.refreshAll(true)); await until(p, () => !window.__bergamot.rt.syncing); await sleep(300); };

console.log('first sign-in on the phone');
const A = await device('phone');
check(await until(A.p, () => !!document.querySelector('.sheet h2')?.textContent.includes('Bring your Mind over')), 'offers to bring Mind over from Citrus');
const offer = await A.p.locator('.sheet').innerText();
check(/1 task · 1 habit · 1 journal entry · 1 day note · 1 note · 1 rated day/.test(offer) && /goals .* stay in Citrus Plan/i.test(offer), `says what it found and what stays (${offer.match(/Found in[^.]*/)?.[0]})`);
await A.p.click('.sheet button:has-text("Bring them over")'); await sleep(700);
let s = await state(A.p);
check(s.tasks.ct1?.aimId === 'aim1' && s.habits.ch1 && s.habitLog.ch1['2026-11-12'].v === 1, 'tasks (with their goal) and habits (with their ticks) came over');
check(s.journal['daily:2026-11-12']?.answers.wins[0] === 'A secret test win' && s.journal['day-2026-11-11']?.text === 'A private Citrus day note' && s.notes.m1?.body === 'Memo body text', 'reflections and day notes are journal entries; memos are notes');
check(!s.aims && !s.media && !s.chores && !s.rotas && !s.me, 'goals, the Library and everything else stay in Citrus');
check(s.migrated?.from === 'citrus' && await A.p.locator('.toast button:has-text("Undo")').count() === 1, 'migration recorded, Undo offered');
check(await until(A.p, () => window.__bergamot.R.has()), 'the shifts were read from Mandarin');
check(await until(A.p, () => window.__bergamot.rt.hub.goals?.aims?.length === 2), 'the goals were read from Citrus Plan');

console.log('Today');
await A.p.click('nav.tabs button[data-view=today]'); await sleep(400);
let today = await A.p.locator('#view-today').innerText();
check(/Day shift/.test(today) && /D1 08:00–20:00/.test(today), 'Today shows the shift');
check(/Inbox/.test(today) && /Read the test guideline/.test(today) && /A test idea/.test(today) && !/not for Bergamot/.test(today), 'the inbox shows the task and note items (not the event)');
check(/Gym/.test(today) && await until(A.p, () => /ticked by orange/.test(document.querySelector('#view-today').innerText)), 'a habit counts itself from another app’s status.json (read as soon as it is linked)');
await A.p.click('#view-today .inbox .mrow:has-text("Read the test guideline") button:has-text("Take")'); await sleep(300);
await A.p.click('#view-today .inbox .mrow:has-text("A test idea") button:has-text("Take")'); await sleep(300);
s = await state(A.p);
check(Object.values(s.tasks).some(t => t.title === 'Read the test guideline' && t.srcApp === 'claude') && Object.values(s.notes).some(n => n.title === 'A test idea') && s.inboxLog['claude:cl-1'].status === 'accepted', 'taking items makes a task and a note, and remembers it');
check(!(await A.p.locator('#view-today .inbox').count()), 'the inbox is empty after');

console.log('a task goal, an alarm, an entry');
await A.p.click('nav.tabs button[data-view=tasks]'); await sleep(300);
await A.p.click('#view-tasks .mrow.task:has-text("Test task from Citrus") .mtitle'); await sleep(400);
check(await A.p.locator('.sheet select[aria-label="Goal"] option:checked').innerText() === '📚 Pass the test exam', 'the task’s goal resolves against plan.json goals');
await A.p.click('.sheet .seg.mini button:has-text("This evening")'); await A.p.click('.sheet button:has-text("Save")'); await sleep(300);
await A.p.click('nav.tabs button[data-view=today]'); await sleep(200);
await A.p.click('#view-today .card.page button:has-text("Write")'); await sleep(300);
await A.p.fill('.sheet textarea.write', 'A very private test sentence about the ward. #hubtest'); await A.p.click('.sheet .seg.emoji button[aria-label="Great"]'); await A.p.click('.sheet button:has-text("Save")'); await sleep(400);
await sync(A.p);
const evs = () => [...g.calendars.get('primary').events.values()].filter(e => e.status !== 'cancelled' && e.extendedProperties?.private?.bergamot === 'reminder');
check(evs().some(e => /Test task from Citrus/.test(e.summary)), 'the task alarm is in the calendar');

console.log('what Citrus gets');
const st = g.readJsonAt(['My Apps', 'hub', 'bergamot'], 'status.json');
check(st?.app === 'bergamot' && st.contract === 2 && /journaled today/.test(st.summary), `status.json: "${st?.summary}"`);
check(st.extra?.goalLinks?.aim1?.tasks === 1 && st.extra.journaledToday === true && st.extra.mood.today === 5 && st.extra.habits.done >= 1, 'extra: goalLinks, journaledToday, mood, habits');
check(st.asks.some(a => /Test task from Citrus/.test(a.title) && a.minutes === 30), 'a task with an estimate is time Citrus can place');
const raw = JSON.stringify(st);
check(!/very private|secret test win|private Citrus day note|Memo body|More words/.test(raw), 'no journal text and no note bodies in status.json');
check(!!g.readJsonAt(['My Apps', 'hub', 'bergamot'], 'state.json'), 'state.json in hub/bergamot');
check(g.find('bergamot', g.path(['My Apps', 'hub']))?.appProperties?.citrusApp === 'bergamot' && st.drive?.byTag === true, 'its own untagged folder is tagged at once, and status.json says drive.byTag');
check(JSON.stringify(g.readJsonAt(['My Apps', 'hub', 'citrus'], 'state.json')) === JSON.stringify(citrusState) && JSON.stringify(g.readJsonAt(['My Apps', 'hub', 'claude'], 'status.json')) === JSON.stringify(claude), "Citrus's and Claude's files are untouched");

console.log('a second device');
const B = await device('desktop', { width: 1400 });
await sleep(500);
check(!(await B.p.locator('.sheet h2:has-text("Bring your Mind over")').count()), 'the second device does not ask again');
await sync(B.p);
let sb = await state(B.p); check(sb.tasks.ct1 && Object.values(sb.journal).some(e => /#hubtest/.test(e.text)) && sb.notes.m1, 'the desktop has the phone’s data');
await B.p.evaluate(() => { const b = window.__bergamot; b.store.update(s => b.N.addNote(s, { id: 'nB', title: 'From the desktop', body: 'x' })); });
await B.p.evaluate(() => { const b = window.__bergamot; b.store.update(s => b.M.logHabit(s, 'ch1', '2026-11-15', 1)); });
await A.p.evaluate(() => { const b = window.__bergamot; b.store.update(s => b.M.deleteTask(s, 'ct1')); }); await sleep(300);
await sync(B.p); await sync(A.p); await sync(B.p);
const [ea, eb] = [await state(A.p), await state(B.p)];
check(ea.notes.nB && eb.notes.nB, 'a note made on the desktop reaches the phone');
check(ea.habitLog.ch1['2026-11-15']?.v === 1 && ea.habitLog.ch1['2026-11-12']?.v === 1, 'habit ticks from both devices are kept');
check(!ea.tasks.ct1 && !eb.tasks.ct1, 'a task deleted on the phone stays deleted on both');
await sync(A.p);
check(!evs().some(e => /Test task from Citrus/.test(e.summary)), 'deleting the task takes its alarm off the calendar');
console.log('Citrus moves the folders (drive-layout.md)');
{
  const FOLDER = 'application/vnd.google-apps.folder', hub = g.path(['My Apps', 'hub']);
  const move = (name, to, rename) => { const f = g.find(name, hub); f.appProperties = { ...(f.appProperties || {}), citrusApp: name }; f.parents = [g.path(to)]; if (rename) f.name = rename; g.touch(f); return f; };
  move('citrus', ['Citrus', '00 Hub'], 'Citrus'); move('claude', ['Citrus', '00 Hub'], 'Claude'); move('mandarin', ['Citrus', 'Work'], 'Mandarin');
  move('orange', ['Citrus', 'Life'], 'Fitness - Orange'); const bf = move('bergamot', ['Citrus', 'Life'], 'Mind & Journal - Bergamot');
  // a new inbox item lands in the moved Claude folder
  const cf = g.find('status.json', g.find('Claude', g.path(['Citrus', '00 Hub'])).id); cf.content = Buffer.from(JSON.stringify({ ...claude, inbox: [...claude.inbox, { id: 'cl-4', type: 'task', title: 'Test item after the move' }] })); g.touch(cf);
  await A.p.evaluate(() => { const b = window.__bergamot; b.store.update(s => b.N.addNote(s, { id: 'nMoved', title: 'Written after the move', body: 'x' })); });
  await sync(A.p); await A.p.evaluate(() => window.__bergamot.refreshAll(true, { full: true })); await until(A.p, () => !window.__bergamot.rt.syncing); await sleep(400);
  const moved = JSON.parse(g.find('state.json', bf.id).content.toString());
  check(!!moved.notes?.nMoved, 'the phone keeps writing into its moved, renamed folder');
  check(!g.find('bergamot', hub) && !g.find('mandarin', hub), 'no folder is created again at the old path');
  await A.p.click('nav.tabs button[data-view=today]'); await sleep(300);
  check(await until(A.p, () => /Test item after the move/.test(document.querySelector('#view-today').innerText)), 'the inbox is read from the moved Claude folder');
  const C = await device('fresh tablet', { width: 800 });
  await sync(C.p);
  const sc = await state(C.p);
  check(sc.notes?.nMoved && sc.notes?.nB && !(await C.p.locator('.sheet h2:has-text("Bring your Mind over")').count()), 'a fresh device finds everything by tag');
  check(await C.p.evaluate(() => window.__bergamot.R.has() && window.__bergamot.rt.hub.goals?.aims?.length === 2), 'shifts and goals come from the moved Mandarin and Citrus folders');
  check(!g.find('bergamot', hub) && !g.find('My Apps', 'root')?.trashed && [...g.files.values()].filter(f => f.mimeType === FOLDER && f.appProperties?.citrusApp === 'bergamot' && !f.trashed).length === 1, 'still one Bergamot folder, nothing new under My Apps');
  check(!C.p.errors.length, 'no page errors on the fresh device');
  await C.ctx.close();
}
const twins = g.tree().filter(l => /(status|state)\.json/.test(l) && !/backups|citrus|mandarin|claude|orange/.test(l));
check(twins.length === new Set(twins).size, `no duplicate files (${twins.length})`);
check(!A.p.errors.length && !B.p.errors.length, `no page errors${[...A.p.errors, ...B.p.errors].slice(0, 2).join(' | ')}`);
await browser.close(); server.close();
if (bad()) { console.log(`${bad()} hub check(s) FAILED`); process.exit(1); }
