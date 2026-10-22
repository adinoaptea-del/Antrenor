// Dovezi UI (auditul consolidat, etapa 4): în modul local (demo), pe lățimea iPhone 17 Pro (402 px), deschide
// calendarul, merge la săptămânile cu ședințe și fotografiază detaliul unei ședințe de calitate și al unei ieșiri
// lungi (pașii ale căror minute trebuie să dea durata din titlu). Rulare: după run.sh, cu același director:
// NODE_PATH=/opt/npm-tools/node_modules node scripts/layout-audit/evidence.cjs <dir>
const { chromium } = require('playwright');
const dir = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const open = async () => { await p.goto('file://' + dir + '/index.html'); await p.waitForTimeout(900); const skip = await p.$('.cosmic-skip'); if (skip) { await skip.click().catch(() => {}); await p.waitForTimeout(300); } };
  await open();
  await p.evaluate(async () => { localStorage.setItem('airon-welcome-day', new Date().toISOString().slice(0, 10)); await window.seedDemo(); });
  const shots = [];
  for (const [label, weeks] of [['calitate', 5], ['lunga', 5]]) {
    await open();
    await (await p.$('text=Planul complet')).click();
    await p.waitForTimeout(700);
    for (let i = 0; i < weeks; i++) { await p.click('[aria-label="Săptămâna următoare"]'); await p.waitForTimeout(300); }
    const rows = await p.$$('button.week-row');
    // Calitatea: luni (rândul cu contur, ședința grea a săptămânii în seed-ul demo); lunga: duminică.
    const row = label === 'lunga' ? rows[6] : rows[0];
    let clicked = false;
    if (row) { await row.click(); await p.waitForTimeout(500); clicked = true; }
    // Detaliul ședinței zilei selectate: primul card de ședință de sub calendar.
    const card = await p.$('text=Ce faci la ședința asta');
    if (card) { await card.click().catch(() => {}); await p.waitForTimeout(1200); }
    const path = `${dir}/ev_${label}.png`;
    await p.screenshot({ path, fullPage: false });
    shots.push(`${label}: ${clicked ? 'ședință deschisă' : 'nu am găsit rândul'} → ${path}`);
  }
  console.log(shots.join('\n'));
  await b.close();
})();
