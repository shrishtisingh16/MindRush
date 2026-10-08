// MindRush server: Express + Socket.io. Authoritative timer, shuffling, scoring, bots.
const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const app = express(), srv = http.createServer(app), io = new Server(srv);
app.use(express.static(path.join(__dirname, 'public')));

const DUR = 20, MAXP = 50, REVEAL = 2000, rooms = new Map();
const QB = [
  { s: 'Quantitative Aptitude', q: 'A can finish a job in 12 days and B in 15 days. Working together, how many days will they take?', o: ['6 2/3 days', '7 days', '6 days', '8 days'], c: 0, e: 'Combined rate = 1/12 + 1/15 = 9/60 = 3/20 per day. Time = 20/3 = 6 2/3 days.' },
  { s: 'Logical Reasoning', q: `Pointing to a man, Riya says, "He is the son of my mother's only brother." How is the man related to Riya?`, o: ['Brother', 'Cousin', 'Uncle', 'Nephew'], c: 1, e: `Her mother's brother is her maternal uncle. His son is her maternal cousin.` },
  { s: 'Mathematics', q: 'Two fair dice are rolled together. What is the probability that the sum is 8?', o: ['1/6', '5/36', '7/36', '1/9'], c: 1, e: 'Pairs summing to 8: (2,6),(3,5),(4,4),(5,3),(6,2) = 5 outcomes out of 36.' },
  { s: 'English / Verbal Ability', q: 'Choose the grammatically correct sentence.', o: ['Neither of the students have passed.', 'Neither of the students has passed.', 'Neither of the students are passing.', 'Neither of the student has passed.'], c: 1, e: '"Neither" is singular, so it takes "has". The noun after "of" must be plural: "students".' },
  { s: 'General Knowledge', q: 'Which company became the first US-listed company to reach a $1 trillion market capitalization (2018)?', o: ['Apple', 'Microsoft', 'Amazon', 'Alphabet'], c: 0, e: 'Apple crossed $1 trillion on 2 August 2018, followed by Amazon and Microsoft later.' },
  { s: 'General Science', q: 'What is the decimal number 13 in binary?', o: ['1011', '1101', '1110', '1001'], c: 1, e: '13 = 8 + 4 + 1 = 1x2^3 + 1x2^2 + 0x2^1 + 1x2^0 = 1101.' }
];
const NAMES = 'Aarav Sneha Rohan Priya Kabir Ananya Vihaan Ishita Arjun Diya Reyansh Meera Aditya Kavya Dev Naina Yash Tara Karan Riya Harsh Sana Manav Pooja Nikhil Aisha Rahul Simran Varun Neha Siddharth Tanvi Ayaan Mahi Pranav Zoya Krish Nisha Om Isha Dhruv Anvi Lakshya Shreya Tejas Kiara Rudra Myra Jay Pihu'.split(' ');
const BR = ['CSE', 'ECE', 'IT', 'MECH', 'EEE', 'CIVIL'], AV = ['🦊', '🐼', '🦁', '🐯', '🤖', '👾', '🐲', '🦄'];

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const send = (r, id, ev, d) => { if (!String(id).startsWith('bot')) io.to(id).emit(ev, d); };
const elapsed = r => (Date.now() - r.qStart - r.pausedMs) / 1000;

function lobby(r) {
  io.to(r.code).emit('lobby', { code: r.code, name: r.name, players: [...r.players].map(([id, p]) => ({ id, n: p.n, av: p.av })) });
}

function startQ(r) {
  const q = QB[r.qi]; r.phase = 'q'; r.paused = false; r.pausedMs = 0; r.qStart = Date.now(); r.endAt = r.qStart + DUR * 1000;
  const base = { qi: r.qi, total: QB.length, s: q.s, q: q.q, left: DUR, resub: r.resub };
  for (const [id, p] of r.players) {
    p.ord = shuffle([0, 1, 2, 3]); p.cur = null; // per-player option shuffle (ord[slot] = original index)
    if (p.bot) p.plan = { t: 1 + Math.random() * 17, ok: Math.random() < .62, skip: Math.random() < .05 };
    send(r, id, 'question', { ...base, opts: p.ord.map(i => q.o[i]) });
  }
  io.to(r.hostId).emit('question', { ...base, opts: q.o, host: true });
  clearInterval(r.loop); r.loop = setInterval(() => tick(r), 250);
}

