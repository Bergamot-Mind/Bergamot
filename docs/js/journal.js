// The journal: daily entries with mood and energy, the reflection methods (ported from Citrus mind.js › METHODS), prompts that
// know your shifts, "on this day", gentle streaks, mood against your shifts, and Markdown export. Pure (no DOM, no store).
// An entry: {id, date, method, text, answers, mood 1–5, energy 1–5, rating, scores, tags[], people[], places[], aimIds[], createdAt, at}.
// #tag, @person and +place written anywhere in an entry are picked up as its tags, people and places.
import { keyOf, fromKey, addDays, startOfDay, uid, fmtDate, DAY_NAMES, MONTHS } from './util.js';
import { AREAS, weekStartOf } from './mind.js';

const rec = (o) => Object.values(o || {});
const tomb = (s, key) => ({ ...(s.deleted || {}), [key]: Date.now() });

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
export const MOOD_WORDS = ['Low', 'Meh', 'Okay', 'Good', 'Great'];
export const ENERGY_WORDS = ['Drained', 'Tired', 'Steady', 'Awake', 'Buzzing'];
export const DAILY = new Set(['daily', 'gratitude', 'stoic', 'journal']);
export const METHODS = [
  { id: 'journal', name: 'Free write', cadence: 'Anytime', blurb: 'No structure. Get it out of your head.', mood: true, fields: [{ k: 'text', label: '', type: 'long' }] },
  { id: 'daily', name: 'Evening check-in', cadence: 'Daily', blurb: 'Two minutes: how the day went, what worked, what tomorrow needs.', mood: true,
    fields: [{ k: 'wins', label: 'Three wins today', type: 'lines', n: 3 }, { k: 'lesson', label: 'One lesson', type: 'text' }, { k: 'tomorrow', label: 'Top three for tomorrow', type: 'lines', n: 3, toTasks: true }] },
  { id: 'gratitude', name: 'Gratitude', cadence: 'Daily', blurb: 'Three small good things. It trains attention toward what is working.',
    fields: [{ k: 'three', label: 'Three things I appreciate', type: 'lines', n: 3 }] },
  { id: 'stoic', name: 'Stoic review', cadence: 'Daily', blurb: 'Seneca’s evening audit, without the mysticism: well done, fell short, do differently.', mood: true,
    fields: [{ k: 'well', label: 'What did I do well?', type: 'text' }, { k: 'short', label: 'Where did I fall short?', type: 'text' }, { k: 'change', label: 'What will I do differently tomorrow?', type: 'text' }] },
  { id: 'weekly', name: 'Weekly review', cadence: 'Weekly', blurb: 'Look back, learn, and choose next week’s focus.', stats: true, rating: true,
    fields: [{ k: 'wins', label: 'What went well', type: 'text' }, { k: 'blockers', label: 'What got in the way', type: 'text' }, { k: 'learned', label: 'What I learned', type: 'text' }, { k: 'focus', label: 'Focus for next week (up to 3)', type: 'lines', n: 3, toTasks: true }] },
  { id: 'ssc', name: 'Start · Stop · Continue', cadence: 'Monthly', blurb: 'One honest pass over habits and routines.',
    fields: [{ k: 'start', label: 'Start doing', type: 'text' }, { k: 'stop', label: 'Stop doing', type: 'text' }, { k: 'continue', label: 'Keep doing', type: 'text' }] },
  { id: 'wheel', name: 'Wheel of life', cadence: 'Monthly', blurb: 'Rate eight areas 1–10 to see what is thriving and what is starved.', wheel: true,
    fields: [{ k: 'note', label: 'What stands out?', type: 'text' }] },
  { id: 'premortem', name: 'Pre-mortem', cadence: 'Per goal', blurb: 'Imagine the goal failed. Why? Then fix it before it happens.', aim: true,
    fields: [{ k: 'fail', label: 'It is six months later and this failed. What went wrong?', type: 'text' }, { k: 'signs', label: 'Early warning signs I would see', type: 'text' }, { k: 'prevent', label: 'What I will do now to prevent it', type: 'text' }] },
  { id: 'yearend', name: 'Year in review', cadence: 'Yearly', blurb: 'Close the year: proud of, hard, learned, and the word for the next.', rating: true,
    fields: [{ k: 'proud', label: 'What I am proudest of', type: 'text' }, { k: 'hard', label: 'What was hardest', type: 'text' }, { k: 'learned', label: 'What I learned', type: 'text' }, { k: 'word', label: 'My word for next year', type: 'text' }] },
];
export const methodOf = (id) => METHODS.find(m => m.id === id) || METHODS[0];

