// Notes: fast capture, Markdown, pinned notes, folders and #tags, checklists inside notes, [[links]] between notes with
// backlinks, a note that turns into a task, a note that links to a goal — and one search across notes and the journal.
// Pure (no DOM, no store). A note: {id, title, body, tags[], folder, pinned, aimId, createdAt, at}.
import { uid, keyOf } from './util.js';
import { addTask } from './mind.js';
import * as J from './journal.js';

const rec = (o) => Object.values(o || {});
const tomb = (s, key) => ({ ...(s.deleted || {}), [key]: Date.now() });
const low = (x) => String(x || '').toLowerCase();

// ════════════════════════════════════════ notes
/** The note's name: its title, else its first line (without Markdown marks). */
export function titleOf(n) { if (!n) return ''; if (n.title?.trim()) return n.title.trim(); const l = String(n.body || '').split('\n').find(x => x.trim()) || ''; return l.replace(/^#+\s*|^[-*]\s*(\[[ xX]\]\s*)?|\*\*|__|`/g, '').trim().slice(0, 80) || 'Untitled'; }
const ownTags = (body) => J.marks(body).tags;
export function addNote(s, f) {
  const id = f.id || uid(), now = Date.now(), body = String(f.body || '').slice(0, 100000), title = String(f.title || '').trim().slice(0, 120);
  if (!title && !body.trim()) return s;
  const n = { id, title, body, tags: [...new Set([...(f.tags || []), ...ownTags(body)].map(low))].slice(0, 30), folder: String(f.folder || '').trim().slice(0, 40), pinned: !!f.pinned, aimId: f.aimId || '', createdAt: f.createdAt || now, at: now };
  return { ...s, notes: { ...s.notes, [id]: n } };
}
export function updateNote(s, id, patch) {
  const n = s.notes?.[id]; if (!n) return s;
  const next = { ...n, ...patch, at: Date.now() };
  if ('body' in patch || 'tags' in patch) next.tags = [...new Set([...(patch.tags || n.tags || []).filter(t => !ownTags(n.body).includes(t) || ownTags(next.body).includes(t)), ...ownTags(next.body)].map(low))].slice(0, 30);
  return { ...s, notes: { ...s.notes, [id]: next } };
}
export function deleteNote(s, id) { const notes = { ...s.notes }; delete notes[id]; return { ...s, notes, deleted: tomb(s, `note:${id}`) }; }
export const togglePin = (s, id) => updateNote(s, id, { pinned: !s.notes?.[id]?.pinned });
/** Pinned first, then the latest edit. */
export const noteList = (s) => rec(s.notes).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.at || 0) - (a.at || 0));
export const folders = (s) => [...new Set(rec(s.notes).map(n => n.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
export function tagCounts(s) { const c = {}; for (const n of rec(s.notes)) for (const t of n.tags || []) c[t] = (c[t] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, n })); }
/** Notes in a folder ('' = all), with a tag ('' = any). */
export const filterNotes = (s, { folder = '', tag = '' } = {}) => noteList(s).filter(n => (!folder || n.folder === folder) && (!tag || (n.tags || []).includes(tag)));

// ════════════════════════════════════════ checklists: "- [ ] milk" lines
const CHECK = /^(\s*[-*]\s+)\[( |x|X)\](\s?)/;
/** {done, total} of the checklist lines in a body. */
export function checklist(body) { let done = 0, total = 0; for (const l of String(body || '').split('\n')) { const m = CHECK.exec(l); if (m) { total++; if (m[2] !== ' ') done++; } } return { done, total }; }
/** Tick or untick the checklist item on line `i` (0-based). Lines that are not checklist items are left alone. */
export function toggleLine(body, i) {
  const lines = String(body || '').split('\n'); const m = CHECK.exec(lines[i] || ''); if (!m) return body;
  lines[i] = lines[i].replace(CHECK, `${m[1]}[${m[2] === ' ' ? 'x' : ' '}]${m[3] || ' '}`); return lines.join('\n');
}

// ════════════════════════════════════════ [[links]] and backlinks
const LINK = /\[\[([^\[\]|\n]{1,120})(?:\|([^\[\]\n]{1,120}))?\]\]/g;
export const linksIn = (txt) => [...new Set([...String(txt || '').matchAll(LINK)].map(m => m[1].trim()))];
export const noteByTitle = (s, title) => { const t = low(title).trim(); return noteList(s).find(n => low(titleOf(n)) === t) || null; };
/** Notes and journal entries that link to this note with [[its title]]. */
export function backlinks(s, note) {
  const t = low(titleOf(note)); if (!t) return { notes: [], entries: [] };
  const has = (txt) => linksIn(txt).some(x => low(x) === t);
  return { notes: noteList(s).filter(n => n.id !== note.id && has(n.body)), entries: J.entriesList(s).filter(e => has(J.entryText(e))) };
}
/** When a note is renamed, [[Old]] links everywhere in your notes follow it. */
export function renameLinks(s, oldTitle, newTitle) {
  if (!oldTitle || !newTitle || low(oldTitle) === low(newTitle)) return s;
  const re = new RegExp(`\\[\\[\\s*${oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\|[^\\]]*)?\\]\\]`, 'gi');
  let notes = s.notes, changed = false;
  for (const n of rec(s.notes)) { const b = String(n.body || '').replace(re, (_, lab) => `[[${newTitle}${lab || ''}]]`); if (b !== n.body) { notes = { ...notes, [n.id]: { ...n, body: b, at: Date.now() } }; changed = true; } }
  return changed ? { ...s, notes } : s;
}

// ════════════════════════════════════════ a note becomes a task
export function noteToTask(s, id, { due = '' } = {}) {
  const n = s.notes?.[id]; if (!n) return { state: s, taskId: '' };
  const taskId = uid(), open = String(n.body || '').split('\n').filter(l => /^\s*[-*]\s+\[ \]/.test(l)).map(l => l.replace(CHECK, '').trim()).slice(0, 8);
  const next = addTask(s, { id: taskId, title: titleOf(n), due, aimId: n.aimId || '', notes: [`From the note “${titleOf(n)}”`, ...open.map(x => `☐ ${x}`)].join('\n'), src: `note:${id}`, srcApp: 'notes' });
  return { state: next, taskId };
}

// ════════════════════════════════════════ Markdown (a small, safe subset): headings, bold, italic, code, quotes, lists,
// checklists (tappable), links (http/https only), [[note links]], #tags and rules. Everything is escaped first.
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function inline(t, ctx) {
  let x = esc(t);
  // finished pieces of HTML are parked behind a marker, so later rules (tags, emphasis) never reach inside a tag or attribute
  const kept = [], keep = (html) => { kept.push(html); return `\u0000${kept.length - 1}\u0000`; };
  x = x.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${c}</code>`));
  x = x.replace(/\[\[([^\[\]|\n]{1,120})(?:\|([^\[\]\n]{1,120}))?\]\]/g, (_, t1, lab) => { const ok = ctx.resolve?.(unesc(t1.trim())); return keep(`<a href="#" class="wl${ok ? '' : ' missing'}" data-note="${t1.trim()}">${lab ? lab.trim() : t1.trim()}</a>`); });
  x = x.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g, (_, lab, u) => keep(`<a href="${u}" target="_blank" rel="noopener">${lab}</a>`));
  x = x.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, u) => pre + keep(`<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '').slice(0, 50)}</a>`));
  x = x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>');
  x = x.replace(/(^|[\s(>])#([\p{L}\p{N}_-]{1,40})/gu, '$1<span class="tag" data-tag="$2">#$2</span>');
  x = x.replace(/(^|[\s(>])@([\p{L}][\p{L}\p{N}_.-]{0,40})/gu, '$1<span class="who">@$2</span>');
  for (let i = 0; i < 3 && /\u0000\d+\u0000/.test(x); i++) x = x.replace(/\u0000(\d+)\u0000/g, (_, i2) => kept[+i2]);
  return x;
}
const unesc = (t) => String(t).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Markdown → HTML string. ctx.resolve(title) says whether a [[link]] exists (missing ones look different). */
export function renderMarkdown(md, ctx = {}) {
  const lines = String(md || '').split('\n'), out = []; let list = null, inCode = false, code = [];
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  lines.forEach((l, i) => {
    if (/^```/.test(l.trim())) { if (inCode) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = []; inCode = false; } else { close(); inCode = true; } return; }
    if (inCode) { code.push(l); return; }
    const ck = CHECK.exec(l);
    if (ck) { if (list !== 'ul') { close(); out.push('<ul class="ck">'); list = 'ul'; } const on = ck[2] !== ' '; out.push(`<li class="ck-li${on ? ' on' : ''}"><button type="button" class="ck-box" data-line="${i}" role="checkbox" aria-checked="${on}" aria-label="${on ? 'Untick' : 'Tick'}"></button><span>${inline(l.replace(CHECK, ''), ctx)}</span></li>`); return; }
    let m;
    if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1], ctx)}</li>`); return; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1], ctx)}</li>`); return; }
    close();
    if (!l.trim()) return;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { out.push(`<h${m[1].length + 2}>${inline(m[2], ctx)}</h${m[1].length + 2}>`); return; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); return; }
    if ((m = /^>\s?(.*)$/.exec(l))) { out.push(`<blockquote>${inline(m[1], ctx)}</blockquote>`); return; }
    out.push(`<p>${inline(l, ctx)}</p>`);
  });
  if (inCode) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  close();
  return out.join('');
}
/** A note as a Markdown file. */
export const noteMarkdown = (n) => `# ${titleOf(n)}\n\n${n.folder ? `Folder: ${n.folder}  \n` : ''}${(n.tags || []).length ? `Tags: ${n.tags.map(t => '#' + t).join(' ')}\n\n` : ''}${n.title?.trim() ? n.body : String(n.body || '').split('\n').slice(1).join('\n')}`.trim() + '\n';
export const allNotesMarkdown = (s) => noteList(s).map(noteMarkdown).join('\n---\n\n');

