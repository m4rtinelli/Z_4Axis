/**
 * render.js - one frame of the canvas.
 *
 * Two layers, and the split matters: the MARK is the drawing, the HANDLES
 * are the tool. Everything above the handle section is what an export would
 * contain, everything in it is scaffolding that must never end up in one.
 * Keeping them apart now is what makes an export a small addition later
 * rather than a refactor.
 *
 * THE HANDLES ARE DELIBERATELY QUIET. A handle has two jobs and they pull
 * against each other: be findable, and stay out of the way of the thing it
 * is editing. The way out is to separate what you SEE from what you can
 * HIT - a 4px dot inside a 15px target. The dot can then be small enough to
 * disappear next to the artwork while the target stays as easy to grab as a
 * button, and the mark is never competing with its own controls for
 * attention. Labels came off the dots for the same reason: the readout in
 * the top bar already says which point is which, and saying it twice put a
 * letter on top of the letter.
 */

import {
  frame, divider, toPx, barQuad, segments, subdivide, inset,
  imagePlacement, pannable, isDark, alignFor, baselineFor, fontSpec,
} from './model.js';

const BLUE = '#007aff';               // a handle in play
const GUIDE = 'rgba(0, 122, 255, 0.34)';

/**
 * A handle stays white; only its ring changes weight.
 *
 * The alternative - flipping the dot itself to dark on pale ink - would
 * make the handles stop looking like one family, and a control that
 * changes identity with the artwork is a control you have to re-learn
 * every time you pick a colour. Holding the fill and adjusting only the
 * ring keeps them recognisable and legible on anything.
 */
const RING_ON_DARK = 'rgba(0, 0, 0, 0.30)';
const RING_ON_LIGHT = 'rgba(0, 0, 0, 0.55)';

const ringFor = (hex) => (isDark(hex) ? RING_ON_DARK : RING_ON_LIGHT);

/** Handle sizes in device-independent px. Constant, so they stay grabbable. */
export const HANDLE_R = 4;
export const HANDLE_R_WARM = 5;
export const HIT_R = 15;
export const DIV_HIT = 9;

export function draw(ctx, cw, ch, state, ui) {
  const f = frame(cw, ch, state);
  const w = f.weightPx;
  const pts = state.anchors.map((p) => toPx(p, f));

  ctx.clearRect(0, 0, cw, ch);

  // ---- the document ------------------------------------------------------
  // A soft shadow rather than an outline. It does the same job - saying
  // where the page ends when black ink bleeds to its edge - without drawing
  // a line that would then be a line in the artwork's own space. The shadow
  // is cleared immediately: the mark must never inherit it.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
  ctx.shadowBlur = state.exporting ? 0 : 22;
  ctx.shadowOffsetY = state.exporting ? 0 : 5;
  ctx.fillStyle = state.paper;
  ctx.fillRect(f.board.x, f.board.y, f.board.size, f.board.size);
  ctx.restore();

  // ---- a background image ------------------------------------------------
  // Behind everything and clipped to the page. It has to be clipped: the
  // image COVERS the board, so it overflows on one axis by design, and
  // without the clip that overflow would paint across the workspace.
  if (state.image && state.imageWhere === 'back') {
    const box = imagePlacement(state.image.el, f.board, state.pan);
    if (box) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(f.board.x, f.board.y, f.board.size, f.board.size);
      ctx.clip();
      ctx.drawImage(state.image.el, box.x, box.y, box.w, box.h);
      ctx.restore();
    }
  }

  // ---- the rectangle -----------------------------------------------------
  // Full bleed to the board on its three outer sides. The letter keeps a
  // margin and the rectangle does not, which is the difference between an
  // element that sits on the page and one that is cut from it.
  //
  // Three readings of the same region, and they are ordered, not blended:
  // modules win over an image, because a set of modules cannot also be one
  // window onto one photograph. Loading an image while modules are on is
  // not an error and does not discard it - the image simply waits.
  //
  // And only an image PUT IN THE RECTANGLE competes for the region at all.
  // With the image in the background the region falls back to plain colour,
  // which is exactly what lets a block, or a set of modules, sit on top of
  // a photograph.
  if (f.rect) drawRegion(ctx, f, state);

  // ---- the letter: bars --------------------------------------------------
  ctx.fillStyle = state.letter;
  for (const [ia, ib] of segments(pts)) {
    const quad = barQuad(pts[ia], pts[ib], w);
    if (!quad) continue;
    poly(ctx, quad);
    ctx.fill();
  }

  // ---- the letter: anchor squares ----------------------------------------
  // After the bars, never before: the square exists to sit on top of the
  // notch two bars leave at a corner, and painted first it would be buried
  // under the very bars it is there to resolve.
  if (state.node > 0) {
    const r = (w * state.node) / 2;
    for (const p of pts) ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }

  // ---- the text ----------------------------------------------------------
  const tb = textBox(state, f.board);
  if (tb) {
    ctx.font = tb.font;
    ctx.textAlign = tb.align;
    ctx.textBaseline = tb.baseline;
    ctx.fillStyle = state.textColor;
    ctx.fillText(state.textValue, tb.point.x, tb.point.y);
  }

  // ---- handles (tool only) -----------------------------------------------
  if (!state.handles) return f;

  if (tb) drawTextHandle(ctx, tb, isText(ui.hover) || isText(ui.drag), ringFor(state.textColor));

  const d = divider(f);
  if (d) drawDivider(ctx, d, isDiv(ui.hover) || isDiv(ui.drag), ringFor(state.block));

  // An anchor always sits on the letter - the chain passes through it, so
  // there is a bar under it whatever the weight - which is why the letter's
  // colour is the right one to measure the ring against.
  const ring = ringFor(state.letter);

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const warm = isAnchor(ui.hover, i) || isAnchor(ui.drag, i);
    const r = warm ? HANDLE_R_WARM : HANDLE_R;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 0.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = warm ? BLUE : ring;
    ctx.lineWidth = warm ? 1.5 : 1;
    ctx.stroke();
  }

  return f;
}

