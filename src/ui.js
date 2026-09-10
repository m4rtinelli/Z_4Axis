/**
 * ui.js - the panel, which is deliberately almost empty.
 *
 * Every control that is not here is a decision the drag already makes
 * better, and the restraint is the feature: the older tool had forty
 * numbers and you could not find the three that mattered.
 *
 * The rectangle's SIZE is not in here on purpose. It is the one thing the
 * divider says better than any slider could, because dragging it is the
 * act of dividing the page - a number spinning in a panel is a report of
 * that, not the thing itself.
 *
 * WHAT IS UNAVAILABLE IS DIMMED, NEVER REMOVED. Two rules govern this
 * panel - the side of a rectangle that does not exist is not a question,
 * and an image cannot be one window onto a photograph while the same region
 * is a set of modules. Both could be handled by hiding the control, and
 * both are handled by dimming it instead: a panel that changes height when
 * you flip a switch reads as the tool losing its place, and a control that
 * vanishes takes with it the explanation of why it went.
 */

import { RANGE, SIDES, PLACES, TABS, LABELS, FALLBACK_FONTS } from './model.js';

/**
 * The tabs, in the top bar.
 *
 * A segmented control rather than underlined links, because the two tabs
 * are two views of ONE document - the mark, and the mark applied - not two
 * pages you navigate between. A segment says "pick a mode"; a link says
 * "go somewhere else", and going somewhere else is not what happens here.
 */
export function buildTabs(root, store) {
  root.innerHTML = '';
  const bar = el('div', 'seg', root);
  const buttons = TABS.map(([value, text]) => {
    const b = el('button', '', bar);
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => store.set('tab', value));
    return [value, b];
  });
  return function sync() {
    const now = store.state.tab;
    for (const [value, b] of buttons) b.dataset.on = value === now ? '1' : '0';
  };
}

