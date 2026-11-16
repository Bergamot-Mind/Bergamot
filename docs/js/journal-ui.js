// The Journal tab and the writing sheet. Today's page with a prompt that knows your shifts, every reflection method, mood and
// energy, #tags @people +places, a goal link, dictation; entries by list or calendar; trends (mood and energy, mood against
// your shifts, the wheel of life); on this day; export to Markdown or PDF; and the optional lock in front of all of it.
import { h, toast, keyOf, fromKey, addDays, fmtDate, DAY_NAMES, DAY_SHORT, MONTHS } from './util.js';
import * as M from './mind.js';
import * as J from './journal.js';
import * as N from './notes.js';
import * as LK from './lock.js';
import * as CZ from './custom.js';
import { ctx, S, up, now, field, pick, aimSelect, aimTitle, confirmBtn, undoToast, plural, micButton, download } from './bits.js';
import { spark, radar, bars } from './viz.js';

const ui = { seg: 'entries', q: '', mark: '', month: '' };
export function journalPart(p) { if (['entries', 'calendar', 'trends', 'marks'].includes(p)) ui.seg = p; }
const longDate = (k) => { const d = fromKey(k); return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now().getFullYear() ? ` ${d.getFullYear()}` : ''}`; };
const face = (m) => m ? J.MOODS[m - 1] : '✎';
const cfg = () => CZ.custom(S()).journal;

// ───────────────────────────────────────── the lock
export function lockGate({ compact = false } = {}) {
  const pin = h('input', { type: 'password', inputmode: 'text', autocomplete: 'current-password', placeholder: 'PIN or passphrase', 'aria-label': 'Journal PIN', 'data-nodirty': '1' });
  const go = async () => { if (await LK.unlock(pin.value)) { ctx.render(); toast('Journal open', 'ok'); } else { pin.value = ''; pin.focus(); toast('That is not it', 'err'); } };
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: `card lockcard ${compact ? 'slim' : ''}` }, h('div', { class: 'lock-ico', 'aria-hidden': 'true' }, '🔒'), h('div', { class: 'title' }, 'Your journal is locked'),
    compact ? null : h('div', { class: 'small muted' }, 'Notes, tasks and habits stay open. Settings › Journal lock changes this.'),
    h('div', { class: 'row', style: { marginTop: '10px' } }, pin, h('button', { class: 'btn primary', onClick: go }, 'Unlock')));
}

// ───────────────────────────────────────── today's page (Journal and Today share it)
export function pageCard({ onToday = false } = {}) {
  const s = S(), n = now(), tk = keyOf(n), st = J.writingStats(s, n), mine = J.entriesOn(s, tk);
  const pr = J.promptFor(n, { today: ctx.kinds(n).kind, tomorrow: ctx.kinds(addDays(n, 1)).kind }, s), showPrompt = cfg().prompts;
  return h('div', { class: 'card page' }, h('div', { class: 'row' }, h('div', { class: 'eyebrow grow' }, onToday ? 'Today’s page' : longDate(tk)), h('span', { class: 'tiny dim' }, J.streakLine(st))),
    showPrompt && !mine.length ? h('p', { class: 'prompt' }, pr.text) : null,
    mine.length ? h('div', { class: 'mlist' }, mine.map(e => entryRow(e, { date: false }))) : null,
    h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onClick: () => writeSheet(mine.length ? 'journal' : cfg().defaultMethod, { prompt: showPrompt && !mine.length && cfg().defaultMethod === 'journal' ? pr.text : '', fresh: true }) }, mine.length ? '＋ Write more' : '✍️ Write'),
      onToday ? null : h('button', { class: 'btn ghost', onClick: () => methodSheet() }, 'Other ways to reflect')));
}
export function entryRow(e, { date = true } = {}) {
  const m = J.methodOf(e.method);
  return h('div', { class: 'mrow entry clickable', onClick: () => readSheet(e.id) }, h('span', { class: 'mood', 'aria-hidden': 'true' }, face(e.mood)),
    h('div', { class: 'grow' }, h('div', { class: 'mtitle' }, date ? `${longDate(e.date)} · ${m.name}` : m.name), h('div', { class: 'msub serif-prev' }, J.preview(e, 110) || '…'),
      (e.tags.length || e.people.length) ? h('div', { class: 'msub' }, [...e.tags.slice(0, 4).map(t => h('span', { class: 'tag' }, `#${t}`)), ...e.people.slice(0, 3).map(p => h('span', { class: 'who' }, `@${p}`))]) : null));
}
export function onThisDayCard() {
  if (!cfg().onThisDay) return null;
  const otd = J.onThisDay(S(), now()); if (!otd.length) return null;
  return h('div', { class: 'card otd' }, h('div', { class: 'title' }, 'On this day'), ...otd.slice(0, 3).map(g => h('div', { class: 'otd-g' }, h('div', { class: 'tiny dim' }, `${g.label} · ${longDate(g.date)}`), g.entries.slice(0, 2).map(e => h('button', { class: 'otd-e', onClick: () => readSheet(e.id) }, h('span', { 'aria-hidden': 'true' }, face(e.mood)), h('span', { class: 'serif-prev' }, J.preview(e, 140)))))));
}