/**
 * The rectangle, in whichever of its three readings applies.
 *
 * @param {object} f  the frame, whose `rect` is known to exist
 */
function drawRegion(ctx, f, state) {
  const r = f.rect;
  ctx.fillStyle = state.block;

  // ---- modules -----------------------------------------------------------
  if (state.multi) {
    const gapPx = state.gap * f.board.size;
    for (const cell of subdivide(r, state.count, state.cutSeed)) {
      const m = inset(cell, gapPx);
      if (m.w <= 0.5 || m.h <= 0.5) continue;   // eaten by its own gap
      const rad = (state.radius * Math.min(m.w, m.h)) / 2;
      roundRectPath(ctx, m.x, m.y, m.w, m.h, rad);
      ctx.fill();
    }
    return;
  }

  // ---- an image, masked by the rectangle ---------------------------------
  // The clip is the entire mechanism. The image is placed against the
  // BOARD, so it does not move when the rectangle does; the rectangle only
  // decides how much of it you are allowed to see. `pan` moves the image
  // within that window, which is the one thing that does move it.
  const box = state.image && state.imageWhere === 'rect'
    && imagePlacement(state.image.el, f.board, state.pan);
  if (box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(state.image.el, box.x, box.y, box.w, box.h);
    ctx.restore();
    return;
  }

  // ---- plain ink ---------------------------------------------------------
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/* ------------------------------------------------------------------ */
/* text                                                               */

/**
 * A context that exists only to measure.
 *
 * Text metrics need a canvas, and hit-testing needs the same metrics the
 * drawing used. Caching the box from the last frame would work until the
 * frame the user resized the window, so instead both callers ask this one
 * function and it measures on the spot - one source of truth, no state to
 * fall out of date.
 */
let scratch = null;

function measurer() {
  // Built on first use rather than at import. A module that reaches for
  // `document` while it is being loaded cannot be imported anywhere there
  // is no DOM - which rules out testing any of the geometry in this file
  // outside a browser, for the sake of one canvas nothing may even need.
  if (!scratch) scratch = document.createElement('canvas').getContext('2d');
  return scratch;
}

/**
 * Where the text is, and the box it occupies.
 *
 * The box is derived, never stored: `align` and `baseline` come from the
 * anchor's position on the page, and the offsets follow from those. So
 * moving the anchor past a quarter of the page flips the text to face
 * inwards and the box follows it without a second thought.
 *
 * @returns {{point,x,y,w,h,size,font,align,baseline}|null}
 */
export function textBox(state, board) {
  if (!state.text) return null;
  const value = String(state.textValue ?? '');
  if (!value) return null;

  const size = state.textSize * board.size;
  const font = fontSpec(state.textFont, size);
  const ctx = measurer();
  ctx.font = font;
  const w = ctx.measureText(value).width;
  const h = size;

  const align = alignFor(state.textPos.x);
  const baseline = baselineFor(state.textPos.y);
  const point = {
    x: board.x + state.textPos.x * board.size,
    y: board.y + state.textPos.y * board.size,
  };

  return {
    point,
    x: align === 'right' ? point.x - w : align === 'center' ? point.x - w / 2 : point.x,
    y: baseline === 'bottom' ? point.y - h : baseline === 'middle' ? point.y - h / 2 : point.y,
    w,
    h,
    size,
    font,
    align,
    baseline,
  };
}

/**
 * The text's handle: a square dot, where the anchors are round.
 *
 * Different shape rather than different colour, because the anchors and the
 * text are different KINDS of thing and colour is already carrying the
 * hover state. A square also matches what the anchor squares of the letter
 * look like, which is a small joke the reference sheet makes first.
 */
function drawTextHandle(ctx, tb, warm, ring) {
  const s = warm ? 9 : 7;

  if (warm) {
    ctx.strokeStyle = 'rgba(0, 122, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tb.x - 3.5, tb.y - 3.5, tb.w + 7, tb.h + 7);
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 0.5;
  ctx.fillStyle = '#fff';
  ctx.fillRect(tb.point.x - s / 2, tb.point.y - s / 2, s, s);
  ctx.restore();

  ctx.strokeStyle = warm ? BLUE : ring;
  ctx.lineWidth = warm ? 1.5 : 1;
  ctx.strokeRect(tb.point.x - s / 2, tb.point.y - s / 2, s, s);
}

/**
 * The divider: a hairline the length of the board, plus a grip at its middle.
 *
 * The line alone would be the honest drawing of where the edge is, and it
 * would also be a one-pixel target sitting on a black rectangle. The grip is
 * what you actually aim at - a pill, in the same white-with-a-shadow idiom
 * as the anchor dots, so the two read as one family of controls.
 */
function drawDivider(ctx, d, warm, ring) {
  const mx = (d.x1 + d.x2) / 2;
  const my = (d.y1 + d.y2) / 2;
  const long = 20;
  const short = 4;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = warm ? BLUE : GUIDE;
  ctx.beginPath();
  ctx.moveTo(d.x1, d.y1);
  ctx.lineTo(d.x2, d.y2);
  ctx.stroke();
  ctx.restore();

  const gw = d.vertical ? short : long;
  const gh = d.vertical ? long : short;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 0.5;
  ctx.fillStyle = warm ? BLUE : '#fff';
  roundRectPath(ctx, mx - gw / 2, my - gh / 2, gw, gh, short / 2);
  ctx.fill();
  ctx.restore();

  if (!warm) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 1;
    roundRectPath(ctx, mx - gw / 2, my - gh / 2, gw, gh, short / 2);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* hit testing                                                        */

export const isAnchor = (d, i) => !!d && d.kind === 'anchor' && d.i === i;
export const isDiv = (d) => !!d && d.kind === 'divider';
export const isImage = (d) => !!d && d.kind === 'image';
export const isText = (d) => !!d && d.kind === 'text';

/**
 * What is under the cursor, as a descriptor, or null.
 *
 * SMALLEST TARGET WINS: anchor, divider, text, image. An anchor is a point,
 * the divider is a line, the text is a small box, the image is a whole
 * region - so wherever two of them overlap, the more precise one is the one
 * that was aimed at. Put the image first and you could never grab the
 * divider that sits on its own edge, nor the caption lying on top of it.
 */
export function hit(x, y, cw, ch, state) {
  const f = frame(cw, ch, state);

  // Walked backwards so the last-drawn handle wins. With four anchors that
  // only matters when two are stacked - which is exactly when a rule about
  // it is worth having.
  let best = -1;
  let bestD = HIT_R * HIT_R;
  for (let i = state.anchors.length - 1; i >= 0; i--) {
    const p = toPx(state.anchors[i], f);
    const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (dd <= bestD) { bestD = dd; best = i; }
  }
  if (best >= 0) return { kind: 'anchor', i: best };

  const d = divider(f);
  if (d) {
    const b = f.board;
    const along = d.vertical
      ? y >= b.y - DIV_HIT && y <= b.y + b.size + DIV_HIT
      : x >= b.x - DIV_HIT && x <= b.x + b.size + DIV_HIT;
    const across = Math.abs((d.vertical ? x : y) - d.at);
    if (along && across <= DIV_HIT) return { kind: 'divider', i: -1 };
  }

  // The text, by its own box plus a little slack - a caption at 12px is a
  // 12px target, and the padding is what makes it grabbable at all.
  const tb = textBox(state, f.board);
  if (tb) {
    const pad = 5;
    if (x >= tb.x - pad && x <= tb.x + tb.w + pad
        && y >= tb.y - pad && y <= tb.y + tb.h + pad) {
      return { kind: 'text', i: -1 };
    }
  }

  // The image is grabbable only where it is actually visible. In the
  // rectangle that means inside the rectangle; in the background it means
  // anywhere on the page, because that is where it is.
  if (state.image) {
    const inRect = state.imageWhere === 'rect' && f.rect && !state.multi
      && x >= f.rect.x && x <= f.rect.x + f.rect.w
      && y >= f.rect.y && y <= f.rect.y + f.rect.h;
    const inBoard = state.imageWhere === 'back'
      && x >= f.board.x && x <= f.board.x + f.board.size
      && y >= f.board.y && y <= f.board.y + f.board.size;
    if ((inRect || inBoard) && pannable(imagePlacement(state.image.el, f.board, state.pan))) {
      return { kind: 'image', i: -1 };
    }
  }

  return null;
}

function poly(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}

/** roundRect with a fallback, since it is newer than the rest of this API. */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (r > 0.5 && ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}