// ════════════════════════════════════════ tags, people, places
const TAG = /(^|[\s(])#([\p{L}\p{N}_-]{1,40})/gu, PERSON = /(^|[\s(])@([\p{L}][\p{L}\p{N}_.-]{0,40})/gu, PLACE = /(^|[\s(])\+([\p{L}][\p{L}\p{N}_-]{0,40})/gu;
const pick = (txt, re) => [...new Set([...String(txt || '').matchAll(re)].map(m => m[2].replace(/[._-]+$/, '')))];
/** {tags, people, places} written in a text: "#work", "@Sara", "+Riyadh" (underscores read as spaces: "@Dr_Ann" → "Dr Ann"). */
export function marks(txt) {
  const sp = (x) => x.replace(/_/g, ' ');
  const u = (l) => [...new Set(l)];
  return { tags: u(pick(txt, TAG).map(x => x.toLowerCase())), people: u(pick(txt, PERSON).map(sp)), places: u(pick(txt, PLACE).map(sp)) };
}
/** Everything an entry says, as one text (search, export, marks). */
export function entryText(e) {
  if (!e) return '';
  const m = methodOf(e.method), parts = [];
  if (e.text) parts.push(e.text);
  for (const f of m.fields) { const v = e.answers?.[f.k]; if (f.k === 'text' && e.text) continue; if (Array.isArray(v) ? v.length : v) parts.push(Array.isArray(v) ? v.join('\n') : String(v)); }
  for (const [k, v] of Object.entries(e.answers || {})) if (!m.fields.some(f => f.k === k) && v) parts.push(Array.isArray(v) ? v.join('\n') : String(v));
  return parts.join('\n\n');
}
/** First words of an entry, for lists. */
export function preview(e, n = 90) { const t = entryText(e).trim().replace(/\s*\n+\s*/g, ' · ').replace(/\s+/g, ' '); return t.length > n ? `${t.slice(0, n - 1)}…` : t; }

// ════════════════════════════════════════ entries
/** Save an entry (new or edited). Marks are read from the words; tags you set by hand stay. */
export function saveEntry(s, e) {
  const id = e.id || uid(), now = Date.now(), cur = s.journal?.[id];
  const text = String(e.text ?? cur?.text ?? '').slice(0, 50000);
  const answers = {}; for (const [k, v] of Object.entries(e.answers ?? cur?.answers ?? {})) answers[k] = Array.isArray(v) ? v.map(x => String(x).slice(0, 400)).filter(Boolean).slice(0, 10) : String(v || '').slice(0, 8000);
  const date = /^\d{4}-\d\d-\d\d$/.test(e.date || '') ? e.date : cur?.date || keyOf(new Date());
  const draft = { ...(cur || {}), ...e, id, date, method: methodOf(e.method || cur?.method).id, text, answers };
  const mk = marks(entryText(draft));
  const own = (k) => [...new Set([...(Array.isArray(e[k]) ? e[k] : cur?.[`${k}Own`] || []), ...mk[k]].map(x => String(x).slice(0, 40)))].slice(0, 30);
  const out = { ...draft, mood: clampScore(draft.mood), energy: clampScore(draft.energy), rating: clampScore(draft.rating), tags: own('tags'), people: own('people'), places: own('places'),
    tagsOwn: Array.isArray(e.tags) ? e.tags : cur?.tagsOwn || [], aimIds: Array.isArray(draft.aimIds) ? draft.aimIds.slice(0, 6) : [], createdAt: cur?.createdAt || e.createdAt || now, at: now };
  return { ...s, journal: { ...s.journal, [id]: out } };
}
const clampScore = (v) => { const n = Math.round(+v || 0); return n >= 1 && n <= 5 ? n : 0; };
export function deleteEntry(s, id) { const journal = { ...s.journal }; delete journal[id]; return { ...s, journal, deleted: tomb(s, `jrnl:${id}`) }; }
export const entriesList = (s) => rec(s.journal).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
export const entriesOn = (s, key) => rec(s.journal).filter(e => e.date === key).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
export const wroteOn = (s, key) => rec(s.journal).some(e => e.date === key);
/** The entry to reopen for a method today (this week's for the weekly review), so a second tap never starts a blank copy. */
export function findEntry(s, method, dateKey, aimId = '') {
  const ws = method === 'weekly' ? keyOf(weekStartOf(fromKey(dateKey))) : '', we = ws ? keyOf(addDays(fromKey(ws), 6)) : '';
  return rec(s.journal).filter(r => r.method === method && (ws ? r.date >= ws && r.date <= we : r.date === dateKey) && (method !== 'premortem' || (r.aimIds?.[0] || '') === (aimId || '')))
    .sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
}

// ════════════════════════════════════════ on this day
const sameDayBack = (now, months) => { const d = new Date(now.getFullYear(), now.getMonth() - months, 1), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(now.getDate(), last)); return d; };
/** What you wrote one month ago and one year ago (and every year before that), with the date it was. */
export function onThisDay(s, now = new Date()) {
  const out = [];
  const month = keyOf(sameDayBack(now, 1)), m = entriesOn(s, month);
  if (m.length) out.push({ label: 'A month ago', date: month, entries: m });
  for (let y = 1; y <= 10; y++) { const k = keyOf(sameDayBack(now, 12 * y)), l = entriesOn(s, k); if (l.length) out.push({ label: y === 1 ? 'A year ago' : `${y} years ago`, date: k, entries: l }); }
  return out;
}

