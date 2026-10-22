// Profilarea întâmpinării (auditul consolidat, etapa 4, „grafică: măsoară tranzițiile”): Chromium headless, viewport
// iPhone 17 Pro, fără și cu încetinirea procesorului ×4 (CDP). Măsoară intervalele dintre cadre (requestAnimationFrame),
// cadrele lungi și apelurile getBoundingClientRect pe cadru, pe primele 9 s ale întâmpinării. NU e o măsurătoare pe
// iPhone sau Android: GPU-ul, WebKit-ul și termica telefonului lipsesc.
// Rulare (după run.sh): NODE_PATH=/opt/npm-tools/node_modules node scripts/layout-audit/profile-welcome.cjs <dir>
const { chromium } = require('playwright');
const dir = process.argv[2];
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null; };
(async () => {
  const b = await chromium.launch();
  for (const rate of [1, 4]) {
    const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      const w = window;
      w.__frames = []; w.__gbcr = 0; w.__gbcrPerFrame = [];
      const orig = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { w.__gbcr++; return orig.call(this); };
      let last = 0;
      const tick = (t) => { if (last) { w.__frames.push(t - last); w.__gbcrPerFrame.push(w.__gbcr); w.__gbcr = 0; } last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await p.goto('file://' + dir + '/index.html');
    await p.evaluate(async () => { localStorage.removeItem('airon-welcome-day'); sessionStorage.clear(); await window.seedDemo(); });
    await p.reload();
    await p.waitForTimeout(9000);
    const r = await p.evaluate(() => ({ frames: window.__frames, g: window.__gbcrPerFrame }));
    const fr = r.frames.slice(5);
    const long = fr.filter((x) => x > 50).length;
    console.log(`CPU ×${rate}: ${fr.length} cadre în ~9 s; interval median ${pct(fr, 50)?.toFixed(1)} ms, p95 ${pct(fr, 95)?.toFixed(1)} ms, max ${Math.max(...fr).toFixed(1)} ms; cadre > 50 ms: ${long}; getBoundingClientRect pe cadru: median ${pct(r.g, 50)}, max ${Math.max(...r.g)}`);
    await p.screenshot({ path: `${dir}/welcome_x${rate}.png` });
    await ctx.close();
  }
  await b.close();
})();
