// Tasks and Habits screens and their sheets (ported from Citrus mind-ui.js). Tasks: capture line, buckets, a sheet with due,
// time needed, alarm, priority, area and goal. Habits: today's ring, a 16-week heat map, rows with the last 7 days and the
// streak, the starter kit, and a sheet with frequency, goal, a link that ticks it (your journal or another app) and an alarm.
import { h, toast, keyOf, addDays, startOfDay, fmtDate, DAY_SHORT } from './util.js';
import * as M from './mind.js';
import { ctx, S, up, now, field, pick, areaPick, areaColor, aimSelect, aimTitle, pctTxt, dueLabel, confirmBtn, undoToast, tick, settling, plural } from './bits.js';
import { ring, heat } from './viz.js';

const ui = { doneOpen: false, filter: '' };
const firstUrl = (t) => { const m = /https?:\/\/[^\s)]+/.exec(t || ''); return m ? m[0] : ''; };

// ───────────────────────────────────────── capture: one line, "call bank tomorrow 20m !"
export function captureBar({ placeholder = 'Add a task: “call the bank tomorrow 20m !”' } = {}) {
  const inp = h('input', { type: 'text', class: 'cap-in', placeholder, maxlength: 160, enterkeyhint: 'done', 'aria-label': 'Add a task' });
  const hint = h('div', { class: 'tiny dim cap-hint' });
  const show = () => { const p = M.parseCapture(inp.value, now()); hint.textContent = inp.value.trim() ? [p.due ? `due ${dueLabel(p.due)}` : '', p.est ? `${p.est} min` : '', p.pri ? M.PRI[p.pri] : '', p.warn].filter(Boolean).join(' · ') : ''; };
  const add = () => { const p = M.parseCapture(inp.value, now()); if (!p.title) return; up(s => M.addTask(s, p)); toast(`Added: ${p.title}`, 'ok'); inp.value = ''; show(); ctx.focusCapture = true; };
  inp.addEventListener('input', show); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  return h('div', { class: 'card cap' }, h('div', { class: 'row' }, inp, h('button', { class: 'btn primary', onClick: add, 'aria-label': 'Add' }, '＋')), hint);
}

export function taskRow(t, { showArea = true } = {}) {
  const s = S(), g = ctx.goals(), area = M.taskArea(s, t, g), aim = aimTitle(t.aimId), late = !t.done && t.due && t.due < keyOf(now());
  const toggle = (el) => { const before = S(); up(st => M.setTaskDone(st, t.id, !t.done)); if (!t.done) { ctx.cheer(el); undoToast(`Done: ${t.title}`, before); } };
  return h('div', { class: `mrow task ${t.done ? 'done' : ''} ${t.pri ? 'pri' + t.pri : ''} clickable`, onClick: () => { if (!settling()) taskSheet(t.id); } },
    tick(t.done, t.done ? `Mark ${t.title} not done` : `Mark ${t.title} done`, toggle, areaColor(area)),
    h('div', { class: 'grow' }, h('div', { class: 'mtitle' }, t.title),
      h('div', { class: 'msub' },
        t.due ? h('span', { class: late ? 'late' : '' }, dueLabel(t.due)) : null,
        t.est ? h('span', {}, t.est >= 60 ? `${Math.round(t.est / 6) / 10}h` : `${t.est}m`) : null,
        showArea && area ? h('span', { style: { color: areaColor(area) } }, M.areaOf(area)?.name) : null,
        aim ? h('span', { class: 'goal' }, '◆ ', aim) : null,
        t.srcApp ? h('span', { class: 'src' }, t.srcApp === 'notes' ? 'from a note' : `from ${t.srcApp}`) : null,
        t.remindAt && !t.done ? h('span', { title: 'Alarm set' }, '🔔') : null)),
    !t.done && firstUrl(t.notes) ? h('a', { class: 'btn sm', href: firstUrl(t.notes), target: '_blank', rel: 'noopener', onClick: (e) => e.stopPropagation() }, 'Open ▸') : null,
    t.pri ? h('span', { class: 'flag', title: M.PRI[t.pri] }, t.pri === 2 ? '‼' : '!') : null);
}

