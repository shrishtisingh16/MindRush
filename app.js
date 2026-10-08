/* MindRush client: same UI as the original file; game logic now lives on the server. */
const socket = io();
const $ = id => document.getElementById(id);
const AV = ['🦊', '🐼', '🦁', '🐯', '🤖', '👾', '🐲', '🦄'];
let S = { role: null, code: '', room: '', players: [], id: null, left: 20, resub: false, phase: 'idle', av: AV[0], opts: [], picked: null, cs: null, fin: null };

/* ---------- SOUND ---------- */
let AC;
function beep(f = 440, d = .12, type = 'square', v = .08, when = 0) { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d) } catch (e) { } }
const fanfare = () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => beep(f, .22, 'triangle', .12, i * .15));
const fanfareStart = () => [392, 523, 659].forEach((f, i) => beep(f, .15, 'square', .08, i * .1));

/* ---------- NAV ---------- */
function show(id) { document.querySelectorAll('section[id^=s-]').forEach(s => s.classList.add('hidden')); const el = $('s-' + id); el.classList.remove('hidden'); el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''; window.scrollTo(0, 0); window.lucide && lucide.createIcons() }
$('avs').innerHTML = AV.map((a, i) => `<button type="button" class="av w-11 h-11 text-2xl rounded-xl border ${i ? 'border-slate-600' : 'border-emerald-400 bg-emerald-900/40'}" onclick="pickAv(${i},this)">${a}</button>`).join('');
function pickAv(i, b) { S.av = AV[i]; document.querySelectorAll('.av').forEach(x => x.className = 'av w-11 h-11 text-2xl rounded-xl border border-slate-600'); b.className = 'av w-11 h-11 text-2xl rounded-xl border border-emerald-400 bg-emerald-900/40'; beep(520, .07) }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }

/* ---------- SETUP ---------- */
function genCode() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = ''; for (let i = 0; i < 7; i++) r += c[Math.floor(Math.random() * c.length)]; $('hostCode').value = r; beep(800, .08) }
function createRoom() {
  socket.emit('host:create', { name: $('roomName').value, code: $('hostCode').value }, res => {
    if (res.error) { $('hostErr').textContent = res.error; return }
    S.role = 'host'; S.room = res.name; S.code = res.code; enterLobby();
  });
}
function joinRoom() {
  const n = $('pName').value.trim(), c = $('pCode').value.trim().toUpperCase();
  if (!n) { $('joinErr').textContent = 'Enter your name.'; return }
  if (!/^[A-Z0-9]{7}$/.test(c)) { $('joinErr').textContent = 'Room code must be 7 letters or numbers.'; return }
  socket.emit('player:join', { name: n, code: c, avatar: S.av }, res => {
    if (res.error) { $('joinErr').textContent = res.error; return }
    S.role = 'player'; S.code = res.code; S.room = res.name; S.id = res.id; enterLobby();
  });
}
function enterLobby() {
  $('lobbyRoom').textContent = S.room; $('lobbyCode').textContent = S.code;
  const host = S.role === 'host';
  document.querySelector('#s-lobby .flex-wrap').classList.toggle('hidden', !host);
  document.querySelector('#s-lobby p.text-xs').textContent = host ? 'Racers are simulated bots running on the server. Real players join with your room code.' : 'Waiting for the host to start the quiz...';
  renderLobby(); show('lobby'); beep(880, .1);
}
function renderLobby() {
  $('cnt').textContent = S.players.length + ' / 50 Joined';
  $('plist').innerHTML = S.players.length ? S.players.map(p => `<div class="px-2 py-1 rounded-lg bg-slate-800 truncate">${p.av} ${esc(p.n)}${p.id === S.id ? ' (you)' : ''}</div>`).join('') : '<p class="col-span-full text-slate-500 text-center">Waiting for players...</p>'
}
function copyCode() { navigator.clipboard && navigator.clipboard.writeText(S.code).catch(() => { }); $('copyBtn').textContent = 'Copied!'; setTimeout(() => $('copyBtn').textContent = 'Copy Code', 1500); beep(900, .08) }
function spawn() { socket.emit('host:spawn'); beep(700, .15, 'sawtooth'); beep(1000, .15, 'sawtooth', .08, .12) }
function startGame() { socket.emit('host:start') }

