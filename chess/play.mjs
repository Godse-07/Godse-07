import { Chess } from 'chess.js';
import fs from 'fs';
import { execFileSync } from 'child_process';

const {
  ISSUE_TITLE = '', ISSUE_AUTHOR = '', ISSUE_NUMBER = '', OWNER = '', REPO = '',
} = process.env;

const BRANCH = 'main';
const P1 = { color: '#2f7bff', emoji: '🟦' }; // owner, white side
const P2 = { color: '#ff8a00', emoji: '🟧' }; // visitors, black side

const gh = (...a) => execFileSync('gh', a, { stdio: 'inherit' });
const reply = (msg) => {
  if (!ISSUE_NUMBER) return; // manual re-render has no issue
  gh('issue', 'comment', ISSUE_NUMBER, '--body', msg);
  gh('issue', 'close', ISSUE_NUMBER);
};
const reject = (msg) => { reply(msg); process.exit(0); };
const safe = (s) => String(s).slice(0, 12).replace(/[^\w=+#-]/g, '');

// ---------------- state ----------------
const STATE = 'chess/state.json';
const emptyStats = () => ({ games: 0, ownerWins: 0, visitorWins: 0, draws: 0, top: {} });

function migrate(s) {
  if (Array.isArray(s.moves)) {
    s.stats ??= emptyStats();
    s.game ??= 1;
    s.players ??= [];
    return s;
  }
  // old format: { fen, history: [SAN...], players: [...] }
  const c = new Chess();
  const moves = [];
  let v = 0;
  for (const san of s.history || []) {
    const color = c.turn();
    const m = c.move(san);
    moves.push({
      san: m.san, from: m.from, to: m.to, promotion: m.promotion, color,
      by: color === 'w' ? OWNER : (s.players?.[v++] || 'visitor'), at: null,
    });
  }
  const stats = emptyStats();
  for (const p of s.players || []) stats.top[p] = (stats.top[p] || 0) + 1;
  return { game: 1, fen: c.fen(), moves, players: s.players || [], stats };
}

const state = migrate(JSON.parse(fs.readFileSync(STATE, 'utf8')));
const game = new Chess(state.fen);

const title = ISSUE_TITLE;
const parts = title.split('|');
const action = title ? parts[1] : 'render';
const arg = (parts[2] || '').trim();
const isOwner = ISSUE_AUTHOR.toLowerCase() === OWNER.toLowerCase();

fs.mkdirSync('chess/games', { recursive: true });

function finishGame(g) {
  let result = '1/2-1/2';
  state.stats.games += 1;
  if (g.isCheckmate()) {
    if (g.turn() === 'b') { result = '1-0'; state.stats.ownerWins += 1; }
    else { result = '0-1'; state.stats.visitorWins += 1; }
  } else {
    state.stats.draws += 1;
  }
  try {
    const full = new Chess();
    for (const m of state.moves) full.move({ from: m.from, to: m.to, promotion: m.promotion });
    full.setHeader('Event', 'Profile README Chess');
    full.setHeader('Site', `https://github.com/${REPO}`);
    full.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    full.setHeader('White', OWNER);
    full.setHeader('Black', 'Visitors');
    full.setHeader('Result', result);
    fs.writeFileSync(`chess/games/game-${state.game}.pgn`, full.pgn() + '\n');
  } catch (e) {
    console.warn('Could not write PGN:', e.message);
  }
}

// ---------------- actions ----------------
let message = null;

if (action === 'render') {
  // just redraw
} else if (action === 'new') {
  if (!isOwner) reject('Only the owner can start a new game.');
  state.game += 1;
  state.fen = new Chess().fen();
  state.moves = [];
  state.players = [];
  message = 'New game started! ♟️';
} else if (action === 'move') {
  if (game.isGameOver()) reject('The game is over. Wait for a new one!');

  const whiteTurn = game.turn() === 'w';
  if (whiteTurn && !isOwner) reject("It's the owner's turn (Player 1). Come back after their move!");
  if (!whiteTurn && isOwner) reject("It's a visitor's turn (Player 2). Wait for someone to move!");
   const COOLDOWN_HOURS = 24;
  const lastMine = [...state.moves].reverse().find((m) => m.by === ISSUE_AUTHOR && m.color === 'b');
  if (!whiteTurn && lastMine?.at) {
    const hrs = (Date.now() - new Date(lastMine.at).getTime()) / 36e5;
    if (hrs < COOLDOWN_HOURS) {
      reject(`You can play again in about ${Math.ceil(COOLDOWN_HOURS - hrs)} hour(s).`);
    }
  }

  let played;
  try {
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(arg)) {
      played = game.move({ from: arg.slice(0, 2), to: arg.slice(2, 4), promotion: arg[4] });
    } else {
      played = game.move(arg); // old-style notation like Nf3 still works
    }
  } catch {
    reject(`"${safe(arg)}" is not a legal move.`);
  }

  state.fen = game.fen();
  state.moves.push({
    san: played.san, from: played.from, to: played.to, promotion: played.promotion,
    color: played.color, by: ISSUE_AUTHOR, at: new Date().toISOString(),
  });
  if (!whiteTurn) {
    state.players.push(ISSUE_AUTHOR);
    state.stats.top[ISSUE_AUTHOR] = (state.stats.top[ISSUE_AUTHOR] || 0) + 1;
  }
  message = `Move **${played.san}** played by @${ISSUE_AUTHOR}. Thanks! ♟️`;

  if (game.isGameOver()) {
    finishGame(game);
    message += '\n\n🏁 The game is over! Check the README for the result.';
  }
} else {
  reject('Unknown action.');
}

fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');

// ---------------- board image ----------------
const SQ = 56, PAD = 26, SIZE = 8 * SQ + PAD * 2;
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FONT = "'Segoe UI Symbol','Apple Symbols','DejaVu Sans','Noto Sans Symbols 2',sans-serif";

function boardSvg(g, last) {
  const turnColor = g.turn() === 'w' ? P1.color : P2.color;
  const board = g.board();
  const hi = last ? [last.from, last.to] : [];
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`;
  o += `<rect x="2" y="2" width="${SIZE - 4}" height="${SIZE - 4}" rx="12" fill="#1f2933" stroke="${turnColor}" stroke-width="4"/>`;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const name = 'abcdefgh'[c] + (8 - r);
      const x = PAD + c * SQ, y = PAD + r * SQ;
      const p = board[r][c];
      o += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="${(r + c) % 2 === 0 ? '#e8eaed' : '#a8adb4'}"/>`;
      if (hi.includes(name)) o += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="#f5d90a" opacity="0.5"/>`;
      if (p && p.type === 'k' && p.color === g.turn() && g.inCheck()) {
        o += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="#ef4444" opacity="0.6"/>`;
      }
      if (p) {
        o += `<text x="${x + SQ / 2}" y="${y + SQ / 2 + 2}" font-size="42" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" fill="${p.color === 'w' ? P1.color : P2.color}" stroke="#0b0f14" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${GLYPH[p.type]}&#xFE0E;</text>`;
      }
    }
  }
  for (let i = 0; i < 8; i++) {
    o += `<text x="${PAD + i * SQ + SQ / 2}" y="${SIZE - 9}" fill="#cbd2d9" font-size="13" text-anchor="middle" font-family="sans-serif">${'abcdefgh'[i]}</text>`;
    o += `<text x="${PAD / 2 + 1}" y="${PAD + i * SQ + SQ / 2 + 5}" fill="#cbd2d9" font-size="13" text-anchor="middle" font-family="sans-serif">${8 - i}</text>`;
  }
  return o + '</svg>\n';
}