// ───────────────────────────────────────── the tab
export function renderJournal() {
  if (!ctx.journalOpen()) return [h('div', { class: 'pg-head' }, h('h1', {}, 'Journal')), lockGate()];
  const s = S(), list = J.entriesList(s);
  const seg = h('div', { class: 'seg', role: 'tablist' }, [['entries', 'Entries'], ['calendar', 'Calendar'], ['trends', 'Trends'], ['marks', 'Tags & people']].map(([k, l]) => h('button', { role: 'tab', class: ui.seg === k ? 'active' : '', 'aria-selected': String(ui.seg === k), onClick: () => { ui.seg = k; ctx.render(); } }, l)));
  const body = { entries: entriesView, calendar: calendarView, trends: trendsView, marks: marksView }[ui.seg]();
  return [h('div', { class: 'pg-head' }, h('h1', {}, 'Journal'), h('div', { class: 'small muted' }, list.length ? `${plural(list.length, 'entry', 'entries')}${LK.isOn() ? ' · 🔒 locked when you leave' : ''}` : 'A private place to think')),
    pageCard(), onThisDayCard(), h('div', { class: 'segbar' }, seg), body,
    list.length ? h('div', { class: 'card' }, h('div', { class: 'title' }, 'Take it with you'), h('div', { class: 'small muted' }, 'Your whole journal as one Markdown file (opens in any notes app), or as a PDF to keep or print.'),
      h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onClick: () => exportSheet() }, '⬇ Export…'), LK.isOn() ? h('button', { class: 'btn sm ghost', onClick: () => { LK.lockNow(); ctx.render(); } }, '🔒 Lock now') : null)) : null];
}
function entriesView() {
  const s = S(), q = ui.q.trim(), all = J.entriesList(s);
  if (!all.length) return h('div', { class: 'card empty' }, h('p', {}, 'Your entries will collect here. Write a line or two — that is enough.'));
  let list = all;
  if (ui.mark) list = list.filter(e => ui.mark.startsWith('#') ? e.tags.includes(ui.mark.slice(1)) : ui.mark.startsWith('@') ? e.people.includes(ui.mark.slice(1)) : e.places.includes(ui.mark.slice(1)));
  if (q) { const ids = new Set(N.searchAll(s, q, { limit: 200 }).filter(x => x.kind === 'entry').map(x => x.id)); list = list.filter(e => ids.has(e.id)); }
  const inp = h('input', { type: 'search', class: 'jr-search', placeholder: 'Search the journal: words, #tag, @person', value: ui.q, 'aria-label': 'Search the journal', onInput: (e) => { ui.q = e.target.value; ctx.render(); ctx.refocus = '.jr-search'; } });
  const byMonth = {}; for (const e of list.slice(0, 200)) (byMonth[e.date.slice(0, 7)] ||= []).push(e);
  return [h('div', { class: 'card slim' }, inp, ui.mark ? h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'chip sel' }, ui.mark), h('button', { class: 'btn sm ghost', onClick: () => { ui.mark = ''; ctx.render(); } }, 'Clear')) : null),
    !list.length ? h('div', { class: 'card empty small' }, 'Nothing matches.') : null,
    ...Object.entries(byMonth).map(([ym, l]) => h('div', { class: 'card' }, h('div', { class: 'title' }, `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`), h('div', { class: 'mlist' }, l.map(e => entryRow(e)))))];
}
function calendarView() {
  const s = S(), n = now(), ym = ui.month || keyOf(n).slice(0, 7), [y, mo] = ym.split('-').map(Number), first = new Date(y, mo - 1, 1), days = new Date(y, mo, 0).getDate();
  const by = {}; for (const e of Object.values(s.journal || {})) if (e.date.startsWith(ym)) (by[e.date] ||= []).push(e);
  const shift = (d) => { const x = new Date(y, mo - 1 + d, 1); ui.month = keyOf(x).slice(0, 7); ctx.render(); };
  const grid = h('div', { class: 'cal' }, DAY_SHORT.map(d => h('div', { class: 'dow' }, d.slice(0, 2))));
  for (let i = 0; i < first.getDay(); i++) grid.append(h('div', { class: 'day blank' }));
  for (let d = 1; d <= days; d++) {
    const k = `${ym}-${String(d).padStart(2, '0')}`, l = by[k] || [], moods = l.map(e => e.mood).filter(Boolean), m = moods.length ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) : 0, kind = ctx.kinds(fromKey(k)).kind;
    grid.append(h('button', { type: 'button', class: `day ${l.length ? 'has' : ''} ${k === keyOf(n) ? 'today' : ''} k-${kind}`, 'aria-label': `${fmtDate(fromKey(k))}: ${l.length ? plural(l.length, 'entry', 'entries') : 'nothing written'}`, style: m ? { '--m': `var(--mood${m})` } : null, onClick: () => daySheet(k) },
      h('span', { class: 'n' }, d), l.length ? h('span', { class: 'mdot' }, m ? J.MOODS[m - 1] : '•') : h('span', { class: 'kd' }, { day: 'D', evening: 'E', night: 'N', 'first-night': 'N', postnight: '·', leave: 'L' }[kind] || '')));
  }
  const written = Object.keys(by).length;
  return h('div', { class: 'card' }, h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', 'aria-label': 'Previous month', onClick: () => shift(-1) }, '‹'), h('div', { class: 'title grow center' }, `${MONTHS[mo - 1]} ${y}`), h('button', { class: 'btn sm ghost', 'aria-label': 'Next month', onClick: () => shift(1) }, '›')),
    grid, h('div', { class: 'tiny dim', style: { marginTop: '8px' } }, `${plural(written, 'day')} written this month · letters are your shifts from Mandarin (D day, N night, L leave)`));
}
function daySheet(k) {
  const l = J.entriesOn(S(), k), r = S().dayLog?.[k];
  const { close } = ctx.sheet([h('h2', {}, longDate(k)), h('div', { class: 'small muted' }, ctx.kinds(fromKey(k)).label),
    r ? h('div', { class: 'small', style: { margin: '6px 0' } }, `The day felt ${M.DAY_FACES[r.score - 1]} ${r.score}/5${r.note ? ` · ${r.note}` : ''}`) : null,
    l.length ? h('div', { class: 'mlist' }, l.map(e => entryRow(e, { date: false }))) : h('p', { class: 'small muted' }, 'Nothing written that day.'),
    h('div', { class: 'row wrap sh-foot' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onClick: () => { close(); writeSheet('journal', { date: k, fresh: true }); } }, k > keyOf(now()) ? 'Write for that day' : '✍️ Write for that day'))]);
}
function trendsView() {
  const s = S(), n = now(), ms = J.moodSeries(s, 30, n), groups = J.moodByShift(s, (d) => ctx.kinds(d).kind, n, 120), w = J.latestWheel(s, 2), ins = J.shiftInsight(groups);
  const any = ms.some(x => x.mood || x.energy || x.day);
  return [any ? h('div', { class: 'card' }, h('div', { class: 'title' }, 'Mood & energy · 30 days'), h('div', { class: 'leg' }, h('span', { class: 'l-m' }, 'Mood'), h('span', { class: 'l-e' }, 'Energy'), h('span', { class: 'l-d' }, 'How the day felt')),
      spark(ms.map(x => x.mood), { max: 5, h: 40, color: 'var(--orange)' }), spark(ms.map(x => x.energy), { max: 5, h: 40, color: 'var(--teal)' }), spark(ms.map(x => x.day), { max: 5, h: 40, color: 'var(--dusk)' }),
      h('div', { class: 'tiny dim' }, `${fmtDate(fromKey(ms[0].date))} – today`))
      : h('div', { class: 'card empty small' }, 'Give an entry a mood and an energy and the trends start here.'),
    groups.length ? h('div', { class: 'card' }, h('div', { class: 'title' }, 'Mood against your shifts'), h('div', { class: 'tiny dim' }, 'Last 4 months, from your entries and how each day felt, by the kind of day Mandarin says it was. Only here in Bergamot.'),
      bars(groups.map(g => ({ label: g.label.replace(' shifts', ''), v: (g.mood ?? g.day ?? 0) / 5, title: `${g.label}: mood ${g.mood ?? '–'}/5 · energy ${g.energy ?? '–'}/5 · day ${g.day ?? '–'}/5 (${g.n} days)` })), { h: 70 }),
      h('div', { class: 'kv' }, ...groups.flatMap(g => [h('b', {}, g.label), h('span', {}, `mood ${g.mood ?? '–'} · energy ${g.energy ?? '–'} · day ${g.day ?? '–'} (${g.n})`)])),
      ins ? h('p', { class: 'small', style: { marginTop: '8px' } }, ins) : null)
      : h('div', { class: 'card empty small' }, ctx.hasShifts() ? 'After a few weeks of entries, your mood shows up against your days, nights and days off here.' : 'Sign in to read your shifts from Mandarin, and your mood shows up against them here.'),
    w[0]?.scores ? h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Wheel of life'), h('span', { class: 'dim tiny' }, fmtDate(fromKey(w[0].date)))), h('div', { class: 'center' }, radar(M.AREAS.map(x => ({ id: x.id, label: x.name, color: x.color })), M.AREAS.map(x => (w[0].scores[x.id] || 0) / 10), { ghost: w[1]?.scores ? M.AREAS.map(x => (w[1].scores[x.id] || 0) / 10) : null, size: 260 })),
      h('button', { class: 'btn sm', onClick: () => writeSheet('wheel', { fresh: true }) }, 'Do it again')) : null];
}
function marksView() {
  const c = J.markCloud(S());
  const row = (title, l, pre) => l.length ? h('div', { class: 'card' }, h('div', { class: 'title' }, title), h('div', { class: 'chips' }, l.slice(0, 40).map(x => h('button', { class: 'chip', onClick: () => { ui.mark = pre + x.name; ui.seg = 'entries'; ctx.render(); } }, `${pre}${x.name}`, h('small', {}, ` ${x.n}`))))) : null;
  return [row('Tags', c.tags, '#'), row('People', c.people, '@'), row('Places', c.places, '+'),
    !c.tags.length && !c.people.length && !c.places.length ? h('div', { class: 'card empty small' }, 'Write #work, @Sara or +Riyadh anywhere in an entry and they collect here, so you can find every page about them.') : null];
}

