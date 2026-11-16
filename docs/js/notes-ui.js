// The Notes tab and the note editor. Fast capture, pinned notes, folders and #tags, search across notes and the journal,
// Markdown with tappable checklists, [[links]] with backlinks, a note that becomes a task, a goal link, export.
// The editor saves as you type (a moment after you stop), so a note is never lost to a closed sheet.
import { h, toast, keyOf, fromKey, fmtDate, uid } from './util.js';
import * as N from './notes.js';
import * as CZ from './custom.js';
import { ctx, S, up, now, field, aimSelect, aimTitle, confirmBtn, undoToast, plural, micButton, download } from './bits.js';
import { printPages } from './journal-ui.js';

const ui = { folder: '', tag: '', q: '' };
export function notesPart(p) { if (p === 'all') { ui.folder = ''; ui.tag = ''; } }
const strip = (t) => String(t || '').replace(/^#+\s*/gm, '').replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1').replace(/\*\*|__|`/g, '').replace(/^\s*[-*]\s+\[[xX]\]\s*/gm, '☑ ').replace(/^\s*[-*]\s+\[ \]\s*/gm, '☐ ').replace(/\s+/g, ' ').trim();
const ago = (t) => { const d = Math.round((Date.now() - t) / 60000); return d < 2 ? 'just now' : d < 60 ? `${d} min ago` : d < 1440 ? `${Math.round(d / 60)} h ago` : fmtDate(new Date(t)); };

function capture() {
  const ta = h('textarea', { class: 'nc-in', rows: 2, placeholder: 'A quick note… the first line is its title. #tag', 'aria-label': 'Quick note', 'data-nodirty': '1' });
  const add = () => { const v = ta.value.trim(); if (!v) return; const lines = v.split('\n'), id = uid(); up(s => N.addNote(s, { id, title: lines.length > 1 ? lines[0].replace(/^#+\s*/, '').slice(0, 120) : '', body: lines.length > 1 ? lines.slice(1).join('\n').trim() : v, folder: ui.folder })); ta.value = ''; toast('Note saved', 'ok', { action: { label: 'Open', run: () => noteSheet(id) } }); ctx.refocus = '.nc-in'; };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } });
  return h('div', { class: 'card cap nc' }, ta, h('div', { class: 'row', style: { marginTop: '8px' } }, micButton(ta, CZ.custom(S()).journal.voice), h('span', { class: 'tiny dim grow' }, 'Ctrl + Enter saves'), h('button', { class: 'btn sm', onClick: () => noteSheet(null, { folder: ui.folder }) }, 'Full editor'), h('button', { class: 'btn sm primary', onClick: add }, 'Save note')));
}
function noteCard(n) {
  const ck = N.checklist(n.body), aim = aimTitle(n.aimId), pre = strip(n.title?.trim() ? n.body : String(n.body || '').split('\n').slice(1).join('\n'));
  return h('div', { class: `ncard clickable ${n.pinned ? 'pinned' : ''}`, onClick: () => noteSheet(n.id) },
    h('div', { class: 'row' }, h('b', { class: 'grow nt' }, N.titleOf(n)), n.pinned ? h('span', { class: 'pin', title: 'Pinned', 'aria-label': 'Pinned' }, '📌') : null),
    pre ? h('div', { class: 'np' }, pre.slice(0, 160)) : null,
    h('div', { class: 'msub' }, ck.total ? h('span', { class: ck.done === ck.total ? 'ok' : '' }, `☑ ${ck.done}/${ck.total}`) : null, n.folder ? h('span', {}, `📁 ${n.folder}`) : null, ...(n.tags || []).slice(0, 3).map(t => h('span', { class: 'tag' }, `#${t}`)), aim ? h('span', { class: 'goal' }, `◆ ${aim}`) : null, h('span', { class: 'dim' }, ago(n.at))));
}
export function renderNotes() {
  const s = S(), all = N.noteList(s), fl = N.folders(s), tags = N.tagCounts(s), q = ui.q.trim();
  let list = N.filterNotes(s, { folder: ui.folder, tag: ui.tag });
  const head = h('div', { class: 'pg-head' }, h('h1', {}, 'Notes'), h('div', { class: 'small muted' }, all.length ? `${plural(all.length, 'note')}${fl.length ? ` · ${plural(fl.length, 'folder')}` : ''}` : 'Quick thoughts, lists and longer pages'));
  const search = h('input', { type: 'search', class: 'nt-search', value: ui.q, placeholder: ctx.journalOpen() ? 'Search notes and the journal' : 'Search notes (the journal is locked)', 'aria-label': 'Search notes and the journal', onInput: (e) => { ui.q = e.target.value; ctx.render(); ctx.refocus = '.nt-search'; } });
  const out = [head, capture(), all.length || q ? h('div', { class: 'card slim' }, search) : null];
  if (q) {
    const hits = N.searchAll(s, q, { journal: ctx.journalOpen(), limit: 60 });
    out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, hits.length ? `${plural(hits.length, 'match', 'matches')}` : 'Nothing matches'), h('div', { class: 'mlist' }, hits.map(x => h('div', { class: 'mrow clickable', onClick: () => x.kind === 'note' ? noteSheet(x.id) : ctx.readEntry(x.id) }, h('span', { class: 'mood', 'aria-hidden': 'true' }, x.kind === 'note' ? '📝' : '📔'), h('div', { class: 'grow' }, h('div', { class: 'mtitle' }, x.title), h('div', { class: 'msub' }, x.snippet)))))));
    return out;
  }
  if (fl.length || tags.length) out.push(h('div', { class: 'chips nt-filters' }, h('button', { class: `chip ${!ui.folder && !ui.tag ? 'sel' : ''}`, onClick: () => { ui.folder = ''; ui.tag = ''; ctx.render(); } }, 'All'),
    ...fl.map(f => h('button', { class: `chip ${ui.folder === f ? 'sel' : ''}`, 'aria-pressed': String(ui.folder === f), onClick: () => { ui.folder = ui.folder === f ? '' : f; ctx.render(); } }, `📁 ${f}`)),
    ...tags.slice(0, 12).map(t => h('button', { class: `chip ${ui.tag === t.name ? 'sel' : ''}`, 'aria-pressed': String(ui.tag === t.name), onClick: () => { ui.tag = ui.tag === t.name ? '' : t.name; ctx.render(); } }, `#${t.name}`))));
  const pinned = list.filter(n => n.pinned), rest = list.filter(n => !n.pinned);
  if (pinned.length) out.push(h('div', { class: 'sect' }, 'Pinned'), h('div', { class: 'ngrid' }, pinned.map(noteCard)));
  if (rest.length) out.push(pinned.length ? h('div', { class: 'sect' }, 'Notes') : null, h('div', { class: 'ngrid' }, rest.map(noteCard)));
  if (!list.length) out.push(h('div', { class: 'card empty' }, h('p', {}, all.length ? 'No notes here.' : 'Notes for anything: a list with checkboxes (“- [ ] milk”), an idea, a page that links to another with [[its title]].')));
  if (all.length) out.push(h('div', { class: 'row wrap', style: { margin: '6px 0 14px' } }, h('button', { class: 'btn sm ghost', onClick: () => download(`bergamot-notes-${keyOf(now())}.md`, N.allNotesMarkdown(S())) }, '⬇ All notes as Markdown')));
  return out;
}

// ───────────────────────────────────────── the editor
export function openByTitle(title) {
  const n = N.noteByTitle(S(), title);
  if (n) return noteSheet(n.id);
  noteSheet(null, { title });
}
export function noteSheet(id, preset = {}) {
  const s = S(), cur = id ? s.notes?.[id] : null; if (id && !cur) return;
  const nid = id || uid(), orig = cur ? N.titleOf(cur) : '';
  let mode = cur && String(cur.body || '').trim() ? 'read' : 'edit', timer = 0, created = !!cur;
  const title = h('input', { type: 'text', class: 'ne-title', value: cur?.title || preset.title || '', placeholder: 'Title', maxlength: 120, 'aria-label': 'Title', 'data-nodirty': '1' });
  const body = h('textarea', { class: 'ne-body', rows: 14, placeholder: 'Write in Markdown: # heading, **bold**, - [ ] a checkbox, [[another note]], #tag', 'aria-label': 'Note', 'data-nodirty': '1' }, cur?.body || preset.body || '');
  const folder = h('input', { type: 'text', value: cur?.folder || preset.folder || '', placeholder: 'No folder', maxlength: 40, list: 'nt-folders', 'aria-label': 'Folder', 'data-nodirty': '1' });
  const dl = h('datalist', { id: 'nt-folders' }, N.folders(s).map(f => h('option', { value: f })));
  let aimId = cur?.aimId || '';
  const status = h('span', { class: 'tiny dim ne-status' }, cur ? `Saved ${ago(cur.at)}` : 'Not saved yet');
  const read = h('div', { class: 'read ne-read' });
  const save = () => {
    clearTimeout(timer);
    const t = title.value.trim(), b = body.value; if (!t && !b.trim()) return;
    up(st => created ? N.updateNote(st, nid, { title: t, body: b, folder: folder.value.trim(), aimId }) : N.addNote(st, { id: nid, title: t, body: b, folder: folder.value.trim(), aimId }));
    created = true; status.textContent = 'Saved'; paintBacklinks();
  };
  const soon = () => { status.textContent = 'Saving…'; clearTimeout(timer); timer = setTimeout(save, 700); };
  for (const el of [title, body, folder]) el.addEventListener('input', soon);
  const paintRead = () => {
    read.innerHTML = N.renderMarkdown(body.value || '', { resolve: (t) => !!N.noteByTitle(S(), t) }) || '<p class="dim">Empty note.</p>';
  };
  read.addEventListener('click', (ev) => {
    const box = ev.target.closest('.ck-box'); if (box) { body.value = N.toggleLine(body.value, +box.dataset.line); save(); paintRead(); return; }
    const a = ev.target.closest('a.wl'); if (a) { ev.preventDefault(); save(); close(); openByTitle(a.dataset.note); return; }
    const tg = ev.target.closest('.tag'); if (tg) { save(); close(); ui.tag = tg.dataset.tag.toLowerCase(); ui.folder = ''; ctx.go('notes'); }
  });
  const insert = (before, after = '', line = false) => {
    const a = body.selectionStart ?? body.value.length, b = body.selectionEnd ?? a, v = body.value;
    const pre = line && a > 0 && v[a - 1] !== '\n' ? '\n' : '';
    body.value = v.slice(0, a) + pre + before + v.slice(a, b) + after + v.slice(b); body.focus();
    const pos = a + pre.length + before.length + (b - a); body.setSelectionRange(pos, pos); soon();
  };
  const tools = h('div', { class: 'ne-tools row wrap' }, [['☐', 'Checklist item', () => insert('- [ ] ', '', true)], ['B', 'Bold', () => insert('**', '**')], ['H', 'Heading', () => insert('## ', '', true)], ['[[ ]]', 'Link a note', () => insert('[[', ']]')], ['#', 'Tag', () => insert('#')]].map(([l, t, fn]) => h('button', { type: 'button', class: 'btn sm ghost', title: t, 'aria-label': t, onClick: fn }, l)), micButton(body, CZ.custom(S()).journal.voice));
  const editBox = h('div', { class: 'ne-edit' }, tools, body), modeSeg = h('div', { class: 'seg mini' });
  const paintMode = () => { editBox.hidden = mode !== 'edit'; read.hidden = mode !== 'read'; if (mode === 'read') paintRead(); modeSeg.replaceChildren(...[['read', 'Read'], ['edit', 'Edit']].map(([k, l]) => h('button', { type: 'button', class: mode === k ? 'active' : '', 'aria-pressed': String(mode === k), onClick: () => { mode = k; paintMode(); if (k === 'edit') body.focus(); } }, l))); };
  const back = h('div', { class: 'ne-back' });
  const paintBacklinks = () => {
    const n = S().notes?.[nid]; if (!n) { back.replaceChildren(); return; }
    const bl = N.backlinks(S(), n), entries = ctx.journalOpen() ? bl.entries : [];
    back.replaceChildren(...(bl.notes.length || entries.length ? [h('div', { class: 'tiny dim' }, 'Linked from'), h('div', { class: 'chips' }, ...bl.notes.map(x => h('button', { class: 'chip', onClick: () => { save(); close(); noteSheet(x.id); } }, `📝 ${N.titleOf(x)}`)), ...entries.slice(0, 8).map(e => h('button', { class: 'chip', onClick: () => { save(); close(); ctx.readEntry(e.id); } }, `📔 ${fmtDate(fromKey(e.date))}`)))] : []));
  };
  const pinBtn = h('button', { type: 'button', class: `btn sm ${cur?.pinned ? 'sel' : ''}`, 'aria-pressed': String(!!cur?.pinned), onClick: () => { save(); if (!S().notes?.[nid]) return toast('Write something first'); up(st => N.togglePin(st, nid)); const on = S().notes[nid].pinned; pinBtn.classList.toggle('sel', on); pinBtn.setAttribute('aria-pressed', String(on)); pinBtn.textContent = on ? '📌 Pinned' : '📌 Pin'; } }, cur?.pinned ? '📌 Pinned' : '📌 Pin');
  const { close, box } = ctx.sheet([h('div', { class: 'row ne-head' }, title, modeSeg), editBox, read,
    h('div', { class: 'grid2', style: { marginTop: '10px' } }, field('Folder', folder, dl), field('Goal it is about (Citrus Plan)', aimSelect(aimId, v => { aimId = v; soon(); }))), back,
    h('div', { class: 'row wrap sh-foot' }, status, h('span', { class: 'grow' }), pinBtn,
      h('button', { type: 'button', class: 'btn sm', onClick: () => { save(); const n = S().notes?.[nid]; if (!n) return toast('Write something first'); const r = N.noteToTask(S(), nid); up(() => r.state); toast(`Task made: ${N.titleOf(n)}`, 'ok', { action: { label: 'Open', run: () => ctx.openTask(r.taskId) } }); } }, '→ Task'),
      h('button', { type: 'button', class: 'btn sm ghost', onClick: () => { save(); const n = S().notes?.[nid]; if (n) download(`${N.titleOf(n).replace(/[^\p{L}\p{N} _-]+/gu, '').slice(0, 40) || 'note'}.md`, N.noteMarkdown(n)); } }, '⬇ .md'),
      h('button', { type: 'button', class: 'btn sm ghost', onClick: () => { save(); const n = S().notes?.[nid]; if (n) printPages(N.noteMarkdown(n), N.titleOf(n)); } }, '🖨'),
      cur || created ? confirmBtn('Delete', () => { clearTimeout(timer); const before = S(); if (S().notes?.[nid]) { up(st => N.deleteNote(st, nid)); undoToast('Note deleted', before); } closing = true; close(); }, 'btn sm danger') : null,
      h('button', { type: 'button', class: 'btn primary', onClick: () => { save(); close(); } }, 'Done'))]);
  box.classList.add('note-sheet');
  let closing = false;
  // closing the sheet any way (Esc, the back button, ✕) saves what was typed, and keeps [[links]] in step with a new title
  new MutationObserver((_, mo) => { if (box.isConnected) return; mo.disconnect(); if (!closing) save(); const n = S().notes?.[nid]; if (n && orig && N.titleOf(n) !== orig) { up(st => N.renameLinks(st, orig, N.titleOf(n))); } }).observe(document.body, { childList: true });
  paintMode(); paintBacklinks();
  if (mode === 'edit') setTimeout(() => (title.value ? body : title).focus(), 60);
}