// ════════════════════════════════════════ one search across notes and the journal
/** Words must all appear (any order); "#tag", "@person" and "+place" match those marks exactly. → [{kind, id, title, snippet, date, score}] */
export function searchAll(s, q, { journal = true, limit = 40 } = {}) {
  const words = low(q).split(/\s+/).filter(Boolean); if (!words.length) return [];
  const test = (txt, m) => words.every(w => {
    if (/^#./.test(w)) return (m.tags || []).includes(w.slice(1));
    if (/^@./.test(w)) return (m.people || []).some(p => low(p).replace(/\s/g, '_').startsWith(w.slice(1)));
    if (/^\+./.test(w)) return (m.places || []).some(p => low(p).replace(/\s/g, '_').startsWith(w.slice(1)));
    return txt.includes(w);
  });
  const snip = (txt) => { const i = low(txt).indexOf(words.find(w => !/^[#@+]/.test(w)) || '\u0000'); const t = txt.replace(/\s+/g, ' '); if (i < 0) return t.slice(0, 110); const a = Math.max(0, i - 40); return (a ? '…' : '') + t.slice(a, a + 110); };
  const out = [];
  for (const n of rec(s.notes)) { const txt = `${titleOf(n)}\n${n.body}\n${n.folder}`; if (test(low(txt), { tags: n.tags, ...J.marks(n.body) })) out.push({ kind: 'note', id: n.id, title: titleOf(n), snippet: snip(n.body || ''), date: keyOf(new Date(n.at || 0)), score: (low(titleOf(n)).includes(words[0]) ? 2 : 0) + (n.pinned ? 1 : 0), at: n.at || 0 }); }
  if (journal) for (const e of rec(s.journal)) { const txt = J.entryText(e); if (test(low(txt), e)) out.push({ kind: 'entry', id: e.id, title: `${J.methodOf(e.method).name} · ${e.date.split('-').reverse().join('/')}`, snippet: snip(txt), date: e.date, score: 0, at: e.at || 0 }); }
  return out.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date) || b.at - a.at).slice(0, limit);
}
