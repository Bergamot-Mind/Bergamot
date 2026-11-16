// Made-up Mind data and a shifts.json shaped like Mandarin's, for the tests. Never real names, words from a real journal, or places.
// The month: day shifts (D1 08:00–20:00) on weekdays, Fri/Sat off, nights 19–21/11 (a stretch of three), off 22/11, leave 25/11.
const d = (n) => `2026-11-${String(n).padStart(2, '0')}`;
const myDays = [];
for (let n = 1; n <= 30; n++) {
  const dow = new Date(2026, 10, n).getDay();
  if ([19, 20, 21].includes(n)) myDays.push({ date: d(n), kind: 'work', code: 'N1', type: 'N', site: 'Upper Village', start: '20:00', end: '08:00', overnight: true });
  else if (n === 25) myDays.push({ date: d(n), kind: 'leave', code: 'AL', label: 'Annual leave' });
  else if (dow === 5 || dow === 6 || n === 22) myDays.push({ date: d(n), kind: 'off', code: '' });
  else myDays.push({ date: d(n), kind: 'work', code: 'D1', type: 'D', site: 'Upper Village', start: '08:00', end: '20:00' });
}
export const shifts = { app: 'mandarin', contract: 2, updatedAt: '2026-11-16T05:00:00Z', me: { name: 'Dr Test Me', key: 'id:1' }, days: myDays,
  roster: { 'id:1': { name: 'Dr Test Me', unit: 'gp', days: {} } },
  legend: { D1: { label: 'Day · Upper Village', site: 'Upper Village', type: 'D', start: '08:00', end: '20:00' }, N1: { label: 'Night · Upper Village', site: 'Upper Village', type: 'N', start: '20:00', end: '08:00' } } };

export const goals = { aims: [{ id: 'aim1', title: 'Pass the test exam', area: 'learning', deadline: '2027-03-01', status: 'active', progress: 0.3 }, { id: 'aim2', title: 'Be consistently fit', area: 'health', deadline: '', status: 'active', progress: 0.5 }],
  resolutions: [{ id: 'res1', title: 'Read 12 books', area: 'learning', aimId: '' }], time: [{ id: 'g1', name: 'Study', kind: 'study', hoursPerWeek: 6 }] };

