// Taking over Mind from Citrus (pure). Bergamot reads My Apps/hub/citrus/state.json (or a Citrus backup file) once and copies
// what it now owns: tasks, habits and their ticks, reflections (they become journal entries), the day log, memos (they become
// notes), Citrus's day notes (dateKey → text: they become free-write journal entries), the task and habit calendar
// reminders, and the matching tombstones — so something you deleted in Citrus stays deleted. Goals (aims, resolutions,
// yearMeta) stay in Citrus Plan, and the media library stays until Sudachi; tasks and habits keep their aimId, which resolves
// against plan.json › goals.aims. It never writes into Citrus's file. Running it twice is harmless: newest edit wins.
import { mergeStates, sanitize } from './store.js';
import { marks } from './journal.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const DAY = /^\d{4}-\d\d-\d\d$/;
const at = (v) => +v?.at || +v?.createdAt || 1;
// Citrus tombstone prefix → Bergamot's
const TOMBS = { task: 'task', habit: 'habit', refl: 'jrnl', memo: 'note', daylog: 'daylog', rem: 'rem', note: 'jrnl' };

/** The Mind part of a Citrus state, shaped as a Bergamot state. → {part, counts} (part is null when there is nothing to take). */
export function mindPart(citrus) {
  if (!isObj(citrus)) return { part: null, counts: {} };
  const part = { updatedAt: +citrus.updatedAt || 0, stamps: {}, deleted: {}, settings: {}, tasks: {}, habits: {}, habitLog: {}, journal: {}, notes: {}, dayLog: {}, reminders: {} }, counts = {};
  const n = (k) => { counts[k] = (counts[k] || 0) + 1; };
  for (const [id, t] of Object.entries(isObj(citrus.tasks) ? citrus.tasks : {})) if (isObj(t) && (typeof t.title === 'string' || typeof t.title === 'number') && String(t.title).trim()) { part.tasks[id] = { ...t, id, title: String(t.title), at: at(t) }; n('tasks'); }
  for (const [id, h] of Object.entries(isObj(citrus.habits) ? citrus.habits : {})) if (isObj(h) && typeof h.name === 'string' && h.name.trim()) {
    part.habits[id] = { ...h, id, link: h.link === 'reading' ? '' : h.link || '', freq: isObj(h.freq) ? h.freq : { type: 'daily' }, at: at(h) }; n('habits');
    const log = citrus.habitLog?.[id];
    if (isObj(log)) { const cells = {}; for (const [d, c] of Object.entries(log)) if (DAY.test(d) && isObj(c)) cells[d] = { v: c.v ? 1 : 0, at: +c.at || 1 }; if (Object.keys(cells).length) { part.habitLog[id] = cells; counts.ticks = (counts.ticks || 0) + Object.keys(cells).length; } }
  }
  for (const [id, r] of Object.entries(isObj(citrus.reflections) ? citrus.reflections : {})) if (isObj(r) && DAY.test(r.date || '')) {
    const answers = isObj(r.answers) ? r.answers : {}, text = r.method === 'journal' && typeof answers.text === 'string' ? answers.text : '';
    const { text: _t, ...rest } = answers;
    const e = { id, date: r.date, method: r.method || 'journal', text, answers: r.method === 'journal' ? rest : answers, mood: +r.mood || 0, energy: +r.energy || 0, rating: +r.rating || 0, aimIds: r.aimId ? [r.aimId] : [], createdAt: +r.createdAt || at(r), at: at(r) };
    if (r.scores && isObj(r.scores)) e.scores = r.scores;
    part.journal[id] = withMarks(e); n('entries');
  }
  // Citrus's day notes: one free-write entry per day ("day:<date>" so a second run lands on the same entry)
  for (const [d, txt] of Object.entries(isObj(citrus.notes) ? citrus.notes : {})) if (DAY.test(d) && typeof txt === 'string' && txt.trim()) {
    const id = `day-${d}`, t = +citrus.stamps?.[`note:${d}`] || +citrus.updatedAt || 1;
    part.journal[id] = withMarks({ id, date: d, method: 'journal', text: txt, answers: {}, mood: 0, energy: 0, tags: ['day-note'], createdAt: t, at: t }); n('day notes');
  }
  for (const [id, m] of Object.entries(isObj(citrus.memos) ? citrus.memos : {})) if (isObj(m) && (String(m.title || '').trim() || String(m.body || '').trim())) {
    part.notes[id] = { id, title: String(m.title || ''), body: String(m.body || ''), tags: Array.isArray(m.tags) ? m.tags.map(x => String(x).toLowerCase()) : [], folder: '', pinned: !!m.pinned, aimId: m.aimId || '', createdAt: +m.createdAt || at(m), at: at(m) }; n('notes');
  }
  for (const [d, l] of Object.entries(isObj(citrus.dayLog) ? citrus.dayLog : {})) if (DAY.test(d) && isObj(l) && +l.score >= 1 && +l.score <= 5) { part.dayLog[d] = { key: d, score: Math.round(+l.score), note: String(l.note || ''), at: at(l) }; n('rated days'); }
  for (const [k, r] of Object.entries(isObj(citrus.reminders) ? citrus.reminders : {})) if (/^(task|habit):/.test(k) && isObj(r) && r.eventId) part.reminders[k] = { ...r, at: at(r) };
  for (const [k, t] of Object.entries(isObj(citrus.deleted) ? citrus.deleted : {})) {
    const [pre, ...rest] = k.split(':'), to = TOMBS[pre]; if (!to || !Number.isFinite(+t)) continue;
    const id = pre === 'note' ? `day-${rest.join(':')}` : rest.join(':');
    if (pre === 'rem' && !/^(task|habit):/.test(id)) continue;
    part.deleted[`${to}:${id}`] = +t;
  }
  for (const k of ['alarmPlan']) if (Number.isFinite(+citrus.settings?.[k])) part.settings[k] = +citrus.settings[k];
  const any = ['tasks', 'habits', 'entries', 'day notes', 'notes', 'rated days'].some(k => counts[k]);
  return { part: any ? sanitize(part) : null, counts };
}
function withMarks(e) { const txt = [e.text, ...Object.values(e.answers || {}).flat()].join('\n'), m = marks(txt); return { ...e, tags: [...new Set([...(e.tags || []), ...m.tags])], people: m.people, places: m.places }; }