// ════════════════════════════════════════ streaks without guilt
/** How much you have written, said kindly: days this week and month, the current run (today can still happen, and one quiet
 *  day does not end it: `grace`), the longest run, the total. Never a "broken" streak. */
export function writingStats(s, now = new Date()) {
  const days = new Set(rec(s.journal).map(e => e.date)), tk = keyOf(now), ws = weekStartOf(now);
  let week = 0; for (let i = 0; i < 7; i++) if (days.has(keyOf(addDays(ws, i)))) week++;
  const ym = tk.slice(0, 7); const month = [...days].filter(d => d.startsWith(ym) && d <= tk).length;
  // the run: consecutive days written, where a single quiet day in between is forgiven (a night shift, a long day)
  let d = startOfDay(now), run = 0, gaps = 0;
  if (!days.has(tk)) d = addDays(d, -1);
  for (let i = 0; i < 800; i++) {
    if (days.has(keyOf(d))) { run++; gaps = 0; }
    else if (++gaps > 1 || !days.has(keyOf(addDays(d, -1)))) break;
    d = addDays(d, -1);
  }
  const sorted = [...days].sort(); let best = 0, cur = 0, prev = null;
  for (const k of sorted) { const gap = prev ? Math.round((fromKey(k) - fromKey(prev)) / 86400000) : 1; cur = gap <= 2 ? cur + 1 : 1; best = Math.max(best, cur); prev = k; }
  return { today: days.has(tk), week, month, run, best: Math.max(best, run), total: rec(s.journal).length, days: days.size };
}
/** One kind line for the header: never scolds. */
export function streakLine(st) {
  if (!st.total) return 'Your first entry starts here.';
  if (st.today) return st.run > 1 ? `${st.run} days in a row · written today` : 'Written today';
  if (st.run > 1) return `${st.run} days in a row · today is still open`;
  return st.week ? `${st.week} day${st.week > 1 ? 's' : ''} written this week` : 'Whenever you are ready.';
}