const at = Date.parse('2026-11-10T10:00:00Z'), ts = (k, h = 21) => Date.parse(`${k}T${String(h).padStart(2, '0')}:00:00+03:00`);
const entry = (id, date, method, extra) => ({ id, date, method, text: '', answers: {}, mood: 0, energy: 0, tags: [], people: [], places: [], aimIds: [], createdAt: ts(date), at: ts(date), ...extra });
export const state = {
  app: 'bergamot', version: 1, updatedAt: at,
  journal: {
    j1: entry('j1', d(10), 'journal', { text: 'Long day on the test ward. Talked with @Test_Friend about the rota. #work #tired', mood: 2, energy: 2, tags: ['work', 'tired'], people: ['Test Friend'] }),
    j2: entry('j2', d(11), 'daily', { answers: { wins: ['Finished the audit', 'Walked home'], lesson: 'Ask for help earlier', tomorrow: ['Call the bank'] }, mood: 4, energy: 3 }),
    j3: entry('j3', d(13), 'gratitude', { answers: { three: ['Coffee', 'Sunset at +Test_Park', 'A quiet shift'] }, places: ['Test Park'] }),
    j4: entry('j4', d(14), 'journal', { text: 'A day off. Slept in, read, felt like a person again. See [[Reading list]].', mood: 5, energy: 4 }),
    j5: entry('j5', d(15), 'journal', { text: 'Sunday, back to work tomorrow. #plans', mood: 3, energy: 3, tags: ['plans'] }),
    j6: entry('j6', '2026-10-16', 'journal', { text: 'One month ago: started a new running plan. #health', mood: 4, energy: 4, tags: ['health'] }),
    j7: entry('j7', '2025-11-16', 'journal', { text: 'One year ago today: first week at the test hospital.', mood: 3, energy: 2 }),
    j8: entry('j8', d(1), 'wheel', { scores: { health: 6, career: 7, learning: 5, money: 6, people: 4, fun: 3, calm: 5, home: 7 }, answers: { note: 'Fun is low.' } }),
  },
  notes: {
    n1: { id: 'n1', title: 'Reading list', body: '- [x] A test novel\n- [ ] Another test book\n- [ ] A third one\n\nLinked from [[Ideas]]. #books', tags: ['books'], folder: 'Lists', pinned: true, aimId: '', createdAt: at, at },
    n2: { id: 'n2', title: 'Ideas', body: '# App ideas\nA **calm** journal with [[Reading list]] links and #ideas.\n\nhttps://example.com/test', tags: ['ideas'], folder: '', pinned: false, aimId: 'aim1', createdAt: at, at: at + 1000 },
    n3: { id: 'n3', title: '', body: 'Grocery run\n- [ ] milk\n- [ ] eggs', tags: [], folder: 'Lists', pinned: false, aimId: '', createdAt: at, at: at + 2000 },
    n4: { id: 'n4', title: 'A note with a very very long title that keeps going and going to test the wrapping on narrow phones', body: 'Short.', tags: [], folder: '', pinned: false, aimId: '', createdAt: at, at: at + 3000 },
  },
  tasks: {
    t1: { id: 't1', title: 'Call the bank', done: false, doneAt: 0, due: d(15), remindAt: '', est: 15, pri: 1, aimId: '', area: 'money', notes: '', src: '', srcApp: '', createdAt: at, at },
    t2: { id: 't2', title: 'Book the exam date', done: false, doneAt: 0, due: d(16), remindAt: '', est: 20, pri: 2, aimId: 'aim1', area: '', notes: '', src: '', srcApp: '', createdAt: at, at },
    t3: { id: 't3', title: 'Renew the test library card', done: false, doneAt: 0, due: d(18), remindAt: '', est: 0, pri: 0, aimId: '', area: '', notes: '', src: '', srcApp: '', createdAt: at, at },
    t4: { id: 't4', title: 'Question bank: 40 questions', done: true, doneAt: ts(d(16), 7), due: d(16), remindAt: '', est: 60, pri: 0, aimId: 'aim1', area: 'learning', notes: '', src: '', srcApp: '', createdAt: at, at },
    t5: { id: 't5', title: 'Sort the photos', done: false, doneAt: 0, due: '', remindAt: '', est: 0, pri: 0, aimId: '', area: 'fun', notes: '', src: '', srcApp: '', createdAt: at, at },
  },
  habits: {
    h1: { id: 'h1', name: 'Write in the journal', emoji: '✍️', freq: { type: 'daily' }, aimId: '', area: 'calm', link: 'journal', threshold: 0, minutes: 0, remindTime: '', archived: false, createdAt: ts(d(1), 8), at },
    h2: { id: 'h2', name: 'Walk 20 minutes', emoji: '🚶', freq: { type: 'daily' }, aimId: 'aim2', area: 'health', link: '', threshold: 0, minutes: 20, remindTime: '21:00', archived: false, createdAt: ts(d(1), 8), at },
    h3: { id: 'h3', name: 'Gym', emoji: '💪', freq: { type: 'weekly', n: 3 }, aimId: 'aim2', area: 'health', link: 'orange', threshold: 0, minutes: 0, remindTime: '', archived: false, createdAt: ts(d(1), 8), at },
  },
  habitLog: { h2: { [d(12)]: { v: 1, at }, [d(13)]: { v: 1, at }, [d(14)]: { v: 1, at }, [d(15)]: { v: 1, at } }, h3: { [d(15)]: { v: 1, at } } },
  dayLog: { [d(10)]: { key: d(10), score: 2, note: '', at }, [d(11)]: { key: d(11), score: 3, note: '', at }, [d(12)]: { key: d(12), score: 2, note: '', at }, [d(13)]: { key: d(13), score: 4, note: '', at }, [d(14)]: { key: d(14), score: 5, note: '', at }, [d(7)]: { key: d(7), score: 5, note: '', at }, [d(8)]: { key: d(8), score: 4, note: '', at } },
  reminders: {}, inboxLog: {},
  deleted: {}, stamps: {}, migrated: { from: 'citrus', at, counts: { tasks: 5 } }, settings: {},
};
