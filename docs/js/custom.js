// Your choices for how Bergamot looks and behaves — synced with your state (settings.custom), unlike the per-device interface.
// Pure: defaults, sanitising and small getters. Settings › Customise edits it.
export const TABS = [['today', 'Today'], ['journal', 'Journal'], ['notes', 'Notes'], ['tasks', 'Tasks'], ['habits', 'Habits']];
export const SECTIONS = [['day', 'Your day'], ['write', 'Today’s page'], ['inbox', 'Inbox'], ['habits', 'Habits'], ['tasks', 'Tasks'], ['onthisday', 'On this day'], ['rate', 'How the day felt'], ['pinned', 'Pinned notes']];
export const ACCENTS = [['bergamot', 'Bergamot', '#c9d86a'], ['teal', 'Teal', '#2fb6a6'], ['sage', 'Sage', '#8fbf8a'], ['honey', 'Honey', '#e7b94a'], ['dusk', 'Dusk', '#8e9bff'], ['rose', 'Rose', '#ec8fa0']];
export const VOICE_LANGS = [['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['ar-SA', 'العربية'], ['de-DE', 'Deutsch']];
export const DEFAULTS = {
  start: 'today',
  tabs: { hidden: [], order: TABS.map(t => t[0]) },
  day: { wake: 8 * 60, late: 23 * 60 },
  journal: { prompts: true, onThisDay: true, voice: 'en-GB', serif: true, defaultMethod: 'journal' },
  today: { sections: { order: [], hidden: [] } },
  look: { accent: 'bergamot', shape: 'bubbly', density: 'comfy', fun: true },
};
const arr = (v, ok) => Array.isArray(v) ? [...new Set(v.filter(x => ok.includes(x)))] : [];
const num = (v, lo, hi, d) => Number.isFinite(+v) && v !== '' && v !== null && v !== undefined ? Math.max(lo, Math.min(hi, Math.round(+v))) : d;
const ids = (l) => l.map(x => Array.isArray(x) ? x[0] : x);
const METHOD_IDS = ['journal', 'daily', 'gratitude', 'stoic'];
/** Clean, complete settings — never trust what came from storage or another device. */
export function custom(s) {
  const c = s?.settings?.custom || {}, t = c.tabs || {};
  const order = [...arr(t.order, ids(TABS)), ...ids(TABS).filter(x => !(t.order || []).includes(x))];
  const hidden = arr(t.hidden, ids(TABS)).filter(x => x !== 'today');
  const dy = c.day || {}, j = c.journal || {}, so = arr(c.today?.sections?.order, ids(SECTIONS)), l = c.look || {};
  const out = {
    start: ids(TABS).includes(c.start) && !hidden.includes(c.start) ? c.start : 'today',
    tabs: { hidden, order },
    day: { wake: num(dy.wake, 4 * 60, 14 * 60, 480), late: num(dy.late, 18 * 60, 26 * 60, 1380) },
    journal: { prompts: j.prompts !== false, onThisDay: j.onThisDay !== false, voice: ids(VOICE_LANGS).includes(j.voice) ? j.voice : 'en-GB', serif: j.serif !== false, defaultMethod: METHOD_IDS.includes(j.defaultMethod) ? j.defaultMethod : 'journal' },
    today: { sections: { order: [...so, ...ids(SECTIONS).filter(x => !so.includes(x))], hidden: arr(c.today?.sections?.hidden, ids(SECTIONS)) } },
    look: { accent: ids(ACCENTS).includes(l.accent) ? l.accent : 'bergamot', shape: ['bubbly', 'classic'].includes(l.shape) ? l.shape : 'bubbly', density: ['comfy', 'compact'].includes(l.density) ? l.density : 'comfy', fun: l.fun !== false },
  };
  if (out.day.late - out.day.wake < 4 * 60) out.day.late = Math.min(26 * 60, out.day.wake + 4 * 60);
  return out;
}
/** Change one part: returns the new state (patch is merged one level deep). */
export function setCustom(s, part, patch) { const cur = custom(s); return { ...s, settings: { ...s.settings, custom: { ...cur, [part]: typeof patch === 'object' && !Array.isArray(patch) ? { ...cur[part], ...patch } : patch } } }; }
export const toggleIn = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];
export function move(list, id, dir) { const i = list.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= list.length) return list; const l = [...list]; [l[i], l[j]] = [l[j], l[i]]; return l; }
export const visibleTabs = (s) => { const c = custom(s); return c.tabs.order.filter(t => !c.tabs.hidden.includes(t)); };