function tick(r) {
  if (r.paused || r.phase !== 'q') return;
  const q = QB[r.qi], el = elapsed(r), left = Math.max(0, (r.endAt - Date.now()) / 1000);
  for (const p of r.players.values())
    if (p.bot && !p.cur && !p.plan.skip && el >= p.plan.t)
      p.cur = { orig: p.plan.ok ? q.c : [0, 1, 2, 3].filter(x => x !== q.c)[Math.floor(Math.random() * 3)], t: el };
  io.to(r.code).emit('tick', { left, answered: [...r.players.values()].filter(p => p.cur).length, total: r.players.size });
  if (left <= 0) endQ(r);
}

function score(r) { // idempotent per question
  const q = QB[r.qi];
  for (const p of r.players.values()) {
    if (p.log.length > r.qi) continue;
    if (!p.cur) { p.log.push({ pick: null, pts: 0, t: 0 }); continue; }
    const ok = p.cur.orig === q.c, t = Math.min(DUR, p.cur.t);
    p.log.push({ pick: p.cur.orig, pts: ok ? 1000 + Math.floor(500 * (DUR - t) / DUR) : -200, t: p.cur.t });
  }
}

function endQ(r) {
  if (r.phase !== 'q') return;
  clearInterval(r.loop); r.phase = 'reveal'; score(r);
  const q = QB[r.qi];
  for (const [id, p] of r.players) {
    const L = p.log[r.qi];
    send(r, id, 'reveal', { cs: p.ord.indexOf(q.c), ms: L.pick == null ? null : p.ord.indexOf(L.pick), pts: L.pts });
  }
  io.to(r.hostId).emit('reveal', { cs: q.c, ms: null, pts: 0 });
  r.timeout = setTimeout(() => { if (r.phase !== 'reveal') return; r.qi++; r.qi >= QB.length ? finish(r) : startQ(r); }, REVEAL);
}

function finish(r) {
  if (r.phase === 'done') return;
  clearInterval(r.loop); clearTimeout(r.timeout); r.phase = 'done';
  const n = r.players.size || 1;
  const board = [...r.players].map(([id, p]) => {
    const used = p.log.filter(l => l.pick != null), ok = p.log.filter((l, i) => l.pick === QB[i].c).length;
    return { id, n: p.n, av: p.av, sc: p.log.reduce((a, l) => a + l.pts, 0), acc: Math.round(ok / QB.length * 100), avg: used.length ? used.reduce((a, l) => a + l.t, 0) / used.length : 0 };
  }).sort((a, b) => b.sc - a.sc || a.avg - b.avg);
  const pct = QB.map((q, i) => Math.round([...r.players.values()].filter(p => p.log[i] && p.log[i].pick === q.c).length / n * 100));
  const sheet = p => QB.map((q, i) => ({ s: q.s, q: q.q, o: q.o, c: q.c, e: q.e, pick: p && p.log[i] ? p.log[i].pick : null, pct: pct[i] }));
  for (const [id, p] of r.players) send(r, id, 'finale', { board, sheet: sheet(p), meId: id });
  io.to(r.hostId).emit('finale', { board, sheet: sheet(null), host: true });
  setTimeout(() => rooms.delete(r.code), 30 * 60 * 1000);
}

