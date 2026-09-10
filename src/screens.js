/**
 * screens.js - the sheet of generated applications.
 *
 * ONE LATTICE, TWO JOBS. The dots are the texture and they are also the
 * snapping system: the same cell grid that gets drawn as a field of dots is
 * the grid every block lands on. That is not a coincidence to be arranged,
 * it is the point - a decorative grid that nothing obeys is wallpaper, and
 * an invisible grid that everything obeys is a rule you have to take on
 * faith. Drawing the thing the layout actually uses makes the composition
 * legible as a system.
 *
 * INTENT IN FRACTIONS, REALISATION ON THE LATTICE. The generator picks
 * sizes and positions as shares of the page - "the panel is about a third
 * of the width, roughly centred" - and only then rounds them to cells. So
 * changing the dot density does not scramble the composition; it quantises
 * the same intent more coarsely or more finely, which is what a functional
 * grid should feel like when you change its resolution.
 *
 * Nothing here is stored. A screen is a pure function of its seed and its
 * lattice, exactly like the module subdivision, so the sheet survives a
 * resize, a redraw and a density change without keeping a single rectangle
 * anywhere.
 */

import { rng } from './rng.js';
import {
  barQuad, segments, barWeight, imagePlacement, fontSpec, SCREEN_RATIO,
} from './model.js';

/* ------------------------------------------------------------------ */
/* the lattice                                                        */

/**
 * The cell grid of one screen.
 *
 * Two cell sizes rather than one square cell, because the lattice must
 * TILE THE PAGE EXACTLY - the dots have to reach all four edges evenly and
 * a block snapped to the last column has to land on the page's edge, not
 * a rounding error short of it. At 3:4 the two cell sizes differ by under
 * a percent, so they read as square anyway.
 */
export function lattice(page, cols) {
  const c = Math.max(2, Math.round(cols));
  const rows = Math.max(2, Math.round(c * SCREEN_RATIO));
  return {
    cols: c,
    rows,
    cw: page.w / c,
    chh: page.h / rows,
    x: page.x,
    y: page.y,
    w: page.w,
    h: page.h,
  };
}

/** A rect given in cell indices, as pixels. */
export function cellRect(L, cx, cy, cwide, chigh) {
  return {
    x: L.x + cx * L.cw,
    y: L.y + cy * L.chh,
    w: cwide * L.cw,
    h: chigh * L.chh,
  };
}

/* ------------------------------------------------------------------ */
/* the composition                                                    */

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

/**
 * One screen, as a description.
 *
 * Pure and seeded, so the same seed and lattice always give the same
 * composition and nothing needs to be remembered between frames.
 *
 * The ground is either a field of dots or an image frame, never both. That
 * is the rule the reference sheet states by example: a page is either the
 * drafting surface with the lattice showing, or it is a photograph with a
 * block on it. Both at once is a third thing nobody asked for, and it
 * would bury the dots under the photo anyway.
 */
export function compose(seed, L, hasImage) {
  const rnd = rng(seed);

  const ground = hasImage
    ? pick(rnd, ['dots', 'image', 'image', 'plain'])
    : pick(rnd, ['dots', 'dots', 'plain']);

  // ---- the panel: the focal block ----------------------------------------
  // Portrait, roughly a third of the width, roughly centred. The jitter is
  // deliberately small: these are applications of one mark, and a focal
  // block that wanders to a corner stops being the same system.
  const wFrac = 0.24 + rnd() * 0.14;
  const hFrac = wFrac * (1.15 + rnd() * 0.35) / SCREEN_RATIO;
  const xFrac = (1 - wFrac) / 2 + (rnd() - 0.5) * 0.06;
  const yFrac = (1 - hFrac) / 2 + (rnd() - 0.5) * 0.10;

  const panel = snap(L, xFrac, yFrac, wFrac, hFrac);

  // ---- the image frame ---------------------------------------------------
  // Grown out of the panel rather than placed independently, so the block
  // always sits ON the photograph the way the reference shows, instead of
  // beside it in a way that would need a second set of constraints to stop
  // the two colliding.
  // The amounts are drawn once and kept, so `resolve` can regrow the frame
  // around a panel you have moved by hand and get the SAME frame - rather
  // than a differently-sized one, which is what re-rolling the generator
  // mid-composition would give.
  const wide = 1 + Math.floor(rnd() * 3);
  const tall = wide + Math.floor(rnd() * 3);
  const image = ground === 'image' ? grow(L, panel, wide, tall) : null;

  // ---- the captions ------------------------------------------------------
  const both = rnd();
  const top = both < 0.75;
  const bottom = both < 0.45 || both > 0.8;

  return {
    ground,
    dots: ground === 'dots',
    panel,
    image,
    wide,
    tall,
    rects: [],
    placed: false,
    top,
    bottom,
    topRow: 2 + Math.floor(rnd() * 2),
    bottomRow: L.rows - 2 - Math.floor(rnd() * 2),
  };
}