// ════════════════════════════════════════ prompts that know your shifts
const PROMPTS = {
  postnight: ['You are coming off a night. How did it go, and how do you feel now that it is over?', 'After the night: one thing you handled well, one thing you want to let go of before you sleep.'],
  'first-night': ['Nights start tonight. What do you need to sort before you disappear into them?', 'Before the night run: what would make these nights easier on you?'],
  night: ['Between nights. How are you holding up — sleep, food, mood?', 'Mid-run of nights: what is keeping you going?'],
  day: ['A long day on shift. One thing that went well, one you would do differently.', 'After twelve hours: what is still on your mind from the ward?'],
  evening: ['An evening shift ahead or behind you. What did today hold before it?'],
  beforeNights: ['Your nights start tomorrow. How do you want to spend today?', 'Last free day before the nights: what would make it feel like rest?'],
  off: ['A day off. What would make it feel like rest?', 'Nothing on the rota today. What did you do with the space?'],
  leave: ['On leave. What are you noticing now that the rota has stopped?'],
  unknown: ['What is on your mind?', 'How was today, honestly?'],
};
/** The prompt for now: {kind, text, method}. `days`: {today, tomorrow} dayKind results from day.js (kind strings). */
export function promptFor(now = new Date(), days = {}, s = null) {
  const k = days.today || 'unknown', tomorrow = days.tomorrow || 'unknown', hr = now.getHours();
  let kind = k;
  if ((k === 'off' || k === 'leave' || k === 'unknown') && tomorrow === 'first-night') kind = 'beforeNights';
  if (k === 'postnight' && tomorrow !== 'first-night' && hr >= 17) kind = 'off';
  const list = PROMPTS[kind] || PROMPTS.unknown, text = list[(now.getDate() + (s ? rec(s.journal).length : 0)) % list.length];
  return { kind, text, method: 'journal' };
}
/** Which method fits right now (weekend: close the week; a new month: the wheel; evening: check-in; morning: gratitude). */
export function suggestMethod(s, now = new Date()) {
  const today = keyOf(now), ws = keyOf(weekStartOf(now)), we = keyOf(addDays(weekStartOf(now), 6));
  const did = (m, test) => rec(s.journal).some(r => r.method === m && test(r.date));
  if ([5, 6].includes(now.getDay()) && !did('weekly', d => d >= ws && d <= we)) return { method: 'weekly', why: 'The weekend is the moment to close the week.' };
  if (now.getDate() <= 5 && !did('wheel', d => d.slice(0, 7) === today.slice(0, 7))) return { method: 'wheel', why: 'A new month: see which areas of life got starved.' };
  if (now.getHours() >= 17 && !did('daily', d => d === today)) return { method: 'daily', why: 'Close the day in two minutes.' };
  if (now.getHours() < 12 && !did('gratitude', d => d === today)) return { method: 'gratitude', why: 'A calm start: three good things.' };
  return { method: 'journal', why: 'Whenever you are ready.' };
}
export function latestWheel(s, n = 2) { return rec(s.journal).filter(r => r.method === 'wheel' && r.scores).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at).slice(0, n); }
export const wheelAreas = () => AREAS;