export function buildPanel(root, store, actions, ui) {
  root.innerHTML = '';

  const weight = slider(root, 'Espessura', RANGE.weight, () => store.state.weight,
    (v) => store.set('weight', v), (v) => `${Math.round(v * 100)}%`);

  const node = slider(root, 'Âncoras', RANGE.node, () => store.state.node,
    (v) => store.set('node', v), (v) => (v === 0 ? 'off' : `${v.toFixed(2)}×`));

  // ---- colour ------------------------------------------------------------
  // Above the rectangle and the modules on purpose. These three always
  // apply; those two groups are conditional and often dimmed, and burying
  // a control you reach for constantly behind two you may never switch on
  // is the wrong way round.
  const gColor = el('div', 'group', root);
  el('span', 'group__title', gColor).textContent = 'Cores';

  const paper = swatch(gColor, 'Papel', () => store.state.paper,
    (v) => store.set('paper', v));

  const letter = swatch(gColor, 'Letra', () => store.state.letter,
    (v) => store.set('letter', v));

  const block = swatch(gColor, 'Retângulo', () => store.state.block,
    (v) => store.set('block', v));

  const textColor = swatch(gColor, 'Texto', () => store.state.textColor,
    (v) => store.set('textColor', v));

  // ---- the image ---------------------------------------------------------
  // Its own group, not a row inside the rectangle's. It stopped being a
  // property of the rectangle the moment it could go behind everything -
  // and a control filed under the wrong heading is a control people cannot
  // find. Shared between the tabs: the screens use the same photograph.
  const gImage = el('div', 'group', root);
  el('span', 'group__title', gImage).textContent = 'Imagem';

  const image = imageRow(gImage, store, actions, ui);

  const place = segmented(gImage, 'Lugar', PLACES, () => store.state.imageWhere,
    (v) => store.set('imageWhere', v));

  // Shared: the sheet has handles of its own now, so this governs both
  // views rather than only the artboard.
  const handles = check(root, 'Mostrar alças', () => store.state.handles,
    (v) => store.set('handles', v));

  /* ======================= the mark tab ================================= */
  // Everything below belongs to one tab or the other, and the two sections
  // are shown or hidden whole. Dimming is for a control that does not apply
  // right now; a different tab is a different set of questions, and leaving
  // the other tab's questions on screen greyed out would be a panel twice
  // as long as either view needs.
  const markPart = el('div', 'section', root);

  const gRect = el('div', 'group', markPart);
  const rect = check(gRect, 'Retângulo', () => store.state.rect,
    (v) => store.set('rect', v));

  const side = segmented(gRect, 'Lado', SIDES, () => store.state.rectSide,
    (v) => store.set('rectSide', v));

  const gText = el('div', 'group', markPart);
  const text = check(gText, 'Texto', () => store.state.text,
    (v) => store.set('text', v));

  const value = textField(gText, store);
  const font = fontRow(gText, store, actions);

  const textSize = slider(gText, 'Corpo', RANGE.textSize, () => store.state.textSize,
    (v) => store.set('textSize', v), (v) => `${(v * 100).toFixed(1)}%`);

  const gMulti = el('div', 'group', markPart);
  const multi = check(gMulti, 'Módulos', () => store.state.multi,
    (v) => store.set('multi', v));

  const count = slider(gMulti, 'Quantidade', RANGE.count, () => store.state.count,
    (v) => store.set('count', v), (v) => `${v}`);

  const gap = slider(gMulti, 'Espaço', RANGE.gap, () => store.state.gap,
    (v) => store.set('gap', v), (v) => `${(v * 100).toFixed(1)}%`);

  const radius = slider(gMulti, 'Cantos', RANGE.radius, () => store.state.radius,
    (v) => store.set('radius', v), (v) => (v === 0 ? 'reto' : `${Math.round(v * 100)}%`));

  const cutField = el('div', 'field', gMulti);
  const cut = el('button', 'btn', cutField);
  cut.type = 'button';
  cut.textContent = 'Cortar de novo';
  cut.addEventListener('click', () => store.recut());

  const snap = check(markPart, 'Grade modular (1/8)', () => store.state.snap,
    (v) => store.set('snap', v));

  const resetRow = el('div', 'field', markPart);
  const reset = el('button', 'btn', resetRow);
  reset.type = 'button';
  reset.textContent = 'Voltar ao Z';
  reset.addEventListener('click', () => store.reset());

  /* ======================= the screens tab ============================== */
  const screenPart = el('div', 'section', root);

  const gSheet = el('div', 'group', screenPart);
  el('span', 'group__title', gSheet).textContent = 'Folha';

  const sheetCount = slider(gSheet, 'Telas', RANGE.sheetCount,
    () => store.state.sheetCount, (v) => store.set('sheetCount', v), (v) => `${v}`);

  const dotCols = slider(gSheet, 'Grade de pontos', RANGE.dotCols,
    () => store.state.dotCols, (v) => store.set('dotCols', v),
    (v) => `${v} × ${Math.round(v * 4 / 3)}`);

  const genField = el('div', 'field', gSheet);
  const gen = el('button', 'btn', genField);
  gen.type = 'button';
  gen.textContent = 'Gerar';
  gen.addEventListener('click', () => store.regenerate());

  const gBlocks = el('div', 'group', screenPart);
  el('span', 'group__title', gBlocks).textContent = 'Blocos';

  const chosen = el('p', 'hint', gBlocks);

  const addField = el('div', 'field', gBlocks);
  const add = el('button', 'btn', addField);
  add.type = 'button';
  add.textContent = 'Adicionar retângulo';
  add.addEventListener('click', () => actions.addRect());

  const gCaption = el('div', 'group', screenPart);
  el('span', 'group__title', gCaption).textContent = 'Legendas';

  const topText = line(gCaption, 'Topo', () => store.state.screenTop,
    (v) => store.set('screenTop', v));

  const bottomText = line(gCaption, 'Base', () => store.state.screenBottom,
    (v) => store.set('screenBottom', v));

  /* ====================================================================== */

  const note = el('p', 'panel__note', root);
  const NOTES = {
    mark:
      'Arraste as âncoras <b>A B C D</b> e o divisor entre o Z e o retângulo. '
      + '<kbd>Alt</kbd> solta da grade, <kbd>Tab</kbd> cicla as alças, setas movem, '
      + '<kbd>Shift</kbd>+setas andam na grade, duplo clique devolve uma alça ao lugar. '
      + 'Arraste uma imagem para dentro da janela para carregá-la.',
    screens:
      'Clique numa tela para selecioná-la. <b>Arraste</b> o painel ou um '
      + 'retângulo para movê-lo na grade de pontos, e a <b>alça do canto</b> '
      + 'para mudar o tamanho. Duplo clique devolve o painel ao gerador e '
      + 'remove um retângulo. <b>Gerar</b> troca a semente e preserva o que '
      + 'você moveu. O Z é o mesmo da aba <b>Marca</b>, vazado no painel.',
  };

  return {
    setFonts: font.setFamilies,

    sync() {
      const onMark = store.state.tab === 'mark';
      markPart.hidden = !onMark;
      screenPart.hidden = onMark;
      note.innerHTML = NOTES[onMark ? 'mark' : 'screens'];

      weight.sync(); node.sync(); image.sync(); place.sync();
      paper.sync(); letter.sync(); block.sync(); textColor.sync();
      handles();

      if (onMark) {
        rect(); side.sync();
        text(); value.sync(); font.sync(); textSize.sync();
        multi(); count.sync(); gap.sync(); radius.sync();
        snap();
      } else {
        sheetCount.sync(); dotCols.sync();
        topText.sync(); bottomText.sync();
        const i = store.state.selected;
        const n = (store.state.edits[i]?.rects || []).length;
        const moved = !!store.state.edits[i]?.panel;
        chosen.textContent = `Tela ${i + 1} selecionada — `
          + `${n} retângulo${n === 1 ? '' : 's'}`
          + (moved ? ', painel posicionado à mão.' : ', painel gerado.');
      }

      const s = store.state;
      const noRect = !s.rect;
      const noMulti = noRect || !s.multi;
      const noText = !s.text;

      // The image in the rectangle is the only case that still conflicts
      // with modules. In the background it is behind everything and the
      // two coexist happily - which is what makes a block of modules on a
      // photograph possible at all.
      const rectImage = !!s.image && s.imageWhere === 'rect';
      const imageShown = !!s.image && (s.imageWhere === 'back' || (s.rect && !s.multi));

      // The screens tab decides where the image goes by itself - it grows
      // the frame out of the panel - so the manual choice does not apply
      // there.
      dim(place.field, !s.image || !onMark);
      dim(side.field, noRect);
      dim(gMulti, noRect);
      dim(count.field, noMulti);
      dim(gap.field, noMulti);
      dim(radius.field, noMulti);
      dim(cutField, noMulti);
      dim(value.field, noText);
      dim(font.field, noText);
      dim(textSize.field, noText);

      // A swatch whose colour nothing on screen is painted in has nothing
      // to change - but that question has a different answer per tab. On
      // the screens every one of the four is in use: the paper is the page,
      // the letter colour is the dots, the block is the panel and the text
      // colour is the captions. So the dimming rules below are the MARK
      // tab's rules, and they only run there.
      dim(block.field, onMark && (noRect || (rectImage && !s.multi)));
      dim(textColor.field, onMark && noText);
      dim(paper.field, onMark && imageShown && s.imageWhere === 'back');
    },
  };
}