/**
 * The composition you actually see: generated, then overridden.
 *
 * The overrides come in as fractions and are snapped here, which is what
 * makes a hand-placed block behave exactly like a generated one - same
 * lattice, same rounding, same clamping. An override that carried pixels
 * or cell indices would be a second placement rule living beside the
 * first.
 *
 * The image frame is still grown from the PANEL, so moving the panel by
 * hand takes the photograph with it. That rule was worth keeping: it is
 * the reason a block always lands on the image instead of beside it.
 */
export function resolve(seed, L, hasImage, edit) {
  const comp = compose(seed, L, hasImage);
  if (!edit) return { ...comp, rects: [], placed: false };

  const panel = edit.panel ? snap(L, edit.panel.x, edit.panel.y, edit.panel.w, edit.panel.h) : comp.panel;
  const image = comp.ground === 'image' ? grow(L, panel, comp.wide, comp.tall) : null;

  return {
    ...comp,
    panel,
    image,
    rects: (edit.rects || []).map((r) => snap(L, r.x, r.y, r.w, r.h)),
    placed: !!edit.panel,
  };
}

/** The image frame, grown out of a panel by a fixed number of cells. */
function grow(L, panel, wide, tall) {
  return clampCells(L, {
    cx: panel.cx - wide,
    cy: panel.cy - tall,
    cw: panel.cw + wide * 2,
    ch: panel.ch + tall * 2,
  });
}

/** A cell rect, back to fractions of the page - the form edits are kept in. */
export function toFrac(L, r) {
  return { x: r.cx / L.cols, y: r.cy / L.rows, w: r.cw / L.cols, h: r.ch / L.rows };
}

/** Fractions of the page -> a cell-aligned rect, kept on the page. */
function snap(L, fx, fy, fw, fh) {
  return clampCells(L, {
    cx: Math.round(fx * L.cols),
    cy: Math.round(fy * L.rows),
    cw: Math.max(2, Math.round(fw * L.cols)),
    ch: Math.max(2, Math.round(fh * L.rows)),
  });
}

/**
 * Keep a cell rect inside the page, with a one-cell margin.
 *
 * Shrinks before it slides. A block pushed back in from the edge would
 * still be the size it asked for and would then hang off the other side;
 * clamping the size first means the worst case is a smaller block, never a
 * clipped one.
 */
function clampCells(L, r) {
  const cw = Math.min(r.cw, L.cols - 2);
  const ch = Math.min(r.ch, L.rows - 2);
  const cx = Math.min(Math.max(1, r.cx), L.cols - 1 - cw);
  const cy = Math.min(Math.max(1, r.cy), L.rows - 1 - ch);
  return { cx, cy, cw, ch, ...cellRect(L, cx, cy, cw, ch) };
}

/* ------------------------------------------------------------------ */
/* the sheet                                                          */

/**
 * Fit `n` portrait cards into the stage, as large as they will go.
 *
 * Tries every column count and keeps the one that makes the biggest card,
 * rather than assuming a shape. Two screens want to be side by side, six
 * want three across, and the arithmetic finds that out instead of being
 * told.
 */
