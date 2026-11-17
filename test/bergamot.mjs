// Logic checks (Node only, no browser): capture, tasks, habits and streaks, the journal (marks, on this day, gentle streaks,
// prompts that know your shifts, mood against shifts, export), notes (checklists, [[links]], backlinks, Markdown, search),
// goals and goalLinks, the inbox, reminders, status.json, the Citrus migration, sanitize and merge, backups, settings.
// Made-up data only. Run: TZ=Asia/Riyadh node test/bergamot.mjs
import { checker } from './helpers-node.mjs';
import { state as fx, shifts, goals as fxGoals } from './fixture.mjs';
import * as M from '../docs/js/mind.js';
import * as J from '../docs/js/journal.js';
import * as N from '../docs/js/notes.js';
import * as R from '../docs/js/roster.js';
import * as D from '../docs/js/day.js';
import * as HUB from '../docs/js/hub.js';
import * as MIG from '../docs/js/migrate.js';
import * as CZ from '../docs/js/custom.js';
import { sanitize, mergeStates } from '../docs/js/store.js';
import { checkBackup, describeCounts } from '../docs/js/backup-check.js';
import { keyOf, fromKey } from '../docs/js/util.js';

const { check, bad } = checker();
const now = new Date('2026-11-16T09:30:00+03:00'), eve = new Date('2026-11-16T21:30:00+03:00');
const S = () => JSON.parse(JSON.stringify(fx));
R.set(shifts);
const goals = M.cleanGoals(fxGoals);

console.log('capture');
let c = M.parseCapture('call the bank tomorrow 20m !', now);
check(c.title === 'Call the bank' && c.due === '2026-11-17' && c.est === 20 && c.pri === 1, 'words, day, minutes and priority are read');
c = M.parseCapture('dentist 31/02', now); check(c.warn && /31\/02/.test(c.title), '31/02 is not a date and stays in the title');
c = M.parseCapture('pay rent 3/12', now); check(c.due === '2026-12-03', 'dd/mm is read the way you write dates');
check(M.parseCapture('!!', now).title === '', '"!!" alone is not a task');

console.log('tasks');
let s = S();
let b = M.taskBuckets(s, now);
check(b.overdue.map(t => t.id).join() === 't1' && b.today.map(t => t.id).join() === 't2' && b.done.length === 1, 'overdue / today / done buckets');
check(M.focusTasks(s, now, 3)[0].id === 't1', 'overdue comes first');
s = M.setTaskDone(s, 't1', true); check(s.tasks.t1.done && s.tasks.t1.doneAt > 0, 'ticking a task');
s = M.deleteTask(s, 't5'); check(!s.tasks.t5 && s.deleted['task:t5'], 'deleting leaves a tombstone');

console.log('habits');
s = S();
const h2 = s.habits.h2, h1 = s.habits.h1, h3 = s.habits.h3;
check(M.habitStreak(s, h2, now, {}).cur === 4, 'walk: 4 days running, today still open');
check(M.habitDone(s, h1, '2026-11-14', {}, '2026-11-16') && !M.habitDone(s, h1, '2026-11-12', {}, '2026-11-16'), 'journal-linked habit ticks itself on days you wrote');
check(!M.habitDone(s, h3, '2026-11-16', {}, '2026-11-16') && M.habitDone(s, h3, '2026-11-16', { orange: { today: { date: '2026-11-16', done: true } } }, '2026-11-16'), 'app-linked habit counts when the app says done today');
s = M.logHabit(s, 'h1', '2026-11-16', 0); check(!M.habitDone(s, h1, '2026-11-14', {}, '2026-11-16') === false && s.habitLog.h1['2026-11-16'].v === 0, 'an explicit un-tick wins');
const ht = M.habitsToday(S(), now, {}); check(ht.due.length === 3 && ht.pending.length === 3, 'today: three habits due, none done yet');
check(M.habitFreqLabel({ freq: { type: 'days', days: [0, 1, 2, 3, 4] } }) === 'Sun–Thu' && M.habitFreqLabel(h3) === '3× a week', 'frequency labels follow the Saudi week');

