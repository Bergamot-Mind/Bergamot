// Mind: tasks, habits, the day log and the goals Bergamot links to — the rules and the numbers. Ported from Citrus mind.js
// (16/11/2026). Pure functions over the state object (no DOM, no store), so they are easy to test and the screens stay thin.
// Every record carries `at` (last edit); deleting leaves a tombstone in state.deleted — that is what lets devices merge safely.
// Goals are not Bergamot's: Citrus Plan owns them (hub/citrus/plan.json › goals). Tasks, habits, entries and notes point at an
// aim by its id, and Bergamot reports what moves each aim back to Citrus (status.json › extra.goalLinks).
import { keyOf, fromKey, addDays, startOfDay, uid } from './util.js';

const rec = (o) => Object.values(o || {});
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const tomb = (s, key) => ({ ...(s.deleted || {}), [key]: Date.now() });
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, n = 140) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, n);
const DAY = 86400000;

export const AREAS = [
  { id: 'health', name: 'Health', color: '#5fd38d', emoji: '💪' },
  { id: 'career', name: 'Career', color: '#4fb3ff', emoji: '🩺' },
  { id: 'learning', name: 'Learning', color: '#e0b43a', emoji: '📚' },
  { id: 'money', name: 'Money', color: '#3cc7b5', emoji: '💰' },
  { id: 'people', name: 'People', color: '#c58cff', emoji: '🤝' },
  { id: 'fun', name: 'Fun', color: '#ff8a3d', emoji: '🎮' },
  { id: 'calm', name: 'Calm', color: '#8e9bff', emoji: '🌿' },
  { id: 'home', name: 'Home', color: '#ff8fa3', emoji: '🏠' },
];
export const areaOf = (id) => AREAS.find(a => a.id === id) || null;
export const PRI = ['', 'High', 'Urgent'];
/** The Saudi week starts on Sunday. */
export const weekStartOf = (d) => addDays(startOfDay(d), -d.getDay());

// ════════════════════════════════════════ goals (read from Citrus Plan, never written here)
/** A clean copy of plan.json › goals: {aims:[{id,title,area,deadline,status,progress}], resolutions:[…], time:[…]}. Never trust another app's file. */
export function cleanGoals(g) {
  const out = { aims: [], resolutions: [], time: [] }; if (!isObj(g)) return out;
  const ok = (x) => isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number') && String(x.id);
  for (const a of Array.isArray(g.aims) ? g.aims.slice(0, 60) : []) if (ok(a) && str(a.title)) out.aims.push({ id: String(a.id), title: str(a.title, 100), area: areaOf(a.area) ? a.area : '', deadline: /^\d{4}-\d\d-\d\d$/.test(a.deadline || '') ? a.deadline : '', status: ['active', 'done', 'paused', 'dropped'].includes(a.status) ? a.status : 'active', progress: Number.isFinite(+a.progress) ? clamp01(+a.progress > 1 ? +a.progress / 100 : +a.progress) : 0 });
  for (const r of Array.isArray(g.resolutions) ? g.resolutions.slice(0, 40) : []) if (ok(r) && str(r.title)) out.resolutions.push({ id: String(r.id), title: str(r.title, 100), area: areaOf(r.area) ? r.area : '', aimId: str(r.aimId, 60) });
  for (const t of Array.isArray(g.time) ? g.time.slice(0, 30) : []) if (ok(t) && str(t.name)) out.time.push({ id: String(t.id), name: str(t.name, 60), kind: str(t.kind, 20), hoursPerWeek: Math.max(0, Math.min(80, +t.hoursPerWeek || 0)) });
  return out;
}
export const activeAims = (goals) => (goals?.aims || []).filter(a => a.status === 'active' || a.status === 'paused');
export const aimOf = (goals, id) => (goals?.aims || []).find(a => a.id === id) || null;
/** What points at each aim: {aimId: {tasks, open, done, habits, entries, notes}} — Citrus Plan shows it on the aim. */
export function goalLinks(s, now = new Date()) {
  const out = {}, get = (id) => (out[id] ||= { tasks: 0, open: 0, done: 0, habits: 0, entries: 0, notes: 0 });
  const ws = weekStartOf(now).getTime();
  for (const t of rec(s.tasks)) if (t.aimId) { const g = get(t.aimId); g.tasks++; if (t.done) g.done++; else g.open++; if (t.done && t.doneAt >= ws) g.doneWeek = (g.doneWeek || 0) + 1; }
  for (const h of activeHabits(s)) if (h.aimId) get(h.aimId).habits++;
  for (const e of rec(s.journal)) for (const id of e.aimIds || []) get(id).entries++;
  for (const n of rec(s.notes)) if (n.aimId) get(n.aimId).notes++;
  return out;
}