/** The top-bar readout: where the four points and the split actually are. */
export function buildReadout(root, store, ui) {
  return function sync() {
    const s = store.state;

    // On the sheet the anchor coordinates are not what you are looking at.
    // What matters there is the seed - it is the whole composition's only
    // input, and it is the thing you would write down to get a sheet back.
    if (s.tab === 'screens') {
      const b = ui.blocks;
      const cells = (r) => `${r.cx},${r.cy} <b>${r.cw}×${r.ch}</b>`;
      root.innerHTML =
        `<span>tela <b>${s.selected + 1}</b>/${s.sheetCount}</span>`
        + `<span>grade <b>${s.dotCols}×${Math.round(s.dotCols * 4 / 3)}</b></span>`
        + (b ? `<span>painel ${cells(b.panel)}</span>` : '')
        + (b && b.rects.length
          ? `<span>${b.rects.map((r) => `▭ ${cells(r)}`).join(' ')}</span>` : '')
        + `<span>semente <b>${s.screenSeed.toString(36)}</b></span>`;
      return;
    }

    const parts = s.anchors.map((p, i) => {
      const hot = warm(ui, 'anchor', i);
      return `<span${hot ? ' class="hot"' : ''}>${LABELS[i]} <b>${fmt(p.x)},${fmt(p.y)}</b></span>`;
    });
    if (s.text && s.textValue) {
      const hot = warm(ui, 'text', -1);
      parts.push(
        `<span${hot ? ' class="hot"' : ''}>T <b>${fmt(s.textPos.x)},${fmt(s.textPos.y)}</b></span>`
      );
    }
    if (s.rect) {
      const hot = warm(ui, 'divider', -1);
      parts.push(`<span${hot ? ' class="hot"' : ''}>▭ <b>${eighths(s.rectSize)}</b></span>`);
      if (s.multi) parts.push(`<span><b>${s.count}</b> módulos</span>`);
    }

    // The image is reported whenever it is actually on screen, which is no
    // longer the same question as whether there is a rectangle.
    const imageShown = s.image
      && (s.imageWhere === 'back' || (s.rect && !s.multi));
    if (imageShown) {
      // The pan reads as a percentage of the slack, so 100 says "this is as
      // far as it goes" rather than leaving you pushing at a wall.
      const hot = warm(ui, 'image', -1);
      const moved = s.pan.x || s.pan.y;
      parts.push(
        `<span${hot ? ' class="hot"' : ''}>`
        + (s.imageWhere === 'back' ? 'fundo' : 'imagem')
        + (moved ? ` <b>${pct(s.pan.x)},${pct(s.pan.y)}</b>` : '')
        + '</span>'
      );
    }

    root.innerHTML = parts.join('');
  };
}