socket.on('lobby', d => { if (S.phase === 'idle' || S.phase === 'lobby') { S.players = d.players; renderLobby() } });
socket.on('err', m => { $('cnt').textContent = m });
socket.on('closed', () => { alert('The host left. Room closed.'); location.reload() });

/* ---------- GAME ---------- */
socket.on('question', d => {
  S.phase = 'q'; S.opts = d.opts; S.picked = null; S.cs = null; S.resub = d.resub; S.left = d.left;
  $('reBtn').textContent = 'Allow Resubmit: ' + (d.resub ? 'On' : 'Off'); $('pauseBtn').textContent = 'Pause';
  $('dock').classList.toggle('hidden', S.role !== 'host');
  $('qCount').textContent = 'Question ' + (d.qi + 1) + ' / ' + d.total; $('subj').textContent = d.s; $('qtext').textContent = d.q;
  renderOpts(); updTimer();
  if (d.qi === 0) { show('arena'); fanfareStart() }
});
function renderOpts(rev) {
  $('opts').innerHTML = S.opts.map((t, i) => {
    let cls = 'opt';
    if (rev) { if (i === S.cs) cls += ' ok'; else if (S.picked === i) cls += ' bad' } else if (S.picked === i) cls += ' sel';
    const dis = S.role !== 'player' || rev || (S.picked !== null && !S.resub);
    return `<button class="${cls}" ${dis ? 'disabled' : ''} onclick="pick(${i})"><span class="f w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">${'ABCD'[i]}</span><span>${esc(t)}</span></button>`
  }).join('');
  $('lockMsg').textContent = S.role === 'host' ? 'Spectating - you are the host' : (S.picked !== null ? (S.resub ? 'Answer saved - you may still change it' : 'Answer Locked ✓') : '')
}
function pick(i) { if (S.role === 'player' && S.phase === 'q') socket.emit('player:answer', { slot: i }) }
socket.on('locked', d => { S.picked = d.slot; S.resub = d.resub; beep(1200, .08, 'square', .1); beep(1600, .1, 'square', .08, .08); renderOpts() });
socket.on('tick', d => {
  const prev = Math.ceil(S.left); S.left = d.left;
  $('answered').textContent = d.answered + '/' + d.total + ' Answered'; updTimer();
  if (Math.ceil(S.left) !== prev && S.left > 0) beep(S.left <= 5 ? 900 : 500, .05, 'square', .05)
});
function updTimer() { const r = Math.max(0, S.left) / 20, col = r > .5 ? '#34d399' : r > .25 ? '#facc15' : '#f43f5e'; $('ring').style.strokeDashoffset = 276.46 * (1 - Math.min(1, r)); $('ring').style.stroke = $('ring').style.color = col; $('tnum').textContent = Math.ceil(S.left); $('tnum').style.color = col }
socket.on('reveal', d => {
  S.phase = 'reveal'; S.cs = d.cs; if (S.role === 'player') S.picked = d.ms; renderOpts(true);
  const ok = S.role === 'player' && d.ms === d.cs;
  $('lockMsg').textContent = S.role === 'host' ? 'Correct answer revealed' : (d.ms === null ? 'Time up - no answer (0 pts)' : ok ? 'Correct! +' + d.pts : 'Wrong answer -200');
  beep(ok ? 880 : 220, .3, 'triangle', .1)
});
socket.on('paused', d => { $('pauseBtn').textContent = d.paused ? 'Resume' : 'Pause' });
socket.on('resub', d => { S.resub = d.on; $('reBtn').textContent = 'Allow Resubmit: ' + (d.on ? 'On' : 'Off'); if (S.phase === 'q') renderOpts() });
function hostCtl(k) { if (S.role === 'host') { beep(600, .06); socket.emit('host:ctl', { k }) } }

