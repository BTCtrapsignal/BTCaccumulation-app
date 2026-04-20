/* ═══════════════════════════════════════
   BTC STACKING — app.js
   Clean, production-level vanilla JS
═══════════════════════════════════════ */

const STORAGE_KEY = 'btc-stack-v4';

const state = {
  settings: {
    currentPrice: 71000,
    usdthb: 33.0,
    goalBtc: 1,
    currentAge: 29,
    targetAge: 40,
    monthlyDcaUsd: 300,
    annualGrowthRate: 10,
    theme: 'light',
    priceUpdatedAt: null,
    triggerBudgetThb: 67000
  },
  dca: [], dip: [], futures: [], grid: [], triggers: []
};

// ── Boot ──────────────────────────────────────────────
async function init() {
  try {
    const remote = await fetch('data.json').then(r => r.json());
    Object.assign(state.settings, remote.settings || {});
    state.dca      = remote.dca      || [];
    state.dip      = remote.dip      || [];
    state.futures  = remote.futures  || [];
    state.grid     = remote.grid     || [];
    state.triggers = remote.triggers || [];
  } catch (e) { console.warn('Could not load data.json', e); }

  hydrateLocal();
  applyTheme();
  setupThemeBtn();
  setupNav();
  setupDialogs();
  setupShare();
  render();
  refreshPrice();
}

// ── Persistence ───────────────────────────────────────
function hydrateLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!s) return;
    if (s.settings) Object.assign(state.settings, s.settings);
    ['dca','dip','futures','grid'].forEach(k => { if (Array.isArray(s[k])) state[k] = s[k]; });
  } catch {}
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    settings: state.settings,
    dca: state.dca, dip: state.dip, futures: state.futures, grid: state.grid
  }));
}

// ── Formatters ────────────────────────────────────────

