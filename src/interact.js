/**
 * interact.js - the mouse is the control surface.
 *
 * The point of this app is that the layout is shaped by hand, so dragging
 * is not a convenience laid over sliders - it IS the parameter editor, and
 * the numbers left in the panel are the ones a drag cannot say.
 *
 * There are two kinds of drag and they share every rule: an anchor moves a
 * point, the divider moves the border between the letter and the rectangle.
 * Both snap to the same grid, both release from it under Alt, both keep the
 * offset you grabbed them by. One vocabulary, two objects.
 *
 * Three details do most of the work of making it feel intentional:
 *
 *   1. Pointer capture. Without it a fast drag that leaves the canvas drops
 *      the thing where the cursor last happened to be inside, which reads
 *      as the tool letting go of you.
 *
 *   2. Grab offset. Picking a handle 5px off centre and having it jump to
 *      the cursor is a small betrayal you feel every single time.
 *
 *   3. Snapping releases under Alt. A modular grid you cannot leave is a
 *      cage; one you can step out of while holding a key is a decision.
 */

import {
  clamp01, snapTo, toUnit, frame, divider, splitFromPointer,
  imagePlacement, GRID, SPLIT,
} from './model.js';
import { hit, isDiv, isImage, isText, textBox } from './render.js';
import { pickInSheet, screenAt, toFrac } from './screens.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function bindPointer(canvas, store, ui, onChange) {
  const size = () => [canvas.clientWidth, canvas.clientHeight];

  /**
   * The sheet has no handles, so it has no pointer behaviour.
   *
   * Guarded here rather than in `hit`, because `hit` answers a geometric
   * question - what is under this point - and the answer does not change
   * just because you are looking at a different view. What changes is
   * whether anyone is allowed to act on it.
   */
  const live = () => store.state.tab === 'mark';
  const onSheet = () => store.state.tab === 'screens';

  /* ---- the sheet ------------------------------------------------------- */

  /**
   * Dragging a block on a screen.
   *
   * Everything is expressed in CELLS while the drag runs and written back
   * as fractions, which is what makes the block move in discrete steps you
   * can see land on the dots. Converting to fractions per pointer event and
   * snapping on the way out would work too, and would round twice.
   */
  function sheetMove(e) {
    const [cw, ch] = size();
    const [x, y] = local(e);
    const t = ui.sheetDrag;
    const s = screenAt(t.index, cw, ch, store.state);
    if (!s) return;

    const L = s.L;
    const cx = (px) => Math.round((px - L.x) / L.cw);
    const cy = (py) => Math.round((py - L.y) / L.chh);
    const start = ui.rect0;

    if (t.kind === 'panelGrip' || t.kind === 'rectGrip') {
      // Resizing pins the top-left corner and moves the far corner, so the
      // block grows where the cursor is instead of around its own middle.
      //
      // AND THE SIZE IS CAPPED AGAINST THE PAGE HERE, not left to the
      // generic clamp. That clamp shrinks before it slides, which is right
      // when placing a block - but on a resize it slid the origin, so
      // dragging the corner into the right margin walked the whole block
      // leftwards. Capping the size instead makes the block stop growing at
      // the edge, which is what a corner grip should do.
      const next = {
        cx: start.cx,
        cy: start.cy,
        cw: clamp(cx(x) - start.cx, 2, L.cols - 1 - start.cx),
        ch: clamp(cy(y) - start.cy, 2, L.rows - 1 - start.cy),
      };
      write(t, toFrac(L, next));
      return;
    }

    // The delta in whole cells, so the block steps from dot to dot rather
    // than sliding and rounding at the end.
    const next = {
      cx: start.cx + Math.round((x - ui.from.x) / L.cw),
      cy: start.cy + Math.round((y - ui.from.y) / L.chh),
      cw: start.cw,
      ch: start.ch,
    };
    write(t, toFrac(L, next));
  }

  function write(t, frac) {
    if (t.kind === 'panel' || t.kind === 'panelGrip') store.setPanel(t.index, frac);
    else store.setRect(t.index, t.i, frac);
  }

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  /** Alt means the same thing whichever way the toggle sits: ignore the grid. */
  const gridOn = (e) => (e.altKey ? !store.state.snap : store.state.snap);

  function move(e) {
    const [cw, ch] = size();
    const [x, y] = local(e);
    const f = frame(cw, ch, store.state);
    const gx = x + ui.grab.x;
    const gy = y + ui.grab.y;

    if (isDiv(ui.drag)) {
      const raw = splitFromPointer(gx, gy, f, store.state.rectSide);
      const s = gridOn(e) ? snapTo(raw, GRID) : raw;
      store.set('rectSize', clamp(s, SPLIT.min, SPLIT.max));
      return;
    }

    // ---- the text -------------------------------------------------------
    // Snaps to the same eighths as the anchors, and releases under Alt the
    // same way - but measured against the BOARD, because a caption pinned
    // to the corner of the page must not move when the page is divided
    // differently.
    if (isText(ui.drag)) {
      const b = f.board;
      const ux = (gx - b.x) / b.size;
      const uy = (gy - b.y) / b.size;
      const free = gridOn(e);
      store.setTextPos(
        free ? snapTo(ux, GRID) : ux,
        free ? snapTo(uy, GRID) : uy
      );
      return;
    }

    // ---- the image ------------------------------------------------------
    // Relative, not absolute: the image moves BY the distance the cursor
    // has travelled since it was grabbed, which is why `pan0` exists. An
    // absolute mapping would teleport the crop to wherever you happened to
    // click inside a region that is often larger than the slack.
    //
    // AND THE IMAGE DOES NOT SNAP. The grid is for layout decisions - where
    // an anchor sits, where the page divides. Framing a photograph is not
    // one of those, and on a 534px board an eighth is a 67px jump, which
    // would make "adjust it slightly" the one thing you cannot do.
    if (isImage(ui.drag)) {
      const place = imagePlacement(store.state.image.el, f.board, store.state.pan);
      if (!place) return;
      const dx = x - ui.from.x;
      const dy = y - ui.from.y;
      store.setPan(
        place.sx > 0.5 ? ui.pan0.x + dx / place.sx : ui.pan0.x,
        place.sy > 0.5 ? ui.pan0.y + dy / place.sy : ui.pan0.y
      );
      return;
    }

    const u = toUnit(gx, gy, f);
    const free = gridOn(e);
    store.setAnchor(
      ui.drag.i,
      clamp01(free ? snapTo(u.x, GRID) : u.x),
      clamp01(free ? snapTo(u.y, GRID) : u.y)
    );
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (onSheet()) {
      const [cw, ch] = size();
      const [x, y] = local(e);
      const target = pickInSheet(x, y, cw, ch, store.state);
      if (!target) return;

      // Clicking anywhere on a screen selects it, so the panel's buttons
      // always have a visible target. Only a block starts a drag.
      store.select(target.index);
      if (target.kind === 'page') { onChange(); return; }

      e.preventDefault();
      const s = screenAt(target.index, cw, ch, store.state);
      const r = target.kind.startsWith('panel') ? s.comp.panel : s.comp.rects[target.i];
      ui.sheetDrag = target;
      ui.rect0 = { cx: r.cx, cy: r.cy, cw: r.cw, ch: r.ch };
      ui.from = { x, y };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* no live pointer */ }
      canvas.dataset.drag = target.kind.endsWith('Grip') ? 'se' : '1';
      onChange();
      return;
    }

    if (!live()) return;
    const [cw, ch] = size();
    const [x, y] = local(e);
    const target = hit(x, y, cw, ch, store.state);
    if (!target) return;

    e.preventDefault();
    const f = frame(cw, ch, store.state);

    if (isDiv(target)) {
      const d = divider(f);
      // Only the axis the divider travels on can carry an offset; the other
      // one is not a degree of freedom it has.
      ui.grab = d.vertical ? { x: d.at - x, y: 0 } : { x: 0, y: d.at - y };
    } else if (isText(target)) {
      const tb = textBox(store.state, f.board);
      ui.grab = { x: tb.point.x - x, y: tb.point.y - y };
    } else if (isImage(target)) {
      // An image drag is relative, so it remembers where it started from
      // rather than carrying an offset into an absolute mapping.
      ui.from = { x, y };
      ui.pan0 = { ...store.state.pan };
      ui.grab = { x: 0, y: 0 };
    } else {
      const p = store.state.anchors[target.i];
      ui.grab = { x: f.ox + p.x * f.ux - x, y: f.oy + p.y * f.uy - y };
    }

    ui.drag = target;
    ui.sel = target;
    // Can throw when the pointer is no longer active by the time we ask -
    // and capture is a comfort, not a requirement, so a failure here must
    // not abort the drag it was meant to improve.
    try { canvas.setPointerCapture(e.pointerId); } catch { /* no live pointer */ }
    canvas.dataset.drag = cursorFor(target, f);
    onChange();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (onSheet()) {
      if (ui.sheetDrag) { sheetMove(e); return; }
      const [cw, ch] = size();
      const [x, y] = local(e);
      const target = pickInSheet(x, y, cw, ch, store.state);
      if (sameSheet(target, ui.sheet)) return;
      ui.sheet = target;
      canvas.dataset.over = !target || target.kind === 'page' ? '0'
        : target.kind.endsWith('Grip') ? 'se' : '1';
      onChange();
      return;
    }

    if (!live()) return;
    const [cw, ch] = size();
    const [x, y] = local(e);

    if (ui.drag) { move(e); return; }

    const target = hit(x, y, cw, ch, store.state);
    if (same(target, ui.hover)) return;
    ui.hover = target;
    canvas.dataset.over = cursorFor(target, frame(cw, ch, store.state));
    onChange();
  });

  const release = (e) => {
    if (ui.sheetDrag) {
      ui.sheetDrag = null;
      canvas.dataset.drag = '0';
      try {
        if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      } catch { /* already gone */ }
      onChange();
      return;
    }
    if (!ui.drag) return;
    ui.drag = null;
    ui.grab = { x: 0, y: 0 };
    canvas.dataset.drag = '0';
    try {
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    } catch { /* already gone */ }
    onChange();
  };

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('pointerleave', () => {
    if (ui.drag || !ui.hover) return;
    ui.hover = null;
    canvas.dataset.over = '0';
    onChange();
  });

  // Double-click sends one thing home. Cheaper than an undo stack, and it is
  // the correction people actually want after pulling something too far.
  canvas.addEventListener('dblclick', (e) => {
    if (onSheet()) {
      const [cw, ch] = size();
      const [x, y] = local(e);
      const target = pickInSheet(x, y, cw, ch, store.state);
      if (!target) return;
      // The panel goes back to the generator; an extra block is removed.
      // Both are "undo the thing I did here", which is what a double click
      // means everywhere else in this app.
      if (target.kind === 'panel' || target.kind === 'panelGrip') {
        store.setPanel(target.index, null);
      } else if (target.kind === 'rect' || target.kind === 'rectGrip') {
        store.removeRect(target.index, target.i);
      }
      return;
    }

    if (!live()) return;
    const [cw, ch] = size();
    const [x, y] = local(e);
    const target = hit(x, y, cw, ch, store.state);
    if (!target) return;
    if (isDiv(target)) store.set('rectSize', 3 / 8);
    else if (isImage(target)) store.setPan(0, 0);
    else if (isText(target)) store.setTextPos(7 / 8, 1);
    else store.reset(target.i);
  });
}

