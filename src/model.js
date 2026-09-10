/**
 * model.js - the Z, and the arithmetic that puts it on screen.
 *
 * THE WHOLE LETTER IS FOUR POINTS. A chain runs 0 -> 1 -> 2 -> 3, so the
 * mark is connected by construction: there is no state in which a segment
 * can come loose, because the segments are not stored at all - they are
 * read off consecutive pairs of the same four anchors. That is the reason
 * to hold the letter this way rather than as a list of bars.
 *
 * Anchors live in a unit box (x right, y down, both 0..1). Nothing here
 * knows about pixels except `frame`, which is the single place the two
 * coordinate systems meet.
 */

import { rng, newSeed } from './rng.js';

/** Chain order, and the labels the handles wear. */
export const LABELS = ['A', 'B', 'C', 'D'];

/** The canonical Z: top bar, diagonal down-left, bottom bar. */
export const HOME = [
  { x: 0, y: 0 },   // A - top left
  { x: 1, y: 0 },   // B - top right
  { x: 0, y: 1 },   // C - bottom left
  { x: 1, y: 1 },   // D - bottom right
];

export const RANGE = {
  // Bar width as a fraction of the LETTER'S OWN box, short axis - see frame().
  // At 1 the bar is as wide as the box is short, which is a solid block; the
  // range stops there because past it the number stops meaning anything.
  weight: { min: 0.03, max: 1, step: 0.01 },
  node: { min: 0, max: 3, step: 0.05 },           // anchor square, as a multiple of the bar
  count: { min: 2, max: 12, step: 1 },            // how many modules the rectangle becomes
  gap: { min: 0, max: 0.03, step: 0.001 },        // between modules, as a fraction of the board
  radius: { min: 0, max: 1, step: 0.02 },         // of a module, as a share of its short side
  textSize: { min: 0.012, max: 0.16, step: 0.002 }, // cap height, as a fraction of the board
  sheetCount: { min: 1, max: 6, step: 1 },        // how many screens on the sheet
  dotCols: { min: 8, max: 48, step: 1 },          // lattice columns across a screen
};

/** Screens are portrait 3:4 - the proportion the reference sheet uses. */
export const SCREEN_RATIO = 4 / 3;

export const TABS = [['mark', 'Marca'], ['screens', 'Telas']];

/** Modular grid the anchors and the divider land on when snapping is on. */
export const GRID = 1 / 8;

/**
 * How far the divider may travel.
 *
 * Never to either end. A rectangle at 0 is the toggle spelled a second way,
 * and a Z crushed to nothing is a state you can enter but not see your way
 * out of - both ends of the range are places where the drag stops teaching
 * you anything, so the range stops before them.
 */
export const SPLIT = { min: 1 / 8, max: 7 / 8 };

export const SIDES = [
  ['bottom', 'Base'], ['top', 'Topo'], ['left', 'Esq'], ['right', 'Dir'],
];

/**
 * Where the image goes.
 *
 * One image with a choice of place, rather than two independent slots. The
 * reference sheet only ever shows one of the two - a photograph filling the
 * card with the letter drawn over it, or a solid block beside the letter -
 * and a second slot would double the state to describe a combination
 * nobody asked for.
 */
export const PLACES = [['rect', 'Retângulo'], ['back', 'Fundo']];

export const FALLBACK_FONTS = [
  '', 'Helvetica Neue', 'Arial', 'Arial Black', 'Verdana', 'Tahoma',
  'Trebuchet MS', 'Impact', 'Futura', 'Optima', 'Georgia', 'Palatino',
  'Garamond', 'Times New Roman', 'Courier New', 'Menlo', 'Consolas',
];

/** Margin the letter keeps inside its own region, as a fraction of the board. */
const PAD = 0.07;