export function renderTasks() {
  const s = S(), b = M.taskBuckets(s, now()), q = ui.filter.trim().toLowerCase();
  const f = (l) => q ? l.filter(t => t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q)) : l;
  const group = (title, list, cls = '') => { list = f(list); return list.length ? h('div', { class: `card ${cls}` }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, title), h('span', { class: 'dim tiny' }, list.length)), h('div', { class: 'mlist' }, list.map(t => taskRow(t)))) : null; };
  const open = Object.values(b).slice(0, 5).reduce((a, l) => a + l.length, 0);
  const out = [h('div', { class: 'pg-head' }, h('h1', {}, 'Tasks'), h('div', { class: 'small muted' }, open ? `${plural(open, 'open task')}${b.overdue.length ? ` · ${b.overdue.length} overdue` : ''}` : 'Nothing open')),
    captureBar(),
    open > 8 ? h('input', { type: 'search', class: 'tk-filter', placeholder: 'Filter tasks', value: ui.filter, 'aria-label': 'Filter tasks', onInput: (e) => { ui.filter = e.target.value; ctx.render(); ctx.refocus = '.tk-filter'; } }) : null,
    group('Overdue', b.overdue, 'warn'), group('Today', b.today), group('This week', b.soon), group('Later', b.later), group('Someday', b.someday),
    !open ? h('div', { class: 'card empty' }, h('p', {}, 'Nothing open. Type above to capture the next thing — “tomorrow”, “fri”, “20m” and “!” are understood.')) : null,
    b.done.length ? h('div', { class: 'card' }, h('button', { class: 'row linkish', 'aria-expanded': String(ui.doneOpen), onClick: () => { ui.doneOpen = !ui.doneOpen; ctx.render(); } }, h('div', { class: 'title grow' }, 'Done'), h('span', { class: 'dim tiny' }, `${b.done.length} ${ui.doneOpen ? '▾' : '▸'}`)),
      ui.doneOpen ? h('div', { class: 'mlist' }, b.done.slice(0, 30).map(t => taskRow(t))) : null) : null];
  return out;
}

