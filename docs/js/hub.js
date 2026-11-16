// What Bergamot tells the other apps (pure, no DOM): My Apps/hub/bergamot/status.json (HUB.md contract v2) — the one-line
// summary, next, metrics, what is waiting on you, dated tasks for Citrus's inbox, tasks with estimates as time to place around
// shifts, deep links, and extra { tasks, habits, journaledToday, mood, streaks, goalLinks } for Citrus's Today and Plan.
// Never journal text and never note bodies: only counts, mood numbers and titles.
import { keyOf, fromKey, addDays } from './util.js';
import * as M from './mind.js';
import * as J from './journal.js';
import * as R from './roster.js';

export const SITE_URL = 'https://bergamot-mind.github.io/Bergamot/';
export const CONTRACT = 2;
const plural = (n, w, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;

/** status.json for Citrus (HUB.md v2). apps: other apps' status files (for linked habits). */
export function buildStatus(s, now = new Date(), { apps = {} } = {}) {
  const t = keyOf(now), b = M.taskBuckets(s, now), hd = M.habitsToday(s, now, apps), ws = M.weekStartOf(now);
  const st = J.writingStats(s, now), moodT = J.moodToday(s, now), moodW = J.weekMood(s, now);
  const todayN = b.today.length + b.overdue.length;
  const bits = [];
  if (todayN) bits.push(`${plural(todayN, 'task')} today`);
  if (hd.pending.length) bits.push(`${plural(hd.pending.length, 'habit')} left`);
  bits.push(st.today ? 'journaled today' : 'not journaled yet');

  const pending = [];
  for (const x of b.overdue.slice(0, 4)) pending.push(`${x.title}: overdue since ${x.due.slice(8)}/${x.due.slice(5, 7)}`);
  for (const h of hd.pending.slice(0, 4)) pending.push(`${h.emoji ? h.emoji + ' ' : ''}${h.name}`);

  const inbox = [];
  for (const x of [...b.overdue, ...b.today, ...b.soon].slice(0, 20)) inbox.push({ id: `task-${x.id}`.slice(0, 60), type: 'task', title: x.title, date: x.due < t ? t : x.due, ...(x.est ? { minutes: x.est } : {}), pri: x.pri || 0, url: `${SITE_URL}?do=tasks`, expires: keyOf(addDays(fromKey(x.due < t ? t : x.due), 7)) });

  const asks = M.asks(s, now, 7).slice(0, 8).map(({ id, ...a }) => a);
  const done7 = M.tasksDoneSince(s, ws.getTime()), hw = M.habitWindow(s, ws, now, apps);
  const metrics = [
    { key: 'tasks-week', label: 'Tasks done this week', value: done7, unit: 'tasks', date: t },
    { key: 'tasks-overdue', label: 'Tasks overdue', value: b.overdue.length, goal: 0, unit: 'tasks', date: t },
    { key: 'habits-week', label: 'Habits done this week', value: hw.rate == null ? 0 : Math.round(hw.rate * 100), goal: 100, unit: '%', date: t },
    { key: 'journal-streak', label: 'Journal run', value: st.run, unit: 'days', date: t },
    { key: 'journal-week', label: 'Days written this week', value: st.week, goal: 7, unit: 'days', date: t },
  ];
  if (moodW != null) metrics.push({ key: 'mood-week', label: 'Mood this week', value: moodW, goal: 5, unit: '/5', date: t });

  const top = M.focusTasks(s, now, 1)[0];
  const next = top ? { title: top.title, minutes: top.est || 15 } : !st.today ? { title: 'Write today’s page', minutes: 5 } : hd.pending[0] ? { title: hd.pending[0].name, minutes: hd.pending[0].minutes || 10 } : null;
  const base = SITE_URL;
  const actions = [
    { id: 'today', label: 'Today in Bergamot', url: `${base}#today`, icon: '🫖' },
    { id: 'journal', label: 'Journal', url: `${base}?do=journal`, icon: '📔', minutes: 5 },
    { id: 'write', label: 'Write today’s page', url: `${base}?do=write`, icon: '✍️', minutes: 5 },
    { id: 'notes', label: 'Notes', url: `${base}?do=notes`, icon: '📝', minutes: 2 },
    { id: 'tasks', label: 'Tasks', url: `${base}?do=tasks`, icon: '✓', minutes: 2 },
    { id: 'habits', label: 'Habits', url: `${base}?do=habits`, icon: '🔁', minutes: 1 },
  ];
  const habits = M.activeHabits(s), streaks = habits.map(h => ({ name: h.name, days: M.habitStreak(s, h, now, apps).cur, unit: M.habitStreak(s, h, now, apps).unit })).filter(x => x.days > 0).sort((a, c) => c.days - a.days).slice(0, 5);
  if (st.run > 0) streaks.unshift({ name: 'Journal', days: st.run, unit: 'd' });
  return {
    app: 'bergamot', title: 'Bergamot', icon: '🫖', color: '#c9d86a', url: base, contract: CONTRACT,
    updatedAt: now.toISOString(),
    summary: bits.join(' · ').slice(0, 140),
    today: { date: t, done: st.today && !hd.pending.length && !todayN },
    next, asks, metrics, pending: pending.slice(0, 10), inbox: inbox.slice(0, 25), actions,
    extra: {
      tasks: { overdue: b.overdue.length, today: b.today.length, top: M.focusTasks(s, now, 5).map(x => ({ title: x.title, due: x.due || '', pri: x.pri || 0, ...(x.est ? { minutes: x.est } : {}), ...(x.aimId ? { aimId: x.aimId } : {}) })) },
      habits: { due: hd.due.length, done: hd.done.length, pending: hd.pending.map(h => h.name).slice(0, 8) },
      journaledToday: st.today,
      mood: { today: moodT == null ? null : Math.round(moodT * 10) / 10, week: moodW, day: s.dayLog?.[t]?.score || null },
      streaks,
      goalLinks: M.goalLinks(s, now),
      roster: R.has() ? R.updatedAt() : null,
    },
  };
}