// ───────────────────────────────────────── reading an entry
export function readSheet(id) {
  if (!ctx.journalOpen()) { ctx.go('journal'); return; }
  const e = S().journal?.[id]; if (!e) return;
  const m = J.methodOf(e.method), body = h('div', { class: 'read serif' });
  if (e.text) body.innerHTML = N.renderMarkdown(e.text, { resolve: (t) => !!N.noteByTitle(S(), t) });
  for (const f of m.fields) { if (f.k === 'text') continue; const v = e.answers?.[f.k]; if (!(Array.isArray(v) ? v.length : v)) continue; body.append(h('h4', {}, f.label), Array.isArray(v) ? h('ul', {}, v.map(x => h('li', {}, x))) : h('p', {}, v)); }
  body.addEventListener('click', (ev) => { const a = ev.target.closest('a.wl'); if (a) { ev.preventDefault(); close(); ctx.openNoteByTitle(a.dataset.note); } });
  const aims = (e.aimIds || []).map(aimTitle).filter(Boolean);
  const { close } = ctx.sheet([h('h2', {}, `${face(e.mood)} ${m.name}`), h('div', { class: 'small muted' }, [longDate(e.date), e.mood ? `mood ${J.MOOD_WORDS[e.mood - 1].toLowerCase()}` : '', e.energy ? `energy ${J.ENERGY_WORDS[e.energy - 1].toLowerCase()}` : '', e.rating ? `rated ${e.rating}/5` : ''].filter(Boolean).join(' · ')),
    e.scores ? h('div', { class: 'center' }, radar(M.AREAS.map(x => ({ id: x.id, label: x.name, color: x.color })), M.AREAS.map(x => (e.scores[x.id] || 0) / 10), { size: 220 })) : null, body,
    (e.tags.length || e.people.length || e.places.length || aims.length) ? h('div', { class: 'chips', style: { marginTop: '10px' } }, [...e.tags.map(t => h('span', { class: 'chip' }, `#${t}`)), ...e.people.map(p => h('span', { class: 'chip' }, `@${p}`)), ...e.places.map(p => h('span', { class: 'chip' }, `+${p}`)), ...aims.map(a => h('span', { class: 'chip goal' }, `◆ ${a}`))]) : null,
    h('div', { class: 'row wrap sh-foot' }, confirmBtn('Delete', () => { const before = S(); up(st => J.deleteEntry(st, id)); close(); undoToast('Entry deleted', before); }), h('span', { class: 'grow' }), h('button', { class: 'btn primary', onClick: () => { close(); writeSheet(e.method, { entry: e }); } }, 'Edit'))]);
}

