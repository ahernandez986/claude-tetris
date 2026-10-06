'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, maxCombo = 0, started = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  // combo: piezas consecutivas que limpian al menos una línea
  combo = cleared ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showGameOverRecords();
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  combo = 0;
  maxCombo = 0;
  started = true;
  savePendingRecord(); // reiniciar sin pulsar Guardar no pierde el récord
  gameoverRecords.classList.add('hidden');
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!started || e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const themeToggle = document.getElementById('theme-toggle');
const toggleIcon = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    toggleIcon.textContent = '☀';
    toggleLabel.textContent = 'DARK';
  } else {
    document.body.classList.remove('light-mode');
    toggleIcon.textContent = '☾';
    toggleLabel.textContent = 'LIGHT';
  }
}

const savedTheme = localStorage.getItem('tetris-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

// ---- Récords (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const DEFAULT_NAME = 'JUGADOR';

const startOverlay = document.getElementById('start-overlay');
const playBtn = document.getElementById('play-btn');
const gameoverRecords = document.getElementById('gameover-records');
const newRecordMsg = document.getElementById('new-record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('player-name');
const saveRecordBtn = document.getElementById('save-record-btn');

const recordViews = [
  {
    table: document.getElementById('start-records-table'),
    combo: document.getElementById('start-best-combo'),
    lines: document.getElementById('start-max-lines'),
  },
  {
    table: document.getElementById('gameover-records-table'),
    combo: document.getElementById('gameover-best-combo'),
    lines: document.getElementById('gameover-max-lines'),
  },
];

let pendingRecord = null; // entrada que califica y aún no se guardó
let highlightIdx = -1;    // posición de la entrada recién guardada

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object' || !Array.isArray(data.top)) return emptyRecords();
    const top = data.top
      .filter(e => e && typeof e === 'object' && Number.isFinite(e.score))
      .map(e => ({
        name: String(e.name ?? DEFAULT_NAME).slice(0, 12),
        score: e.score,
        lines: Number(e.lines) || 0,
        level: Number(e.level) || 1,
        date: String(e.date ?? ''),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
    return { top, bestCombo: Number(data.bestCombo) || 0, maxLines: Number(data.maxLines) || 0 };
  } catch {
    return emptyRecords();
  }
}

function saveRecords(data) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(data));
  } catch {
    // almacenamiento no disponible: se ignora
  }
}

function qualifies(s, top) {
  return s > 0 && (top.length < MAX_RECORDS || s > top[top.length - 1].score);
}

function renderRecords() {
  const data = loadRecords();
  for (const view of recordViews) {
    const table = view.table;
    table.replaceChildren();
    const head = table.insertRow();
    for (const h of ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS', 'NIVEL']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    if (!data.top.length) {
      const td = table.insertRow().insertCell();
      td.colSpan = 5;
      td.className = 'empty';
      td.textContent = 'Sin récords todavía';
    }
    data.top.forEach((e, i) => {
      const row = table.insertRow();
      if (view === recordViews[1] && i === highlightIdx) row.className = 'current';
      for (const v of [i + 1, e.name, e.score.toLocaleString(), e.lines, e.level]) {
        row.insertCell().textContent = v;
      }
    });
    view.combo.textContent = data.bestCombo;
    view.lines.textContent = data.maxLines;
  }
}

function showGameOverRecords() {
  const data = loadRecords();
  data.bestCombo = Math.max(data.bestCombo, maxCombo);
  data.maxLines = Math.max(data.maxLines, lines);
  saveRecords(data);

  highlightIdx = -1;
  pendingRecord = qualifies(score, data.top)
    ? { score, lines, level, date: new Date().toISOString().slice(0, 10) }
    : null;
  newRecordMsg.classList.toggle('hidden', !pendingRecord);
  nameForm.classList.toggle('hidden', !pendingRecord);
  renderRecords();
  gameoverRecords.classList.remove('hidden');
  if (pendingRecord) {
    // retraso para que las teclas de juego aún pulsadas no escriban en el campo
    setTimeout(() => {
      if (pendingRecord && gameOver) {
        nameInput.focus();
        nameInput.select();
      }
    }, 400);
  }
}

function savePendingRecord() {
  if (!pendingRecord) return;
  const data = loadRecords();
  if (qualifies(pendingRecord.score, data.top)) {
    const entry = { name: nameInput.value.trim().slice(0, 12) || DEFAULT_NAME, ...pendingRecord };
    data.top.push(entry);
    data.top.sort((a, b) => b.score - a.score);
    data.top = data.top.slice(0, MAX_RECORDS);
    saveRecords(data);
    highlightIdx = data.top.indexOf(entry);
  }
  pendingRecord = null;
  nameForm.classList.add('hidden');
  nameInput.blur();
  renderRecords();
}

function resetRecords() {
  if (!confirm('¿Borrar todos los récords?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    // almacenamiento no disponible: se ignora
  }
  highlightIdx = -1;
  renderRecords();
}

// los botones sueltan el foco para que Espacio/Enter no los reactiven al jugar
saveRecordBtn.addEventListener('click', () => { saveRecordBtn.blur(); savePendingRecord(); });
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') savePendingRecord();
});
for (const id of ['start-reset-btn', 'gameover-reset-btn']) {
  const btn = document.getElementById(id);
  btn.addEventListener('click', () => { btn.blur(); resetRecords(); });
}

playBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  playBtn.blur();
  init();
});

// pantalla de inicio: tablero vacío y sin bucle hasta pulsar Jugar
function drawIdle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
}

themeToggle.addEventListener('click', () => { if (!started) drawIdle(); });

drawIdle();
renderRecords();