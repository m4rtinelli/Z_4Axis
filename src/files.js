import { frame } from './model.js';
import { draw } from './render.js';
import { sheetModel, drawScreen } from './screens.js';
import { SvgContext } from './svg-context.js';
import { encodePreset, decodePreset, embeddedImage } from './presets.js';

const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
const nameOf=value=>value.trim().replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,80)||'z3';
export function exportPlan(state,cw,ch,scope) {
  if(state.tab!=='screens'){const b=frame(cw,ch,state).board;return [{name:'marca',bounds:{x:b.x,y:b.y,w:b.size,h:b.size},screens:null}];}
  const screens=sheetModel(cw,ch,state);
  if(!screens.length)throw Error('Amplie a janela para exportar as telas.');
  if(scope==='grid'){
    const x=Math.min(...screens.map(s=>s.page.x)),y=Math.min(...screens.map(s=>s.page.y));
    const right=Math.max(...screens.map(s=>s.page.x+s.page.w)),bottom=Math.max(...screens.map(s=>s.page.y+s.page.h));
    return [{name:'grid',bounds:{x,y,w:right-x,h:bottom-y},screens}];
  }
  const chosen=screens.filter(s=>scope==='all'||s.index===state.selected);
  if(!chosen.length)throw Error('Selecione uma tela para exportar.');
  return chosen.map(s=>({name:`tela-${String(s.index+1).padStart(2,'0')}`,bounds:s.page,screens:[s]}));
}
export function dimensions(bounds,longEdge) {const scale=longEdge/Math.max(bounds.w,bounds.h);return {width:Math.max(1,Math.round(bounds.w*scale)),height:Math.max(1,Math.round(bounds.h*scale))};}
function paintExport(ctx,item,state,cw,ch){
  if(item.screens){ctx.fillStyle=state.paper;ctx.fillRect(item.bounds.x,item.bounds.y,item.bounds.w,item.bounds.h);for(const s of item.screens)drawScreen(ctx,s.page,state,s.comp,s.L);}
  else draw(ctx,cw,ch,{...state,handles:false,exporting:true},{});
}
export async function renderFile(item,state,cw,ch,format,longEdge,imageHref) {
  const {width,height}=dimensions(item.bounds,longEdge);
  if(format==='svg'){
    const ctx=new SvgContext(document.createElement('canvas').getContext('2d'),imageHref);
    paintExport(ctx,item,state,cw,ch);return new Blob([ctx.serialize(item.bounds,width,height)],{type:'image/svg+xml;charset=utf-8'});
  }
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');if(!ctx)throw Error('Não foi possível criar a imagem.');
  ctx.setTransform(width/item.bounds.w,0,0,height/item.bounds.h,-item.bounds.x*width/item.bounds.w,-item.bounds.y*height/item.bounds.h);
  paintExport(ctx,item,state,cw,ch);
  return new Promise((resolve,reject)=>c.toBlob(blob=>{c.width=1;c.height=1;blob?resolve(blob):reject(Error('Falha ao gerar PNG. Tente uma resolução menor.'));},'image/png'));
}