// ════════════════════════════════════════ capture: "Call bank tomorrow 20m !" → a task
export function parseCapture(raw, now = new Date()) {
  let t = ` ${String(raw || '').trim()} `;
  let due = '', est = 0, pri = 0, warn = '';
  // fn may return false to leave the words where they were (e.g. "31/02" is not a date, so it stays in the title)
  const take = (re, fn) => { const m = t.match(re); if (m && fn(m) !== false) t = t.replace(m[0], ' '); };
  const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  take(/\s(!{1,2})(?=\s)/, m => { pri = m[1].length; });
  take(/\s(?:due |by |on )?(today|tod)(?=\s)/i, () => { due = keyOf(now); });
  take(/\s(?:due |by |on )?(tomorrow|tmrw)(?=\s)/i, () => { due = keyOf(addDays(now, 1)); });
  take(/\snext week(?=\s)/i, () => { due = keyOf(addDays(now, 7)); });
  take(/\sin (\d{1,3}) days?(?=\s)/i, m => { due = keyOf(addDays(now, +m[1])); });
  take(/\s(?:due |by |on |next )?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?)(?=\s)/i, m => {
    const idx = DAYS[m[1].slice(0, 3).toLowerCase()]; due = keyOf(addDays(now, (idx - now.getDay() + 7) % 7 || 7));
  });
  take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/, m => {   // dd/mm[/yyyy], the way you write dates
    const d = +m[1], mo = +m[2], y0 = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    let c = new Date(y0, mo - 1, d);
    if (mo < 1 || mo > 12 || d < 1 || c.getMonth() !== mo - 1) { warn = `${m[0].trim()} is not a date`; return false; }
    if (!m[3] && c < startOfDay(now)) c = new Date(y0 + 1, mo - 1, d);
    due = keyOf(c);
  });
  // an estimate only at the very end ("… 20m") or marked with ~ ("~5 min"), so "about 5 min talk" keeps its words
  const UNIT = '(h|hr|hrs|hours?|m|min|mins|minutes?)';
  const setEst = (m) => { est = Math.round(parseFloat(m[1]) * (/^h/i.test(m[2]) ? 60 : 1)); };
  if (/\s~\d/.test(t)) take(new RegExp(`\\s~(\\d+(?:\\.\\d+)?)\\s?${UNIT}(?=\\s)`, 'i'), setEst);
  else take(new RegExp(`\\s(\\d+(?:\\.\\d+)?)\\s?${UNIT}\\s*$`, 'i'), setEst);
  let title = t.replace(/\s+/g, ' ').trim();
  if (!title) title = String(raw || '').trim();
  if (!/[\p{L}\p{N}]/u.test(title)) title = '';   // "!" or "..." alone is not a task
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title, due, est: Math.min(480, est), pri, warn };
}
/** First user-perceived character: keeps 🇸🇦 and 🧑‍⚕️ whole (a code-unit slice cuts them in half). */
export function firstGrapheme(v) {
  const s = String(v || '').trim(); if (!s) return '';
  try { if (typeof Intl !== 'undefined' && Intl.Segmenter) { for (const g of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) return g.segment; } } catch {}
  return Array.from(s)[0] || '';
}
/** Nothing of your own yet: the screens show the guided start instead of zeros. */
export const isEmpty = (s) => !rec(s.tasks).length && !rec(s.habits).length && !rec(s.journal).length && !rec(s.notes).length;

