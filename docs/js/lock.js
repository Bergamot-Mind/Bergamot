// An optional lock for the journal only (Citrus has none, by choice). A PIN or passphrase, set per device in Settings ›
// Journal lock. Only a salted PBKDF2 hash is kept (localStorage 'bergamot.lock', never synced, never in status.json).
// It is a privacy screen against someone picking up your phone — not encryption: the entries are still in this browser and
// in your own Drive. The journal locks again when Bergamot has been hidden or idle for the minutes you choose.
const KEY = 'bergamot.lock';
let unlockedAt = 0, lastSeen = 0;
const read = () => { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j && typeof j.hash === 'string' && typeof j.salt === 'string' ? j : null; } catch { return null; } };
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
async function derive(pin, saltHex) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(saltHex), iterations: 150000, hash: 'SHA-256' }, k, 256));
}
export const isOn = () => !!read();
export const settings = () => { const r = read(); return r ? { after: [0, 1, 5, 15, 60].includes(+r.after) ? +r.after : 5 } : null; };
/** Turn the lock on (or change the PIN). PIN: 4+ characters. */
export async function setPin(pin, after = 5) {
  if (String(pin || '').length < 4) throw new Error('Use at least 4 characters');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16))), hash = await derive(pin, salt);
  localStorage.setItem(KEY, JSON.stringify({ salt, hash, after, at: Date.now() })); unlockedAt = Date.now(); lastSeen = Date.now();
}
export function setAfter(after) { const r = read(); if (r) localStorage.setItem(KEY, JSON.stringify({ ...r, after })); }
export function turnOff() { try { localStorage.removeItem(KEY); } catch {} unlockedAt = 0; }
/** Is the journal open right now? Always true when there is no lock. */
export function isOpen(now = Date.now()) {
  const r = read(); if (!r) return true;
  if (!unlockedAt) return false;
  const after = (settings()?.after ?? 5) * 60000;
  if (now - lastSeen > Math.max(after, 20000)) { unlockedAt = 0; return false; }   // idle (or hidden) too long
  return true;
}
/** Activity keeps it open; leaving the app with "lock at once" closes it. */
export function touch(now = Date.now()) { if (unlockedAt && isOpen(now)) lastSeen = now; }   // an expired lock is not revived by the tap that finds it
export function hidden() { if (read() && (settings()?.after ?? 5) === 0) unlockedAt = 0; }
export async function unlock(pin) {
  const r = read(); if (!r) return true;
  const ok = (await derive(pin, r.salt)) === r.hash;
  if (ok) { unlockedAt = Date.now(); lastSeen = Date.now(); }
  return ok;
}
export function lockNow() { unlockedAt = 0; }
