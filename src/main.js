/**
 * main.js - wiring, and the redraw loop.
 *
 * There is no animation here, so there is no reason to run a frame clock:
 * the canvas is redrawn when the state or the pointer changes and at no
 * other time. A tool that repaints sixty times a second to show a static
 * letter is spending a laptop battery to prove it is awake.
 */

import { createStore, imagePlacement } from './model.js';
import { draw } from './render.js';
import { drawSheet } from './screens.js';
import { bindPointer, bindKeys } from './interact.js';
import { buildPanel, buildReadout, buildTabs } from './ui.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('.stage');

const store = createStore();

/**
 * Pointer state. Not part of the design, so it is not in the store.
 *
 * `hover`, `drag` and `sel` are descriptors - `{kind, i}` or null - rather
 * than indices, because there are now two kinds of handle and an index
 * alone can no longer say which one it means.
 */
const ui = {
  hover: null,
  drag: null,
  sel: null,
  grab: { x: 0, y: 0 },
  // An image drag is relative, so it needs where it began and the pan it
  // began from. The other two kinds of drag are absolute and use `grab`.
  from: { x: 0, y: 0 },
  pan0: { x: 0, y: 0 },
  // The sheet's own hover and drag. Separate from the mark tab's, because
  // a sheet descriptor needs the screen index too and reusing one field
  // would mean two shapes in one slot.
  sheet: null,
  sheetDrag: null,
  rect0: null,
  blocks: null,
};

/**
 * Loading an image.
 *
 * The object URL has to be revoked or every file the user tries leaks a
 * blob for the life of the tab - and it has to be revoked AFTER the new
 * image is in place, not before, or a swap briefly points the canvas at a
 * URL that has already been torn down.
 */
function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    fail('Isso não é uma imagem.');
    return;
  }

  const url = URL.createObjectURL(file);
  const el = new Image();

  el.onload = () => {
    const previous = store.state.image;
    // A new image is a new framing decision, so the pan goes back to
    // centre. Carrying the old one over would apply a crop chosen for a
    // different picture, on a different aspect, to this one.
    store.setPan(0, 0);
    store.set('image', { el, name: file.name, url });
    if (previous?.url) URL.revokeObjectURL(previous.url);
    hint.textContent = 'Arraste as âncoras e o divisor';
    stage.dataset.touched = '1';
  };

  el.onerror = () => {
    URL.revokeObjectURL(url);
    fail('Não foi possível ler essa imagem.');
  };

  el.src = url;
}

function fail(message) {
  hint.textContent = message;
  stage.dataset.touched = '0';
}