export function sheet(cw, ch, n, gap = 28) {
  let best = null;

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const availW = cw - gap * (cols + 1);
    const availH = ch - gap * (rows + 1);
    if (availW <= 4 || availH <= 4) continue;

    const cardW = Math.min(availW / cols, availH / rows / SCREEN_RATIO);
    if (cardW > 4 && (!best || cardW > best.cardW)) {
      best = { cols, rows, cardW, cardH: cardW * SCREEN_RATIO };
    }
  }

  if (!best) return { cards: [] };

  const { cols, rows, cardW, cardH } = best;
  const gridW = cols * cardW + (cols - 1) * gap;
  const gridH = rows * cardH + (rows - 1) * gap;
  const ox = (cw - gridW) / 2;
  const oy = (ch - gridH) / 2;

  const cards = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // The last row is centred on its own, so a sheet of five reads as a
    // deliberate arrangement rather than as four plus a leftover.
    const inRow = Math.min(cols, n - row * cols);
    const rowW = inRow * cardW + (inRow - 1) * gap;
    cards.push({
      x: ox + (gridW - rowW) / 2 + col * (cardW + gap),
      y: oy + row * (cardH + gap),
      w: cardW,
      h: cardH,
    });
  }

  return { cards, cardW, cardH };
}

/* ------------------------------------------------------------------ */
/* drawing                                                            */

/**
 * The whole sheet, resolved.
 *
 * ONE MODEL, READ BY BOTH THE RENDERER AND THE HIT TEST. Working it out
 * twice would be two chances to disagree about where a block is, and a
 * handle that is not where it looks is the worst class of bug in a
 * direct-manipulation tool - it makes the user doubt their own aim.
 *
 * Each screen's seed is derived from the one stored seed and its own index,
 * mixed by the golden-ratio constant so neighbouring indices do not produce
 * neighbouring compositions. Seeding them `seed + i` instead gives a sheet
 * whose first two screens are near-identical, because a small change to a
 * mulberry32 seed is a small change to its first outputs.
 */
export function sheetModel(cw, ch, state) {
  const n = Math.max(1, Math.round(state.sheetCount));
  const { cards } = sheet(cw, ch, n);
  const hasImage = !!state.image;

  return cards.map((page, i) => {
    const L = lattice(page, state.dotCols);
    const seed = (state.screenSeed + Math.imul(i, 0x9e3779b9)) >>> 0;
    return { index: i, page, L, comp: resolve(seed, L, hasImage, state.edits[i]) };
  });
}

export function drawSheet(ctx, cw, ch, state, ui) {
  ctx.clearRect(0, 0, cw, ch);

  const model = sheetModel(cw, ch, state);

  for (const s of model) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = state.paper;
    ctx.fillRect(s.page.x, s.page.y, s.page.w, s.page.h);
    ctx.restore();

    drawScreen(ctx, s.page, state, s.comp, s.L);
  }

  // Handles last and over everything, so a block hidden under the panel is
  // still reachable by its own grip.
  if (state.handles) for (const s of model) drawScreenHandles(ctx, s, state, ui);

  return model;
}

/* ------------------------------------------------------------------ */
/* handles and picking                                                */

export const GRIP = 9;      // the resize square, in device-independent px
const GRIP_HIT = 12;

const HANDLE_BLUE = '#007aff';

function drawScreenHandles(ctx, s, state, ui) {
  const chosen = state.selected === s.index;
  // Hover and drag both light a handle, and a drag outranks a hover that
  // has wandered off it - so the block you are holding stays lit even when
  // the cursor has run ahead of it.
  const hot = (kind, i) => [ui.sheetDrag, ui.sheet].some((d) => d
    && d.index === s.index && d.kind === kind && d.i === i);

  // The selected screen wears a hairline, because the buttons in the panel
  // act on it and a button whose target is invisible is a guess.
  if (chosen) {
    ctx.strokeStyle = 'rgba(0, 122, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.page.x - 1.5, s.page.y - 1.5, s.page.w + 3, s.page.h + 3);
  }

  outline(ctx, s.comp.panel, hot('panel', -1) || hot('panelGrip', -1));
  grip(ctx, s.comp.panel, hot('panelGrip', -1));

  for (let i = 0; i < s.comp.rects.length; i++) {
    outline(ctx, s.comp.rects[i], hot('rect', i) || hot('rectGrip', i));
    grip(ctx, s.comp.rects[i], hot('rectGrip', i));
  }
}

function outline(ctx, r, warm) {
  if (!warm) return;
  ctx.strokeStyle = HANDLE_BLUE;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
}