// ───────────────────────────────────────── the methods
export function methodSheet() {
  const s = S(), sug = J.suggestMethod(s, now());
  const { close } = ctx.sheet([h('h2', {}, 'Ways to reflect'), h('div', { class: 'small muted' }, `Right now: ${J.methodOf(sug.method).name}. ${sug.why}`),
    h('div', { class: 'methods' }, J.METHODS.map(x => h('button', { class: `method ${x.id === sug.method ? 'sug' : ''}`, onClick: () => { close(); writeSheet(x.id, { fresh: x.id === 'journal' }); } }, h('b', {}, x.name), h('small', {}, x.cadence), h('span', {}, x.blurb)))),
    h('div', { class: 'row wrap sh-foot' }, h('button', { class: 'btn ghost', onClick: () => { close(); breatheSheet(); } }, h('span', { class: 'bdot' }), ' Breathe first'))]);
}

// ───────────────────────────────────────── writing
const DRAFT = 'bergamot.draft';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } };
const saveDraft = (d) => { try { d ? localStorage.setItem(DRAFT, JSON.stringify({ ...d, at: Date.now() })) : localStorage.removeItem(DRAFT); } catch {} };
/** A typed page that was never saved (a crash, a closed tab): offered back the next time you write. */
export const pendingDraft = () => { const d = loadDraft(); return d && d.text?.trim() && Date.now() - d.at < 7 * 86400000 ? d : null; };
export function writeSheet(methodId, opts = {}) {
  if (!ctx.journalOpen()) { ctx.go('journal'); toast('Unlock the journal first'); return; }
  const s = S(), m = J.methodOf(methodId), n = now();
  const date0 = opts.entry?.date || opts.date || keyOf(n), aim0 = opts.aimId || opts.entry?.aimIds?.[0] || '';
  // reopening a structured method you already used today opens that entry — a blank sheet saved over it would lose the first text
  const found = !opts.entry && !opts.fresh && m.id !== 'journal' ? J.findEntry(s, m.id, date0, aim0) : null;
  if (m.wheel) return wheelSheet(opts.entry || found);
  const e = opts.entry || found || {}, date = e.date || date0;
  const answers = JSON.parse(JSON.stringify(e.answers || {})), f = { mood: e.mood || 0, energy: e.energy || 0, rating: e.rating || 0, aimId: aim0, push: {}, date };
  const draft = !e.id && m.id === 'journal' ? pendingDraft() : null;
  const kids = [h('h2', {}, m.name), h('div', { class: 'small muted' }, `${m.blurb} · `, h('b', {}, longDate(date)))];
  if (opts.prompt && !e.id) kids.push(h('p', { class: 'prompt' }, opts.prompt));
  if (e.id) kids.push(h('div', { class: 'banner soft' }, h('span', { class: 'grow' }, `Editing ${date === keyOf(n) ? 'today’s' : 'this'} entry`), m.id !== 'journal' ? h('button', { type: 'button', class: 'btn sm ghost', onClick: () => { close(); writeSheet(m.id, { aimId: f.aimId, fresh: true, date }); } }, 'New entry') : null));
  if (m.stats) { const ws = M.weekStartOf(n), hw = M.habitWindow(s, ws, n, ctx.apps()), st = J.writingStats(s, n); kids.push(h('div', { class: 'kv weekstats' }, h('span', {}, `${M.tasksDoneSince(s, ws.getTime())} tasks done`), h('span', {}, `habits ${hw.rate == null ? '–' : Math.round(hw.rate * 100) + '%'}`), h('span', {}, `${st.week} days written`), J.weekMood(s, n) != null ? h('span', {}, `mood ${J.weekMood(s, n)}/5`) : null)); }
  if (m.mood) kids.push(h('div', { class: 'grid2 me-row' }, field('Mood', pick(J.MOODS.map((x, i) => [i + 1, x, null, J.MOOD_WORDS[i]]), f.mood, v => { f.mood = +v === f.mood ? 0 : +v; }, 'emoji')), field('Energy', pick([1, 2, 3, 4, 5].map((x, i) => [x, '⚡'.repeat(x), null, J.ENERGY_WORDS[i]]), f.energy, v => { f.energy = +v; }, 'energy'))));
  const inputs = {}, voice = cfg().voice;
  for (const fd of m.fields) {
    if (fd.type === 'lines') { const cur = answers[fd.k] || []; inputs[fd.k] = Array.from({ length: fd.n }, (_, i) => h('input', { type: 'text', value: cur[i] || '', placeholder: `${i + 1}.`, maxlength: 200, 'aria-label': `${fd.label} ${i + 1}` })); kids.push(field(fd.label, ...inputs[fd.k]), fd.toTasks && !e.id ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onChange: (ev) => { f.push[fd.k] = ev.target.checked; } }), ' Turn these into tasks') : null); if (fd.toTasks) f.push[fd.k] = true; }
    else {
      const long = fd.type === 'long', val = fd.k === 'text' ? (e.text ?? answers.text ?? '') : (answers[fd.k] || '');
      const ta = h('textarea', { rows: long ? 12 : 3, class: long ? `write ${cfg().serif ? 'serif' : ''}` : '', placeholder: long ? 'Write whatever is on your mind… #tag @person +place' : '', 'aria-label': fd.label || 'Entry' }, val);
      if (long && draft && !val) kids.push(h('div', { class: 'banner soft' }, h('span', { class: 'grow small' }, `A page you did not save (${fmtDate(new Date(draft.at))}): “${draft.text.slice(0, 50)}…”`), h('button', { type: 'button', class: 'btn sm', onClick: (ev) => { ta.value = draft.text; ev.currentTarget.parentElement.remove(); ta.dispatchEvent(new Event('input', { bubbles: true })); } }, 'Bring it back'), h('button', { type: 'button', class: 'btn sm ghost', onClick: (ev) => { saveDraft(null); ev.currentTarget.parentElement.remove(); } }, 'Drop')));
      if (long && !e.id) ta.addEventListener('input', () => saveDraft({ text: ta.value, date }));
      inputs[fd.k] = ta; kids.push(field(fd.label, ta, h('div', { class: 'row write-tools' }, micButton(ta, voice), long ? h('span', { class: 'tiny dim grow' }, '#tag · @person · +place · [[a note]]') : null)));
    }
  }
  if (m.rating) kids.push(field('Rate it 1–5', pick([1, 2, 3, 4, 5].map(x => [x, String(x)]), f.rating, v => { f.rating = +v; })));
  kids.push(h('details', { class: 'adv' }, h('summary', { class: 'small' }, 'Date and goal'), h('div', { class: 'grid2' }, field('Day', h('input', { type: 'date', value: date, max: keyOf(addDays(n, 1)), 'aria-label': 'Day', onChange: (ev) => { if (/^\d{4}-\d\d-\d\d$/.test(ev.target.value)) f.date = ev.target.value; } })), field(m.aim ? 'The goal' : 'A goal this is about', aimSelect(f.aimId, v => { f.aimId = v; })))));
  const save = () => {
    const out = {}; for (const fd of m.fields) out[fd.k] = fd.type === 'lines' ? inputs[fd.k].map(i => i.value.trim()).filter(Boolean) : inputs[fd.k].value.trim();
    const text = out.text ?? ''; delete out.text;
    if (!text && !Object.values(out).flat().some(Boolean) && !f.mood) return toast('Write something first');
    const before = S();
    up(st => {
      let x = J.saveEntry(st, { ...(e.id ? { id: e.id } : {}), method: m.id, date: f.date, text, answers: out, mood: f.mood, energy: f.energy, rating: f.rating, aimIds: f.aimId ? [f.aimId] : [] });
      for (const fd of m.fields) if (fd.toTasks && f.push[fd.k] && !e.id) for (const t of out[fd.k]) x = M.addTask(x, { title: t, due: keyOf(m.id === 'weekly' ? addDays(M.weekStartOf(n), 7) : addDays(n, 1)), aimId: f.aimId, src: `journal:${m.id}` });
      return x;
    });
    saveDraft(null); close(); ctx.cheer(null);
    const made = m.fields.filter(fd => fd.toTasks && f.push[fd.k] && !e.id).reduce((a, fd) => a + out[fd.k].length, 0);
    toast(e.id ? 'Saved' : made ? `Saved · ${plural(made, 'task')} for tomorrow` : 'Saved to your journal', 'ok', e.id ? {} : { action: { label: 'Undo', run: () => ctx.undoTo(before) } });
  };
  kids.push(h('div', { class: 'row wrap sh-foot' }, e.id ? confirmBtn('Delete', () => { const before = S(); up(st => J.deleteEntry(st, e.id)); close(); undoToast('Entry deleted', before); }) : null, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', onClick: save }, 'Save')));
  const { close, box } = ctx.sheet(kids);
  box.classList.add('writing');
  box.addEventListener('keydown', (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); save(); } });
}
function wheelSheet(entry) {
  const prev = J.latestWheel(S(), 1)[0], scores = { ...(entry?.scores || prev?.scores || Object.fromEntries(M.AREAS.map(a => [a.id, 5]))) };
  const rad = h('div', { class: 'wheel-rad center' }), paint = () => rad.replaceChildren(radar(M.AREAS.map(x => ({ id: x.id, label: x.name, color: x.color })), M.AREAS.map(x => scores[x.id] / 10), { size: 220 }));
  paint(); const note = h('textarea', { rows: 2, placeholder: 'What stands out?', 'aria-label': 'What stands out?' }, entry?.answers?.note || '');
  const { close } = ctx.sheet([h('h2', {}, 'Wheel of life'), h('div', { class: 'small muted' }, 'How satisfied are you with each area right now? 1 = starved, 10 = thriving.'), rad,
    ...M.AREAS.map(a => { const out = h('b', {}, String(scores[a.id])); const r = h('input', { type: 'range', min: 1, max: 10, step: 1, value: scores[a.id], 'aria-label': a.name, style: { '--c': a.color }, onInput: () => { scores[a.id] = +r.value; out.textContent = r.value; paint(); } }); return h('div', { class: 'wheel-row' }, h('span', {}, `${a.emoji} ${a.name}`), r, out); }),
    field('', note), h('div', { class: 'row wrap sh-foot' }, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', onClick: () => { up(st => J.saveEntry(st, { ...(entry?.id ? { id: entry.id } : {}), method: 'wheel', date: entry?.date || keyOf(now()), scores, answers: { note: note.value.trim() } })); close(); toast('Saved', 'ok'); } }, 'Save'))]);
}
/** In for 4, out for 6: a longer exhale calms. Animated with one transform. */
export function breatheSheet() {
  let count = 0, on = true;
  const label = h('div', { class: 'b-label' }, 'Breathe in'), cnt = h('div', { class: 'dim tiny' }, '0 breaths'), orb = h('div', { class: 'b-orb' }, h('i'), h('i'), h('i'));
  const cycle = () => { if (!on || !orb.isConnected) return; label.textContent = 'Breathe in'; setTimeout(() => { if (!on || !orb.isConnected) return; label.textContent = 'Breathe out'; setTimeout(() => { count++; cnt.textContent = `${count} breath${count > 1 ? 's' : ''}`; cycle(); }, 6000); }, 4000); };
  const { close } = ctx.sheet([h('h2', {}, 'Breathe'), h('div', { class: 'small muted' }, 'In for 4, out for 6. Follow the glow.'), h('div', { class: 'breathe-stage' }, orb, label), cnt,
    h('div', { class: 'row wrap sh-foot' }, h('span', { class: 'grow' }), h('button', { class: 'btn', onClick: () => { on = false; close(); writeSheet('journal', { fresh: true }); } }, 'Now write'), h('button', { class: 'btn primary', onClick: () => { on = false; close(); } }, 'Done'))]);
  setTimeout(cycle, 50);
}

// ───────────────────────────────────────── export
function exportSheet() {
  const from = h('input', { type: 'date', 'aria-label': 'From' }), to = h('input', { type: 'date', 'aria-label': 'To' });
  const range = () => ({ from: from.value || '', to: to.value || '' });
  const { close } = ctx.sheet([h('h2', {}, 'Export the journal'), h('p', { class: 'small muted' }, 'Leave the dates empty for everything. The file is made here on your device; nothing is sent anywhere.'),
    h('div', { class: 'grid2' }, field('From', from), field('To', to)),
    h('div', { class: 'row wrap sh-foot' }, h('button', { class: 'btn', onClick: () => { download(`bergamot-journal-${keyOf(now())}.md`, J.toMarkdown(S(), range())); close(); toast('Markdown file saved', 'ok'); } }, '⬇ Markdown'),
      h('button', { class: 'btn primary', onClick: () => { printPages(J.toMarkdown(S(), range()), 'Journal'); close(); } }, '🖨 PDF / print'))]);
}
/** Print (or "Save as PDF") Markdown as calm pages, from a hidden frame, so no window has to open. */
export function printPages(md, title) {
  const html = N.renderMarkdown(md).replace(/<button[^>]*><\/button>/g, '☐ ');
  const fr = h('iframe', { style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' }, 'aria-hidden': 'true' }); document.body.append(fr);
  const doc = fr.contentDocument; doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:12pt/1.6 "Newsreader",Georgia,serif;color:#16302f;max-width:42em;margin:2em auto;padding:0 1em}h1,h2,h3,h4,h5{font-family:"Manrope",system-ui,sans-serif;color:#0f3b3a}h4{border-top:1px solid #d6dcc0;padding-top:1em;margin-top:2em}h5{margin:1.2em 0 .3em}ul.ck{list-style:none;padding-left:0}.tag,.who{color:#2d6f68}a{color:#0f3b3a}@page{margin:18mm}</style></head><body>${html}</body></html>`);
  doc.close();
  setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch { toast('Printing is not available here', 'err'); } setTimeout(() => fr.remove(), 60000); }, 300);
}