/** Merge the Mind part into this device's state. Local edits that are newer win; nothing local is lost. */
export function applyMigration(local, citrus, { source = 'citrus' } = {}) {
  const { part, counts } = mindPart(citrus);
  if (!part) return { state: local, counts, changed: false };
  const settings = { ...(local.settings || {}) };
  if (part.settings.alarmPlan !== undefined && !local.stamps?.['set:alarmPlan']) settings.alarmPlan = part.settings.alarmPlan;
  const merged = mergeStates(local, { ...local, ...part, settings, stamps: { ...(local.stamps || {}) }, deleted: { ...(local.deleted || {}), ...part.deleted }, updatedAt: Math.max(local.updatedAt || 0, part.updatedAt) });
  merged.settings = { ...merged.settings, alarmPlan: settings.alarmPlan ?? merged.settings.alarmPlan };
  merged.migrated = { from: source, at: Date.now(), counts };
  return { state: merged, counts, changed: true };
}
const ORDER = [['tasks', 'task'], ['habits', 'habit'], ['entries', 'journal entry', 'journal entries'], ['day notes', 'day note'], ['notes', 'note'], ['rated days', 'rated day']];
/** "12 tasks · 4 habits · 30 journal entries" for the confirmation and the toast. */
export function describe(counts) { const l = ORDER.filter(([k]) => counts?.[k]).map(([k, one, many]) => `${counts[k]} ${counts[k] === 1 ? one : many || k}`); return l.join(' · ') || 'nothing of Mind'; }
const CITRUS_ONLY = ['rotas', 'goals', 'plan', 'aims', 'media', 'study', 'swaps', 'friends', 'chores', 'resolutions', 'reflections', 'memos'];
/** A backup that is not Bergamot's own: anything without app:"bergamot" that holds a Citrus-only key. */
export function looksLikeCitrus(j) { return isObj(j) && j.app !== 'bergamot' && (j.app === 'citrus' || CITRUS_ONLY.some(k => k in j)); }
