# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris built on HTML5 Canvas. No dependencies, no `package.json`, no build step, no tests, no linter. The three source files are `index.html`, `style.css`, and `game.js`.

## Running

Open `index.html` directly, or serve the directory statically:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Architecture (`game.js`)

All logic is in one script loaded by `index.html`. It uses module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`) with no classes or modules. `init()` resets all state and is also the restart button handler.

- **Board model**: `ROWS × COLS` matrix. Each cell is `0` (empty) or a piece type index `1–8`. The same index is used in `PIECES[type]` (the shape matrices store the type number as their filled value) and in every skin's `SKINS[key].colors[type]` (`COLORS` is an alias of the active skin's palette). Index `0` is `null` in all of them, so new piece types have to keep `PIECES` and every skin's `colors` in sync.
- **Pieces**: `{ type, shape, x, y }`. `shape` is a square matrix that gets copied from `PIECES`. Rotation (`rotateCW`) builds a new matrix. `tryRotate` applies simple horizontal wall kicks `[0, -1, 1, -2, 2]`, not SRS.
- **Collision**: everything goes through `collide(shape, ox, oy)`. Movement, rotation, the ghost piece (`ghostY`), and the spawn/game-over check all call it. Cells with `y < 0` are allowed (above the board).
- **Lifecycle**: `lockPiece()` runs `merge()` → `clearLines()` → `spawn()`. `spawn()` promotes `next` to `current` and calls `endGame()` if the new piece collides immediately.
- **Loop**: `requestAnimationFrame(loop)` adds elapsed time to `dropAccum` and drops one row each time it passes `dropInterval`. Pause and game over stop the loop with `cancelAnimationFrame(animId)`. Resuming resets `lastTime` and calls `loop` directly.
- **Scoring/speed**: line clears pay `LINE_SCORES[n] * level`, soft drop pays 1 per row, and hard drop pays 2 per row. The level is `floor(lines / 10) + 1`, and `dropInterval = max(100, 1000 - (level - 1) * 90)`.
- **Skins**: `SKINS` (`retro`, `neon`, `pastel`, `pixel`) each have `name`, `colors`, optional `bg`/`grid`, and `drawCell(context, px, py, size, color, alpha)`. `drawBlock` delegates to the active `skin`. `applySkin(key)` sets `body[data-skin]`, sets the canvases' inline background from `skin.bg` (empty falls back to the theme's `--canvas-bg`), and redraws. The `#skin-select` change handler saves to `localStorage 'tetris-skin'`.
- **Rendering**: `draw()` redraws the whole board every frame (grid → locked cells → ghost at alpha 0.2 → current piece). `drawNext()` renders to a separate 120×120 `#next-canvas` with a 4×4 cell area and only runs on spawn. The HUD (`updateHUD`) is DOM text, not canvas.

## Conventions

- User-facing text (HTML labels, overlay messages, README) is in **Spanish**. Keep it that way.
- If you change `COLS`, `ROWS`, or `BLOCK`, also update the `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`).
- The keyboard controls are listed in both the `keydown` handler and the controls list in `index.html` (and in the README). Update all of them together.