export function defaults() {
  return {
    anchors: HOME.map((p) => ({ ...p })),
    weight: 0.28,
    node: 1.45,

    // The letter and the block start on the same ink deliberately: the
    // opening state is one ink and one system, and separating them has to
    // be something you chose rather than something you inherited.
    paper: '#ffffff',
    letter: '#1d1d1f',
    block: '#1d1d1f',
    snap: true,
    handles: true,
    rect: false,
    rectSide: 'bottom',
    rectSize: 3 / 8,

    // The image is a loaded HTMLImageElement plus what we need to release
    // it again - `{ el, name, url }` - not a path or a data URI. It is the
    // one piece of state that is a live object rather than a number, which
    // is also why it is the one piece that will not survive a saved file
    // when saving arrives.
    image: null,

    /**
     * Where the image sits, in units of its OWN available slack: -1 is
     * flush to one edge, +1 flush to the other, 0 centred. Not pixels and
     * not a fraction of the board, because the amount there is to pan
     * depends on the image's aspect - a normalised offset survives a change
     * of image, of board size and of window size, and it re-clamps itself
     * for free.
     */
    pan: { x: 0, y: 0 },
    imageWhere: 'rect',

    /**
     * The text sits in BOARD coordinates, not in the letter's box.
     *
     * The letter's box shrinks when the rectangle grows; a caption pinned
     * to the corner of the page must not move because the page was
     * divided differently. So the text snaps to eighths of the BOARD -
     * the same grid the anchors use, measured against the page instead of
     * against the letter.
     */
    text: false,
    textValue: 'ZIVO',
    textFont: '',
    textSize: 0.028,
    // Bottom right on the page's own edge - measured, not guessed. At the
    // default weight the letter's bottom bar covers y 0.68 to 0.93 across
    // the full width, so every eighth from 6/8 to 7/8 would put dark text
    // on dark ink and the feature would look broken the moment it was
    // switched on. y = 1 is the nearest gridpoint that is clear.
    textPos: { x: 7 / 8, y: 1 },
    textColor: '#1d1d1f',

    // ---- the screens tab -------------------------------------------------
    // Its own composition state, but NOT its own letter: the screens draw
    // the anchors, weight and colours you designed in the mark tab. That
    // is the whole reason the two are tabs of one app rather than two
    // apps - you shape the mark, then you look at it applied.
    tab: 'mark',
    sheetCount: 2,
    dotCols: 26,
    screenSeed: newSeed(),
    screenTop: 'ZIVO',
    screenBottom: 'Z',

    /**
     * What you have moved by hand, per screen: `{ [index]: {panel, rects} }`.
     *
     * KEPT IN FRACTIONS OF THE PAGE, NOT IN CELL INDICES. Cell 9 of a
     * 26-column lattice and cell 9 of a 20-column one are different places,
     * so storing indices would slide every block you had placed the moment
     * you touched the density slider. Fractions re-snap to the nearest cell
     * instead, which preserves the intent - the same rule the generator
     * already works by.
     *
     * A screen with no entry here is purely generated. That is what lets
     * Gerar keep working on the screens you have not touched without
     * throwing away the ones you have.
     */
    edits: {},
    selected: 0,

    multi: false,
    count: 5,
    gap: 0.012,
    radius: 0,
    cutSeed: newSeed(),
  };
}

/* ------------------------------------------------------------------ */
/* store                                                              */

/**
 * A four-line store. Enough for two sliders and a drag - a framework here
 * would be more machinery than the app it runs.
 */
