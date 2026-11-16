// Every tab and the main sheets render at phone and desktop sizes (and in each interface) with made-up data, with no page errors,
// no stray "undefined" / "NaN" / "null" on screen and no sideways scroll. Writing, notes, the lock and search are exercised.
// Run: node test/smoke.mjs
import { chromium, serve, page, sleep, checker } from './helpers.mjs';
import { shifts, state } from './fixture.mjs';
import fs from 'node:fs'; import path from 'node:path';
const shots = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'shots/smoke'); fs.rmSync(shots, { recursive: true, force: true }); fs.mkdirSync(shots, { recursive: true });
const { server, url } = await serve(), browser = await chromium.launch(), { check, bad } = checker();
const TABS = ['today', 'journal', 'notes', 'tasks', 'habits', 'more'];
const clean = async (p, sel, what) => {
  const txt = await p.locator(sel).first().innerText();
  check(txt.length > 30, `${what} renders (${txt.length} chars)`);
  check(!/\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]/.test(txt), `${what}: no undefined / NaN / null`);
  check(!/hit a problem|could not be shown/.test(txt), `${what}: no crash card`);
  return txt;
};
const state0 = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('bergamot.state.v1') || 'null'));
for (const [w, hgt, time, ui] of [[390, 844, '2026-11-16T19:30:00+03:00', 'clean'], [320, 640, '2026-11-20T09:00:00+03:00', 'arcade'], [1500, 900, '2026-11-22T15:00:00+03:00', 'paper']]) {
  console.log(`${w}px at ${time.slice(5, 16)} (${ui})`);
  const { p, ctx, errors } = await page(browser, { width: w, height: hgt, time, seed: state, shifts });
  await p.addInitScript((u) => localStorage.setItem('bergamot.ui', JSON.stringify({ ui: u, size: 'normal' })), ui);
  await p.goto(url); await sleep(500);
  for (const t of TABS) {
    if (t === 'more') await p.click('#btnMore'); else await p.click(`nav.tabs button[data-view=${t}]`);
    await sleep(300);
    await clean(p, `#view-${t}`, t);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check(over <= 1, `${t}: no sideways scroll (${over}px)`);
    await p.screenshot({ path: `${shots}/${w}-${t}.png`, fullPage: true });
  }
  const sheetCheck = async (open, what) => { await open(); await sleep(400); const t = await clean(p, '.sheet', what); await p.screenshot({ path: `${shots}/${w}-${what.replace(/\W+/g, '-')}.png` }); const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check(over <= 1, `${what}: no sideways scroll`); for (let i = 0; i < 3 && await p.locator('.sheet').count(); i++) { await p.keyboard.press('Escape'); await sleep(300); } return t; };
  const tab = async (t, seg) => { await p.click(`nav.tabs button[data-view=${t}]`); await sleep(150); if (seg) { await p.click(`#view-${t} .seg button:has-text("${seg}")`); await sleep(200); } };
  // Today
  await tab('today');
  const today = await p.locator('#view-today').innerText();
  if (time.startsWith('2026-11-16')) check(/On this day/.test(today) && /A month ago/.test(today) && /A year ago/.test(today), 'Today: on this day');
  if (time.startsWith('2026-11-22')) check(/After a night/.test(today) && /coming off a night|After the night/i.test(today), 'Today knows you are coming off a night (prompt and chip)');
  if (time.startsWith('2026-11-20')) check(/Night/.test(today), 'Today knows it is a night');
  // the journal: write an entry with mood, energy and marks
  await p.click('#view-today .card.page button:has-text("Write")'); await sleep(350);
  check(await p.locator('.sheet textarea.write').count() === 1, 'Write opens the writing sheet');
  await p.screenshot({ path: `${shots}/${w}-write.png` });
  await p.click('.sheet .seg.emoji button[aria-label="Good"]'); await p.click('.sheet .seg.energy button[aria-label="Steady"]');
  await p.fill('.sheet textarea.write', `Test entry at ${w}. Coffee with @Test_Friend at +Test_Cafe. #smoke`);
  await p.click('.sheet button:has-text("Save")'); await sleep(400);
  let s = await state0(p); const mine = Object.values(s.journal).find(e => e.text.startsWith(`Test entry at ${w}`));
  check(mine && mine.mood === 4 && mine.energy === 3 && mine.tags.includes('smoke') && mine.people.includes('Test Friend') && mine.places.includes('Test Cafe'), 'the entry is saved with mood, energy, #tag, @person and +place');
  check(!(await p.evaluate(() => localStorage.getItem('bergamot.draft'))), 'the draft is cleared after saving');
  // Journal tab
  await tab('journal');
  await sheetCheck(() => p.click('#view-journal .entry >> nth=0'), 'read an entry');
  await sheetCheck(() => p.click('#view-journal button:has-text("Other ways to reflect")'), 'methods');
  await p.click('#view-journal button:has-text("Other ways to reflect")'); await sleep(300); await p.click('.sheet .method:has-text("Evening check-in")'); await sleep(350);
  await clean(p, '.sheet', 'evening check-in'); await p.fill('.sheet input[aria-label="Three wins today 1"]', 'A test win'); await p.fill('.sheet input[aria-label="Top three for tomorrow 1"]', 'Test follow-up'); await p.click('.sheet button:has-text("Save")'); await sleep(400);
  s = await state0(p); check(Object.values(s.tasks).some(t => t.title === 'Test follow-up' && t.src === 'journal:daily'), 'tomorrow’s top three become tasks');
  await p.click('#view-journal button:has-text("Other ways to reflect")'); await sleep(300); await p.click('.sheet .method:has-text("Wheel of life")'); await sleep(350);
  await clean(p, '.sheet', 'wheel of life'); await p.screenshot({ path: `${shots}/${w}-wheel.png` }); await p.keyboard.press('Escape'); await sleep(300);
  await p.fill('#view-journal .jr-search', 'rota'); await sleep(300); check((await p.locator('#view-journal .card:not(.page) .entry').count()) === 1, 'journal search narrows to the match');
  check(await p.evaluate(() => document.activeElement?.classList.contains('jr-search')), 'typing in the search keeps the focus');
  await p.fill('#view-journal .jr-search', ''); await sleep(200);
  await tab('journal', 'Calendar'); await clean(p, '#view-journal', 'Journal › Calendar'); await p.screenshot({ path: `${shots}/${w}-calendar.png`, fullPage: true });
  await sheetCheck(() => p.click('#view-journal .cal .day.has >> nth=0'), 'a day in the calendar');
  await tab('journal', 'Trends'); const tr = await clean(p, '#view-journal', 'Journal › Trends'); await p.screenshot({ path: `${shots}/${w}-trends.png`, fullPage: true });
  check(/Mood & energy/.test(tr) && /Wheel of life/.test(tr), 'trends: mood and the wheel');
  await tab('journal', 'Tags & people'); const mk = await clean(p, '#view-journal', 'Journal › Tags & people'); check(/#work/.test(mk) && /@Test Friend/.test(mk), 'tags and people collect');
  await p.click('#view-journal .chip:has-text("#work")'); await sleep(250); check(await p.locator('#view-journal .card:not(.page) .entry').count() === 1, 'a tag filters the entries');
  await sheetCheck(() => p.click('#view-journal button:has-text("Export")'), 'export');
  // Notes
  await tab('notes');
  await p.fill('#view-notes .nc-in', 'Test shopping\n- [ ] test bread\n- [ ] test tea #errands'); await p.click('#view-notes button:has-text("Save note")'); await sleep(350);
  s = await state0(p); const nn = Object.values(s.notes).find(n => n.title === 'Test shopping'); check(nn && nn.tags.includes('errands'), 'a quick note is saved with its title and tag');
  await p.click('#view-notes .ncard:has-text("Reading list")'); await sleep(400);
  await clean(p, '.sheet', 'note (read)'); await p.screenshot({ path: `${shots}/${w}-note.png` });
  check(/Linked from/.test(await p.locator('.sheet').innerText()), 'a note shows its backlinks');
  await p.click('.sheet .ck-box >> nth=1'); await sleep(300);
  s = await state0(p); check(/- \[x\] Another test book/.test(s.notes.n1.body), 'ticking a checklist item in a note saves it');
  await p.click('.sheet .seg button:has-text("Edit")'); await sleep(200);
  await p.fill('.sheet .ne-body', s.notes.n1.body + '\nSee [[Ideas]].'); await sleep(900);
  s = await state0(p); check(/See \[\[Ideas\]\]/.test(s.notes.n1.body), 'the editor saves as you type');
  await p.click('.sheet .seg button:has-text("Read")'); await sleep(200); await p.click('.sheet a.wl:has-text("Ideas") >> nth=-1'); await sleep(450);
  check(await p.locator('.sheet .ne-title').inputValue() === 'Ideas', 'a [[link]] opens the other note');
  await p.click('.sheet button:has-text("→ Task")'); await sleep(300); s = await state0(p); check(Object.values(s.tasks).some(t => t.src === 'note:n2'), 'a note becomes a task');
  for (let i = 0; i < 3 && await p.locator('.sheet').count(); i++) { await p.keyboard.press('Escape'); await sleep(300); }
  await sheetCheck(() => p.click('#view-notes button:has-text("Full editor")'), 'new note editor');
  await p.fill('#view-notes .nt-search', 'reading'); await sleep(300); const res = await p.locator('#view-notes').innerText(); check(/📝/.test(res) && /📔/.test(res), 'search finds notes and journal entries together'); await p.fill('#view-notes .nt-search', ''); await sleep(200);
  // Tasks, Habits
  await tab('tasks'); await p.fill('#view-tasks .cap-in', 'test the capture tomorrow 15m !'); await p.keyboard.press('Enter'); await sleep(300);
  s = await state0(p); check(Object.values(s.tasks).some(t => t.title === 'Test the capture' && t.est === 15 && t.pri === 1), 'capture reads “tomorrow 15m !”');
  check(await p.evaluate(() => document.activeElement?.classList.contains('cap-in')), 'capture keeps the focus for the next one');
  await sheetCheck(() => p.click('#view-tasks .mrow.task >> nth=0'), 'task sheet');
  await p.click('#view-tasks .mrow.task:not(.done) .tick >> nth=0'); await sleep(300); check(await p.locator('.toast button:has-text("Undo")').count() >= 1, 'ticking a task offers Undo'); await sleep(500);
  await tab('habits'); await sheetCheck(() => p.click('#view-habits .mrow.habit .mtitle >> nth=0'), 'habit sheet'); await sheetCheck(() => p.click('#view-habits button:has-text("＋ Habit")'), 'new habit');
  // search, shortcuts, Settings, the lock
  await sheetCheck(() => p.click('#btnSearch'), 'search').catch(() => {});
  await p.keyboard.press('Escape'); await sleep(200);
  await p.keyboard.press('w'); await sleep(300); check(await p.locator('.sheet textarea.write').count() === 1, '“w” opens the writing sheet'); await p.keyboard.press('Escape'); await sleep(300);
  if (w === 390) {
    await p.click('#btnMore'); await sleep(300);
    await p.fill('input[aria-label="New PIN"]', '2468'); await p.fill('input[aria-label="Repeat the PIN"]', '2468'); await p.click('button:has-text("Lock the journal")'); await sleep(1200);
    await p.evaluate(() => window.__bergamot.LK.lockNow()); await tab('journal'); await sleep(200);
    const lk = await p.locator('#view-journal').innerText(); check(/locked/.test(lk) && !/rota/.test(lk), 'the locked journal shows nothing of your words');
    await tab('notes'); await p.fill('#view-notes .nt-search', 'rota'); await sleep(300); check(!/📔/.test(await p.locator('#view-notes').innerText()), 'search leaves a locked journal out'); await p.fill('#view-notes .nt-search', '');
    await tab('today'); check(/locked/.test(await p.locator('#view-today').innerText()), 'Today shows the lock instead of the page');
    await tab('journal'); await p.fill('#view-journal input[aria-label="Journal PIN"]', '1111'); await p.keyboard.press('Enter'); await sleep(1200); check(/locked/.test(await p.locator('#view-journal').innerText()), 'a wrong PIN keeps it locked');
    await p.fill('#view-journal input[aria-label="Journal PIN"]', '2468'); await p.keyboard.press('Enter'); await sleep(1200); check(/Entries/.test(await p.locator('#view-journal').innerText()), 'the right PIN opens it');
    check(!/2468/.test(await p.evaluate(() => JSON.stringify(localStorage))), 'the PIN itself is never stored');
  }
  check(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}
// first run: an empty app shows the guided start
{
  const { p, ctx, errors } = await page(browser, { width: 390, height: 844, seed: { app: 'bergamot', settings: {} }, shifts });
  await p.goto(url); await sleep(500);
  const t = await clean(p, '#view-today', 'first run'); check(/Welcome to Bergamot/i.test(t) && /Pick a few habits/.test(t), 'first run: the guided start');
  await p.screenshot({ path: `${shots}/first-run.png`, fullPage: true });
  await p.click('#view-today .kit-item >> nth=0'); await sleep(300); check((await state0(p)).habits && Object.keys((await state0(p)).habits).length === 1, 'one tap adds a starter habit');
  check(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}
await browser.close(); server.close();
if (bad()) { console.log(`${bad()} smoke check(s) FAILED`); process.exit(1); }
