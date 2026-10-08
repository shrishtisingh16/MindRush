// Headless load test: 1 host + 50 bots with randomized answer delays.
// Usage: npm start (in one terminal), then: npm run simulate [url]
const { io } = require('socket.io-client');
const URL = process.argv[2] || 'http://localhost:3000', N = 50;
const code = Array.from({ length: 7 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const host = io(URL), stats = { joined: 0, answered: 0, finale: 0 };
let t0;

host.on('connect', () => host.emit('host:create', { name: 'Load Test', code }, res => {
  if (res.error) { console.error(res.error); process.exit(1); }
  console.log(`Room ${code} created. Connecting ${N} bots...`);
  for (let i = 1; i <= N; i++) spawn(i);
}));

function spawn(i) {
  const s = io(URL, { forceNew: true });
  s.on('connect', () => s.emit('player:join', { name: 'Bot' + i, code, avatar: '🤖' }, res => {
    if (res.error) return console.error(`Bot${i}:`, res.error);
    if (++stats.joined === N) {
      console.log(`${N}/${N} bots joined. Starting quiz...`); t0 = Date.now();
      setTimeout(() => host.emit('host:start'), 500);
    }
  }));
  s.on('question', q => {
    const delay = 500 + Math.random() * 17000; // some bots intentionally too slow
    setTimeout(() => s.emit('player:answer', { slot: Math.floor(Math.random() * 4) }), delay);
  });
  s.on('locked', () => stats.answered++);
  s.on('finale', f => {
    if (++stats.finale === N) {
      console.log(`\nAll ${N} bots received finale in ${((Date.now() - t0) / 1000).toFixed(1)}s. Answers locked: ${stats.answered}`);
      console.log('Top 3:', f.board.slice(0, 3).map((b, i) => `${i + 1}. ${b.n} ${b.sc}`).join(' | '));
      process.exit(0);
    }
  });
}

host.on('question', q => console.log(`Q${q.qi + 1}/${q.total} live`));
host.on('tick', t => { if (Math.round(t.left * 4) % 20 === 0) process.stdout.write(`  answered ${t.answered}/${t.total}\r`); });
setTimeout(() => { console.error('Timeout: simulation did not finish'); process.exit(1); }, 240000);
