import { defaults, RANGE } from './model.js';

// One set of ceilings for both directions. The export side has to respect
// the numbers the import side enforces, or the tool can write a file it
// will later refuse to open.
const MAX_PIXELS = 40000000;
const MAX_IMAGE_DATA = 45000000;
const MAX_FILE = 46000000;
export function validatePreset(data) {
  if(data?.format!=='procedural-z3'||data.version!==1||!data.state) throw Error('Selecione um preset do Procedural Z3 (.z3.json).');
  const src=data.state,out=defaults();
  const number=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('O preset contém um valor fora dos limites.');return v;};
  const text=(v,max)=>{if(typeof v!=='string'||v.length>max)throw Error('Texto inválido no preset.');return v;};
  for(const [key,range] of Object.entries(RANGE))if(src[key]!==undefined)out[key]=number(src[key],range.min,range.max);
  for(const key of ['count','sheetCount','dotCols'])if(!Number.isInteger(out[key]))throw Error('Contagem inválida no preset.');
  for(const key of ['paper','letter','block','textColor'])if(src[key]!==undefined){if(!/^#[0-9a-f]{6}$/i.test(src[key]))throw Error('Cor inválida no preset.');out[key]=src[key];}
  for(const key of ['snap','handles','rect','text','multi'])if(src[key]!==undefined){if(typeof src[key]!=='boolean')throw Error('Opção inválida no preset.');out[key]=src[key];}
  for(const [key,choices] of [['tab',['mark','screens']],['rectSide',['top','bottom','left','right']],['imageWhere',['rect','back']]])if(src[key]!==undefined){if(!choices.includes(src[key]))throw Error('Opção desconhecida no preset.');out[key]=src[key];}
  for(const key of ['textValue','screenTop','screenBottom'])if(src[key]!==undefined)out[key]=text(src[key],2000);
  if(src.textFont!==undefined)out.textFont=text(src.textFont,200);
  for(const key of ['screenSeed','cutSeed'])if(src[key]!==undefined){out[key]=number(src[key],0,0xffffffff);if(!Number.isInteger(out[key]))throw Error('Semente inválida.');}
  const point=(p,min=0,max=1)=>({x:number(p?.x,min,max),y:number(p?.y,min,max)});
  if(!Array.isArray(src.anchors)||src.anchors.length!==4)throw Error('O preset precisa de quatro âncoras.');out.anchors=src.anchors.map(p=>point(p));
  out.pan=point(src.pan,-1,1);out.textPos=point(src.textPos);out.rectSize=number(src.rectSize,1/8,7/8);
  out.selected=number(src.selected,0,out.sheetCount-1);if(!Number.isInteger(out.selected))throw Error('Seleção inválida.');
  const rect=r=>({...point(r),w:number(r?.w,.00001,1),h:number(r?.h,.00001,1)});
  if(!src.edits||typeof src.edits!=='object'||Array.isArray(src.edits))throw Error('Composição inválida.');
  for(const [key,e] of Object.entries(src.edits)){
    if(!/^[0-5]$/.test(key)||!e||typeof e!=='object')throw Error('Tela inválida no preset.');
    const edit={};if(e.panel)edit.panel=rect(e.panel);
    if(e.rects!==undefined){if(!Array.isArray(e.rects)||e.rects.length>256)throw Error('Quantidade de blocos inválida.');edit.rects=e.rects.map(rect);}out.edits[key]=edit;
  }
  let image=null;
  if(src.image){if(typeof src.image.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(src.image.data)||src.image.data.length>MAX_IMAGE_DATA)throw Error('Imagem incorporada inválida.');image={data:src.image.data,name:text(src.image.name||'Imagem',250)};}
  return {state:out,image};
}

/**
 * The image, as a data URI small enough to be read back.
 *
 * PNG first: the artwork this tool is pointed at is usually flat, and PNG
 * keeps it exact. A photograph is the case PNG cannot serve - re-encoding
 * a twelve megapixel JPEG losslessly runs to tens of megabytes, past the
 * ceiling the import side enforces, and a preset that saves but will never
 * reopen is a worse outcome than one that says it had to compress. So
 * quality is given up only after lossless has been shown not to fit, and
 * resolution only after quality has run out.
 */
export function embeddedImage(state) {
  if (!state.image) return null;
  const el = state.image.el;
  const name = state.image.name || 'Imagem';
  if (!el.naturalWidth || !el.naturalHeight) throw Error('A imagem ainda não terminou de carregar.');
  if (el.naturalWidth * el.naturalHeight > MAX_PIXELS) throw Error('A imagem ultrapassa o limite de 40 megapixels.');

  let w = el.naturalWidth, h = el.naturalHeight;
  for (let pass = 0; pass < 12; pass++) {
    const png = pass === 0 ? encode(el, w, h, null, 'image/png') : null;
    if (png) return { name, data: png };
    // JPEG carries no transparency, so the fallback paints its own white
    // ground rather than letting the canvas composite the image onto black.
    for (const quality of [0.92, 0.8, 0.7]) {
      const jpeg = encode(el, w, h, '#ffffff', 'image/jpeg', quality);
      if (jpeg) return { name, data: jpeg };
    }
    if (w < 64 || h < 64) break;
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
  }
  throw Error('Não foi possível incorporar essa imagem no preset. Use uma imagem menor.');
}

/**
 * One attempt at the ladder, or null.
 *
 * An encoder that runs out of room throws rather than returning something
 * oversized, and a browser that does not know the format quietly hands
 * back a PNG instead. Both are the same answer as "too big" - this pass
 * did not work - so both become null and the ladder moves on, rather than
 * ending the save or returning a PNG labelled as a JPEG.
 */
function encode(el, w, h, background, type, quality) {
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(el, 0, 0, w, h);
    const data = c.toDataURL(type, quality);
    c.width = 1; c.height = 1;
    return data.startsWith(`data:${type};base64,`) && data.length <= MAX_IMAGE_DATA ? data : null;
  } catch {
    return null;
  }
}

export function encodePreset(state) {
  const json = JSON.stringify({ format: 'procedural-z3', version: 1, state: { ...state, image: embeddedImage(state) } }, null, 2);
  // Measured against the same ceiling the import side applies, so "saved"
  // never means "saved and unopenable".
  if (json.length > MAX_FILE) throw Error('O preset ficou grande demais para ser reaberto. Use uma imagem menor.');
  return json;
}
export async function decodePreset(file) {
  if(file.size>MAX_FILE)throw Error('O preset deve ter até 46 MB.');
  let data;try{data=JSON.parse(await file.text());}catch{throw Error('O arquivo não contém um preset JSON válido.');}
  const parsed=validatePreset(data);
  if(parsed.image){const el=new Image();el.src=parsed.image.data;try{await el.decode();}catch{throw Error('Não foi possível carregar a imagem do preset.');}
    if(el.naturalWidth*el.naturalHeight>MAX_PIXELS)throw Error('A imagem ultrapassa 40 megapixels.');
    parsed.state.image={el,url:parsed.image.data,name:parsed.image.name};}
  return parsed.state;
}