/** Format BTC to 4 or 6 decimal places */
function fmtBtc(v, d = 4) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Compact USD: 1234 → $1.23k, 1234567 → $1.23M */
function fmtUsdCompact(v) {
  const n = Math.abs(Number(v || 0));
  const sign = Number(v) < 0 ? '-' : '';
  if (n >= 1_000_000) return `${sign}$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)    return `${sign}$${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000)     return `${sign}$${(n / 1_000).toFixed(2)}k`;
  return `${sign}$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Compact THB: 2474000 → ฿2.47M */
function fmtThbCompact(v) {
  const n = Math.abs(Number(v || 0));
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)    return `฿${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000)     return `฿${(n / 1_000).toFixed(2)}k`;
  return `฿${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Full USD with cents (for PnL) */
function fmtUsdFull(v, d = 2) {
  const sign = Number(v) < 0 ? '-' : '';
  return `${sign}$${Math.abs(Number(v||0)).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})}`;
}

/** Full USD no decimals */
function fmtUsd(v) {
  const sign = Number(v) < 0 ? '-' : '';
  return `${sign}$${Math.abs(Number(v||0)).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`;
}

function fmtThb(v) {
  return `฿${Math.abs(Number(v||0)).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`;
}

function fmtPct(v, d = 1) { return `${Number(v||0).toFixed(d)}%`; }

function todayStr() {
  return new Date().toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
}

function fmtDate(v, key) {
  const d = v && v[key] ? v[key] : v;
  try { return new Date(d).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' }); }
  catch { return '—'; }
}

function sortDesc(a, b, key = 'date') {
  return new Date(b[key] || 0) - new Date(a[key] || 0);
}

// ── Theme ─────────────────────────────────────────────
function applyTheme() {
  const app = document.getElementById('app');
  const isDark = state.settings.theme === 'dark';
  app.classList.toggle('dark', isDark);
  // swap sun/moon icon
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.innerHTML = isDark
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" stroke="none"/>'
      : '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
  }
}

function setupThemeBtn() {
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    persist(); applyTheme();
  });
}

// ── Nav ───────────────────────────────────────────────
const TITLES = { home:'Home', dca:'Stacking', futures:'Futures', more:'More', triggers:'Triggers' };

function setupNav() {
  document.querySelectorAll('.nav-btn[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => nav(btn.dataset.screen));
  });
}

function nav(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.nav-btn[data-screen]').forEach(b =>
    b.classList.toggle('active', b.dataset.screen === screen));
  document.getElementById('pageTitle').textContent = TITLES[screen] || screen;
  window.scrollTo({ top: 0, behavior: 'instant' in ScrollToOptions.prototype ? 'instant' : 'auto' });
}

// ── Dialogs ───────────────────────────────────────────
function setupDialogs() {
  // Goal dialog
  const goalDlg = document.getElementById('goalDialog');
  document.getElementById('editGoalBtn').addEventListener('click', () => {
    document.getElementById('goalInput').value   = state.settings.goalBtc;
    document.getElementById('usdthbInput').value = state.settings.usdthb;
    goalDlg.showModal();
  });
  document.getElementById('saveGoalBtn').addEventListener('click', () => {
    const g = parseFloat(document.getElementById('goalInput').value);
    const r = parseFloat(document.getElementById('usdthbInput').value);
    if (g > 0) state.settings.goalBtc = g;
    if (r > 0) state.settings.usdthb  = r;
    persist(); goalDlg.close(); render();
  });

  // Projection dialog
  const projDlg  = document.getElementById('projectionDialog');
  const projForm = document.getElementById('projectionForm');
  document.getElementById('editProjectionBtn').addEventListener('click', () => {
    projForm.currentAge.value       = state.settings.currentAge;
    projForm.targetAge.value        = state.settings.targetAge;
    projForm.currentDcaBtc.value    = computeMetrics().dcaBtc.toFixed(8);
    projForm.monthlyDcaUsd.value    = state.settings.monthlyDcaUsd;
    projForm.annualGrowthRate.value = state.settings.annualGrowthRate;
    if (projForm.triggerBudgetThb) projForm.triggerBudgetThb.value = state.settings.triggerBudgetThb || 67000;
    projDlg.showModal();
  });
  const closeProjDlg = () => projDlg.close();
  document.getElementById('closeProjectionBtn').addEventListener('click', closeProjDlg);
  document.getElementById('cancelProjectionBtn').addEventListener('click', closeProjDlg);
  projForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(projForm);
    state.settings.currentAge       = +f.get('currentAge')       || 29;
    state.settings.targetAge        = +f.get('targetAge')        || 40;
    state.settings.monthlyDcaUsd    = +f.get('monthlyDcaUsd')    || 300;
    state.settings.annualGrowthRate = +f.get('annualGrowthRate') || 10;
    state.settings.triggerBudgetThb   = +f.get('triggerBudgetThb') || state.settings.triggerBudgetThb || 67000;
    const mc = +f.get('currentDcaBtc');
    if (mc > 0) state.settings.manualCurrentDcaBtc = mc;
    persist(); projDlg.close(); render();
  });

  setupEntryDialog();
}

function setupEntryDialog() {
  const dlg   = document.getElementById('entryDialog');
  const form  = document.getElementById('entryForm');
  const close = () => dlg.close();

  document.getElementById('addBtn').addEventListener('click', () => {
    form.reset();
    const today = new Date().toISOString().slice(0,10);
    ['date','dateOpen','dateClose','dateStart','dateEnd'].forEach(n => { if (form[n]) form[n].value = today; });
    setEntryMode('DCA'); dlg.showModal();
  });
  document.getElementById('closeEntryBtn').addEventListener('click', close);
  document.getElementById('cancelEntryBtn').addEventListener('click', close);
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(b =>
    b.addEventListener('click', () => setEntryMode(b.dataset.value)));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const mode = document.querySelector('#entryStrategySeg .seg-btn.active').dataset.value;
    const f    = new FormData(form);
    if (mode === 'Futures') {
      state.futures.unshift({
        dateOpen: f.get('dateOpen'), dateClose: f.get('dateClose'),
        symbol:'BTCUSDT', side: f.get('side'), leverage: f.get('leverage'),
        mode: f.get('mode'), entryPrice: +f.get('entryPrice')||0,
        exitPrice: +f.get('exitPrice')||0, sizeBtc: +f.get('sizeBtc')||0,
        pnlUsdt: +f.get('pnlUsdt')||0,
        mistakeTag: f.get('mistakeTag')||null, notes: f.get('notes'), strategy:'Futures'
      });
    } else if (mode === 'Grid Bot') {
      state.grid.unshift({
        dateStart: f.get('dateStart'), dateEnd: f.get('dateEnd'),
        gridType: f.get('gridType'), mode: f.get('gridMode'),
        capitalUsdt: +f.get('capitalUsdt')||0,
        netProfitUsdt: +f.get('netProfitUsdt')||0,
        roi: +f.get('roi')||0, note: f.get('gridNote'), strategy:'Grid Bot'
      });
    } else {
      (mode === 'Dip Reserve' ? state.dip : state.dca).unshift({
        date: f.get('date'), type: f.get('type'), source: f.get('source'),
        btcQty: +f.get('btcQty')||0, usdtAmount: +f.get('usdtAmount')||0,
        price: +f.get('price')||0, note: f.get('note'),
        location: f.get('location'), strategy: mode
      });
    }
    persist(); close(); render();
  });
}

function setEntryMode(mode) {
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === mode));
  document.getElementById('spotFields').classList.toggle('hidden',    mode === 'Futures' || mode === 'Grid Bot');
  document.getElementById('futuresFields').classList.toggle('hidden', mode !== 'Futures');
  document.getElementById('gridFields').classList.toggle('hidden',    mode !== 'Grid Bot');
}

// ── Share ─────────────────────────────────────────────
function setupShare() {
  const dlg     = document.getElementById('shareDialog');
  const preview = document.getElementById('sharePreview');
  let shareMode = 'amount';

  function renderPreview() {
    const m   = computeMetrics();
    const p   = estimateDcaProjection();
    const pct = (m.dcaBtc / state.settings.goalBtc) * 100;
    let big = '', sub = '';
    if (shareMode === 'amount')   { big = `${fmtBtc(m.dcaBtc,4)} BTC`; sub = `${fmtPct(pct,2)} toward ${fmtBtc(state.settings.goalBtc,4)} BTC`; }
    else if (shareMode === 'progress') { big = fmtPct(pct,2); sub = 'on the way to 1 BTC'; }
    else if (shareMode === 'stealth')  { big = 'Stay humble'; sub = 'Stack sats.'; }
    else { big = `Age ${p.targetAge}: ${fmtBtc(p.estimatedBTCAtTargetAge,3)} BTC`; sub = p.onTrack ? 'On target' : `Need ${fmtUsd(p.requiredDca)}/mo`; }
    preview.innerHTML = `<h4>Stacking Bitcoin</h4><div class="share-big">${big}</div><div class="share-sub">${sub}</div><div class="share-foot">btcstack.app</div>`;
  }

  document.getElementById('shareProgressBtn')?.addEventListener('click', () => {
    shareMode = 'amount';
    document.querySelectorAll('#shareModeSeg .seg-btn').forEach((b,i) => b.classList.toggle('active',i===0));
    renderPreview(); dlg.showModal();
  });
  document.querySelectorAll('#shareModeSeg .seg-btn').forEach(b => b.addEventListener('click', () => {
    shareMode = b.dataset.value;
    document.querySelectorAll('#shareModeSeg .seg-btn').forEach(x => x.classList.toggle('active', x===b));
    renderPreview();
  }));

  async function getCanvas() {
    if (!window.html2canvas) await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    return window.html2canvas(preview, { backgroundColor: getComputedStyle(preview).backgroundColor, scale: 2 });
  }
  async function doShare(text) {
    const c = await getCanvas();
    const blob = await new Promise(r=>c.toBlob(r,'image/png'));
    const file = new File([blob],'btc-stacking.png',{type:'image/png'});
    if (navigator.share && navigator.canShare?.({files:[file]})) await navigator.share({files:[file],title:'BTC Stacking',text});
    else { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='btc-stacking.png';a.click(); }
  }
  document.getElementById('saveImageBtn')?.addEventListener('click', async()=>{const c=await getCanvas();const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='btc-stacking.png';a.click();});
  document.getElementById('shareIgBtn')?.addEventListener('click',()=>doShare('Stacking Bitcoin'));
  document.getElementById('shareFbBtn')?.addEventListener('click',()=>doShare('Stacking Bitcoin'));
  document.getElementById('shareXBtn')?.addEventListener('click', ()=>doShare('Stacking Bitcoin'));
}

// ── Price ─────────────────────────────────────────────
async function refreshPrice() {
  try {
    const data = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd').then(r=>r.json());
    if (data?.bitcoin?.usd) {
      state.settings.currentPrice   = +data.bitcoin.usd;
      state.settings.priceUpdatedAt = new Date().toISOString();
      persist(); render();
    }
  } catch {}
}

// ── Metrics ───────────────────────────────────────────
function computeMetrics() {
  const price    = +state.settings.currentPrice || 0;
  const usdthb   = +state.settings.usdthb       || 33;
  const dcaBtc   = state.dca.reduce((s,x)=>s + (+x.btcQty||0), 0);
  const dipBtc   = state.dip.reduce((s,x)=>s + (+x.btcQty||0), 0);
  const totalBtc = dcaBtc + dipBtc;
  const dcaInv   = state.dca.reduce((s,x)=>s + Math.abs(+x.usdtAmount||0), 0);
  const dipInv   = state.dip.reduce((s,x)=>s + Math.abs(+x.usdtAmount||0), 0);
  const totalInv = dcaInv + dipInv;
  const avgCost  = totalBtc > 0 ? totalInv / totalBtc : 0;
  const futPnl   = state.futures.reduce((s,x)=>s + (+x.pnlUsdt||0), 0);
  const gridPnl  = state.grid.reduce((s,x)=>s + (+x.netProfitUsdt||0), 0);
  const wins     = state.futures.filter(x=>+x.pnlUsdt>0).length;
  const winRate  = state.futures.length ? (wins/state.futures.length)*100 : 0;
  const mo       = new Date().toISOString().slice(0,7);
  const moDca    = state.dca.filter(x=>String(x.date).slice(0,7)===mo);
  const moBtc    = moDca.reduce((s,x)=>s + (+x.btcQty||0), 0);
  const moInv    = moDca.reduce((s,x)=>s + Math.abs(+x.usdtAmount||0), 0);
  return {
    price, usdthb, dcaBtc, dipBtc, totalBtc, dcaInv, dipInv, totalInv, avgCost,
    futPnl, gridPnl, wins, winRate,
    moCount: moDca.length, moBtc, moInv,
    futsToBtc: price>0 ? futPnl/price : 0,
    gridToBtc: price>0 ? gridPnl/price : 0,
    totalConverted: price>0 ? (futPnl+gridPnl)/price : 0
  };
}

// ── DCA Projection Math ───────────────────────────────
function estimateDcaProjection() {
  const m   = computeMetrics();
  const cur = +(state.settings.manualCurrentDcaBtc || m.dcaBtc);
  const tgt = +(state.settings.goalBtc  || 1);
  const age = +(state.settings.currentAge || 29);
  const tAge= +(state.settings.targetAge  || 40);
  const dca = +(state.settings.monthlyDcaUsd || 300);
  const gr  = +(state.settings.annualGrowthRate || 0) / 100;
  const p0  = +(state.settings.currentPrice || 1);
  const mgr = Math.pow(1+gr, 1/12) - 1;
  const months = Math.max(0, Math.round((tAge-age)*12));

  let btc = cur, price = p0;
  const path = [{ age, btc }];
  for (let i = 1; i <= months; i++) {
    btc   += dca / price;
    price *= (1+mgr);
    path.push({ age: age + i/12, btc });
  }

  let btc2=cur, p2=p0, mo2=0;
  while (btc2<tgt && mo2<1200) { btc2+=dca/p2; p2*=(1+mgr); mo2++; }
  const reachAge  = age + mo2/12;
  const shortfall = Math.max(0, tgt - btc);
  const reqDca    = solveRequiredDca({ cur, tgt, age, tAge, p0, gr });

  const suggestions = buildSuggestions({ cur, tgt, age, tAge, p0, dca, gr, reqDca });

  return {
    currentBtc: cur, targetBTC: tgt, currentAge: age, targetAge: tAge,
    currentPrice: p0, monthlyDcaUsd: dca, annualGrowthRate: gr,
    estimatedBTCAtTargetAge: btc, shortfall, reachAge,
    onTrack: btc >= tgt, requiredDca: reqDca, path, suggestions
  };
}

function projectWith({ cur, tgt, age, tAge, p0, dca, gr }) {
  const mgr = Math.pow(1+gr, 1/12) - 1;
  const months = Math.max(0, Math.round((tAge-age)*12));
  let btc=cur, price=p0;
  for (let i=1;i<=months;i++){ btc+=dca/price; price*=(1+mgr); }
  let b2=cur, p2=p0, mo=0;
  while (b2<tgt && mo<1200){ b2+=dca/p2; p2*=(1+mgr); mo++; }
  return { projBtc: btc, reachAge: age+mo/12, onTrack: btc>=tgt };
}

function solveRequiredDca({ cur, tgt, age, tAge, p0, gr }) {
  let lo=0, hi=100000;
  for (let i=0;i<50;i++){
    const mid=( lo+hi)/2;
    const r = projectWith({ cur, tgt, age, tAge, p0, dca:mid, gr });
    if (r.projBtc>=tgt) hi=mid; else lo=mid;
  }
  return hi;
}

function buildSuggestions({ cur, tgt, age, tAge, p0, dca, gr, reqDca }) {
  return [
    { extra: 100, growthAdj: gr,   icon:'💵', cls:'s1' },
    { extra: Math.round((reqDca - dca) / 50) * 50, growthAdj: gr, icon:'💰', cls:'s2' },
    { extra: 0,   growthAdj: 0.15, icon:'📈', cls:'s3' }
  ].map(({ extra, growthAdj, icon, cls }) => {
    const newDca = Math.max(dca, dca + extra);
    const s      = projectWith({ cur, tgt, age, tAge, p0, dca: newDca, gr: growthAdj });
    const diff   = s.reachAge - tAge;
    const title  = extra > 0
      ? `Add $${extra.toFixed(0)}/month`
      : growthAdj > gr
        ? `Increase growth to ${(growthAdj*100).toFixed(0)}%`
        : 'At current DCA';
    return {
      icon, cls, title,
      reach: s.reachAge,
      isEarly: diff <= 0,
      diffLabel: Math.abs(diff) < 0.1
        ? 'On target 🎯'
        : diff < 0
          ? `${Math.abs(diff).toFixed(1)} yrs early`
          : `${diff.toFixed(1)} yrs late`
    };
  });
}

// ── Render helpers ────────────────────────────────────
function $$(id) { return document.getElementById(id); }
function setText(id, v) { const el=$$(id); if(el) el.textContent = v; }

function renderStatCards(id, items) {
  const el = $$(id);
  if (!el) return;
  el.innerHTML = items.map(i => `
    <div class="stat-card">
      <span class="stat-label">${i.label}</span>
      <span class="stat-value ${i.cls||''}">${i.value}</span>
      <span class="stat-hint">${i.hint||''}</span>
    </div>`).join('');
}

function renderEntries(id, rows) {
  const el = $$(id);
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<p class="muted text-sm" style="padding:8px 0">No entries yet.</p>'; return; }
  el.innerHTML = rows.map(r => `
    <div class="entry-row">
      <div class="entry-left">
        <div class="entry-badge ${r.kind||'default'}">${r.badge||'—'}</div>
        <div>
          <p class="entry-title">${r.title}</p>
          <p class="entry-sub">${r.sub}</p>
        </div>
      </div>
      <div class="entry-right">
        <span class="entry-val ${r.cls||''}">${r.val}</span>
        <span class="entry-sub-val">${r.subVal||''}</span>
      </div>
    </div>`).join('');
}

function drawChart(svgId, points, opts = {}) {
  const svg = $$(svgId);
  if (!svg || !points.length) return;
  const W=320, H=160, P={l:44,r:12,t:14,b:24};
  const xs = points.map(p=>p.x), ys = points.map(p=>p.y);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, opts.goal ?? Infinity, 0);
  const maxY = Math.max(...ys, opts.goal ?? 0, 1);
  const rangeY = maxY === minY ? 1 : maxY - minY;
  const cx = v => P.l + (v/maxX) * (W-P.l-P.r);
  const cy = v => H - P.b - ((v-minY)/rangeY) * (H-P.t-P.b);

  const isNeg = points.at(-1).y < 0 && !opts.forceGreen;
  if (isNeg) svg.classList.add('neg'); else svg.classList.remove('neg');

  const linePts = points.map((p,i)=>`${i?'L':'M'}${cx(p.x).toFixed(1)},${cy(p.y).toFixed(1)}`).join(' ');
  const baseY   = cy(Math.max(0, minY));
  const areaPts = `M${cx(points[0].x)},${baseY} ` + points.map(p=>`L${cx(p.x).toFixed(1)},${cy(p.y).toFixed(1)}`).join(' ') + ` L${cx(points.at(-1).x)},${baseY}Z`;

  const tickVals = [minY, (minY+maxY)/2, maxY];
  const yTicks = tickVals.map(v =>
    `<line class="ax" x1="${P.l}" y1="${cy(v).toFixed(1)}" x2="${W-P.r}" y2="${cy(v).toFixed(1)}"/>` +
    `<text x="2" y="${(cy(v)+4).toFixed(1)}" text-anchor="start">${opts.currency ? (v<0?'-':'')+'$'+Math.abs(Math.round(v)) : v.toFixed(2)}</text>`
  ).join('');

  const goalLine = opts.goal != null
    ? `<line class="gl" x1="${P.l}" y1="${cy(opts.goal).toFixed(1)}" x2="${W-P.r}" y2="${cy(opts.goal).toFixed(1)}"/>`
    : '';

  const xLabels = [points[0], points[Math.floor(points.length/2)], points.at(-1)];
  const xticks = xLabels.map(p=>`<text x="${cx(p.x).toFixed(1)}" y="${H-4}" text-anchor="middle">${p.label}</text>`).join('');

  const ex = cx(points.at(-1).x), ey = cy(points.at(-1).y);
  const pillW = 64, pillH = 18;
  const px = Math.min(Math.max(ex - pillW/2, P.l), W-P.r-pillW);
  const py = Math.max(P.t, ey - 22);
  const pill = opts.pillText
    ? `<rect class="pill-bg" x="${px}" y="${py}" width="${pillW}" height="${pillH}" rx="6"/><text class="pill-txt" x="${px+pillW/2}" y="${py+12}" text-anchor="middle">${opts.pillText}</text>`
    : '';

  svg.innerHTML =
    `<path class="da" fill="${isNeg ? 'var(--red)' : 'var(--green)'}" opacity=".1" d="${areaPts}"/>` +
    `${yTicks}${goalLine}` +
    `<path class="dl" d="${linePts}"/>` +
    `<circle class="dot" cx="${ex}" cy="${ey}" r="4"/>` +
    `${pill}${xticks}`;
}

// ── RENDER ────────────────────────────────────────────
function render() {
  setText('headerDate', todayStr());
  const m = computeMetrics();
  const p = estimateDcaProjection();

  // Topbar pill
  setText('topbarBtcPrice', fmtUsdCompact(m.price));
  setText('topbarThbPrice', fmtThbCompact(m.price * m.usdthb));

  renderHome(m, p);
  renderDca(p, m);
  renderFutures(m);
  renderMore(m);
  renderTriggers(m);
}

// ── HOME ──────────────────────────────────────────────
function renderHome(m, p) {
  // Hero
  setText('heroBtc',   fmtBtc(m.totalBtc, 4));
  setText('heroGoal',  `${fmtBtc(state.settings.goalBtc, 4)} BTC`);
  const heroUsd = m.totalBtc * m.price;
  setText('heroUsdValue', `${fmtUsdCompact(heroUsd)} · ${fmtThbCompact(heroUsd * m.usdthb)}`);

  const pct = Math.min(100, m.totalBtc / state.settings.goalBtc * 100);
  const fill = $$('goalProgressFill');
  if (fill) fill.style.width = `${pct}%`;
  setText('goalPercent',  fmtPct(pct, 1));
  setText('remainingBtc', `${fmtBtc(Math.max(0, state.settings.goalBtc - m.totalBtc), 4)} BTC`);

  // Stats
  renderStatCards('homeStats', [
    { label:'Avg Cost',    value: fmtUsd(m.avgCost),    hint:'per BTC' },
    { label:'Capital',     value: fmtUsdCompact(m.totalInv), hint:'deployed' },
    { label:'BTC Stacked', value: fmtBtc(m.totalBtc,4), hint:'total' }
  ]);

  // Cash flow
  function setFlow(id, v) {
    const el=$$(id); if(!el) return;
    el.textContent = v; el.className = 'flow-val mono ' + (Number(v.replace(/[^0-9.-]/g,''))<0?'negative':'positive');
  }
  setText('futuresCash', fmtUsdFull(m.futPnl));
  $$('futuresCash').className = `flow-val mono ${m.futPnl>=0?'positive':'negative'}`;
  setText('gridCash', fmtUsdFull(m.gridPnl));
  $$('gridCash').className = `flow-val mono ${m.gridPnl>=0?'positive':'negative'}`;
  const ftb = m.futsToBtc, gtb = m.gridToBtc, ttb = m.totalConverted;
  setText('futuresToBtc', `${ftb>=0?'+':''}${fmtBtc(ftb,4)} BTC`);
  $$('futuresToBtc').className = `flow-btc mono ${ftb>=0?'positive':'negative'}`;
  setText('gridToBtc', `${gtb>=0?'+':''}${fmtBtc(gtb,4)} BTC`);
  $$('gridToBtc').className = `flow-btc mono ${gtb>=0?'positive':'negative'}`;
  setText('totalConverted', `${ttb>=0?'+':''}${fmtBtc(ttb,4)} BTC`);
  $$('totalConverted').className = `mono ${ttb>=0?'positive':'negative'}`;

  // This Month
  setText('monthBtc',      `${m.moBtc>=0?'+':''}${fmtBtc(m.moBtc,4)}`);
  $$('monthBtc').className = `month-val mono ${m.moBtc>=0?'positive':''}`;
  setText('monthEntries',  String(m.moCount));
  setText('monthInvested', fmtUsdCompact(m.moInv));

  // Recent
  const rows = [
    ...state.dca.slice(0,3).map(x=>({
      kind:'dca', badge:'DCA',
      title: fmtDate(x,'date'),
      sub: `${x.type||'BUY'} · ${(x.note||x.source||'').replace(/, 1m candle/g,'').slice(0,30)}`,
      val: `${x.btcQty>=0?'+':''}${fmtBtc(x.btcQty,4)} BTC`,
      subVal: fmtUsdFull(x.usdtAmount), cls: x.btcQty>=0?'positive':''
    })),
    ...state.futures.slice(0,2).map(x=>({
      kind:'futures', badge:'FUT',
      title: fmtDate(x,'dateClose'),
      sub: `${x.side||''} · ${x.mode||''}`,
      val: fmtUsdFull(x.pnlUsdt), cls: x.pnlUsdt>=0?'positive':'negative'
    }))
  ].slice(0,5);
  renderEntries('recentActivity', rows);
}

// ── DCA ───────────────────────────────────────────────
function renderDca(p, m) {
  setText('dcaGoalLabel', fmtBtc(state.settings.goalBtc, 1));

  // Hero
  setText('projCurrentBtc',      fmtBtc(p.currentBtc, 4));
  setText('projTargetValue',      fmtBtc(p.targetBTC,  4));
  setText('projTargetValueSide',  fmtBtc(p.targetBTC,  4));
  setText('projTargetAgeInline',  String(p.targetAge));
  setText('projTimeLeft',         `${Math.max(0, p.targetAge - p.currentAge)} yrs`);

  const pct = Math.min(100, p.currentBtc / p.targetBTC * 100);
  const f = $$('projProgressFill');
  if (f) f.style.width = `${pct}%`;
  setText('projProgressPct', fmtPct(pct, 1));
  setText('projHeroNote', p.currentBtc < p.targetBTC * 0.05
    ? "Early days. Keep stacking."
    : p.onTrack ? "On target. Stay consistent."
    : "Raise your DCA to stay on track.");

  // Estimated BTC summary
  setText('projSummaryAge',  String(p.targetAge));
  setText('projAtTargetAge', fmtBtc(p.estimatedBTCAtTargetAge, 3));
  const chip = $$('projGapChip');
  if (chip) {
    chip.textContent = p.onTrack ? '✓ On target' : `−${fmtBtc(p.shortfall,3)} BTC`;
    chip.className   = `proj-gap-chip ${p.onTrack ? '' : 'short'}`;
  }
  setText('projReachAge',    p.reachAge > 100 ? '100+' : p.reachAge.toFixed(1));
  setText('projLateYears',   p.onTrack ? 'On target' : `−${fmtBtc(p.shortfall,3)} BTC`);
  setText('projTargetAge',   String(p.targetAge));
  setText('projTargetAge2',  String(p.targetAge));
  setText('projRequiredDca', fmtUsd(p.requiredDca));

  // Assumptions
  const assumEl = $$('projectionAssumptions');
  if (assumEl) {
    assumEl.innerHTML = [
      ['Age',         String(p.currentAge),                     'years'],
      ['Target Age',  String(p.targetAge),                      'years'],
      ['DCA Stack',   fmtBtc(p.currentBtc, 4),                  'BTC'],
      ['Monthly DCA', fmtUsd(p.monthlyDcaUsd),                  '/month'],
      ['BTC Price',   fmtUsd(p.currentPrice),                   'per BTC'],
      ['Growth',      `${state.settings.annualGrowthRate}%`,    '/year']
    ].map(([l,v,h])=>`
      <div class="assume-cell">
        <span class="alabel">${l}</span>
        <span class="avalue">${v}</span>
        <span class="ahint">${h}</span>
      </div>`).join('');
  }

  setText('projectionFootnote',
    `Assumes ${state.settings.annualGrowthRate}% annual BTC price growth. Live price auto-updates.`);

  // Chart
  const chartPts = p.path
    .filter((_,i)=>i===0||i===p.path.length-1||i%12===0)
    .map(pt=>({ x: pt.age - p.currentAge, y: pt.btc, label:`${Math.round(pt.age)}` }));
  drawChart('projectionChart', chartPts, {
    goal: p.targetBTC,
    pillText: `${fmtBtc(p.estimatedBTCAtTargetAge,3)} BTC`,
    forceGreen: true
  });

  // Callout
  const co = $$('projectionCallout');
  if (co) co.innerHTML = p.onTrack
    ? `At age <strong>${p.targetAge}</strong>, your DCA path reaches <strong>${fmtBtc(p.estimatedBTCAtTargetAge,3)} BTC</strong>. You're on track. ✓`
    : `At age <strong>${p.targetAge}</strong>, you'll have <strong>${fmtBtc(p.estimatedBTCAtTargetAge,3)} BTC</strong>. Need <strong>${fmtUsd(p.requiredDca)}/month</strong> to hit goal.`;

  // What-if scenarios
  const sugEl = $$('projectionSuggestions');
  if (sugEl) {
    sugEl.innerHTML = p.suggestions.map(s=>`
      <div class="scenario-item">
        <div class="scenario-icon ${s.cls}">${s.icon}</div>
        <div class="scenario-body">
          <p class="scenario-title">${s.title}</p>
          <p class="scenario-reach">Reach goal at age <strong class="mono">${s.reach.toFixed(1)}</strong></p>
          <p class="scenario-timing ${s.isEarly?'on':'late'}">${s.diffLabel}</p>
        </div>
      </div>`).join('');
  }

  // DCA entries
  setText('dcaCountLabel', `${state.dca.length} entries`);
  renderEntries('dcaList', state.dca.slice().sort((a,b)=>sortDesc(a,b,'date')).slice(0,20).map(x=>({
    kind:'dca', badge:'DCA',
    title: fmtDate(x,'date'),
    sub: (x.note||x.source||'').replace(/, 1m candle/g,'').trim().slice(0,40),
    val: `${x.btcQty>=0?'+':''}${fmtBtc(x.btcQty,4)} BTC`,
    subVal: fmtUsd(x.price), cls: x.btcQty>=0?'positive':''
  })));
}

// ── FUTURES ───────────────────────────────────────────
function renderFutures(m) {
  setText('futuresCountLabel', `${state.futures.length} trades`);

  renderStatCards('futuresStats', [
    { label:'Total PnL',   value: fmtUsdFull(m.futPnl),  cls: m.futPnl>=0?'positive':'negative', hint:'cumulative' },
    { label:'Win Rate',    value: fmtPct(m.winRate,0),   cls: m.winRate>=50?'positive':'negative', hint:`${m.wins}/${state.futures.length} wins` },
    { label:'Total Trades',value: String(state.futures.length), hint:'all time' }
  ]);

  // Chart — cumulative PnL
  const sorted = state.futures.slice().sort((a,b)=>sortDesc(b,a,'dateClose')).reverse();
  let acc = 0;
  const cum = sorted.map((x,i)=>{ acc+=+x.pnlUsdt||0; return { x:i+1, y:acc, label:String(i+1) }; });
  drawChart('futuresChart', cum.length?cum:[{x:0,y:0,label:'0'}], { currency:true, pillText: fmtUsdFull(acc) });

  // Trade log
  renderEntries('futuresList', state.futures.slice().sort((a,b)=>sortDesc(a,b,'dateClose')).slice(0,20).map(x=>({
    kind:'futures', badge:'FUT',
    title: fmtDate(x,'dateClose'),
    sub: `${x.side||''} ${x.leverage||''} · ${x.mode||''}${x.mistakeTag?' · '+x.mistakeTag:''}`,
    val: fmtUsdFull(x.pnlUsdt),
    subVal: x.roi!=null ? fmtPct(x.roi,2) : '',
    cls: x.pnlUsdt>=0?'positive':'negative'
  })));
}

// ── MORE ──────────────────────────────────────────────
function renderMore(m) {
  const thb = m.price * m.usdthb;
  setText('liveBtcPrice', fmtUsd(m.price));
  setText('liveBtcThb',   fmtThb(thb));
  setText('priceUpdatedAt', state.settings.priceUpdatedAt
    ? `Updated ${new Date(state.settings.priceUpdatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`
    : 'Saved price');

  const refreshBtn = $$('refreshPriceBtn');
  if (refreshBtn && !refreshBtn._b) {
    refreshBtn._b = true;
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '↻ …';
      await refreshPrice();
      refreshBtn.textContent = '↻ Refresh';
    });
  }

  // Dip Reserve
  renderStatCards('dipStats', [
    { label:'BTC Total',  value: fmtBtc(m.dipBtc,4), hint:'BTC' },
    { label:'Capital',    value: fmtUsdCompact(state.dip.reduce((s,x)=>s+Math.abs(+x.usdtAmount||0),0)), hint:'USD' },
    { label:'Entries',    value: String(state.dip.length), hint:'count' }
  ]);
  renderEntries('dipList', state.dip.slice().sort((a,b)=>sortDesc(a,b,'date')).slice(0,10).map(x=>({
    kind:'dip', badge:'DIP',
    title: fmtDate(x,'date'), sub: x.note||x.source||'',
    val: `${x.btcQty>=0?'+':''}${fmtBtc(x.btcQty,4)} BTC`,
    subVal: fmtUsd(x.price), cls: x.btcQty>=0?'positive':''
  })));

  // Grid Bot
  renderStatCards('gridStats', [
    { label:'Net Profit',  value: fmtUsdFull(m.gridPnl), cls: m.gridPnl>=0?'positive':'negative', hint:'USD' },
    { label:'Capital',     value: fmtUsdCompact(state.grid.reduce((s,x)=>s+Math.abs(+x.capitalUsdt||0),0)), hint:'USD' },
    { label:'Runs',        value: String(state.grid.length), hint:'bots' }
  ]);
  renderEntries('gridList', state.grid.slice().sort((a,b)=>sortDesc(a,b,'dateEnd')).slice(0,8).map(x=>({
    kind:'grid', badge:'GRD',
    title: fmtDate(x,'dateEnd'), sub:`${x.gridType||''} · ${x.mode||''}`,
    val: fmtUsdFull(x.netProfitUsdt),
    subVal: fmtPct(x.roi,2), cls: x.netProfitUsdt>=0?'positive':'negative'
  })));
}