// ════════════════════════════════════════ tasks
export function addTask(s, f) {
  const title = String(f.title || '').trim().slice(0, 140); if (!title) return s;
  const id = f.id || uid(), now = Date.now();
  const t = { id, title, done: false, doneAt: 0, due: /^\d{4}-\d\d-\d\d$/.test(f.due || '') ? f.due : '', remindAt: f.remindAt || '', est: Math.max(0, Math.min(480, +f.est || 0)), pri: Math.max(0, Math.min(2, +f.pri || 0)), aimId: f.aimId || '', area: areaOf(f.area) ? f.area : '', notes: String(f.notes || '').slice(0, 2000), src: f.src || '', srcApp: f.srcApp || '', createdAt: now, at: now };
  return { ...s, tasks: { ...s.tasks, [id]: t } };
}
export function updateTask(s, id, patch) { const t = s.tasks?.[id]; return t ? { ...s, tasks: { ...s.tasks, [id]: { ...t, ...patch, at: Date.now() } } } : s; }
export const setTaskDone = (s, id, done) => updateTask(s, id, { done: !!done, doneAt: done ? Date.now() : 0 });
export function deleteTask(s, id) { const tasks = { ...s.tasks }; delete tasks[id]; return { ...s, tasks, deleted: tomb(s, `task:${id}`) }; }
export const taskArea = (s, t, goals) => t.area || aimOf(goals, t.aimId)?.area || '';

export function taskBuckets(s, now = new Date()) {
  const today = keyOf(now), weekEnd = keyOf(addDays(now, 7));
  const all = rec(s.tasks), open = all.filter(t => !t.done);
  const order = (a, b) => (b.pri || 0) - (a.pri || 0) || (a.due || '9').localeCompare(b.due || '9') || (a.createdAt || 0) - (b.createdAt || 0);
  return {
    overdue: open.filter(t => t.due && t.due < today).sort(order),
    today: open.filter(t => t.due === today).sort(order),
    soon: open.filter(t => t.due > today && t.due <= weekEnd).sort(order),
    later: open.filter(t => t.due > weekEnd).sort(order),
    someday: open.filter(t => !t.due).sort(order),
    done: all.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)),
  };
}
/** The few things worth doing today: overdue and due-today first, then high-priority undated, then this week. */
export function focusTasks(s, now = new Date(), n = 3) {
  const b = taskBuckets(s, now);
  return [...b.overdue, ...b.today, ...b.someday.filter(t => t.pri > 0), ...b.soon].slice(0, n);
}
export const tasksDoneSince = (s, ms) => rec(s.tasks).filter(t => t.done && t.doneAt >= ms).length;

// ════════════════════════════════════════ habits
export const activeHabits = (s) => rec(s.habits).filter(h => !h.archived).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
export const habitArea = (s, h, goals) => h.area || aimOf(goals, h.aimId)?.area || '';
export function habitFreqLabel(h) {
  const f = h.freq || { type: 'daily' };
  if (f.type === 'days' && new Set(f.days || []).size === 7) return 'Every day';
  if (f.type === 'days') return (f.days || []).length === 5 && ![5, 6].some(d => f.days.includes(d)) ? 'Sun–Thu' : (f.days || []).map(d => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d]).join(' ');
  if (f.type === 'weekly') return `${f.n || 3}× a week`;
  return 'Every day';
}
export function addHabit(s, f) {
  const name = String(f.name || '').trim().slice(0, 60); if (!name) return s;
  const id = f.id || uid(), now = Date.now();
  const h = { id, name, emoji: firstGrapheme(f.emoji), freq: f.freq || { type: 'daily' }, aimId: f.aimId || '', area: areaOf(f.area) ? f.area : '', link: f.link || '', threshold: +f.threshold || 0, minutes: Math.max(0, Math.min(180, +f.minutes || 0)), remindTime: /^\d\d:\d\d$/.test(f.remindTime || '') ? f.remindTime : '', archived: false, createdAt: f.createdAt || now, at: now };
  return { ...s, habits: { ...s.habits, [id]: h } };
}
export function updateHabit(s, id, patch) { const h = s.habits?.[id]; return h ? { ...s, habits: { ...s.habits, [id]: { ...h, ...patch, at: Date.now() } } } : s; }
export function deleteHabit(s, id) { const habits = { ...s.habits }, habitLog = { ...s.habitLog }; delete habits[id]; delete habitLog[id]; return { ...s, habits, habitLog, deleted: tomb(s, `habit:${id}`) }; }
export function logHabit(s, id, key, v) {
  const next = { ...s, habitLog: { ...s.habitLog, [id]: { ...(s.habitLog?.[id] || {}), [key]: { v: v ? 1 : 0, at: Date.now() } } } };
  // ticking a day before the habit existed is back-filling: the habit starts that day, so the streak and rates count it
  const hb = s.habits?.[id], day = fromKey(key).getTime();
  return v && hb && day < startOfDay(new Date(hb.createdAt || Date.now())).getTime() ? updateHabit(next, id, { createdAt: day }) : next;
}
export function habitDue(h, date) { const f = h.freq || {}; return f.type === 'days' ? (f.days || []).includes(date.getDay()) : true; }

