import { Chess } from 'chess.js';
import fs from 'fs';
import { execFileSync } from 'child_process';

const { ISSUE_TITLE, ISSUE_AUTHOR, ISSUE_NUMBER, OWNER, REPO } = process.env;
const gh = (...a) => execFileSync('gh', a, { stdio: 'inherit' });
const reply = (msg) => {
  gh('issue', 'comment', ISSUE_NUMBER, '--body', msg);
  gh('issue', 'close', ISSUE_NUMBER);
};

const STATE = 'chess/state.json';
const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
const game = new Chess(state.fen);

const [, action, arg] = ISSUE_TITLE.split('|');
const isOwner = ISSUE_AUTHOR.toLowerCase() === OWNER.toLowerCase();

if (action === 'new') {
  if (!isOwner) { reply('Only the owner can start a new game.'); process.exit(0); }
  state.fen = new Chess().fen();
  state.history = [];
  state.players = [];
  reply('New game started! ♟️');
} else if (action === 'move') {
  if (game.isGameOver()) { reply('The game is over. Wait for a new one!'); process.exit(0); }

  const whiteTurn = game.turn() === 'w';
  if (whiteTurn && !isOwner) { reply("It's the owner's turn (white). Come back after their move!"); process.exit(0); }
  if (!whiteTurn && isOwner) { reply("It's a visitor's turn (black). Wait for someone to move!"); process.exit(0); }
  if (!whiteTurn && state.players.includes(ISSUE_AUTHOR)) {
    reply('You already played a move in this game. One move per visitor!'); process.exit(0);
  }

  try {
    game.move(arg);
  } catch {
    reply(`"${arg}" is not a legal move.`); process.exit(0);
  }

  state.fen = game.fen();
  state.history.push(arg);
  if (!whiteTurn) state.players.push(ISSUE_AUTHOR);
  reply(`Move **${arg}** played by @${ISSUE_AUTHOR}. Thanks! ♟️`);
} else {
  reply('Unknown action.'); process.exit(0);
}

fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

// ---------- render README ----------
const g = new Chess(state.fen);
const sym = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟\uFE0E', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const rows = g.board().map((row, i) =>
  `<tr><td align="center"><b>${8 - i}</b></td>` +
  row.map(p => `<td align="center" width="44" height="44">${p ? sym[p.color + p.type] : '·'}</td>`).join('') +
  '</tr>'
).join('\n');
const board =
  `<table align="center">\n<tr><td></td>${[...'abcdefgh'].map(f => `<td align="center"><b>${f}</b></td>`).join('')}</tr>\n${rows}\n</table>`;

const link = (title, text) =>
  `[${text}](https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent('Just click "Create". Do not edit the title.')})`;

let status;
if (g.isCheckmate()) status = `🏁 **Checkmate!** ${g.turn() === 'w' ? 'Black (visitors)' : 'White (owner)'} wins.`;
else if (g.isGameOver()) status = '🤝 **Draw.**';
else status = g.turn() === 'w'
  ? `⏳ Waiting for **@${OWNER}** (white) to move.`
  : '🎯 **Your turn, visitors (black)!** Pick a move below. One move per person.';
if (g.inCheck() && !g.isGameOver()) status += ' ⚠️ Check!';

let moves;
if (g.isGameOver()) {
  moves = link('chess|new|', '🔄 Start a new game (owner only)');
} else {
  const label = g.turn() === 'b' ? '👇 Make your move (black)' : `Owner's moves (white)`;
  moves = `<details>\n<summary><b>${label}</b></summary>\n\n` +
    g.moves().map(m => link(`chess|move|${m}`, m)).join(' · ') + '\n\n</details>';
}

const pairs = [];
state.history.forEach((m, i) => {
  if (i % 2 === 0) pairs.push(`${i / 2 + 1}. ${m}`);
  else pairs[pairs.length - 1] += ` ${m}`;
});

const block = `<!-- CHESS:START -->
<div align="center">

${board}

${status}

${moves}

**Moves:** ${pairs.length ? pairs.join(' &nbsp; ') : 'none yet'}

</div>
<!-- CHESS:END -->`;

let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace(/<!-- CHESS:START -->[\s\S]*?<!-- CHESS:END -->/, block);
fs.writeFileSync('README.md', readme);