io.on('connection', socket => {
  socket.on('host:create', ({ name, code }, ack) => {
    name = clean(name, 30); code = String(code || '').toUpperCase();
    if (!name || !code) return ack?.({ error: 'Enter a room name and generate a code.' });
    if (!/^[A-Z0-9]{7}$/.test(code)) return ack?.({ error: 'Code must be 7 letters or numbers.' });
    if (rooms.has(code)) return ack?.({ error: 'Code already in use. Generate another.' });
    rooms.set(code, { code, name, hostId: socket.id, players: new Map(), phase: 'lobby', qi: 0, resub: false });
    socket.join(code); socket.data.room = code; socket.data.host = true;
    ack?.({ ok: true, code, name });
    lobby(rooms.get(code));
  });

  socket.on('player:join', ({ name, code, avatar }, ack) => {
    name = clean(name, 20); code = String(code || '').toUpperCase().trim();
    const r = rooms.get(code);
    if (!name) return ack?.({ error: 'Enter your name.' });
    if (!/^[A-Z0-9]{7}$/.test(code)) return ack?.({ error: 'Room code must be 7 letters or numbers.' });
    if (!r) return ack?.({ error: 'Room not found.' });
    if (r.phase !== 'lobby') return ack?.({ error: 'Quiz already started.' });
    if (r.players.size >= MAXP) return ack?.({ error: 'Room is full (50/50).' });
    r.players.set(socket.id, { n: name, av: AV.includes(avatar) ? avatar : AV[0], log: [], cur: null, ord: [0, 1, 2, 3] });
    socket.join(code); socket.data.room = code;
    ack?.({ ok: true, code, name: 'Room ' + code, id: socket.id });
    lobby(r);
  });

  const hostRoom = () => { const r = rooms.get(socket.data.room); return r && r.hostId === socket.id ? r : null; };

  socket.on('host:spawn', () => {
    const r = hostRoom(); if (!r || r.phase !== 'lobby') return;
    const have = [...r.players.values()].filter(p => p.bot).length; let i = 0;
    while (r.players.size < MAXP) {
      const k = have + i++;
      r.players.set('bot-' + r.code + '-' + k, { bot: true, n: NAMES[k % 50] + ' - ' + BR[k % 6], av: AV[k % 8], log: [], cur: null, ord: [0, 1, 2, 3] });
    }
    lobby(r);
  });

  socket.on('host:start', () => {
    const r = hostRoom(); if (!r || r.phase !== 'lobby') return;
    if (!r.players.size) return socket.emit('err', 'Spawn racers or wait for players first');
    r.qi = 0; r.resub = false; startQ(r);
  });

  socket.on('player:answer', ({ slot }) => {
    const r = rooms.get(socket.data.room), p = r?.players.get(socket.id);
    if (!p || r.phase !== 'q' || r.paused || !Number.isInteger(slot) || slot < 0 || slot > 3) return;
    if ((p.cur && !r.resub) || Date.now() > r.endAt) return; // hard lock
    p.cur = { orig: p.ord[slot], t: elapsed(r) };
    socket.emit('locked', { slot, resub: r.resub });
  });

  socket.on('host:ctl', ({ k }) => {
    const r = hostRoom(); if (!r) return;
    const now = Date.now();
    if (k === 'resub') { r.resub = !r.resub; return io.to(r.code).emit('resub', { on: r.resub }); }
    if (k === 'end') { if (r.phase === 'q') score(r); return finish(r); }
    if (r.phase !== 'q') return;
    if (k === 'pause') {
      if (!r.paused) { r.paused = true; r.pauseAt = now; }
      else { const d = now - r.pauseAt; r.paused = false; r.pausedMs += d; r.endAt += d; }
      io.to(r.code).emit('paused', { paused: r.paused });
    } else if (k === 'skip') { r.paused = false; endQ(r); }
    else if (k === 'add') r.endAt += 10000;
  });

  socket.on('disconnect', () => {
    const r = rooms.get(socket.data.room); if (!r) return;
    if (socket.data.host) { if (r.phase === 'lobby') { io.to(r.code).emit('closed'); rooms.delete(r.code); } return; }
    if (r.phase === 'lobby' && r.players.delete(socket.id)) lobby(r);
  });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log(`MindRush running on http://localhost:${PORT}`));
