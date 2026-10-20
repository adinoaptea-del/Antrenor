/**
 * Imaginea ecranului care pleacă, desenată pe canvas din DOM-ul viu (fără bibliotecă și fără foreignObject, care pe
 * iOS „murdărește” canvas-ul): fundalurile și bordurile elementelor (cu colțuri rotunjite), canvas-urile copiilor
 * (grafice, tuburi) și textul, cuvânt cu cuvânt, în fontul și culoarea lui. Aproximare, nu captură exactă: suficientă
 * ca praful să pornească din forma și culorile reale ale ecranului.
 */
export function snapshotScreen(root: HTMLElement, bg: string, dpr: number): HTMLCanvasElement {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const visible = (r: DOMRect) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < H && r.left < W;
  const transparent = (c: string) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const radius = (cs: CSSStyleDeclaration, r: DOMRect) => Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
  const box = (r: DOMRect, rad: number) => {
    ctx.beginPath();
    if (rad > 0 && 'roundRect' in ctx) (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(r.left, r.top, r.width, r.height, rad);
    else ctx.rect(r.left, r.top, r.width, r.height);
  };

  const walk = (el: Element, opacity: number) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const op = opacity * (parseFloat(cs.opacity) || (cs.opacity === '0' ? 0 : 1));
    if (op <= 0.02) return;
    const r = el.getBoundingClientRect();
    if (visible(r)) {
      ctx.globalAlpha = op;
      const rad = radius(cs, r);
      if (!transparent(cs.backgroundColor)) {
        ctx.fillStyle = cs.backgroundColor;
        box(r, rad);
        ctx.fill();
      }
      const bw = parseFloat(cs.borderTopWidth) || 0;
      if (bw > 0 && !transparent(cs.borderTopColor) && cs.borderTopStyle !== 'none') {
        ctx.strokeStyle = cs.borderTopColor;
        ctx.lineWidth = bw;
        box(r, rad);
        ctx.stroke();
      }
      if (el instanceof HTMLCanvasElement || el instanceof HTMLImageElement) {
        try {
          ctx.drawImage(el, r.left, r.top, r.width, r.height);
        } catch {
          /* imagine din altă sursă: se sare */
        }
      }
    }
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) drawText(n as Text, cs, op);
      else if (n.nodeType === Node.ELEMENT_NODE) walk(n as Element, op);
    }
  };

  const range = document.createRange();
  const drawText = (t: Text, cs: CSSStyleDeclaration, op: number) => {
    const s = t.data;
    if (!s.trim()) return;
    ctx.globalAlpha = op;
    ctx.fillStyle = cs.color;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    let words = 0;
    while ((m = re.exec(s)) && words < 400) {
      words++;
      range.setStart(t, m.index);
      range.setEnd(t, m.index + m[0].length);
      const rr = range.getBoundingClientRect();
      if (!visible(rr)) continue;
      // Linia de bază: ~80% din înălțimea cutiei cuvântului.
      ctx.fillText(m[0], rr.left, rr.top + rr.height * 0.8);
    }
  };

  walk(root, 1);
  ctx.globalAlpha = 1;
  return cv;
}