function grip(ctx, r, warm) {
  const x = r.x + r.w;
  const y = r.y + r.h;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 0.5;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - GRIP / 2, y - GRIP / 2, GRIP, GRIP);
  ctx.restore();
  ctx.strokeStyle = warm ? HANDLE_BLUE : 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = warm ? 1.5 : 1;
  ctx.strokeRect(x - GRIP / 2, y - GRIP / 2, GRIP, GRIP);
}

/**
 * What is under the cursor on the sheet.
 *
 * Grips before bodies, and the panel before the extra blocks - the same
 * "smallest target wins" rule the mark tab uses. Every grip is tested
 * across every screen before any body is, so a grip lying on top of a
 * neighbouring block is still the thing you grabbed.
 */
export function pickInSheet(x, y, cw, ch, state) {
  const model = sheetModel(cw, ch, state);

  for (const s of model) {
    if (near(x, y, s.comp.panel)) return { index: s.index, kind: 'panelGrip', i: -1 };
    for (let i = s.comp.rects.length - 1; i >= 0; i--) {
      if (near(x, y, s.comp.rects[i])) return { index: s.index, kind: 'rectGrip', i };
    }
  }

  for (const s of model) {
    if (inside(x, y, s.comp.panel)) return { index: s.index, kind: 'panel', i: -1 };
    for (let i = s.comp.rects.length - 1; i >= 0; i--) {
      if (inside(x, y, s.comp.rects[i])) return { index: s.index, kind: 'rect', i };
    }
    if (inside(x, y, s.page)) return { index: s.index, kind: 'page', i: -1 };
  }

  return null;
}

/** The screen a point falls on, and its lattice - for a drag in progress. */
export function screenAt(index, cw, ch, state) {
  return sheetModel(cw, ch, state).find((s) => s.index === index) || null;
}

const inside = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

const near = (x, y, r) => Math.abs(x - (r.x + r.w)) <= GRIP_HIT
                       && Math.abs(y - (r.y + r.h)) <= GRIP_HIT;

/**
 * One screen, into one pixel rect.
 *
 * The letter inside the panel is drawn KNOCKED OUT in the paper colour.
 * That needs no control and it is what the reference shows: the block is
 * the ink, the mark is the hole in it. Drawing it in the letter colour
 * instead would make the default state - one ink for the letter and the
 * block - a black Z on a black panel, which is to say nothing at all.
 */
export function drawScreen(ctx, page, state, comp, L) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(page.x, page.y, page.w, page.h);
  ctx.clip();

  // ---- the page ----------------------------------------------------------
  ctx.fillStyle = state.paper;
  ctx.fillRect(page.x, page.y, page.w, page.h);

  // ---- the captions, measured before anything is drawn -------------------
  // Their boxes are needed BEFORE the dots, because a caption reserves the
  // cells it sits in and the lattice leaves those cells empty. That is the
  // grid being functional in a second way, and it is much better than the
  // alternatives: text laid over a dot field is unreadable, and suppressing
  // the caption whenever the dots are showing would make two features that
  // cannot be used together.
  const unit = page.w;
  const caps = [];
  if (comp.top && state.screenTop) {
    caps.push(layout(ctx, state, state.screenTop, page.x + page.w / 2,
      L.y + comp.topRow * L.chh, unit * 0.026, 0.14, ''));
  }
  if (comp.bottom && state.screenBottom) {
    caps.push(layout(ctx, state, state.screenBottom, page.x + page.w / 2,
      L.y + comp.bottomRow * L.chh, unit * 0.05, 0, '700'));
  }

  // ---- the lattice, as texture -------------------------------------------
  if (comp.dots) drawDots(ctx, L, state.letter, caps);

  // ---- the image frame ---------------------------------------------------
  if (comp.image && state.image) {
    const box = imagePlacement(state.image.el, squareOver(comp.image), state.pan);
    if (box) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(comp.image.x, comp.image.y, comp.image.w, comp.image.h);
      ctx.clip();
      ctx.drawImage(state.image.el, box.x, box.y, box.w, box.h);
      ctx.restore();
    }
  }

  // ---- the extra blocks --------------------------------------------------
  // Before the panel, so the mark is never covered by a block you added
  // after it. The panel is the focal element; the others compose around it.
  ctx.fillStyle = state.block;
  for (const r of comp.rects || []) ctx.fillRect(r.x, r.y, r.w, r.h);

  // ---- the panel ---------------------------------------------------------
  ctx.fillRect(comp.panel.x, comp.panel.y, comp.panel.w, comp.panel.h);

  // ---- the letter, knocked out of the panel ------------------------------
  drawLetterIn(ctx, comp.panel, state);

  // ---- the captions ------------------------------------------------------
  for (const cap of caps) drawCaption(ctx, state, cap);

  ctx.restore();
}