const actions = {
  pickImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => loadImageFile(input.files?.[0]));
    input.click();
  },

  clearImage() {
    const previous = store.state.image;
    store.set('image', null);
    if (previous?.url) URL.revokeObjectURL(previous.url);
  },

  /**
   * A new block on the selected screen.
   *
   * OFFSET FROM THE LAST BLOCK, not from how many there are. Stepping by
   * the count looks equivalent and is not: remove one from the middle and
   * the count no longer says which slots are taken, so the next block lands
   * exactly on an existing one - invisible, and the precise failure the
   * stepping exists to prevent. The last block's position is always a place
   * that is occupied, so a step from it is always somewhere new.
   */
  addRect() {
    const i = Math.min(store.state.selected, Math.round(store.state.sheetCount) - 1);
    const rects = store.state.edits[i]?.rects || [];
    const last = rects[rects.length - 1];
    const step = (v, by, wrap, from) => (last ? (v + by > wrap ? from : v + by) : from);
    store.addRect(i, {
      x: step(last?.x, 0.05, 0.62, 0.10),
      y: step(last?.y, 0.07, 0.70, 0.12),
      w: 0.22,
      h: 0.10,
    });
  },

  /**
   * Ask the operating system what fonts it has.
   *
   * Behind a button because the Local Font Access API requires a user
   * gesture and a permission grant - it cannot be done on load, and it
   * should not be: enumerating someone's installed fonts is a fingerprint,
   * and the browser is right to make it a decision.
   *
   * Every failure path ends in a usable font list. Unsupported, denied, or
   * broken, the panel keeps the fallback families and says what happened,
   * because a font menu that empties itself is worse than one that is
   * merely shorter than it could be.
   */
  async loadFonts() {
    if (!window.queryLocalFonts) {
      panel.setFonts(null, 'Este navegador não expõe as fontes do sistema. Usando as comuns.');
      return;
    }
    try {
      const found = await window.queryLocalFonts();
      const families = [...new Set(found.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
      if (!families.length) {
        panel.setFonts(null, 'Nenhuma fonte retornada. Usando as comuns.');
        return;
      }
      panel.setFonts(families, `${families.length} famílias do sistema.`);
    } catch (err) {
      panel.setFonts(
        null,
        err?.name === 'SecurityError' || err?.name === 'NotAllowedError'
          ? 'Permissão negada. Usando as fontes comuns.'
          : 'Não foi possível ler as fontes do sistema. Usando as comuns.'
      );
    }
  },
};

const hint = document.querySelector('.stage__hint');
const panel = buildPanel(document.getElementById('panel'), store, actions, ui);
const tabs = buildTabs(document.getElementById('tabs'), store);
const readout = buildReadout(document.getElementById('readout'), store, ui);

let queued = false;
function invalidate() {
  // A hidden document never runs its animation frames, so coalescing
  // through one would latch `queued` on and every later redraw request
  // would be dropped - the canvas comes back from a background tab still
  // showing the layout it had when it left. Paint straight through
  // instead: a hidden canvas is cheap and there is nothing to coalesce.
  if (document.hidden) { paint(); return; }
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    paint();
  });
}

function paint() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // Size the backing store to the device, not to CSS px, or every edge of
  // a mark whose whole point is hard geometry comes out soft.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // The two tabs are two renderers over one state. Nothing is shared but
  // the state itself, which is what keeps the sheet honest: it can only
  // show the mark that the mark tab actually describes.
  if (store.state.tab === 'screens') {
    const model = drawSheet(ctx, w, h, store.state, ui);
    // The selected screen's blocks, in cells, for the readout to report -
    // the same service the mark tab's readout gives for the anchors, and
    // worked out here because this is where the lattice exists.
    const chosen = model.find((s) => s.index === store.state.selected);
    ui.blocks = chosen
      ? { panel: chosen.comp.panel, rects: chosen.comp.rects, L: chosen.L }
      : null;
    ui.fit = null;
  } else {
    const f = draw(ctx, w, h, store.state, ui);

    // How much room the image has to be moved is a fact about the frame, so
    // it is worked out here where the frame exists and stashed on `ui` -
    // which is already where transient, non-design state lives. The panel
    // needs it to say "there is nothing to move" rather than offering a
    // drag that would quietly do nothing.
    ui.fit = store.state.image
      ? imagePlacement(store.state.image.el, f.board, store.state.pan)
      : null;
  }

  tabs();
  panel.sync();
  readout();
}

store.subscribe(() => {
  if (ui.drag) stage.dataset.touched = '1';
  invalidate();
});

bindPointer(canvas, store, ui, invalidate);
bindKeys(store, ui, invalidate);

// ---- dropping an image ---------------------------------------------------
// The whole window takes the drop, not a zone drawn in the panel. `dragover`
// has to be cancelled or the browser navigates away to the file instead,
// which throws away whatever is on the artboard.
window.addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  e.preventDefault();
  loadImageFile(file);
  // An image bound for the rectangle is useless while the rectangle does
  // not exist, so turning it on is part of accepting the drop. An image
  // bound for the BACKGROUND needs no such thing - and forcing a rectangle
  // on would drop a block onto the photograph the user just chose.
  if (store.state.imageWhere === 'rect' && !store.state.rect) store.set('rect', true);
});

new ResizeObserver(invalidate).observe(canvas);
window.addEventListener('resize', invalidate);
document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });

paint();