/* ---------- FINALE ---------- */
socket.on('finale', d => { S.phase = 'done'; S.fin = d; renderFinale(); show('finale'); fanfare() });
function renderFinale() {
  const ranked = S.fin.board, h = [150, 200, 110], ord = [1, 0, 2], cols = ['#94a3b8', '#facc15', '#d97706'], medals = ['🥈', '🥇', '🥉'];
  $('podium').innerHTML = ord.map((r, k) => { const p = ranked[r]; if (!p) return ''; return `<div class="text-center w-28 md:w-36"><div class="text-3xl">${p.av}</div><div class="text-xs truncate">${esc(p.n)}</div><div class="f text-sm text-emerald-300">${p.sc}</div><div class="bar rounded-t-xl flex items-start justify-center pt-2 text-3xl" style="height:${h[k]}px;background:linear-gradient(${cols[k]},#1e1b4b);box-shadow:0 0 20px ${cols[k]}66">${medals[k]}</div></div>` }).join('');
  const mi = ranked.findIndex(p => p.id === S.fin.meId);
  if (S.role === 'player' && mi >= 0) { const m = ranked[mi]; $('mycard').innerHTML = `<div class="f text-emerald-300 text-sm">Your result</div><div class="f text-3xl my-1">Rank #${mi + 1} of ${ranked.length} &middot; ${m.sc} pts</div><div class="text-slate-400 text-sm">${m.acc}% accuracy &middot; ${m.avg.toFixed(1)}s avg response</div>` }
  else $('mycard').innerHTML = `<div class="f text-emerald-300">Host view</div><div class="text-slate-400 text-sm">Class average: ${Math.round(ranked.reduce((a, p) => a + p.acc, 0) / Math.max(1, ranked.length))}% accuracy</div>`;
  renderBoard();
  $('p2').innerHTML = S.fin.sheet.map((q, i) => {
    const a = q.pick, mine = S.role !== 'player' ? '' : a !== null ? (a === q.c ? `<p class="text-emerald-300 text-sm">Your answer: ${esc(q.o[a])} ✓</p>` : `<p class="text-rose-400 text-sm">Your answer: ${esc(q.o[a])} ✗</p>`) : '<p class="text-slate-400 text-sm">You did not answer this question.</p>';
    return `<div class="card p-5"><span class="text-xs px-3 py-1 rounded-full bg-purple-600/30 border border-purple-400">Q${i + 1} &middot; ${esc(q.s)}</span><h3 class="text-lg my-3">${esc(q.q)}</h3>${mine}<p class="mt-1 px-3 py-2 rounded-lg bg-emerald-900/50 border border-emerald-400 text-emerald-200">Correct: ${esc(q.o[q.c])}</p><p class="text-sm text-slate-300 mt-3">${esc(q.e)}</p><p class="text-xs text-slate-500 mt-2">${q.pct}% of players got this right</p></div>`
  }).join('')
}
function renderBoard() {
  const f = $('srch').value.toLowerCase();
  $('board').innerHTML = S.fin.board.map((p, i) => [p, i]).filter(([p]) => p.n.toLowerCase().includes(f)).map(([p, i]) => `<tr class="border-t border-slate-800 ${p.id === S.fin.meId ? 'bg-emerald-900/30' : ''}"><td class="p-3 f">#${i + 1}</td><td>${p.av} ${esc(p.n)}</td><td class="f text-emerald-300">${p.sc}</td><td>${p.acc}%</td><td>${p.avg.toFixed(1)}s</td></tr>`).join('')
}
function tab(n) { $('p1').classList.toggle('hidden', n !== 1); $('p2').classList.toggle('hidden', n !== 2); $('t1').classList.toggle('on', n === 1); $('t2').classList.toggle('on', n === 2); beep(600, .06) }
window.lucide && lucide.createIcons();