/**
 * The dots.
 *
 * Drawn at every cell corner, including the page's own edges, so the field
 * reads as the page's grid rather than as a rectangle of pattern floating
 * inside it. The radius follows the cell, so a coarse lattice gets fat dots
 * and a fine one gets a fine screen - the density control changes the
 * texture's character, not just its count.
 */
function drawDots(ctx, L, colour, reserved = []) {
  const r = Math.max(0.5, Math.min(L.cw, L.chh) * 0.13);
  // The clearance is generous on purpose: a dot grazing a letterform reads
  // as dirt on the page, not as a grid.
  const pad = Math.max(L.cw, L.chh) * 0.9;
  ctx.fillStyle = colour;

  for (let cy = 0; cy <= L.rows; cy++) {
    for (let cx = 0; cx <= L.cols; cx++) {
      const x = L.x + cx * L.cw;
      const y = L.y + cy * L.chh;
      if (reserved.some((b) => x >= b.x - pad && x <= b.x + b.w + pad
                            && y >= b.boxY - pad && y <= b.boxY + b.h + pad)) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The mark, fitted into a panel, using the mark tab's own anchors. */
function drawLetterIn(ctx, panel, state) {
  const short = Math.min(panel.w, panel.h);
  const pad = short * 0.06;
  const room = Math.max(2, short - pad * 2);
  const { weightPx, over } = barWeight(room, state.weight, state.node);

  const ux = Math.max(1, panel.w - pad * 2 - over * 2);
  const uy = Math.max(1, panel.h - pad * 2 - over * 2);
  const ox = panel.x + pad + over;
  const oy = panel.y + pad + over;

  const pts = state.anchors.map((p) => ({ x: ox + p.x * ux, y: oy + p.y * uy }));

  ctx.fillStyle = state.paper;
  for (const [ia, ib] of segments(pts)) {
    const quad = barQuad(pts[ia], pts[ib], weightPx);
    if (!quad) continue;
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
    ctx.closePath();
    ctx.fill();
  }

  if (state.node > 0) {
    const r = (weightPx * state.node) / 2;
    for (const p of pts) ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
}

/**
 * A caption, laid out but not yet drawn.
 *
 * Split from the drawing so the dot field can be told where the type is
 * going before it paints. Tracking is applied by hand because canvas has no
 * letter-spacing, and the reference wordmark is tracked wide - set solid it
 * does not read as the same object.
 */
function layout(ctx, state, value, cx, y, size, tracking, weight) {
  const font = fontSpec(state.textFont, size, weight);
  ctx.font = font;
  const chars = [...String(value)];
  const space = size * tracking;
  const widths = chars.map((c) => ctx.measureText(c).width);
  const w = widths.reduce((a, b) => a + b, 0) + space * Math.max(0, chars.length - 1);

  return {
    font, chars, widths, space, size,
    y,                          // the baseline the text is centred on
    x: cx - w / 2,
    w,
    // The box is what the dot field must avoid, so it is the type's extent
    // and not its baseline: centred on `y`, one size tall.
    boxY: y - size / 2,
    h: size,
  };
}

function drawCaption(ctx, state, cap) {
  ctx.font = cap.font;
  ctx.fillStyle = state.textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let x = cap.x;
  for (let i = 0; i < cap.chars.length; i++) {
    ctx.fillText(cap.chars[i], x, cap.y);
    x += cap.widths[i] + cap.space;
  }
}

/**
 * The square an image is measured against inside a frame.
 *
 * `imagePlacement` covers a SQUARE board, and an image frame on a screen is
 * not square. Handing it the frame's longer side as a square, centred on
 * the frame, keeps one placement rule for both tabs: the image still
 * covers, still crops, and still answers to the same pan.
 */
function squareOver(rect) {
  const size = Math.max(rect.w, rect.h);
  return {
    x: rect.x + (rect.w - size) / 2,
    y: rect.y + (rect.h - size) / 2,
    size,
  };
}