const warm = (ui, kind, i) =>
  [ui.hover, ui.drag, ui.sel].some((d) => d && d.kind === kind && d.i === i);

const fmt = (v) => v.toFixed(2).replace(/0$/, '');

const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * The split, in eighths when it is on the grid and as a percentage when it
 * is not. "3/8" is the number you were aiming at; "37.5%" is the same fact
 * with the modularity filed off.
 */
function eighths(v) {
  const n = v * 8;
  return Math.abs(n - Math.round(n)) < 1e-6
    ? `${Math.round(n)}/8`
    : `${(v * 100).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */

/**
 * Every control builder returns `{ sync, field }`.
 *
 * `field` is the wrapper the panel dims when the control does not apply.
 * Handing it back is what keeps the availability rules in one readable
 * block at the top instead of scattered through the builders, each one
 * having to know why it might be irrelevant.
 */
function slider(parent, label, range, read, write, format) {
  const field = el('div', 'field', parent);
  const head = el('div', 'field__head', field);
  el('span', 'field__label', head).textContent = label;
  const value = el('span', 'field__value', head);

  const input = el('input', '', field);
  input.type = 'range';
  input.min = range.min;
  input.max = range.max;
  input.step = range.step;
  input.addEventListener('input', () => write(Number(input.value)));

  return {
    field,
    sync() {
      const v = read();
      if (document.activeElement !== input) input.value = v;
      value.textContent = format(v);
    },
  };
}

/**
 * A switch, not a checkbox.
 *
 * Label first and control last, because that is the reading order of every
 * settings row in the system this borrows from - the name of the thing, then
 * its state, flush right where the eye can scan a column of them.
 */
function check(root, label, read, write) {
  const wrap = el('label', 'toggle', root);
  el('span', '', wrap).textContent = label;
  const input = el('input', '', wrap);
  input.type = 'checkbox';
  input.addEventListener('change', () => write(input.checked));
  return function sync() { input.checked = read(); };
}

/** A labelled one-line field, for the captions the generator places. */
function line(parent, label, read, write) {
  const field = el('div', 'field', parent);
  el('span', 'field__label', field).textContent = label;
  const input = el('input', 'text', field);
  input.type = 'text';
  input.spellcheck = false;
  input.addEventListener('input', () => write(input.value));
  return {
    field,
    sync() {
      if (document.activeElement !== input && input.value !== read()) input.value = read();
    },
  };
}

/** The text itself. Typing repaints the artboard on every keystroke. */
function textField(parent, store) {
  const field = el('div', 'field', parent);
  const input = el('input', 'text', field);
  input.type = 'text';
  input.placeholder = 'Texto';
  input.spellcheck = false;
  input.addEventListener('input', () => store.set('textValue', input.value));
  return {
    field,
    sync() {
      // Never while it has focus, or the caret jumps to the end on every
      // repaint and the field becomes impossible to edit in the middle.
      if (document.activeElement !== input && input.value !== store.state.textValue) {
        input.value = store.state.textValue;
      }
    },
  };
}

/**
 * The font list, with the system's own families in it when we can have them.
 *
 * Enumerating installed fonts needs the Local Font Access API, which needs
 * a user gesture and a permission grant - so it is a button, not something
 * that happens on load. RENDERING with a local family never needed the
 * permission: naming an installed family in a canvas font string has always
 * worked. The API only buys the LIST, which is why a refusal degrades to a
 * fallback set of common families rather than to nothing at all.
 */
function fontRow(parent, store, actions) {
  const field = el('div', 'field', parent);
  const head = el('div', 'field__head', field);
  el('span', 'field__label', head).textContent = 'Fonte';
  const load = el('button', 'link', head);
  load.type = 'button';
  load.textContent = 'Do sistema';
  load.addEventListener('click', () => actions.loadFonts());

  const select = el('select', '', field);
  select.addEventListener('change', () => store.set('textFont', select.value));

  const hint = el('p', 'hint', field);
  let families = FALLBACK_FONTS;
  let note = '';

  function fill() {
    select.innerHTML = '';
    for (const family of families) {
      const opt = el('option', '', select);
      opt.value = family;
      opt.textContent = family || 'Sistema';
      // Show each family in itself - the only honest preview of a typeface
      // is the typeface.
      if (family) opt.style.fontFamily = `"${family}"`;
    }
    // A family chosen before the list changed must survive the change.
    const chosen = store.state.textFont;
    if (chosen && !families.includes(chosen)) {
      const opt = el('option', '', select);
      opt.value = chosen;
      opt.textContent = chosen;
      opt.style.fontFamily = `"${chosen}"`;
    }
    select.value = chosen;
  }

  fill();

  return {
    field,
    setFamilies(list, message) {
      if (list?.length) families = ['', ...list];
      note = message || '';
      fill();
      hint.textContent = note;
      load.hidden = !!list?.length;
    },
    sync() {
      if (select.value !== store.state.textFont) select.value = store.state.textFont;
      hint.textContent = note;
    },
  };
}

/**
 * A colour swatch, which opens the operating system's own picker.
 *
 * `input[type=color]` rather than a hand-built wheel: the native picker
 * already has the eyedropper, the recent colours and the hex field, and
 * every one of those would be a week of work to reproduce worse. The
 * `input` event fires while the picker is open, so the artboard previews
 * the colour as it is chosen rather than when the dialog is dismissed.
 */
function swatch(parent, label, read, write) {
  const field = el('div', 'field row', parent);
  el('span', 'field__label', field).textContent = label;
  const input = el('input', '', field);
  input.type = 'color';
  input.addEventListener('input', () => write(input.value));
  return {
    field,
    sync() {
      const v = read();
      if (input.value !== v) input.value = v;
    },
  };
}

function segmented(parent, label, options, read, write) {
  const field = el('div', 'field', parent);
  el('span', 'field__label', field).textContent = label;
  const bar = el('div', 'seg', field);
  const buttons = options.map(([value, text]) => {
    const b = el('button', '', bar);
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => write(value));
    return [value, b];
  });
  return {
    field,
    sync() {
      const now = read();
      for (const [value, b] of buttons) b.dataset.on = value === now ? '1' : '0';
    },
  };
}

/**
 * The image row: one button that changes what it says, plus the filename.
 *
 * Not a drop zone drawn in the panel. The whole window already accepts a
 * dropped file, and a dashed rectangle asking for one would take permanent
 * space to advertise something that works everywhere.
 */
function imageRow(parent, store, actions, ui) {
  const field = el('div', 'field', parent);
  const head = el('div', 'field__head', field);
  el('span', 'field__label', head).textContent = 'Arquivo';
  const clear = el('button', 'link', head);
  clear.type = 'button';
  clear.textContent = 'Remover';
  clear.addEventListener('click', () => actions.clearImage());

  const pick = el('button', 'btn', field);
  pick.type = 'button';
  pick.addEventListener('click', () => actions.pickImage());

  const hint = el('p', 'hint', field);

  return {
    field,
    sync() {
      const s = store.state;
      const img = s.image;
      pick.textContent = img ? 'Trocar imagem' : 'Escolher imagem';
      clear.hidden = !img;
      hint.textContent = imageHint(s, img, ui?.fit);
    },
  };
}

/**
 * What the line under the image button says.
 *
 * The case that earns this function is the last one: an image whose aspect
 * matches the page has no overflow, so there is nothing hidden to reveal
 * and dragging it does nothing at all. Saying so is the difference between
 * a locked control and a broken one.
 */
function imageHint(state, img, fit) {
  if (!img) return 'No retângulo ela é recortada; no fundo ela fica atrás do Z.';
  if (state.imageWhere === 'rect' && state.multi) {
    return `${img.name} — no retângulo não se aplica com módulos ligados.`;
  }
  if (state.imageWhere === 'rect' && !state.rect) {
    return `${img.name} — ligue o retângulo, ou ponha a imagem no fundo.`;
  }
  if (!fit) return img.name;

  const axes = [];
  if (fit.sx > 0.5) axes.push('horizontal');
  if (fit.sy > 0.5) axes.push('vertical');
  if (!axes.length) return `${img.name} — cabe exata na página, sem folga para mover.`;
  return `${img.name} — arraste para mover (${axes.join(' e ')}).`;
}

function dim(node, off) {
  node.classList.toggle('dim', !!off);
}

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  parent.appendChild(node);
  return node;
}