// ---------------- README block ----------------
const g = new Chess(state.fen);
const last = state.moves.at(-1);
fs.writeFileSync('chess/board.svg', boardSvg(g, last));

const esc = (u) => u.replace(/&/g, '&amp;');
const userLink = (u) => `<a href="https://github.com/${u}">@${u}</a>`;
const issueUrl = (t, body) =>
  esc(`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(t)}&body=${encodeURIComponent(body)}`);

const legend = `${P1.emoji} <b>Player 1:</b> ${userLink(OWNER)} (blue) &nbsp;vs&nbsp; ${P2.emoji} <b>Player 2:</b> every visitor (orange)`;

let status;
if (g.isCheckmate()) {
  status = g.turn() === 'b'
    ? `🏁 <b>Checkmate!</b> ${P1.emoji} Player 1 (${userLink(OWNER)}) wins.`
    : `🏁 <b>Checkmate!</b> ${P2.emoji} Player 2 (the visitors) win.`;
} else if (g.isGameOver()) {
  status = '🤝 <b>Draw.</b>';
} else if (g.turn() === 'w') {
  status = `${P1.emoji} <b>Player 1's turn</b>, waiting for ${userLink(OWNER)}`;
} else {
  status = `${P2.emoji} <b>Player 2's turn. That's you, visitor!</b> Pick a move below.`;
}
if (g.inCheck() && !g.isGameOver()) status += ' ⚠️ <b>Check!</b>';