// ZIP without compression: PNG is already compressed. One download avoids popup blockers.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
// Entries carry the real clock. A zero timestamp is day 0 of month 0, which
// is not a date, and strict extractors say so.
const dosStamp=(d=new Date())=>({
  time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),
  date:((Math.max(1980,d.getFullYear())-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),
});
export async function zipFiles(files){
  const chunks=[],central=[],{time,date}=dosStamp();let offset=0,centralSize=0;
  for(const file of files){const bytes=new Uint8Array(await file.blob.arrayBuffer()),name=new TextEncoder().encode(file.name),crc=crc32(bytes);
    const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(10,time,true);l.setUint16(12,date,true);l.setUint32(14,crc,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,name.length,true);local.set(name,30);
    const entry=new Uint8Array(46+name.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint16(12,time,true);e.setUint16(14,date,true);e.setUint32(16,crc,true);e.setUint32(20,bytes.length,true);e.setUint32(24,bytes.length,true);e.setUint16(28,name.length,true);e.setUint32(42,offset,true);entry.set(name,46);
    chunks.push(local,bytes);central.push(entry);offset+=local.length+bytes.length;centralSize+=entry.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/zip'});
}

export function bindFiles(store,canvas,onImport){
  const toolbar=document.createElement('div');toolbar.className='file-toolbar';toolbar.innerHTML='<button type="button" id="z3-files-open">Salvar / Exportar</button>';document.querySelector('.bar').append(toolbar);
  const dialog=document.createElement('dialog');dialog.className='file-dialog';dialog.innerHTML=`<form method="dialog" class="file-heading"><h2>Presets e exportação</h2><button aria-label="Fechar">×</button></form><label>Nome do arquivo<input id="z3-name" value="Meu Z" maxlength="80"></label><div class="file-presets"><button id="z3-save">Salvar preset</button><button id="z3-import">Importar preset</button><input id="z3-input" type="file" accept=".json,application/json" hidden></div><p class="file-note">O preset inclui cores, posições, textos, imagem e ajustes de todas as telas.</p><hr><label id="z3-scope-label">O que exportar<select id="z3-scope"><option value="selected">Tela selecionada</option><option value="all">Todas individualmente · ZIP</option><option value="grid">Todas em um grid</option></select></label><div class="file-options"><label>Formato<select id="z3-format"><option value="png">PNG · alta qualidade</option><option value="svg">SVG · vetorial</option></select></label><label>Maior lado<select id="z3-size"><option value="2048">2048 px</option><option value="4096" selected>4096 px</option><option value="8192">8192 px</option></select></label></div><p id="z3-dimensions" class="file-note"></p><p class="file-note">SVG mantém formas e texto vetoriais; imagens ficam incorporadas. Para texto idêntico em qualquer computador, use PNG.</p><p id="z3-status" role="status"></p><button id="z3-export" class="file-primary">Exportar</button>`;document.body.append(dialog);
  const $=id=>dialog.querySelector('#z3-'+id);let busy=false;
  const status=message=>$('status').textContent=message;
  function sync(){const screens=store.state.tab==='screens';$('scope-label').hidden=!screens;try{const plan=exportPlan(store.state,canvas.clientWidth,canvas.clientHeight,$('scope').value);$('dimensions').textContent=plan.map(item=>{const d=dimensions(item.bounds,+$('size').value);return `${item.name}: ${d.width} × ${d.height} px`;}).join(' · ');}catch(e){$('dimensions').textContent=e.message;}}
  toolbar.querySelector('button').onclick=()=>{sync();status('');dialog.showModal();};
  for(const id of ['scope','size','format'])$(id).onchange=sync;
  function lock(value){busy=value;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);}
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('save').onclick=()=>{try{download(new Blob([encodePreset(store.state)],{type:'application/json'}),nameOf($('name').value)+'.z3.json');status('Preset salvo.');}catch(e){status(e.message);}};
  $('import').onclick=()=>$('input').click();
  $('input').onchange=async e=>{const file=e.target.files[0];if(!file)return;lock(true);try{const next=await decodePreset(file);const old=store.state.image;store.replace(next);onImport();if(old?.url?.startsWith('blob:'))URL.revokeObjectURL(old.url);sync();status('Preset importado.');}catch(err){status(err.message);}finally{lock(false);e.target.value='';}};
  $('export').onclick=async()=>{if(busy)return;lock(true);status('Preparando exportação…');try{
    await document.fonts.ready;
    const state={...store.state,handles:false},cw=canvas.clientWidth,ch=canvas.clientHeight,format=$('format').value,longEdge=+$('size').value;
    const plan=exportPlan(state,cw,ch,$('scope').value),files=[],imageHref=format==='svg'?embeddedImage(state)?.data:null;
    for(let i=0;i<plan.length;i++){status(`Exportando ${i+1} de ${plan.length}…`);await new Promise(r=>setTimeout(r,0));const item=plan[i];files.push({name:`${nameOf($('name').value)}-${item.name}.${format}`,blob:await renderFile(item,state,cw,ch,format,longEdge,imageHref)});}
    if(files.length===1)download(files[0].blob,files[0].name);else download(await zipFiles(files),nameOf($('name').value)+'-telas.zip');status('Exportação concluída.');
  }catch(e){status('Não foi possível exportar: '+e.message);}finally{lock(false);}};
}