console.log('the journal');
s = S();
const mk = J.marks('Met @Dr_Ann at +Test_Park. #Work #work (#tired)');
check(mk.tags.join() === 'work,tired' && mk.people[0] === 'Dr Ann' && mk.places[0] === 'Test Park', '#tags, @people and +places are read');
s = J.saveEntry(s, { date: '2026-11-16', method: 'journal', text: 'Morning before the shift. Coffee with @Test_Friend. #calm', mood: 4, energy: 3 });
const e = J.entriesOn(s, '2026-11-16')[0];
check(e && e.tags.includes('calm') && e.people.includes('Test Friend') && e.mood === 4, 'an entry is saved with its marks');
const e2 = J.saveEntry(s, { id: e.id, text: 'Edited. #focus' }).journal[e.id]; check(e2.tags.join() === 'focus' && e2.mood === 4 && e2.createdAt === e.createdAt, 'editing re-reads the marks and keeps the rest');
const otd = J.onThisDay(S(), now);
check(otd.length === 2 && otd[0].label === 'A month ago' && otd[0].entries[0].id === 'j6' && otd[1].label === 'A year ago' && otd[1].entries[0].id === 'j7', 'on this day: a month ago and a year ago');
check(J.onThisDay(S(), new Date('2026-03-31T10:00:00+03:00')).length === 0, 'on this day near a short month does not crash');
let ws = J.writingStats(S(), now);
check(ws.run === 5 && !ws.today && ws.week === 1, `a quiet day is forgiven in the run (run ${ws.run}: 15, 14, 13, 11 and 10, with 12 quiet)`);
check(/today is still open/.test(J.streakLine(ws)), 'the line never scolds');
ws = J.writingStats(s, now); check(ws.today && /written today/.test(J.streakLine(ws)), 'written today');
check(J.writingStats({ journal: {} }, now).total === 0 && /first entry/.test(J.streakLine(J.writingStats({ journal: {} }, now))), 'an empty journal invites');
const pk = (date) => D.dayKind(new Date(date));
let p = J.promptFor(new Date('2026-11-22T10:00:00+03:00'), { today: pk('2026-11-22T10:00:00+03:00').kind, tomorrow: pk('2026-11-23T10:00:00+03:00').kind });
check(p.kind === 'postnight', `after the nights the prompt knows (${p.kind})`);
p = J.promptFor(new Date('2026-11-18T10:00:00+03:00'), { today: pk('2026-11-18T10:00:00+03:00').kind, tomorrow: pk('2026-11-19T10:00:00+03:00').kind });
check(p.kind === 'day', `a day shift (${p.kind})`);
p = J.promptFor(new Date('2026-11-14T10:00:00+03:00'), { today: 'off', tomorrow: 'first-night' }); check(p.kind === 'beforeNights' && /nights/i.test(p.text), 'the day before a run of nights');
p = J.promptFor(new Date('2026-11-19T10:00:00+03:00'), { today: pk('2026-11-19T10:00:00+03:00').kind }); check(p.kind === 'first-night', `the first night (${p.kind})`);
check(J.suggestMethod(S(), new Date('2026-11-20T10:00:00+03:00')).method === 'weekly' && J.suggestMethod(S(), eve).method === 'daily', 'method: weekly at the weekend, check-in in the evening');
const groups = J.moodByShift(S(), (d) => D.dayKind(d).kind, now, 60);
check(groups.length >= 1 && groups.every(g => g.n >= 3), `mood by shift: groups with 3+ days (${groups.map(g => `${g.label} ${g.mood ?? '-'}/${g.day ?? '-'}`).join(', ')})`);
check(typeof J.shiftInsight(groups) === 'string', 'the insight is a plain sentence or nothing');
const md = J.toMarkdown(S());
check(/^# Journal/.test(md) && /## Tuesday 10 November 2026/.test(md) && /\*\*Three wins today\*\*/.test(md) && md.indexOf('2025') < md.indexOf('2026-11') + 1e9, 'Markdown export with days, methods and answers');
check(md.indexOf('November 2025') < md.indexOf('November 2026'), 'export runs oldest first');
check(J.findEntry(S(), 'daily', '2026-11-11')?.id === 'j2' && !J.findEntry(S(), 'daily', '2026-11-12'), 'reopening today’s check-in finds it');
check(J.weekMood(S(), now) != null && J.moodSeries(S(), 7, now).length === 7, 'mood series and week average');

console.log('notes');
s = S();
check(N.titleOf(s.notes.n3) === 'Grocery run', 'a note without a title is named by its first line');
check(JSON.stringify(N.checklist(s.notes.n1.body)) === '{"done":1,"total":3}', 'checklist counts');
const tb = N.toggleLine(s.notes.n1.body, 1); check(/- \[x\] Another/.test(tb) && N.toggleLine(tb, 1) === s.notes.n1.body && N.toggleLine('plain', 0) === 'plain', 'ticking a checklist line (and back), plain lines untouched');
const bl = N.backlinks(s, s.notes.n1); check(bl.notes.map(n => n.id).join() === 'n2' && bl.entries.map(e => e.id).join() === 'j4', 'backlinks from notes and journal entries');
s = N.renameLinks(s, 'Reading list', 'Books to read'); check(/\[\[Books to read\]\]/.test(s.notes.n2.body), 'renaming a note updates [[links]] to it');
s = N.addNote(S(), { body: 'Quick thought #idea' }); const qn = N.noteList(s).find(n => n.body === 'Quick thought #idea'); check(qn && qn.tags.includes('idea'), 'fast capture: tags from the words');
check(N.addNote(S(), { body: '   ' }) .notes === S().notes || Object.keys(N.addNote(S(), { body: ' ' }).notes).length === 4, 'an empty note is not saved');
s = N.updateNote(S(), 'n2', { body: 'No more tags here' }); check(!s.notes.n2.tags.includes('ideas'), 'a tag removed from the words leaves the note');
check(N.noteList(S())[0].id === 'n1' && N.folders(S()).join() === 'Lists', 'pinned first; folders');
const nt = N.noteToTask(S(), 'n1'); check(nt.state.tasks[nt.taskId]?.title === 'Reading list' && /☐ Another test book/.test(nt.state.tasks[nt.taskId].notes), 'a note becomes a task with its open checklist');
const html = N.renderMarkdown('# T\n<img src=x onerror=alert(1)>\n[x](javascript:alert(1)) [[A "b"]] **b** `c`', { resolve: () => false });
check(!/<img|href="javascript/.test(html) && /&lt;img/.test(html) && /class="wl missing"/.test(html) && /<b>b<\/b>/.test(html), 'Markdown is escaped; only http links; missing links look different');
let hits = N.searchAll(S(), 'rota'); check(hits.length === 1 && hits[0].kind === 'entry' && hits[0].id === 'j1', 'search finds journal words');
hits = N.searchAll(S(), '#books'); check(hits.length === 1 && hits[0].id === 'n1', 'search by #tag');
hits = N.searchAll(S(), '@test_fr'); check(hits.some(h => h.id === 'j1'), 'search by @person');
hits = N.searchAll(S(), 'reading list'); check(hits.some(h => h.id === 'n1') && hits.some(h => h.id === 'j4'), 'search across notes and the journal together');
check(N.searchAll(S(), 'rota', { journal: false }).length === 0, 'search can leave the (locked) journal out');

console.log('goals');
check(goals.aims.length === 2 && M.cleanGoals({ aims: [{ id: 1, title: 'x', progress: 40 }, { title: 'no id' }, 'junk'] }).aims[0].progress === 0.4, 'goals from plan.json are cleaned (bad ones dropped)');
const gl = M.goalLinks(S(), now);
check(gl.aim1.tasks === 2 && gl.aim1.done === 1 && gl.aim1.notes === 1 && gl.aim2.habits === 2, 'goalLinks: what moves each aim');
check(M.asks(S(), now).some(a => a.title === 'Bergamot: Call the bank' && a.date === '2026-11-16') && M.asks(S(), now).some(a => /Walk/.test(a.title)), 'asks: tasks with estimates and habits with minutes');

console.log('inbox');
const src = { claude: { inbox: [{ id: 'x1', type: 'task', title: 'Read the guideline', date: '2026-11-17', minutes: 20 }, { id: 'x2', type: 'note', title: 'An idea', text: 'Long text' }, { id: 'x3', type: 'event', title: 'not ours', date: '2026-11-17', start: '10:00' }, { id: 'x4', type: 'task', title: 'old', expires: '2026-11-01' }] } };
let pend = M.inboxPending(S(), src, now); check(pend.length === 2 && pend.map(p => p.item.type).join() === 'task,note', 'takes only task and note items, not expired ones');
let r = M.acceptInbox(S(), pend[0], N.addNote); check(r.state.tasks[r.taskId]?.srcApp === 'claude' && r.state.inboxLog['claude:x1'].status === 'accepted', 'a task item becomes a task that remembers who sent it');
r = M.acceptInbox(r.state, pend[1], N.addNote); check(r.state.notes[r.noteId]?.body === 'Long text' && M.inboxPending(r.state, src, now).length === 0, 'a note item becomes a note; nothing left');
check(M.inboxPending(M.dismissInbox(S(), 'claude:x1'), src, now).length === 1, 'dismissed items do not come back');

console.log('reminders');
const wr = M.wantedReminders({ ...S(), tasks: { a: { id: 'a', title: 'Test call', remindAt: '2026-11-16T18:00', done: false } } }, now);
check(wr['task:a'] && wr['habit:h2']?.recurrence?.[0] === 'RRULE:FREQ=DAILY' && wr['habit:h2'].start.getHours() === 21, 'a task alarm and a daily habit alarm');

console.log('status.json');
const st = HUB.buildStatus(S(), now, { apps: {} });
check(st.app === 'bergamot' && st.contract === 2 && /2 tasks today · 3 habits left · not journaled yet/.test(st.summary), `summary: "${st.summary}"`);
check(st.metrics.some(m => m.key === 'journal-streak' && m.value === 5) && st.metrics.some(m => m.key === 'mood-week'), 'metrics: journal run and mood');
check(st.extra.goalLinks.aim1.tasks === 2 && st.extra.habits.due === 3 && st.extra.journaledToday === false && st.extra.tasks.overdue === 1, 'extra: goalLinks, habits, tasks, journaledToday');
check(st.asks.every(a => /^\d{4}-\d\d-\d\d$/.test(a.date) && a.minutes > 0 && a.slot === 'free' && !('id' in a)), 'asks are well-formed');
check(st.inbox.every(i => i.type === 'task' && i.id.length <= 60), 'inbox: dated tasks');
const all = JSON.stringify(st);
check(!/rota\. #work|Slept in|Finished the audit|Coffee|running plan|App ideas|Another test book/.test(all), 'no journal text and no note bodies in status.json');
check(st.drive?.byTag === true, 'status.json says Bergamot finds its Drive folders by tag');
check(st.actions.length === 6 && st.actions.every(a => a.url.startsWith(HUB.SITE_URL)), 'six deep links');

console.log('migration from Citrus');
const citrus = { app: 'citrus', updatedAt: Date.parse('2026-11-12T10:00:00Z'),
  tasks: { ct1: { id: 'ct1', title: 'Old task', done: false, due: '2026-11-20', aimId: 'aim1', at: 5 } },
  habits: { ch1: { id: 'ch1', name: 'Read', freq: { type: 'daily' }, link: 'reading', at: 5 } }, habitLog: { ch1: { '2026-11-10': { v: 1, at: 5 }, bad: 1 } },
  reflections: { 'daily:2026-11-09': { id: 'daily:2026-11-09', method: 'daily', date: '2026-11-09', mood: 3, answers: { wins: ['A test win'] }, at: 5 }, 'journal:2026-11-08': { id: 'journal:2026-11-08', method: 'journal', date: '2026-11-08', answers: { text: 'Free text #old' }, at: 5 } },
  notes: { '2026-11-07': 'A Citrus day note', '2026-11-06': '' }, memos: { m1: { id: 'm1', title: 'Memo', body: 'Body', tags: ['A'], pinned: true, at: 5 } },
  dayLog: { '2026-11-09': { key: '2026-11-09', score: 4, at: 5 } }, reminders: { 'task:ct1': { eventId: 'e1', sig: 's', at: 5 }, 'shift:x': { eventId: 'e2' } },
  aims: { aim1: { id: 'aim1', title: 'stays' } }, resolutions: { r: {} }, media: { x: {} }, yearMeta: {},
  deleted: { 'task:gone': 9, 'refl:old': 9, 'memo:mm': 9, 'note:2026-11-01': 9, 'aim:aim9': 9, 'chore:c': 9 } };
const { part, counts } = MIG.mindPart(citrus);
check(counts.tasks === 1 && counts.habits === 1 && counts.entries === 2 && counts['day notes'] === 1 && counts.notes === 1 && counts['rated days'] === 1, `counts: ${MIG.describe(counts)}`);
check(part.tasks.ct1.aimId === 'aim1' && part.habits.ch1.link === '' && part.habitLog.ch1['2026-11-10'].v === 1 && !part.habitLog.ch1.bad, 'tasks keep their aimId; ticks come over; Library links are dropped');
check(part.journal['journal:2026-11-08'].text === 'Free text #old' && part.journal['journal:2026-11-08'].tags.includes('old') && part.journal['day-2026-11-07'].text === 'A Citrus day note', 'reflections and day notes become journal entries');
check(part.notes.m1.tags[0] === 'a' && part.dayLog['2026-11-09'].score === 4 && part.reminders['task:ct1'] && !part.reminders['shift:x'], 'memos become notes; the day log and task reminders come over');
check(part.deleted['task:gone'] && part.deleted['jrnl:old'] && part.deleted['note:mm'] && part.deleted['jrnl:day-2026-11-01'] && !part.deleted['aim:aim9'] && !part.deleted['chore:c'], 'tombstones are mapped; aims and chores stay behind');
check(!part.aims && !part.resolutions && !part.media && !part.yearMeta, 'goals and the Library stay in Citrus');
const mig = MIG.applyMigration(S(), citrus);
check(mig.changed && mig.state.tasks.ct1 && mig.state.tasks.t1 && mig.state.migrated.from === 'citrus', 'merged with what is already here');
check(MIG.applyMigration(mig.state, citrus).state.tasks.ct1.title === 'Old task', 'running it twice is harmless');
check(MIG.looksLikeCitrus(citrus) && !MIG.looksLikeCitrus(S()), 'a Citrus backup is recognised');

console.log('sanitize and merge');
const rep = { fixed: 0, notes: [] };
const dirty = sanitize({ journal: { a: { date: 'x' }, b: { date: '2026-11-01', tags: 'no' } }, tasks: { c: { title: 3 }, d: 'junk' }, habits: { h: { name: 'x', freq: 'bad' } }, habitLog: { h: { '2026-11-01': { v: 1 }, '2026-11-02': 'bad' } }, dayLog: { k: { score: 9 } } }, rep);
check(!dirty.journal.a && dirty.journal.b.tags.length === 0 && !dirty.tasks.d && dirty.tasks.c && dirty.habits.h.freq.type === 'daily' && !dirty.habitLog.h['2026-11-02'] && !dirty.dayLog.k, `bad records dropped or repaired (${rep.fixed} dropped)`);
const A = S(), B = S();
A.journal.jA = { ...A.journal.j1, id: 'jA', at: 2e12 }; B.notes.nB = { ...B.notes.n1, id: 'nB', at: 2e12 };
B.habitLog.h2['2026-11-16'] = { v: 1, at: 2e12 }; A.habitLog.h2['2026-11-15'] = { v: 0, at: 2e12 };
A.deleted['task:t5'] = 2e12; delete A.tasks.t5; A.updatedAt = 2e12; B.updatedAt = 2e12 + 1;
const m = mergeStates(A, B);
check(m.journal.jA && m.notes.nB && !m.tasks.t5, 'two devices: both additions kept, a delete holds');
check(m.habitLog.h2['2026-11-16'].v === 1 && m.habitLog.h2['2026-11-15'].v === 0 && m.habitLog.h2['2026-11-14'].v === 1, 'habit ticks merge day by day, newest tap wins');
const C2 = S(); delete C2.habits.h3; C2.deleted['habit:h3'] = 2e12; C2.updatedAt = 3e12;
check(!mergeStates(S(), C2).habitLog.h3, 'a deleted habit takes its ticks with it');

console.log('backups and settings');
const bk = checkBackup({ ...S(), rotas: {}, tasks: { ...S().tasks, bad: { title: 5 } } });
check(bk.ok && bk.dropped.some(x => /tasks/.test(x)) && bk.dropped.some(x => /rotas/.test(x)) && /8 journal entries · 4 notes · 5 tasks · 3 habits · 7 rated days/.test(describeCounts(bk.summary.counts)), `a backup is checked: ${describeCounts(bk.summary.counts)}`);
check(!checkBackup({ app: 'calamansi', chores: {} }).ok && !checkBackup({ recipes: {} }).ok, 'other apps’ backups are refused');
const cz = CZ.custom({ settings: { custom: { tabs: { hidden: ['today', 'notes'], order: ['notes', 'x'] }, journal: { voice: 'xx', prompts: false }, look: { accent: 'nope' } } } });
check(cz.tabs.hidden.join() === 'notes' && cz.tabs.order[0] === 'notes' && cz.tabs.order.length === 5 && cz.journal.voice === 'en-GB' && !cz.journal.prompts && cz.look.accent === 'bergamot', 'Customise is cleaned');
check(keyOf(fromKey('2026-11-16')) === '2026-11-16', 'dates stay local (Asia/Riyadh)');

if (bad()) { console.log(`${bad()} logic check(s) FAILED`); process.exit(1); }
console.log('all logic checks passed');