const localDT = (d) => { const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export function taskSheet(id, preset = {}) {
  const s = S(), cur = s.tasks?.[id], f = { title: '', due: '', est: 0, pri: 0, aimId: '', area: '', notes: '', ...preset, ...(cur || {}) };
  const title = h('input', { type: 'text', value: f.title, placeholder: 'What needs doing?', maxlength: 140, 'aria-label': 'Task' }), notes = h('textarea', { rows: 3, placeholder: 'Notes', 'aria-label': 'Notes' }, f.notes);
  const due = h('input', { type: 'date', value: f.due, 'aria-label': 'Due' }), est = h('input', { type: 'number', min: 0, max: 480, step: 5, value: f.est || '', placeholder: 'minutes', inputmode: 'numeric', 'aria-label': 'Time needed' });
  const remind = h('input', { type: 'datetime-local', value: f.remindAt || '', 'aria-label': 'Alarm' });
  const at = (d, hh, mm = 0) => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return localDT(x); };
  const { close } = ctx.sheet([h('h2', {}, cur ? 'Task' : 'New task'), field('', title),
    h('div', { class: 'grid2' }, field('Due', due, h('div', { class: 'seg mini' }, [['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([l, d]) => h('button', { type: 'button', onClick: () => { due.value = keyOf(addDays(now(), d)); } }, l)), h('button', { type: 'button', onClick: () => { due.value = ''; } }, 'None'))), field('Time needed (min)', est)),
    field('Alarm', remind, h('div', { class: 'seg mini' }, [['In 1 h', () => localDT(new Date(Date.now() + 3600000))], ['This evening', () => at(now(), 20)], ['Tomorrow 9:00', () => at(addDays(now(), 1), 9)], ['Clear', () => '']].map(([l, fn]) => h('button', { type: 'button', onClick: () => { remind.value = fn(); } }, l))), h('div', { class: 'dim tiny' }, 'Rings on your phone through Google Calendar (sign in to Google to use it).')),
    field('Priority', pick([[0, 'Normal'], [1, 'High'], [2, 'Urgent']], f.pri, v => { f.pri = +v; })),
    field('Area', areaPick(f.area, v => { f.area = v; })), field('Goal it moves (from Citrus Plan)', aimSelect(f.aimId, v => { f.aimId = v; })), field('Notes', notes),
    f.srcApp ? h('div', { class: 'dim tiny' }, f.srcApp === 'notes' ? 'Made from a note' : `Sent by ${f.srcApp}`) : null,
    h('div', { class: 'dim tiny' }, 'With a due date and a time estimate, Citrus finds a slot for this around your shifts.'),
    h('div', { class: 'row wrap sh-foot' }, cur ? confirmBtn('Delete', () => { const before = S(); up(st => M.deleteTask(st, id)); close(); undoToast('Task deleted', before); }) : null, h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost', onClick: () => close() }, 'Cancel'),
      h('button', { class: 'btn primary', onClick: () => {
        if (!title.value.trim()) return toast('Give it a title');
        const v = { title: title.value.trim().slice(0, 140), due: due.value, est: Math.max(0, Math.min(480, +est.value || 0)), pri: f.pri, aimId: f.aimId, area: f.area, notes: notes.value.slice(0, 2000), remindAt: remind.value };
        up(st => cur ? M.updateTask(st, id, v) : M.addTask(st, { ...v, src: f.src, srcApp: f.srcApp })); close(); toast(cur ? 'Saved' : `Added: ${v.title}`, 'ok');
      } }, 'Save'))]);
}

// ───────────────────────────────────────── Habits
function habitDots(hb, days = 7) {
  const s = S(), n = now(), tk = keyOf(n), wrap = h('div', { class: 'hdots' });
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(startOfDay(n), -i), k = keyOf(d), due = M.habitDue(hb, d), done = M.habitDone(s, hb, k, ctx.apps(), tk);
    wrap.append(h('button', { type: 'button', class: `hd ${done ? 'on' : ''} ${due ? '' : 'off'} ${k === tk ? 'today' : ''}`, title: `${DAY_SHORT[d.getDay()]} ${fmtDate(d)}`, 'aria-label': `${DAY_SHORT[d.getDay()]} ${fmtDate(d)}: ${done ? 'done' : 'not done'}`, 'aria-pressed': String(done), style: { '--c': areaColor(M.habitArea(s, hb, ctx.goals())) },
      onClick: (e) => { e.stopPropagation(); up(st => M.logHabit(st, hb.id, k, !M.habitDone(st, hb, k, ctx.apps(), tk))); } }, h('span', {}, DAY_SHORT[d.getDay()].slice(0, 2))));
  }
  return wrap;
}
export function habitRow(hb, { dots = true } = {}) {
  const s = S(), n = now(), tk = keyOf(n), a = ctx.apps(), done = M.habitDone(s, hb, tk, a, tk), auto = !s.habitLog?.[hb.id]?.[tk] && M.autoDone(s, hb, tk, a, tk);
  const due = M.habitDue(hb, n), st = M.habitStreak(s, hb, n, a), color = areaColor(M.habitArea(s, hb, ctx.goals()));
  const wk = hb.freq?.type === 'weekly' ? M.habitWeekCount(s, hb, M.weekStartOf(n), n, a) : null, aim = aimTitle(hb.aimId);
  const linkName = hb.link === M.LINK_JOURNAL ? 'your journal' : hb.link ? hb.link.split(':')[0] : '';
  return h('div', { class: `mrow habit ${done ? 'done' : ''} ${due ? '' : 'rest'} clickable`, onClick: () => { if (!settling()) habitSheet(hb.id); } },
    tick(done, done ? `Undo ${hb.name}` : `Do ${hb.name}`, (el) => { up(x => M.logHabit(x, hb.id, tk, !done)); if (!done) ctx.cheer(el); }, color),
    h('div', { class: 'grow' },
      h('div', { class: 'mtitle' }, hb.emoji ? `${hb.emoji} ` : '', hb.name),
      h('div', { class: 'msub' }, h('span', {}, M.habitFreqLabel(hb)), wk != null ? h('span', {}, `${wk}/${hb.freq.n} this week`) : null, auto ? h('span', { class: 'ok' }, `ticked by ${linkName}`) : linkName ? h('span', {}, `counts from ${linkName}`) : null, !due ? h('span', {}, 'rest day') : null, aim ? h('span', { class: 'goal' }, '◆ ', aim) : null),
      dots ? habitDots(hb) : null),
    st.cur > 0 ? h('div', { class: `streak ${st.cur >= 7 ? 'hot' : ''}`, title: `Best ${st.best}` }, h('b', {}, st.cur), h('small', {}, st.unit === 'wk' ? 'wk' : 'day')) : null);
}
export function renderHabits() {
  const s = S(), n = now(), a = ctx.apps(), list = M.activeHabits(s), archived = Object.values(s.habits || {}).filter(x => x.archived);
  const td = M.habitsToday(s, n, a), w7 = M.habitWindow(s, addDays(startOfDay(n), -6), n, a), w30 = M.habitWindow(s, addDays(startOfDay(n), -29), n, a);
  const cells = [], start = M.weekStartOf(addDays(n, -7 * 15)), tk = keyOf(n);
  for (let i = 0; i < 16 * 7; i++) { const d = addDays(start, i), k = keyOf(d); if (d > n) cells.push({ key: k, blank: true }); else { const r = M.habitWindow(s, d, d, a).rate; cells.push({ key: k, v: r, title: `${fmtDate(d)} · ${pctTxt(r)}`, today: k === tk }); } }
  return [h('div', { class: 'pg-head' }, h('h1', {}, 'Habits'), h('div', { class: 'small muted' }, list.length ? `${td.done.length} of ${td.due.length} today` : 'Small things, most days')),
    list.length ? h('div', { class: 'card hero slim' }, h('div', { class: 'habit-hero' }, ring(td.due.length ? td.done.length / td.due.length : 0, { size: 84, stroke: 7, label: `${td.done.length}/${td.due.length}`, sub: 'today' }),
      h('div', { class: 'grow' }, h('div', { class: 'big' }, pctTxt(w7.rate), h('small', {}, ' this week')), h('div', { class: 'dim small' }, w7.rate == null ? 'Rates start counting tomorrow' : `${pctTxt(w30.rate)} over 30 days`), h('div', { class: 'dim tiny' }, `Best streak ${Math.max(0, ...list.map(x => M.habitStreak(s, x, n, a).best))}`))),
      h('div', { class: 'dim tiny', style: { margin: '10px 0 4px' } }, 'Last 16 weeks'), heat(cells)) : null,
    list.length ? h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Your habits'), h('button', { class: 'btn sm', onClick: () => habitSheet(null) }, '＋ Habit')), h('div', { class: 'mlist' }, list.map(x => habitRow(x))))
      : h('div', { class: 'card empty' }, h('p', {}, 'Habits that run themselves: tick them, or link one to your journal or another app so it counts when that says you did it.'), h('button', { class: 'btn primary', onClick: () => habitSheet(null) }, 'Add a habit')),
    kitCard(),
    archived.length ? h('div', { class: 'card' }, h('div', { class: 'title' }, 'Paused'), archived.map(x => h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'grow' }, `${x.emoji || ''} ${x.name}`), h('button', { class: 'btn sm', onClick: () => up(st => M.updateHabit(st, x.id, { archived: false })) }, 'Resume')))) : null];
}
export function kitCard({ compact = false } = {}) {
  const kit = M.starterKit(S()); if (!kit.length || (M.activeHabits(S()).length >= 6 && !compact)) return null;
  return h('div', { class: 'card kit' }, h('div', { class: 'title' }, compact ? 'Pick a few habits to start' : 'Starter habits'), h('div', { class: 'tiny dim' }, 'One tap adds it. You can change anything later.'),
    h('div', { class: 'kit-list' }, kit.slice(0, compact ? 4 : 6).map(k => h('button', { class: 'kit-item', onClick: () => { up(s => M.addHabit(s, k)); toast(`Added: ${k.name}`, 'ok'); } }, h('b', {}, `${k.emoji} ${k.name}`), h('small', {}, `${M.habitFreqLabel(k)} · ${k.why}`)))));
}
export function habitSheet(id) {
  const s = S(), cur = s.habits?.[id], f = { name: '', emoji: '', freq: { type: 'daily' }, area: '', aimId: '', link: '', threshold: 0, minutes: 0, ...(cur || {}) };
  f.freq = { ...f.freq, ...(f.freq.days ? { days: [...f.freq.days] } : {}) };
  const n = now(), a = ctx.apps();
  const name = h('input', { type: 'text', value: f.name, placeholder: 'e.g. Read 20 pages', maxlength: 60, 'aria-label': 'Habit' }), emoji = h('input', { type: 'text', value: f.emoji, class: 'emoji-in', placeholder: '🙂', 'aria-label': 'Emoji', onInput: () => { const g = M.firstGrapheme(emoji.value); if (g !== emoji.value) emoji.value = g; } });
  const mins = h('input', { type: 'number', min: 0, max: 180, step: 5, value: f.minutes || '', placeholder: '0 = no slot', inputmode: 'numeric', 'aria-label': 'Minutes' }), thr = h('input', { type: 'number', min: 0, step: 1, value: f.threshold || '', placeholder: 'the app’s goal', inputmode: 'numeric', 'aria-label': 'Metric goal' });
  const freqBox = h('div', {}), paintFreq = () => {
    freqBox.replaceChildren(pick([['daily', 'Every day'], ['days', 'Certain days'], ['weekly', 'X per week']], f.freq.type, v => { f.freq = v === 'days' ? { type: 'days', days: [0, 1, 2, 3, 4] } : v === 'weekly' ? { type: 'weekly', n: 3 } : { type: 'daily' }; paintFreq(); }),
      f.freq.type === 'days' ? h('div', { class: 'seg wrap tight', style: { marginTop: '6px' } }, DAY_SHORT.map((l, i) => h('button', { type: 'button', class: f.freq.days.includes(i) ? 'active' : '', 'aria-pressed': String(f.freq.days.includes(i)), onClick: (e) => { f.freq.days = f.freq.days.includes(i) ? f.freq.days.filter(x => x !== i) : [...f.freq.days, i]; e.currentTarget.classList.toggle('active'); e.currentTarget.setAttribute('aria-pressed', String(f.freq.days.includes(i))); } }, l.slice(0, 2)))) : null,
      f.freq.type === 'weekly' ? h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Fewer', onClick: () => { f.freq.n = Math.max(1, f.freq.n - 1); paintFreq(); } }, '−'), h('b', {}, `${f.freq.n}× a week`), h('button', { type: 'button', class: 'btn sm', 'aria-label': 'More', onClick: () => { f.freq.n = Math.min(7, f.freq.n + 1); paintFreq(); } }, '+')) : null);
  }; paintFreq();
  const remindT = h('input', { type: 'time', value: f.remindTime || '', 'aria-label': 'Alarm time' });
  const known = Object.entries(a).filter(([, v]) => v);
  const linkSel = h('select', { 'aria-label': 'Counts from' }, h('option', { value: '' }, 'Nothing: I tick it'), h('option', { value: M.LINK_JOURNAL }, 'Writing in my journal that day'),
    ...['orange', 'yuzu', 'mephisto', 'mandarin', 'calamansi', 'clementine'].filter(x => !known.some(([k]) => k === x)).map(x => h('option', { value: x }, `${x[0].toUpperCase()}${x.slice(1)} says I am done today`)),
    ...known.map(([k, v]) => h('option', { value: k }, `${v.title || k} says I am done today`)),
    ...known.flatMap(([k, v]) => (v.metrics || []).slice(0, 8).map(m => h('option', { value: `${k}:${m.key}` }, `${v.title || k}: ${m.label} reaches its goal`))),
    f.link && !['', M.LINK_JOURNAL].includes(f.link) && !known.some(([k]) => f.link.startsWith(k)) ? h('option', { value: f.link }, f.link) : null);
  linkSel.value = f.link || '';
  let stats = null;
  if (cur) { const st = M.habitStreak(s, cur, n, a), cells = [], start = M.weekStartOf(addDays(n, -7 * 19)); for (let i = 0; i < 140; i++) { const d = addDays(start, i), k = keyOf(d); cells.push(d > n ? { key: k, blank: true } : { key: k, v: M.habitDue(cur, d) ? (M.habitDone(s, cur, k, a, keyOf(n)) ? 1 : 0) : null, title: fmtDate(d), today: k === keyOf(n) }); }
    stats = h('div', { class: 'hstats' }, h('div', { class: 'kv' }, h('span', {}, 'Streak'), h('b', {}, `${st.cur} ${st.unit === 'wk' ? 'weeks' : 'days'}`), h('span', {}, 'Best'), h('b', {}, String(st.best)), h('span', {}, '7 days'), h('b', {}, pctTxt(M.habitRate(s, cur, n, 7, a))), h('span', {}, '30 days'), h('b', {}, pctTxt(M.habitRate(s, cur, n, 30, a)))), heat(cells, { color: areaColor(M.habitArea(s, cur, ctx.goals())) })); }
  const { close } = ctx.sheet([h('h2', {}, cur ? 'Habit' : 'New habit'), h('div', { class: 'row' }, h('div', { style: { width: '70px' } }, field('', emoji)), h('div', { class: 'grow' }, field('', name))), stats, field('How often', freqBox),
    field('Area', areaPick(f.area, v => { f.area = v; })), field('Goal it serves (from Citrus Plan)', aimSelect(f.aimId, v => { f.aimId = v; })),
    field('Counts by itself from', linkSel), h('div', { class: 'grid2' }, field('Goal for an app number', thr), field('Time to set aside (min)', mins)),
    h('div', { class: 'dim tiny' }, 'With minutes, Citrus finds a slot for it around your shifts each day.'),
    field('Alarm at (on its days)', remindT, h('div', { class: 'dim tiny' }, 'Rings on your phone through Google Calendar; leave empty for none.')),
    h('div', { class: 'row wrap sh-foot' }, cur ? [confirmBtn('Delete', () => { const before = S(); up(st => M.deleteHabit(st, id)); close(); undoToast(`Habit deleted · ${cur.name}`, before); }), h('button', { class: 'btn', onClick: () => { up(st => M.updateHabit(st, id, { archived: true })); close(); toast('Paused: find it under Paused'); } }, 'Pause')] : null, h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', onClick: () => {
        if (!name.value.trim()) return toast('Name the habit');
        if (f.freq.type === 'days' && !f.freq.days.length) return toast('Pick at least one day, or choose Every day');
        const v = { name: name.value.trim().slice(0, 60), emoji: M.firstGrapheme(emoji.value), freq: f.freq, area: f.area, aimId: f.aimId, link: linkSel.value, threshold: +thr.value || 0, minutes: Math.max(0, Math.min(180, +mins.value || 0)), remindTime: remindT.value || '' };
        up(st => cur ? M.updateHabit(st, id, v) : M.addHabit(st, v)); close(); toast(cur ? 'Saved' : `Added: ${v.name}`, 'ok');
      } }, 'Save'))]);
}
