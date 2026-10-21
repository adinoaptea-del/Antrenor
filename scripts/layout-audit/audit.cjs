// Auditul de layout (regula 40): aplicația în modul local (demo), ecranele principale la lățimile telefoanelor
// (344 Fold, 360 Galaxy, 402 iPhone 17 Pro, 430 Pro Max): niciun element în afara ecranului, fără derulare orizontală.
// Rulare: `bash scripts/layout-audit/run.sh` (esbuild + Playwright/Chromium; WebKit nu e disponibil aici).
const { chromium } = require('playwright');
const dir = process.argv[2];
const IGNORE = ['amb-a', 'amb-b', 'orb-cv', 'cosmic', 'ambient'];
const measure = () => {
  const vw = window.innerWidth; const over = [];
  for (const el of document.querySelectorAll('body *')) {
    const cls = (typeof el.className === 'string' ? el.className : '') || '';
    if (['amb-a','amb-b','orb-cv','cosmic','ambient','open-burst'].some((c) => cls.includes(c))) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement, inScroller = false;
      while (p) { const pc = getComputedStyle(p); if (pc.overflowX === 'auto' || pc.overflowX === 'scroll' || pc.overflowX === 'hidden' || pc.overflowX === 'clip') { if (p !== document.body && p.id !== 'root') { inScroller = true; break; } } p = p.parentElement; }
      if (!inScroller) over.push(`${el.tagName.toLowerCase()}.${cls.split(' ').slice(0,2).join('.')}[${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
  }
  return { vw, scrollW: document.documentElement.scrollWidth, over: [...new Set(over)].slice(0, 6) };
};
(async () => {
  const b = await chromium.launch();
  for (const [name, w, h] of [['fold', 344, 882], ['galaxy', 360, 780], ['ip17pro', 402, 874], ['promax', 430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const open = async () => { await p.goto('file://' + dir + '/index.html'); await p.waitForTimeout(900); const skip = await p.$('.cosmic-skip'); if (skip) { await skip.click().catch(()=>{}); await p.waitForTimeout(300); } };
    await open();
    await p.evaluate(async () => { localStorage.setItem('airon-welcome-day', new Date().toISOString().slice(0,10)); await window.seedDemo(); });
    const steps = [
      ['acasa', null], ['calendar', 'text=Planul complet'], ['progres', 'text=Progresul tău'], ['mese', 'text=Mese recomandate'], ['profil', '.avatar-btn'],
      ['antrenament', '.orb'],
    ];
    for (const [s, sel] of steps) {
      await open();
      if (sel) { const el = await p.$(sel); if (!el) { console.log(name, s, 'selector lipsă'); continue; } await el.click(); await p.waitForTimeout(900); }
      const m = await p.evaluate(measure);
      await p.screenshot({ path: `${dir}/t_${name}_${s}.png`, fullPage: false });
      console.log(name, w, s, 'scrollW', m.scrollW, m.over.length ? 'OVER: ' + m.over.join(' | ') : 'ok');
    }
    if (errs.length) console.log('errors', name, errs.slice(0, 3));
    await ctx.close();
  }
  await b.close();
})();
