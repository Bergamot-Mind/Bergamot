// Today: your day (from Mandarin's shifts), today's page with a prompt that knows them, the inbox, habits due, the few tasks
// worth doing, on this day, how the day felt, and pinned notes — in the order you choose (Settings › Customise › Today).
// With nothing of your own yet it shows the guided start instead of zeros.
import { h, toast, keyOf, addDays, DAY_NAMES, MONTHS } from './util.js';
import * as M from './mind.js';
import * as J from './journal.js';
import * as N from './notes.js';
import * as CZ from './custom.js';
import { ctx, S, up, now, plural } from './bits.js';
import { captureBar, taskRow, habitRow, kitCard, taskSheet } from './tasks-ui.js';
import { pageCard, onThisDayCard, lockGate, writeSheet } from './journal-ui.js';
import { noteSheet } from './notes-ui.js';

function greeting(n) { const hr = n.getHours(); return hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; }
function dayCard() {
  const n = now(), k = ctx.kinds(n), t = ctx.kinds(addDays(n, 1));
  const line = k.kind === 'unknown' ? (ctx.hasShifts() ? 'No shift known for today' : 'Sign in to read your shifts from Mandarin') : k.text;
  const next = t.kind === 'first-night' && k.kind !== 'night' ? 'Nights start tomorrow' : t.kind === 'day' && k.kind === 'postnight' ? 'Day shift tomorrow' : '';
  return h('div', { class: 'td-head' }, h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, `${greeting(n)} · ${DAY_NAMES[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]}`), h('h1', {}, 'Today'),
    h('div', { class: 'small muted td-shift' }, h('span', { class: `kchip k-${k.kind}` }, k.label), line && line !== k.label ? ` ${line}` : '', next ? ` · ${next}` : '')));
}
function inboxCard() {
  const l = ctx.inbox(); if (!l.length) return null;
  return h('div', { class: 'card inbox' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Inbox'), h('span', { class: 'tiny dim' }, plural(l.length, 'item'))),
    h('div', { class: 'tiny dim' }, 'Sent to Bergamot. Nothing is added until you take it.'),
    h('div', { class: 'mlist' }, l.slice(0, 5).map(p => h('div', { class: 'mrow' }, h('span', { class: 'mood', 'aria-hidden': 'true' }, p.item.type === 'note' ? '📝' : '✓'),
      h('div', { class: 'grow' }, h('div', { class: 'mtitle' }, p.item.title), h('div', { class: 'msub' }, h('span', {}, `from ${p.app}`), p.item.date ? h('span', {}, p.item.date.split('-').reverse().join('/')) : null, p.item.minutes ? h('span', {}, `${p.item.minutes} min`) : null)),
      h('button', { class: 'btn sm primary', onClick: () => { const r = M.acceptInbox(S(), p, N.addNote); up(() => r.state); toast(p.item.type === 'note' ? 'Taken in as a note' : 'Taken in as a task', 'ok', { action: { label: 'Open', run: () => r.taskId ? taskSheet(r.taskId) : noteSheet(r.noteId) } }); } }, 'Take'),
      h('button', { class: 'btn sm ghost', 'aria-label': `Dismiss ${p.item.title}`, onClick: () => up(s => M.dismissInbox(s, p.ref)) }, '✕')))));
}
function habitsCard() {
  const s = S(), td = M.habitsToday(s, now(), ctx.apps()); if (!td.due.length) return null;
  return h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Habits'), h('span', { class: `tiny ${td.pending.length ? 'dim' : 'ok'}` }, td.pending.length ? `${td.done.length}/${td.due.length}` : 'all done ✓'), h('button', { class: 'btn sm ghost', onClick: () => ctx.go('habits') }, 'All')),
    h('div', { class: 'mlist' }, [...td.pending, ...td.done].slice(0, 6).map(x => habitRow(x, { dots: false }))));
}
function tasksCard() {
  const s = S(), n = now(), b = M.taskBuckets(s, n), focus = M.focusTasks(s, n, 5);
  return h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Tasks'), b.overdue.length ? h('span', { class: 'tiny late' }, `${b.overdue.length} overdue`) : null, h('button', { class: 'btn sm ghost', onClick: () => ctx.go('tasks') }, 'All')),
    focus.length ? h('div', { class: 'mlist' }, focus.map(t => taskRow(t, { showArea: false }))) : h('div', { class: 'small muted', style: { margin: '6px 0' } }, 'Nothing due. Capture the next thing below.'),
    captureBar({ placeholder: 'Add a task…' }));
}
function rateCard() {
  const s = S(), n = now(), k = keyOf(n), r = s.dayLog?.[k], early = n.getHours() < 15 && !r;
  if (early) return null;
  return h('div', { class: 'card rate' }, h('div', { class: 'title' }, 'How did today feel?'),
    h('div', { class: 'faces', role: 'group', 'aria-label': 'How did today feel?' }, M.DAY_FACES.map((f, i) => h('button', { type: 'button', class: `face ${r?.score === i + 1 ? 'on' : ''}`, 'aria-pressed': String(r?.score === i + 1), 'aria-label': `${i + 1} of 5`, onClick: () => { up(st => r?.score === i + 1 ? M.clearDay(st, k) : M.rateDay(st, k, i + 1, r?.note || '')); } }, f))),
    r ? h('input', { type: 'text', class: 'rate-note', value: r.note || '', placeholder: 'One line about it (optional)', maxlength: 200, 'aria-label': 'One line about the day', onChange: (e) => up(st => M.rateDay(st, k, r.score, e.target.value)) }) : null);
}
function pinnedCard() {
  const l = N.noteList(S()).filter(n => n.pinned).slice(0, 4); if (!l.length) return null;
  return h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Pinned notes'), h('button', { class: 'btn sm ghost', onClick: () => ctx.go('notes') }, 'All')),
    h('div', { class: 'mlist' }, l.map(n => { const ck = N.checklist(n.body); return h('div', { class: 'mrow clickable', onClick: () => noteSheet(n.id) }, h('span', { class: 'mood', 'aria-hidden': 'true' }, '📌'), h('div', { class: 'grow' }, h('div', { class: 'mtitle' }, N.titleOf(n)), ck.total ? h('div', { class: 'msub' }, `☑ ${ck.done}/${ck.total}`) : null)); })));
}
function guide() {
  const s = S(), steps = [
    ['✍️', 'Write your first page', 'A line or two is enough. Mood and energy are one tap each.', () => writeSheet('journal', { fresh: true }), J.entriesList(s).length > 0],
    ['🔁', 'Pick a few habits', 'Small things, most days. One can tick itself when you write.', () => ctx.go('habits'), M.activeHabits(s).length > 0],
    ['📝', 'Capture a note', 'A list, an idea, a page. “- [ ] milk” makes a checkbox.', () => noteSheet(null), Object.keys(s.notes || {}).length > 0],
    ['🍊', 'Bring Mind over from Citrus', 'Your tasks, habits, reflections, memos and day notes, with Undo.', () => ctx.migrateNow(), !!s.migrated],
  ];
  return [h('div', { class: 'card hero guide' }, h('div', { class: 'eyebrow' }, 'Welcome to Bergamot'), h('h2', {}, 'A calm place for your mind'), h('p', { class: 'small' }, 'A journal that knows your shifts, notes that link to each other, and the tasks and habits that keep you moving. Your goals stay in Citrus Plan; Bergamot shows what moves them.'),
    h('div', { class: 'gsteps' }, steps.map(([ic, t, sub, fn, done]) => h(fn ? 'button' : 'div', { class: `gstep ${done ? 'done' : ''}`, ...(fn ? { type: 'button', onClick: fn } : {}) }, h('span', { class: 'gi', 'aria-hidden': 'true' }, done ? '✓' : ic), h('span', { class: 'grow' }, h('b', {}, t), h('small', {}, sub)))))),
    kitCard({ compact: true })];
}
export function renderToday() {
  const s = S(), c = CZ.custom(s), open = ctx.journalOpen();
  if (M.isEmpty(s)) return [dayCard(), ...guide(), inboxCard()];
  const make = { day: () => null, write: () => open ? pageCard({ onToday: true }) : lockGate({ compact: true }), inbox: inboxCard, habits: habitsCard, tasks: tasksCard, onthisday: () => open ? onThisDayCard() : null, rate: rateCard, pinned: pinnedCard };
  const out = [c.today.sections.hidden.includes('day') ? null : dayCard()];
  for (const id of c.today.sections.order) if (!c.today.sections.hidden.includes(id)) { try { out.push(make[id]?.()); } catch (e) { console.error(e); } }
  out.push(h('div', { class: 'td-acts' }, h('button', { class: 'btn', onClick: () => writeSheet('journal', { fresh: true }) }, '✍️ Write'), h('button', { class: 'btn', onClick: () => noteSheet(null) }, '📝 Note'), h('button', { class: 'btn', onClick: () => taskSheet(null) }, '✓ Task')));
  return out;
}