/** Where a habit can count itself from: your journal, or another app's status.json (its "done today", or one of its metrics). */
export const LINK_JOURNAL = 'journal';
/** Done = you tapped it, or what it is linked to says so. An explicit tap wins, including un-ticking an automatic one. */
export function habitDone(s, h, key, apps, todayKey) {
  const c = s.habitLog?.[h.id]?.[key];
  if (c) return c.v === 1;
  return !!autoDone(s, h, key, apps, todayKey);
}
export function autoDone(s, h, key, apps, todayKey) {
  if (!h.link) return false;
  if (h.link === LINK_JOURNAL) return rec(s.journal).some(e => e.date === key);
  const [app, metric] = h.link.split(':'), st = apps?.[app];
  if (!st || key !== todayKey) return false;   // other apps only report today
  if (metric) { const m = (st.metrics || []).find(x => x.key === metric); return !!m && (!m.date || m.date === key) && +m.value >= (h.threshold || +m.goal || 1); }
  const t = st.today; return !!(t?.done && (!t.date || t.date === key));
}
/** Current and best streak. Days that aren't due don't break it; today only counts once done (and never breaks it while pending). */
export function habitStreak(s, h, now, apps) {
  const todayKey = keyOf(now), f = h.freq || { type: 'daily' };
  const created = startOfDay(new Date(h.createdAt || now.getTime()));
  const start = new Date(Math.max(created.getTime(), startOfDay(now).getTime() - 400 * DAY));
  if (f.type === 'weekly') {
    const n = f.n || 3; let run = 0, best = 0, ws = weekStartOf(start); const last = weekStartOf(now);
    for (; ws <= last; ws = addDays(ws, 7)) {
      let c = 0; for (let i = 0; i < 7; i++) { const d = addDays(ws, i), k = keyOf(d); if (k > todayKey) break; if (d >= created && habitDone(s, h, k, apps, todayKey)) c++; }
      const current = keyOf(ws) === keyOf(last);
      if (c >= n) { run++; best = Math.max(best, run); } else if (!current) run = 0;
    }
    return { cur: run, best, unit: 'wk' };
  }
  let run = 0, best = 0;
  for (let d = start; keyOf(d) <= todayKey; d = addDays(d, 1)) {
    if (!habitDue(h, d)) continue;
    const k = keyOf(d);
    if (habitDone(s, h, k, apps, todayKey)) { run++; best = Math.max(best, run); } else if (k !== todayKey) run = 0;
  }
  return { cur: run, best, unit: 'd' };
}
export function habitWeekCount(s, h, ws, now, apps) { const todayKey = keyOf(now); let c = 0; for (let i = 0; i < 7; i++) { const k = keyOf(addDays(ws, i)); if (k <= todayKey && habitDone(s, h, k, apps, todayKey)) c++; } return c; }
/** Due vs done over a window, for all habits (weekly habits count n/7 per day). Fractions are fine: they feed percentages. */
export function habitWindow(s, from, to, apps, only = null) {
  const todayKey = keyOf(to); let due = 0, done = 0;
  for (const h of only || activeHabits(s)) {
    const created = startOfDay(new Date(h.createdAt || 0)); const f = h.freq || {}; let hd = 0, dn = 0;
    if (keyOf(created) >= todayKey) continue;   // younger than a day: no rate yet ("–"), not 0 %
    for (let d = startOfDay(from); keyOf(d) <= todayKey; d = addDays(d, 1)) {
      if (d < created) continue;
      const k = keyOf(d), did = habitDone(s, h, k, apps, todayKey);
      if (k === todayKey && !did) continue;   // today isn't a miss yet
      if (f.type === 'weekly') { hd += (f.n || 3) / 7; if (did) dn++; }
      else if (habitDue(h, d)) { hd++; if (did) dn++; }
    }
    due += hd; done += Math.min(dn, hd || dn);
  }
  return { due, done, rate: due > 0 ? clamp01(done / due) : null };
}
export const habitRate = (s, h, now, days, apps) => habitWindow(s, addDays(startOfDay(now), -(days - 1)), now, apps, [h]).rate;
/** Today's habits: due ones, done or not. */
export function habitsToday(s, now, apps) {
  const tk = keyOf(now), due = activeHabits(s).filter(h => habitDue(h, now) || h.freq?.type === 'weekly');
  const done = due.filter(h => habitDone(s, h, tk, apps, tk));
  return { due, done, pending: due.filter(h => !done.includes(h)) };
}

