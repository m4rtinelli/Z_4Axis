// The same drawing functions target Canvas for PNG and vector primitives for SVG.
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const num = x => Number(x.toFixed(5));
export class SvgContext {
  constructor(measure, imageHref) {
    this.measure = measure; this.imageHref = imageHref; this.nodes = []; this.defs = []; this.stack = []; this.clips = [];
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.font = '10px sans-serif';
    this.textAlign = 'left'; this.textBaseline = 'alphabetic'; this.path = '';
  }
  save() { this.stack.push(Object.fromEntries(['fillStyle','strokeStyle','lineWidth','font','textAlign','textBaseline','clips'].map(k => [k, this[k]]))); }
  restore() { Object.assign(this, this.stack.pop()); }
  clearRect() {} // Export starts with an empty document; no workspace shadow is recorded.
  beginPath() { this.path = ''; }
  moveTo(x,y) { this.path += `M${num(x)} ${num(y)} `; }
  lineTo(x,y) { this.path += `L${num(x)} ${num(y)} `; }
  closePath() { this.path += 'Z '; }
  rect(x,y,w,h) { this.path += `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z `; }
  roundRect(x,y,w,h,r) {
    r = Math.min(Number(r)||0,w/2,h/2);
    this.path += `M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z `;
  }
  arc(x,y,r,start,end) {
    if(Math.abs(end-start)<Math.PI*2-0.00001) throw Error('Arco parcial não suportado na exportação.');
    this.path += `M${num(x+r)} ${num(y)}a${num(r)} ${num(r)} 0 1 0 ${num(-2*r)} 0a${num(r)} ${num(r)} 0 1 0 ${num(2*r)} 0Z `;
  }
  emit(node) { this.nodes.push(this.clips.reduceRight((s,id)=>`<g clip-path="url(#${id})">${s}</g>`,node)); }
  fill() { this.emit(`<path d="${this.path}" fill="${esc(this.fillStyle)}"/>`); }
  stroke() { this.emit(`<path d="${this.path}" fill="none" stroke="${esc(this.strokeStyle)}" stroke-width="${this.lineWidth}"/>`); }
  fillRect(x,y,w,h) { this.emit(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${esc(this.fillStyle)}"/>`); }
  strokeRect(x,y,w,h) { this.emit(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="none" stroke="${esc(this.strokeStyle)}" stroke-width="${this.lineWidth}"/>`); }
  clip() { const id=`clip-${this.defs.length}`; this.defs.push(`<clipPath id="${id}"><path d="${this.path}"/></clipPath>`); this.clips=[...this.clips,id]; }
  drawImage(el,x,y,w,h) { this.emit(`<image x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" preserveAspectRatio="none" href="${esc(this.imageHref)}"/>`); }
  measureText(value) { this.measure.font=this.font; return this.measure.measureText(value); }
  fillText(value,x,y) {
    const anchor={left:'start',center:'middle',right:'end'}[this.textAlign]||'start';
    const baseline={top:'text-before-edge',bottom:'text-after-edge',middle:'central',alphabetic:'alphabetic'}[this.textBaseline]||'alphabetic';
    this.emit(`<text x="${num(x)}" y="${num(y)}" text-anchor="${anchor}" dominant-baseline="${baseline}" style="font:${esc(this.font)}" fill="${esc(this.fillStyle)}">${esc(value)}</text>`);
  }
  serialize(bounds,width,height) { return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}"><defs>${this.defs.join('')}</defs>${this.nodes.join('')}</svg>`; }
}
