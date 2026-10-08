# MindRush: Think Fast. Win Smart.

Multiplayer Aptitude Arena (Problem Statement 3). A real-time quiz **website** (desktop and mobile browsers) built with Node.js, Express, Socket.io and vanilla HTML/CSS/JS.

## Run locally
```bash
npm install
npm start          # http://localhost:3000
npm run simulate   # in a second terminal: 1 host + 50 bots, ~2.5 min
```
Open the site in one tab as **Host**, then join from other tabs or phones on the same network (`http://<your-ip>:3000`).

## Structure
```
server.js        Express + Socket.io: rooms, authoritative timer, scoring, anti-cheat, server-side bots
simulation.js    Headless 50-bot concurrency test
public/index.html  Your original Mind_rush.html design (markup and CSS unchanged; only the inline script now loads app.js)
public/app.js      Original UI functions, now driven by Socket.io events
```
The page loads Tailwind, Lucide icons and Google Fonts from CDNs, exactly like the original file, so the browser needs internet access.

## How it works
- Host creates a room with a 7-char code; up to 50 players join from any browser. Host can start at any time.
- **Spawn 50 Campus Racers** adds simulated players on the server, handy for demos.
- Server runs the 20 s timer, shows the correct answer for 2 s, then moves on automatically. Host dock: Pause/Resume, Skip, +10s, Allow Resubmit, End Quiz Now.
- Options are shuffled per player on the server; answers lock instantly; the correct answer is sent only at the reveal.
- Scoring: correct = `1000 + floor(500 * (20 - t) / 20)` with server-measured `t` (pause time excluded); wrong = -200; unanswered = 0.
- Finale: podium, searchable leaderboard (score, accuracy, avg time) and full answersheet with explanations.

## Upload to GitHub
```bash
cd mindrush
git init
git add .
git commit -m "MindRush: multiplayer aptitude arena"
git branch -M main
git remote add origin https://github.com/<your-username>/mindrush.git
git push -u origin main
```
Create the empty `mindrush` repository on github.com first (no README or .gitignore). `node_modules` is ignored, so anyone who clones runs `npm install && npm start`.

## Deploy online (free)
GitHub Pages only serves static files, so it **cannot** run this Node/Socket.io backend. Use a Node host connected to your GitHub repo:

**Render** (included `render.yaml`): New + > Web Service > pick your repo > Build `npm install` > Start `npm start` > Deploy. You get a public `https://mindrush.onrender.com`-style URL that works on any phone or desktop. (Free tier sleeps when idle, so the first load can take about 30 s.)

**Railway / Fly.io / Glitch** work the same way: connect the repo, and they run `npm start`. The server reads the `PORT` environment variable automatically.

Run the load test against a deployed site with `node simulation.js https://your-app-url`.

## Local network play
Run `npm start`, find your computer's IP (`ipconfig` or `ifconfig`), and have others on the same Wi-Fi open `http://<your-ip>:3000`.