// ── TRIGGERS ──────────────────────────────────────────
function renderTriggers(m) {
  const ref = m.price || state.settings.currentPrice || 0;
  const budget = +(state.settings.triggerBudgetThb || 67000);
  setText('triggerRefPrice', fmtUsd(ref));
  setText('triggerBudgetHelp', `Auto-calculated from reference price and your total trigger budget: ${fmtThb(budget)}.`);
  setText('triggerBudgetSub', 'Edit budget in DCA Plan → Total Trigger Budget (THB).');

  // Avg Cost vs Market
  setText('avgCostVal',   fmtUsd(m.avgCost));
  setText('avgMarketVal', fmtUsd(ref));
  const diff    = ref - m.avgCost;
  const diffPct = m.avgCost > 0 ? (diff/m.avgCost)*100 : 0;
  const diffEl  = $$('avgVsDiff');
  if (diffEl) {
    diffEl.textContent = `${diff>=0?'+':''}${fmtPct(diffPct,1)}`;
    diffEl.className   = `avg-vs-diff mono ${diff>=0?'positive':'negative'}`;
  }

  const listEl = $$('triggersList');
  if (!listEl) return;

  // Build triggers: use data.json triggers if available,
  // otherwise auto-calc from ref price
  let triggers = (state.triggers && state.triggers.length > 0)
    ? state.triggers
    : buildAutoTriggers(ref, m.usdthb);

  if (!triggers.length) {
    listEl.innerHTML = '<p class="muted text-sm">No triggers configured.</p>';
    return;
  }

  listEl.innerHTML = triggers.map(t => {
    const buyPrice = t.buyPrice || (ref * (1 + (t.drop||0)));
    const thbUse   = t.thbUse || 0;
    const btcEst   = thbUse > 0 && buyPrice > 0
      ? (thbUse / m.usdthb) / buyPrice
      : (t.btcEst || 0);
    const isPanic  = (t.fundSource||'').toLowerCase() === 'panic';
    const fired    = ref > 0 && ref <= buyPrice * 1.03;
    return `
      <div class="trigger-card ${fired?'trigger-fired':''}">
        <div class="trigger-top">
          <div>
            <span class="trigger-level-badge ${isPanic?'panic':''}">${t.level} · ${t.fundSource||''}</span>
          </div>
          <span class="trigger-note-text">${t.notes||''}</span>
        </div>
        <div class="trigger-stats">
          <div class="trigger-stat">
            <span class="trigger-stat-label">Buy Price</span>
            <span class="trigger-stat-value ${fired?'positive':''}">${fmtUsd(buyPrice)}</span>
          </div>
          <div class="trigger-stat">
            <span class="trigger-stat-label">Drop</span>
            <span class="trigger-stat-value negative">${((t.drop||0)*100).toFixed(0)}%</span>
          </div>
          <div class="trigger-stat">
            <span class="trigger-stat-label">Deploy (THB)</span>
            <span class="trigger-stat-value">${fmtThb(thbUse)}</span>
          </div>
          <div class="trigger-stat">
            <span class="trigger-stat-label">Est. BTC</span>
            <span class="trigger-stat-value positive">${fmtBtc(btcEst, 4)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

function buildAutoTriggers(ref, usdthb) {
  if (!ref) return [];
  const budget = +(state.settings.triggerBudgetThb || 67000);
  const weights = [0.10, 0.20, 0.30, 0.40];
  const drops = [-0.10, -0.20, -0.30, -0.40];
  const sources = ['Dip', 'Dip', 'Panic', 'Panic'];
  const notes = [
    'Small buy on -10%',
    'Add more on -20%',
    'Start panic buying on -30%',
    'All-in panic reserve on -40%'
  ];

  return weights.map((w, i) => ({
    level: `L${i+1}`,
    drop: drops[i],
    fundSource: sources[i],
    notes: notes[i],
    thbUse: Math.round(budget * w),
    buyPrice: ref * (1 + drops[i])
  }));
}

// ── Start ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