// ════════════════════════════════════════ the day log: how each day felt, 1–5
export const DAY_FACES = ['😞', '😕', '😐', '🙂', '😄'];
export function rateDay(s, key, score, note = '') {
  const sc = Math.round(+score); if (!(sc >= 1 && sc <= 5) || !/^\d{4}-\d\d-\d\d$/.test(key)) return s;
  return { ...s, dayLog: { ...(s.dayLog || {}), [key]: { key, score: sc, note: String(note || '').slice(0, 200), at: Date.now() } } };
}
export function clearDay(s, key) { const dayLog = { ...(s.dayLog || {}) }; delete dayLog[key]; return { ...s, dayLog, deleted: tomb(s, `daylog:${key}`) }; }
export const dayRating = (s, key) => s.dayLog?.[key]?.score || 0;

// ════════════════════════════════════════ planner asks: tasks with an estimate, habits that need time (Citrus places them around shifts)
export function asks(s, now = new Date(), days = 7) {
  const out = [], todayKey = keyOf(now), end = keyOf(addDays(now, days - 1));
  for (const t of taskBuckets(s, now).overdue.concat(taskBuckets(s, now).today, taskBuckets(s, now).soon)) {
    if (!t.est || !t.due) continue; const date = t.due < todayKey ? todayKey : t.due; if (date > end) continue;
    out.push({ date, title: `Bergamot: ${t.title}`.slice(0, 80), minutes: Math.max(5, t.est), slot: 'free', ...(t.aimId ? { aimId: t.aimId } : {}), id: `task-${t.id}` });
  }
  for (const h of activeHabits(s)) {
    if (!h.minutes || h.freq?.type === 'weekly') continue;
    for (let i = 0; i < Math.min(days, 3); i++) { const d = addDays(now, i), k = keyOf(d); if (!habitDue(h, d) || s.habitLog?.[h.id]?.[k]?.v === 1) continue; out.push({ date: k, title: `Bergamot: ${h.name}`.slice(0, 80), minutes: h.minutes, slot: 'free', id: `habit-${h.id}` }); }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ════════════════════════════════════════ reminders: Google Calendar pop-ups (your phone rings them even when Bergamot is closed)
const RR_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/** What should currently be ringing: tasks with an alarm time, habits with a daily alarm time. */
export function wantedReminders(s, now = new Date()) {
  const want = {};
  for (const t of rec(s.tasks)) {
    if (t.done || !t.remindAt) continue; const d = new Date(t.remindAt); if (isNaN(d) || d < now) continue;
    want[`task:${t.id}`] = { title: `⏰ ${t.title}`, start: d, end: new Date(d.getTime() + 15 * 60000), desc: 'Task reminder from Bergamot', sig: `${t.remindAt}|${t.title}`, window: [addDays(d, -1), addDays(d, 1)] };
  }
  for (const hb of activeHabits(s)) {
    if (!/^\d\d:\d\d$/.test(hb.remindTime || '')) continue; const [hh, mm] = hb.remindTime.split(':').map(Number), f = hb.freq || {};
    const days = f.type === 'days' && (f.days || []).length ? f.days : [0, 1, 2, 3, 4, 5, 6];
    let d = new Date(now); d.setHours(hh, mm, 0, 0); if (d < now) d = addDays(d, 1); for (let i = 0; i < 8 && !days.includes(d.getDay()); i++) d = addDays(d, 1);
    const rule = days.length === 7 ? 'RRULE:FREQ=DAILY' : `RRULE:FREQ=WEEKLY;BYDAY=${days.map(x => RR_DAYS[x]).join(',')}`;
    want[`habit:${hb.id}`] = { title: `${hb.emoji || '●'} ${hb.name}`, start: d, end: new Date(d.getTime() + 10 * 60000), desc: 'Habit reminder from Bergamot', sig: `${hb.remindTime}|${hb.name}|${days.join('')}`, recurrence: [rule], window: [addDays(d, -1), addDays(d, 8)] };
  }
  return want;
}
export function reminderDrift(s, now = new Date()) { const want = wantedReminders(s, now), have = s.reminders || {}; return Object.keys(want).some(k => have[k]?.sig !== want[k].sig) || Object.keys(have).some(k => !want[k]); }

// ════════════════════════════════════════ the inbox: hub/claude/status.json › inbox (Bergamot takes the task and note items)
export const refOf = (app, id) => `${app}:${String(id).slice(0, 80)}`;
/** Items waiting for a tap: only task and note, not yet decided, not expired. */
export function inboxPending(s, sources, now = new Date()) {
  const todayKey = keyOf(now), out = [];
  for (const [app, st] of Object.entries(sources || {})) for (const it of Array.isArray(st?.inbox) ? st.inbox.slice(0, 25) : []) {
    if (!isObj(it) || !['task', 'note'].includes(it.type) || !str(it.id) || !str(it.title || it.text)) continue;
    const ref = refOf(app, it.id);
    if (s.inboxLog?.[ref]) continue;
    if (it.expires && it.expires < todayKey) continue;
    out.push({ ref, app, item: { id: str(it.id), type: it.type, title: str(it.title || it.text, 140), text: str(it.text, 2000), date: /^\d{4}-\d\d-\d\d$/.test(it.date || '') ? it.date : '', minutes: Math.max(0, Math.min(480, +it.minutes || 0)), pri: Math.max(0, Math.min(2, +it.pri || 0)), url: str(it.url, 400) } });
  }
  return out;
}
/** Take an item: a task becomes a task that remembers who sent it, a note becomes a note. → {state, taskId, noteId} */
export function acceptInbox(s, p, addNote) {
  const { ref, app, item } = p, now = Date.now();
  if (item.type === 'note') {
    const noteId = uid(); const next = addNote(s, { id: noteId, title: item.title, body: [item.text && item.text !== item.title ? item.text : '', item.url].filter(Boolean).join('\n\n'), tags: ['inbox'] });
    return { state: { ...next, inboxLog: { ...next.inboxLog, [ref]: { status: 'accepted', type: 'note', noteId, at: now } } }, noteId };
  }
  const taskId = uid();
  const next = addTask(s, { id: taskId, title: item.title, due: item.date, est: item.minutes, pri: item.pri, notes: [item.text, item.url].filter(Boolean).join('\n'), src: ref, srcApp: app });
  return { state: { ...next, inboxLog: { ...next.inboxLog, [ref]: { status: 'accepted', type: 'task', taskId, at: now } } }, taskId };
}
export const dismissInbox = (s, ref) => ({ ...s, inboxLog: { ...s.inboxLog, [ref]: { status: 'dismissed', at: Date.now() } } });

// ════════════════════════════════════════ the guided start: a light kit
export function starterKit(s) {
  const have = new Set(rec(s.habits).map(h => h.name.toLowerCase()));
  const kit = [
    { name: 'Write in the journal', emoji: '✍️', area: 'calm', freq: { type: 'daily' }, link: LINK_JOURNAL, why: 'Ticks itself when you write an entry' },
    { name: 'Walk 20 minutes', emoji: '🚶', area: 'health', freq: { type: 'daily' }, minutes: 20, why: 'Citrus finds time for it around your shifts' },
    { name: 'Read', emoji: '📚', area: 'learning', freq: { type: 'daily' }, minutes: 20, why: 'Twenty minutes, any book' },
    { name: 'Gym', emoji: '💪', area: 'health', freq: { type: 'weekly', n: 3 }, link: 'orange', why: 'Counts when Orange says you trained' },
    { name: 'Yuzu reviews', emoji: '🍋', area: 'learning', freq: { type: 'daily' }, link: 'yuzu', why: 'Counts when Yuzu says you are done' },
    { name: 'German session', emoji: '🇩🇪', area: 'learning', freq: { type: 'daily' }, link: 'mephisto', why: 'Counts from Mephisto' },
  ];
  return kit.filter(k => !have.has(k.name.toLowerCase()));
}
/** Apps that habits are linked to (their status.json is read to tick the habit). */
export const linkedApps = (s) => [...new Set(activeHabits(s).map(h => (h.link || '').split(':')[0]).filter(a => a && a !== LINK_JOURNAL && a !== 'reading' && /^[a-z][a-z0-9-]{1,30}$/.test(a)))];