// ════════════════════════════════════════ mood and energy
/** Per day: average mood and energy from your entries, and the day-log score. */
export function moodSeries(s, days, now = new Date()) {
  const by = {}; for (const r of rec(s.journal)) if (r.mood || r.energy) (by[r.date] ||= []).push(r);
  return Array.from({ length: days }, (_, i) => {
    const k = keyOf(addDays(startOfDay(now), i - days + 1)), l = by[k] || [];
    const avg = (f) => { const v = l.map(x => x[f]).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    return { date: k, mood: avg('mood'), energy: avg('energy'), day: s.dayLog?.[k]?.score || null };
  });
}
export function weekMood(s, now = new Date()) { const l = moodSeries(s, 7, now).map(x => x.mood).filter(x => x != null); return l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length * 10) / 10 : null; }
export function moodToday(s, now = new Date()) { return moodSeries(s, 1, now)[0].mood; }
export const SHIFT_GROUPS = [['day', 'Day shifts', ['day', 'evening']], ['night', 'Nights', ['night', 'first-night']], ['postnight', 'After a night', ['postnight']], ['off', 'Days off', ['off', 'leave']]];
/** Mood and energy by the kind of day it was (your shifts), over `days`. kindOf(date) → day.js kind. Groups need 3 entries to show. */
export function moodByShift(s, kindOf, now = new Date(), days = 120) {
  const from = keyOf(addDays(now, -days)), groups = Object.fromEntries(SHIFT_GROUPS.map(([id, label]) => [id, { id, label, mood: [], energy: [], day: [] }]));
  const groupOf = (k) => SHIFT_GROUPS.find(g => g[2].includes(k))?.[0];
  const dates = new Set([...rec(s.journal).filter(e => e.mood || e.energy).map(e => e.date), ...Object.keys(s.dayLog || {})]);
  for (const d of dates) {
    if (d < from || d > keyOf(now)) continue; const g = groups[groupOf(kindOf(fromKey(d)))]; if (!g) continue;
    for (const e of entriesOn(s, d)) { if (e.mood) g.mood.push(e.mood); if (e.energy) g.energy.push(e.energy); }
    if (s.dayLog?.[d]?.score) g.day.push(s.dayLog[d].score);
  }
  const avg = (l) => l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length * 10) / 10 : null;
  return Object.values(groups).map(g => ({ id: g.id, label: g.label, n: Math.max(g.mood.length, g.day.length), mood: avg(g.mood), energy: avg(g.energy), day: avg(g.day) })).filter(g => g.n >= 3);
}
/** One plain sentence when the shifts make a real difference (≥ 0.7 points between the best and the worst group). */
export function shiftInsight(groups) {
  const l = groups.filter(g => g.mood != null); if (l.length < 2) return '';
  const sorted = [...l].sort((a, b) => b.mood - a.mood), hi = sorted[0], lo = sorted[sorted.length - 1];
  return hi.mood - lo.mood >= 0.7 ? `Your mood is highest on ${hi.label.toLowerCase()} (${hi.mood}/5) and lowest ${lo.id === 'postnight' ? 'after a night' : `on ${lo.label.toLowerCase()}`} (${lo.mood}/5).` : '';
}

// ════════════════════════════════════════ tags and people across the journal
export function markCloud(s) {
  const c = { tags: {}, people: {}, places: {} };
  for (const e of rec(s.journal)) for (const k of ['tags', 'people', 'places']) for (const x of e[k] || []) c[k][x] = (c[k][x] || 0) + 1;
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, n }));
  return { tags: top(c.tags), people: top(c.people), places: top(c.places) };
}

// ════════════════════════════════════════ export
const longDate = (k) => { const d = fromKey(k); return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
/** Your journal as Markdown, oldest first (from/to: date keys, both optional). */
export function toMarkdown(s, { from = '', to = '' } = {}) {
  const list = entriesList(s).filter(e => (!from || e.date >= from) && (!to || e.date <= to)).reverse();
  const out = [`# Journal${from || to ? ` · ${from ? fmtDate(fromKey(from)) : '…'} – ${to ? fmtDate(fromKey(to)) : '…'}` : ''}`, ''];
  let day = '';
  for (const e of list) {
    if (e.date !== day) { out.push(`## ${longDate(e.date)}`, ''); day = e.date; }
    const m = methodOf(e.method), bits = [];
    if (e.mood) bits.push(`mood ${MOODS[e.mood - 1]} ${e.mood}/5`); if (e.energy) bits.push(`energy ${e.energy}/5`); if (e.rating) bits.push(`rated ${e.rating}/5`);
    out.push(`### ${m.name}${bits.length ? ` · ${bits.join(' · ')}` : ''}`, '');
    if (e.text) out.push(e.text, '');
    for (const f of m.fields) { if (f.k === 'text') continue; const v = e.answers?.[f.k]; if (!(Array.isArray(v) ? v.length : v)) continue; out.push(`**${f.label || f.k}**`, ''); out.push(Array.isArray(v) ? v.map(x => `- ${x}`).join('\n') : String(v), ''); }
    if (e.scores) out.push(AREAS.map(a => `- ${a.name}: ${e.scores[a.id] || 0}/10`).join('\n'), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