const lastLine = last
  ? `Last move: <b>${last.san}</b> by ${userLink(last.by)} ${last.color === 'w' ? P1.emoji : P2.emoji}`
  : 'No moves yet. A new game just started.';

const NAMES = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
const ORDER = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };

const moveLink = (m) => {
  const uci = m.from + m.to + (m.promotion || '');
  let label;
  if (m.flags.includes('k')) label = 'O-O';
  else if (m.flags.includes('q')) label = 'O-O-O';
  else {
    label = (m.captured ? '×' : '') + m.to + (m.promotion ? '=' + m.promotion.toUpperCase() : '');
  }
  if (m.san.includes('#')) label += '#';
  else if (m.san.includes('+')) label += '+';
  const body = `Click "Create" to play ${m.san}. Please don't edit the title.`;
  return `<a href="${issueUrl(`chess|move|${uci}`, body)}">${label}</a>`;
};

let panel;
if (g.isGameOver()) {
  panel = `<a href="${issueUrl('chess|new|', 'Owner only: click Create to start a new game.')}">🔄 Start a new game (owner only)</a>`;
} else {
  const byFrom = {};
  for (const m of g.moves({ verbose: true })) (byFrom[m.from] ||= []).push(m);
  const rows = Object.entries(byFrom)
    .sort(([, a], [, b]) => ORDER[a[0].piece] - ORDER[b[0].piece] || a[0].from.localeCompare(b[0].from))
    .map(([from, ms]) =>
      `<tr><td>${GLYPH[ms[0].piece]}&#xFE0E; ${NAMES[ms[0].piece]}</td><td align="center"><b>${from}</b></td><td>${ms.map(moveLink).join(' &nbsp; ')}</td></tr>`
    ).join('\n');
  panel = `<details open>
<summary><b>♟️ Choose a move</b> (click a square, then press "Create")</summary>

<table align="center">
<tr><th>Piece</th><th>At</th><th>Move to</th></tr>
${rows}
</table>

</details>`;
}

const logRows = [];
for (let i = 0; i < state.moves.length; i += 2) {
  const cell = (m) => (m ? `<b>${m.san}</b> <sub>${userLink(m.by)}</sub>` : '');
  logRows.push(`<tr><td align="center">${i / 2 + 1}</td><td>${cell(state.moves[i])}</td><td>${cell(state.moves[i + 1])}</td></tr>`);
}
const log = state.moves.length
  ? `<details>
<summary>📜 Move log (${state.moves.length} moves)</summary>

<table align="center">
<tr><th>#</th><th>${P1.emoji} Player 1</th><th>${P2.emoji} Player 2</th></tr>
${logRows.join('\n')}
</table>

</details>`
  : '';

const top = Object.entries(state.stats.top).sort((a, b) => b[1] - a[1]).slice(0, 5);
const topHtml = top.length
  ? '🏆 Top visitors: ' + top.map(([u, n]) =>
      `<a href="https://github.com/${u}"><img src="https://github.com/${u}.png?size=40" width="28" height="28" title="${u}: ${n} move${n > 1 ? 's' : ''}" alt="${u}"></a>`
    ).join(' ')
  : '';

const s = state.stats;
const record = `<sub>Game #${state.game} · Finished: ${s.games} · ${P1.emoji} Owner wins: ${s.ownerWins} · ${P2.emoji} Visitor wins: ${s.visitorWins} · 🤝 Draws: ${s.draws}</sub>`;

const img = `<img src="https://raw.githubusercontent.com/${REPO}/${BRANCH}/chess/board.svg?v=${state.game}-${state.moves.length}" width="440" alt="Chess board">`;

const block = `<!-- CHESS:START -->
<div align="center">

${legend}

${img}

${status}

${lastLine}

${panel}

${log}

${topHtml}

${record}

</div>
<!-- CHESS:END -->`;

let readme = fs.readFileSync('README.md', 'utf8');
if (!readme.includes('<!-- CHESS:START -->')) throw new Error('CHESS markers not found in README.md');
readme = readme.replace(/<!-- CHESS:START -->[\s\S]*?<!-- CHESS:END -->/, () => block);
fs.writeFileSync('README.md', readme);

if (message) reply(message);