export function createStore() {
  let state = defaults();
  const subs = new Set();
  const emit = () => subs.forEach((fn) => fn(state));

  return {
    get state() { return state; },
    set(key, value) {
      if (state[key] === value) return;
      state = { ...state, [key]: value };
      // One special case in an otherwise generic setter, and it earns its
      // place: shrinking the sheet can leave the selection pointing at a
      // screen that no longer exists, and then Adicionar retângulo writes
      // its block onto a page nobody can see.
      if (key === 'sheetCount') {
        const last = Math.max(0, Math.round(value) - 1);
        if (state.selected > last) state = { ...state, selected: last };
      }
      emit();
    },
    /** Anchors are replaced whole, never mutated, so redraws stay honest. */
    setAnchor(i, x, y) {
      const anchors = state.anchors.map((p, k) => (k === i ? { x, y } : p));
      state = { ...state, anchors };
      emit();
    },
    setTextPos(x, y) {
      state = { ...state, textPos: { x: clamp01(x), y: clamp01(y) } };
      emit();
    },
    /** Pan is stored clamped, so nothing downstream has to re-check it. */
    setPan(x, y) {
      state = { ...state, pan: { x: clampPan(x), y: clampPan(y) } };
      emit();
    },
    /** A new cut. The button picks a number; the geometry follows from it. */
    recut() {
      state = { ...state, cutSeed: newSeed() };
      emit();
    },
    /**
     * A new sheet, on the same terms: one number, every screen follows.
     *
     * Hand edits survive it. A generate that discarded them would make the
     * button dangerous, and the whole point of keeping the edits separate
     * from the seed is that the two can move independently.
     */
    regenerate() {
      state = { ...state, screenSeed: newSeed() };
      emit();
    },

    /* ---- the screens you have touched ---------------------------------- */

    /** The screen the buttons act on. */
    select(index) {
      if (state.selected === index) return;
      state = { ...state, selected: index };
      emit();
    },

    /** Place or resize a screen's panel. `null` gives it back to the seed. */
    setPanel(index, frac) {
      state = withEdit(state, index, (e) => ({ ...e, panel: frac }));
      emit();
    },

    addRect(index, frac) {
      state = withEdit(state, index, (e) => ({ ...e, rects: [...(e.rects || []), frac] }));
      emit();
    },

    setRect(index, i, frac) {
      state = withEdit(state, index, (e) => ({
        ...e,
        rects: (e.rects || []).map((r, k) => (k === i ? frac : r)),
      }));
      emit();
    },

    removeRect(index, i) {
      state = withEdit(state, index, (e) => ({
        ...e,
        rects: (e.rects || []).filter((_, k) => k !== i),
      }));
      emit();
    },
    /** No argument resets the whole letter; an index resets one anchor. */
    reset(i) {
      const anchors = typeof i === 'number'
        ? state.anchors.map((p, k) => (k === i ? { ...HOME[i] } : p))
        : HOME.map((p) => ({ ...p }));
      state = { ...state, anchors };
      emit();
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

/**
 * One screen's edit record, replaced rather than mutated.
 *
 * An entry that ends up empty is deleted, so "has this screen been touched"
 * stays a question you can answer by looking - dropping a panel override
 * and removing the last rectangle really does give the screen back to the
 * generator, instead of leaving an empty husk that says otherwise.
 */
function withEdit(state, index, fn) {
  const before = state.edits[index] || {};
  const after = fn(before);
  const empty = !after.panel && !(after.rects && after.rects.length);
  const edits = { ...state.edits };
  if (empty) delete edits[index];
  else edits[index] = after;
  return { ...state, edits };
}

/* ------------------------------------------------------------------ */
/* geometry                                                           */

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const snapTo = (v, step = GRID) => Math.round(v / step) * step;

/**
 * The board, the split, and the unit box - all three at once.
 *
 * THE TWO ELEMENTS TILE THE BOARD. The rectangle takes a full-bleed band off
 * one side and the letter gets exactly what is left; there is no third
 * number holding them apart, so neither can be resized without the other
 * answering for it. That is what makes the split feel like shared space
 * rather than like two objects that happen to be near each other.
 *
 * THE UNIT BOX STRETCHES. `ux` and `uy` are independent, so the letter fills
 * whatever shape it is given - tall and steep, or short and shallow - which
 * is the whole point of adapting to the rectangle instead of merely making
 * room for it. Bar weight is measured off the BOARD and not off either axis,
 * so the horizontals and the diagonal stay one weight while the geometry
 * squashes. Scale the weight with the axis instead and a flattened Z comes
 * out with a fat diagonal and thin bars, which reads as a bug even when the
 * arithmetic behind it is consistent.
 *
 * @returns {{ox:number,oy:number,ux:number,uy:number,board:object,rect:object|null,
 *            weightPx:number,over:number}}
 */
export function frame(cw, ch, state) {
  const margin = Math.min(cw, ch) * 0.055;
  const size = Math.max(40, Math.min(cw, ch) - margin * 2);
  const board = { x: (cw - size) / 2, y: (ch - size) / 2, size };

  // ---- the split ---------------------------------------------------------
  let rect = null;
  let zx = board.x;
  let zy = board.y;
  let zw = size;
  let zh = size;

  if (state.rect) {
    const t = clamp(state.rectSize, SPLIT.min, SPLIT.max) * size;
    switch (state.rectSide) {
      case 'top':
        rect = { x: board.x, y: board.y, w: size, h: t };
        zy = board.y + t; zh = size - t; break;
      case 'left':
        rect = { x: board.x, y: board.y, w: t, h: size };
        zx = board.x + t; zw = size - t; break;
      case 'right':
        rect = { x: board.x + size - t, y: board.y, w: t, h: size };
        zw = size - t; break;
      default:
        rect = { x: board.x, y: board.y + size - t, w: size, h: t };
        zh = size - t;
    }
  }

  // ---- the letter's box inside what is left ------------------------------
  // The margin is a share of the board, but never more than a share of the
  // region it is a margin inside - otherwise a thin band is all margin and
  // the letter has nowhere to be.
  const short = Math.min(zw, zh);
  const pad = Math.min(size * PAD, short * 0.12);
  const room = Math.max(2, short - pad * 2);

  const { weightPx, over } = barWeight(room, state.weight, state.node);

  const ux = Math.max(1, zw - pad * 2 - over * 2);
  const uy = Math.max(1, zh - pad * 2 - over * 2);

  return {
    ox: zx + pad + over,
    oy: zy + pad + over,
    ux,
    uy,
    board,
    rect,
    weightPx,
    over,
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * How thick a bar is, given the room it has.
 *
 * THICKNESS IS MEASURED AGAINST THE LETTER, NOT AGAINST THE PAGE.
 *
 * Measure it against the board instead and the letter dies as the space
 * around it shrinks: the box gets short, the bar does not, and somewhere
 * around a third of the page the counters close and the Z reads as a black
 * block. Adapting has to mean staying legible, or it is not adapting - it
 * is just being crowded out.
 *
 * The two depend on each other, because the box is the room minus the
 * overhang and the overhang is half a bar (or half an anchor square, when
 * those are larger). Writing that down and solving it:
 *
 *     w = t · box            box = room − k·w        k = max(1, node)
 *     w = t · (room − k·w)  ->  w = t·room / (1 + t·k)
 *
 * Closed form, so there is no iteration and no circularity - and on the
 * short axis the identity is exact: w / box === t, at every proportion.
 *
 * Extracted rather than inlined because the screens tab draws the same
 * letter inside a panel a fifth of the size, and it has to be the same
 * arithmetic. Two copies of a rule this load-bearing is two rules waiting
 * to disagree.
 *
 * @param {number} room  the short side available, in px
 * @param {number} t     requested thickness, as a share of the letter's box
 * @param {number} node  anchor square size, as a multiple of the bar
 */
export function barWeight(room, t, node) {
  const k = Math.max(1, node);
  const weightPx = Math.max(0.5, (t * Math.max(2, room)) / (1 + t * k));
  return { weightPx, over: (weightPx * k) / 2 };
}

/**
 * The divider, as a line to draw and a band to grab.
 *
 * Derived from the frame rather than stored, so it cannot disagree with the
 * rectangle it is the edge of.
 */
export function divider(f) {
  if (!f.rect) return null;
  const b = f.board;
  const r = f.rect;
  const vertical = r.h === b.size;   // the band runs down a side, so its edge is vertical
  const at = vertical
    ? (r.x === b.x ? r.x + r.w : r.x)
    : (r.y === b.y ? r.y + r.h : r.y);
  return vertical
    ? { vertical: true, at, x1: at, y1: b.y, x2: at, y2: b.y + b.size }
    : { vertical: false, at, x1: b.x, y1: at, x2: b.x + b.size, y2: at };
}

/** Cursor position -> the rectangle's share of the board, for one side. */
export function splitFromPointer(x, y, f, side) {
  const b = f.board;
  switch (side) {
    case 'top': return (y - b.y) / b.size;
    case 'left': return (x - b.x) / b.size;
    case 'right': return (b.x + b.size - x) / b.size;
    default: return (b.y + b.size - y) / b.size;
  }
}

export const toPx = (p, f) => ({ x: f.ox + p.x * f.ux, y: f.oy + p.y * f.uy });

export const toUnit = (x, y, f) => ({ x: (x - f.ox) / f.ux, y: (y - f.oy) / f.uy });

/**
 * One bar as four corners.
 *
 * A polygon rather than a stroked line, for the same reason the older tool
 * used one: geometry you can also outline, offset or export as a real shape
 * later, instead of a line whose width is a rendering property.
 *
 * Ends are butt-cut. The two bars meeting at an anchor each carry that
 * anchor on their end face, so their union always overlaps there - the
 * anchor square that follows tidies the outside notch, it does not do the
 * joining. Which is why `node` may sit at 0 and the letter stays one piece.
 */
export function barQuad(a, b, w) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

/* ------------------------------------------------------------------ */
/* the rectangle, subdivided                                          */

/**
 * Cut a rectangle into `count` modules, by recursive guillotine.
 *
 * Two rules do all the work, and both are about the result staying usable
 * rather than about the randomness being interesting:
 *
 *   1. ALWAYS SPLIT THE BIGGEST CELL. Split a random one and the counts
 *      pile up in one corner - you ask for eight modules and get one large
 *      rectangle beside seven crumbs. Taking the largest each time keeps
 *      the areas within a factor of two or so of each other, which is what
 *      makes a set of them read as a composition.
 *
 *   2. ALWAYS CUT ACROSS THE LONGER SIDE. This is what makes the grid
 *      re-solve itself when the region is reshaped, instead of merely
 *      stretching: the axis of each cut is decided from the CURRENT pixel
 *      aspect of the cell, so dragging the divider genuinely relays the
 *      composition and the modules stay roughly squarish at any proportion.
 *      Decide the axis from the seed instead and a wide, short region comes
 *      out as a row of slivers.
 *
 * The consequence of rule 2 is worth naming: a cell whose aspect crosses
 * 1:1 mid-drag flips the direction of its own cut, and the layout visibly
 * jumps. That is the cost of adapting rather than scaling, and it is the
 * behaviour asked for - a grid that regenerates as the space changes.
 *
 * Pure: same (rect, count, seed) always gives the same cells, so nothing
 * needs to be stored between frames.
 */
export function subdivide(rect, count, seed) {
  const cells = [{ x: rect.x, y: rect.y, w: rect.w, h: rect.h }];
  const next = rng(seed);
  const n = Math.max(1, Math.round(count));

  while (cells.length < n) {
    let at = 0;
    for (let i = 1; i < cells.length; i++) {
      if (cells[i].w * cells[i].h > cells[at].w * cells[at].h) at = i;
    }
    const c = cells.splice(at, 1)[0];

    // Never nearer than a third from either end. A cut at 0.06 is a random
    // number doing its job and a sliver doing nobody's.
    const t = 0.34 + next() * 0.32;

    if (c.w >= c.h) {
      cells.push(
        { x: c.x, y: c.y, w: c.w * t, h: c.h },
        { x: c.x + c.w * t, y: c.y, w: c.w * (1 - t), h: c.h }
      );
    } else {
      cells.push(
        { x: c.x, y: c.y, w: c.w, h: c.h * t },
        { x: c.x, y: c.y + c.h * t, w: c.w, h: c.h * (1 - t) }
      );
    }
  }

  return cells;
}

/**
 * One module, inset by half the gap on every side.
 *
 * Half on each side rather than a full gap between neighbours, so interior
 * neighbours end up a whole gap apart and the composition keeps a half-gap
 * margin from the region's own edge. That margin is what lets rounded
 * corners read: rounding a corner that sits exactly on the page edge looks
 * like a mistake. At gap 0 the modules butt together and the rectangle is
 * whole again, which is the right thing for the slider's bottom end to do.
 */
export function inset(cell, gapPx) {
  const g = gapPx / 2;
  return { x: cell.x + g, y: cell.y + g, w: cell.w - gapPx, h: cell.h - gapPx };
}

/* ------------------------------------------------------------------ */
/* the image                                                          */

/**
 * Where to draw the image, and how much room it has to be moved.
 *
 * MEASURED AGAINST THE BOARD, NEVER AGAINST THE RECTANGLE. That single
 * choice is the whole feature: the image is pinned to the page, so when the
 * divider moves, the visible part of it does not shift, stretch or rescale
 * - more or less of it is simply revealed. Fit it to the rectangle instead
 * and dragging the divider would zoom the photograph, which is the one
 * thing a mask must not do.
 *
 * It covers the board rather than fitting inside it, so there is never a
 * gap between the image and the edge of the window looking at it. The cost
 * is that the image is cropped by the page, which is what a placeholder in
 * a layout is for - and the crop is exactly what `pan` adjusts.
 *
 * `sx` and `sy` are the SLACK: how far the image may travel from centre on
 * each axis before its own edge reaches the board's. Panning is clamped to
 * that, so the image can never be dragged off the page leaving a gap - it
 * covers, or it does not move. An axis with no overflow has zero slack and
 * simply does not respond, which is the honest answer: there is nothing
 * hidden along it to reveal.
 *
 * @returns {{x,y,w,h,sx,sy}|null}
 */
export function imagePlacement(el, board, pan = { x: 0, y: 0 }) {
  const iw = el.naturalWidth || el.width;
  const ih = el.naturalHeight || el.height;
  if (!iw || !ih) return null;

  const s = Math.max(board.size / iw, board.size / ih);
  const w = iw * s;
  const h = ih * s;
  const sx = (w - board.size) / 2;
  const sy = (h - board.size) / 2;

  return {
    x: board.x + (board.size - w) / 2 + clampPan(pan.x) * sx,
    y: board.y + (board.size - h) / 2 + clampPan(pan.y) * sy,
    w,
    h,
    sx,
    sy,
  };
}

/* ------------------------------------------------------------------ */
/* text                                                               */

/**
 * How the text hangs off its own anchor point.
 *
 * DERIVED FROM THE POSITION, NOT A CONTROL. A caption snapped to the right
 * edge of the page and left-aligned runs straight off it, so alignment is
 * not really a free choice - it is a consequence of where you put the
 * thing. Reading it off the position removes two controls and removes the
 * failure at the same time: text near an edge turns to face inwards, text
 * near the middle centres on its point.
 *
 * The thresholds are the grid's own: a quarter in from either side, which
 * is two of the eight steps the anchor snaps to.
 */
export const alignFor = (x) => (x <= 0.25 ? 'left' : x >= 0.75 ? 'right' : 'center');

export const baselineFor = (y) => (y <= 0.25 ? 'top' : y >= 0.75 ? 'bottom' : 'middle');

/**
 * The CSS/canvas font string.
 *
 * The chosen family is quoted and always falls back to the system UI stack,
 * so a family that has been uninstalled since it was picked degrades to
 * something readable instead of to the browser's default serif.
 */
export function fontSpec(family, sizePx, weight = '') {
  const stack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  return `${weight ? `${weight} ` : ''}${sizePx}px ${family ? `"${family}", ` : ''}${stack}`;
}

/* ------------------------------------------------------------------ */
/* colour                                                             */

/**
 * Relative luminance of a `#rrggbb`, by the sRGB definition.
 *
 * Needed because the handles have to stay visible on ink the user chose.
 * The naive test - average the channels - calls a saturated yellow dark
 * and a saturated blue light, which is backwards, and puts white dots on
 * pale ink where they disappear. Gamma-correcting first and weighting the
 * green channel is what makes "is this dark?" agree with the eye.
 */
export function luminance(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return 0;
  const lin = (c) => {
    const u = c / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255)
       + 0.7152 * lin((n >> 8) & 255)
       + 0.0722 * lin(n & 255);
}

export const isDark = (hex) => luminance(hex) < 0.4;

export const clampPan = (v) => (!Number.isFinite(v) ? 0 : v < -1 ? -1 : v > 1 ? 1 : v);

/** Whether the image can be moved at all - both axes may be locked. */
export const pannable = (place) => !!place && (place.sx > 0.5 || place.sy > 0.5);

/** The three segments of the chain, as index pairs. */
export function segments(anchors) {
  const out = [];
  for (let i = 0; i < anchors.length - 1; i++) out.push([i, i + 1]);
  return out;
}