/**
 * Which cursor the canvas should wear.
 *
 * One place, because hover and drag must never disagree about it - and
 * they did, briefly, when each computed its own.
 */
function cursorFor(target, f) {
  if (!target) return '0';
  if (isImage(target)) return 'm';
  if (isDiv(target)) return divider(f).vertical ? 'x' : 'y';
  return '1';   // anchors and text: both are grabbed and placed
}

/**
 * Arrow keys, for the last thing you touched.
 *
 * A mouse cannot land on 0.375 reliably and sometimes 0.375 is the point.
 * Shift walks the grid, bare arrows walk a sixty-fourth. Tab cycles the
 * anchors and then the divider, so the whole layout is reachable without
 * the mouse - and the divider only joins the cycle when it exists.
 */
export function bindKeys(store, ui, onChange) {
  const DIRS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };

  window.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (store.state.tab !== 'mark') return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const s = store.state;
      const stops = s.anchors.map((_, i) => ({ kind: 'anchor', i }));
      if (s.rect) stops.push({ kind: 'divider', i: -1 });
      if (s.text && s.textValue) stops.push({ kind: 'text', i: -1 });
      const imageShown = s.image
        && (s.imageWhere === 'back' || (s.rect && !s.multi));
      if (imageShown) stops.push({ kind: 'image', i: -1 });
      const at = stops.findIndex((s) => same(s, ui.sel));
      const next = (at + (e.shiftKey ? stops.length - 1 : 1) + (at < 0 ? 1 : 0)) % stops.length;
      ui.sel = stops[next];
      ui.hover = ui.sel;
      onChange();
      return;
    }

    const dir = DIRS[e.key];
    if (!dir || !ui.sel) return;
    e.preventDefault();
    const step = e.shiftKey ? GRID : 1 / 64;

    if (isText(ui.sel)) {
      const p = store.state.textPos;
      store.setTextPos(p.x + dir[0] * step, p.y + dir[1] * step);
      return;
    }

    // The image moves in its own units - shares of its slack - so it gets
    // its own step. A sixty-fourth of the slack is imperceptible on a
    // photograph that only overflows the page by a little.
    if (isImage(ui.sel)) {
      const k = e.shiftKey ? 0.1 : 0.02;
      const p = store.state.pan;
      store.setPan(p.x + dir[0] * k, p.y + dir[1] * k);
      return;
    }

    if (isDiv(ui.sel)) {
      // The divider answers to the axis it can move on. Growing the
      // rectangle always means the arrow that points AWAY from its side,
      // so the key does what the picture says it should.
      const side = store.state.rectSide;
      const axis = (side === 'left' || side === 'right') ? dir[0] : dir[1];
      if (!axis) return;
      const grow = (side === 'bottom' || side === 'right') ? -axis : axis;
      store.set('rectSize', clamp(store.state.rectSize + grow * step, SPLIT.min, SPLIT.max));
      return;
    }

    const p = store.state.anchors[ui.sel.i];
    store.setAnchor(ui.sel.i, clamp01(p.x + dir[0] * step), clamp01(p.y + dir[1] * step));
  });
}

const same = (a, b) => (!a && !b) || (!!a && !!b && a.kind === b.kind && a.i === b.i);

const sameSheet = (a, b) => (!a && !b)
  || (!!a && !!b && a.index === b.index && a.kind === b.kind && a.i === b.i);
