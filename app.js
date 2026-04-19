const STORAGE_KEY = 'btc-stacking-v3';

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
    priceUpdatedAt: null
  },
  dca: [],
  dip: [],
  futures: [],
  grid: [],
  triggers: []
};

async function init() {
  const remote = await fetch('data.json').then(r => r.json());
  Object.assign(state.settings, remote.settings || {});
  state.dca      = remote.dca      || [];
  state.dip      = remote.dip      || [];
  state.futures  = remote.futures  || [];
  state.grid     = remote.grid     || [];
  state.triggers = remote.triggers || [];

  hydrateLocal();
  setupTheme();
  setupNav();
  setupDialogs();
  setupShare();
  render();
  refreshPrice();
}

// ── Persistence ──────────────────────────
function hydrateLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!saved) return;
    if (saved.settings) Object.assign(state.settings, saved.settings);
    ['dca', 'dip', 'futures', 'grid'].forEach(key => {
      if (Array.isArray(saved[key])) state[key] = saved[key];
    });
  } catch {}
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    settings: state.settings,
    dca: state.dca,
    dip: state.dip,
    futures: state.futures,
    grid: state.grid
  }));
}

// ── Formatters ───────────────────────────
function fmtNum(v, d = 4) {
  return Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtUsd(v, d = 0) {
  const sign = Number(v) < 0 ? '-' : '';
  return `${sign}$${Math.abs(Number(v || 0)).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
function fmtThb(v, d = 0) {
  return `฿${Math.abs(Number(v || 0)).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
function fmtPct(v, d = 2) { return `${Number(v || 0).toFixed(d)}%`; }
function todayStr() {
  return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function asDate(v) { return new Date(v); }
function sortByDateDesc(a, b, key = 'date') { return asDate(b[key]) - asDate(a[key]); }

// ── Theme ────────────────────────────────
function applyTheme() {
  const app = document.getElementById('app');
  app.classList.toggle('theme-dark',  state.settings.theme === 'dark');
  app.classList.toggle('theme-light', state.settings.theme !== 'dark');
}
function setupTheme() {
  applyTheme();
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    persist();
    applyTheme();
  });
}

// ── Navigation ───────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });
}

const PAGE_TITLES = { home: 'Home', dca: 'Stacking', futures: 'Futures', more: 'More', triggers: 'Triggers' };

function switchScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.screen === screen));
  document.getElementById('pageTitle').textContent = PAGE_TITLES[screen] || screen;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

// ── Dialogs ──────────────────────────────
function setupDialogs() {
  const goalDialog = document.getElementById('goalDialog');
  document.getElementById('editGoalBtn').addEventListener('click', () => {
    document.getElementById('goalInput').value   = state.settings.goalBtc;
    document.getElementById('usdthbInput').value = state.settings.usdthb;
    goalDialog.showModal();
  });
  document.getElementById('saveGoalBtn').addEventListener('click', () => {
    state.settings.goalBtc = Math.max(0.001, Number(document.getElementById('goalInput').value || 1));
    state.settings.usdthb  = Math.max(1,     Number(document.getElementById('usdthbInput').value || 33));
    persist(); goalDialog.close(); render();
  });

  const projectionDialog = document.getElementById('projectionDialog');
  const projectionForm   = document.getElementById('projectionForm');
  document.getElementById('editProjectionBtn').addEventListener('click', () => {
    projectionForm.currentAge.value       = state.settings.currentAge;
    projectionForm.targetAge.value        = state.settings.targetAge;
    projectionForm.currentDcaBtc.value    = computeMetrics().dcaBtc.toFixed(8);
    projectionForm.monthlyDcaUsd.value    = state.settings.monthlyDcaUsd;
    projectionForm.annualGrowthRate.value = state.settings.annualGrowthRate;
    projectionDialog.showModal();
  });
  document.getElementById('closeProjectionBtn').addEventListener('click',  () => projectionDialog.close());
  document.getElementById('cancelProjectionBtn').addEventListener('click', () => projectionDialog.close());
  projectionForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(projectionForm);
    state.settings.currentAge       = Number(f.get('currentAge')       || 29);
    state.settings.targetAge        = Number(f.get('targetAge')        || 40);
    state.settings.monthlyDcaUsd    = Number(f.get('monthlyDcaUsd')    || 300);
    state.settings.annualGrowthRate = Number(f.get('annualGrowthRate') || 10);
    const mc = Number(f.get('currentDcaBtc') || 0);
    if (mc > 0) state.settings.manualCurrentDcaBtc = mc;
    persist(); projectionDialog.close(); render();
  });

  setupEntryDialog();
}

function setupEntryDialog() {
  const dialog = document.getElementById('entryDialog');
  const form   = document.getElementById('entryForm');
  const addBtn = document.getElementById('addBtn');
  const close  = () => dialog.close();

  addBtn.addEventListener('click', () => {
    form.reset();
    const today = new Date().toISOString().slice(0, 10);
    ['date','dateOpen','dateClose','dateStart','dateEnd'].forEach(n => { if (form[n]) form[n].value = today; });
    setEntryMode('DCA');
    dialog.showModal();
  });
  document.getElementById('closeEntryBtn').addEventListener('click', close);
  document.getElementById('cancelEntryBtn').addEventListener('click', close);
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn =>
    btn.addEventListener('click', () => setEntryMode(btn.dataset.value)));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const mode = document.querySelector('#entryStrategySeg .seg-btn.active').dataset.value;
    const f    = new FormData(form);
    if (mode === 'Futures') {
      state.futures.unshift({
        dateOpen: f.get('dateOpen'), dateClose: f.get('dateClose'),
        symbol: 'BTCUSDT', side: f.get('side'), leverage: f.get('leverage'),
        mode: f.get('mode'), entryPrice: Number(f.get('entryPrice') || 0),
        exitPrice: Number(f.get('exitPrice') || 0), sizeBtc: Number(f.get('sizeBtc') || 0),
        pnlUsdt: Number(f.get('pnlUsdt') || 0),
        mistakeTag: f.get('mistakeTag') || null, notes: f.get('notes'), strategy: 'Futures'
      });
    } else if (mode === 'Grid Bot') {
      state.grid.unshift({
        dateStart: f.get('dateStart'), dateEnd: f.get('dateEnd'),
        gridType: f.get('gridType'), mode: f.get('gridMode'),
        capitalUsdt: Number(f.get('capitalUsdt') || 0),
        netProfitUsdt: Number(f.get('netProfitUsdt') || 0),
        roi: Number(f.get('roi') || 0), note: f.get('gridNote'), strategy: 'Grid Bot'
      });
    } else {
      const arr = mode === 'Dip Reserve' ? state.dip : state.dca;
      arr.unshift({
        date: f.get('date'), type: f.get('type'), source: f.get('source'),
        btcQty: Number(f.get('btcQty') || 0), usdtAmount: Number(f.get('usdtAmount') || 0),
        price: Number(f.get('price') || 0), note: f.get('note'),
        location: f.get('location'), strategy: mode
      });
    }
    persist(); close(); render();
  });
}

function setEntryMode(mode) {
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.value === mode));
  document.getElementById('spotFields').classList.toggle('hidden',    mode === 'Futures' || mode === 'Grid Bot');
  document.getElementById('futuresFields').classList.toggle('hidden', mode !== 'Futures');
  document.getElementById('gridFields').classList.toggle('hidden',    mode !== 'Grid Bot');
}

// ── Share ─────────────────────────────────
function setupShare() {
  const dialog  = document.getElementById('shareDialog');
  const preview = document.getElementById('sharePreview');
  let mode = 'amount';

  const renderSharePreview = () => {
    const m   = computeMetrics();
    const p   = estimateDcaProjection();
    const pct = (m.dcaBtc / state.settings.goalBtc) * 100;
    let big = '', sub = '';
    if (mode === 'amount')   { big = `${fmtNum(m.dcaBtc,4)} BTC`; sub = `${fmtPct(pct,2)} to ${fmtNum(state.settings.goalBtc,4)} BTC`; }
    else if (mode === 'progress') { big = fmtPct(pct,2); sub = 'on the way to 1 BTC'; }
    else if (mode === 'stealth')  { big = 'Stay humble'; sub = 'Stack sats.'; }
    else { big = `At age ${p.targetAge}: ${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC`; sub = p.onTrack ? 'On target' : `Need ${fmtUsd(p.requiredDca,0)}/month`; }
    preview.innerHTML = `<h4>Stacking Bitcoin</h4><div class="share-big">${big}</div><div class="share-sub">${sub}</div><div class="footnote">btcstack.app</div>`;
  };

  document.getElementById('shareProgressBtn')?.addEventListener('click', () => {
    mode = 'amount';
    document.querySelectorAll('#shareModeSeg .seg-btn').forEach((b,i) => b.classList.toggle('active', i===0));
    renderSharePreview(); dialog.showModal();
  });
  document.querySelectorAll('#shareModeSeg .seg-btn').forEach(btn => btn.addEventListener('click', () => {
    mode = btn.dataset.value;
    document.querySelectorAll('#shareModeSeg .seg-btn').forEach(b => b.classList.toggle('active', b===btn));
    renderSharePreview();
  }));

  async function exportPreview() {
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
      });
    }
    return window.html2canvas(preview, { backgroundColor: getComputedStyle(preview).backgroundColor, scale: 2 });
  }
  async function shareFile(text) {
    const canvas = await exportPreview();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'btc-stacking.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'BTC Stacking', text });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'btc-stacking.png'; a.click();
    }
  }
  document.getElementById('saveImageBtn')?.addEventListener('click', async () => {
    const canvas = await exportPreview();
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'btc-stacking.png'; a.click();
  });
  document.getElementById('shareIgBtn')?.addEventListener('click', () => shareFile('Stacking Bitcoin'));
  document.getElementById('shareFbBtn')?.addEventListener('click', () => shareFile('Stacking Bitcoin'));
  document.getElementById('shareXBtn')?.addEventListener('click', () => shareFile('Stacking Bitcoin'));
}

// ── Price ─────────────────────────────────
async function refreshPrice() {
  try {
    const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await res.json();
    if (data?.bitcoin?.usd) {
      state.settings.currentPrice   = Number(data.bitcoin.usd);
      state.settings.priceUpdatedAt = new Date().toISOString();
      persist(); render();
    }
  } catch {}
}

// ── Metrics ───────────────────────────────
function computeMetrics() {
  const price        = Number(state.settings.currentPrice || 0);
  const usdthb       = Number(state.settings.usdthb || 33);
  const dcaBtc       = state.dca.reduce((s,x) => s + Number(x.btcQty||0), 0);
  const dipBtc       = state.dip.reduce((s,x) => s + Number(x.btcQty||0), 0);
  const totalBtc     = dcaBtc + dipBtc;
  const dcaInvested  = state.dca.reduce((s,x) => s + Math.abs(Number(x.usdtAmount||0)), 0);
  const dipInvested  = state.dip.reduce((s,x) => s + Math.abs(Number(x.usdtAmount||0)), 0);
  const totalInvested = dcaInvested + dipInvested;
  const avgCost      = totalBtc > 0 ? totalInvested / totalBtc : 0;
  const futuresPnl   = state.futures.reduce((s,x) => s + Number(x.pnlUsdt||0), 0);
  const gridPnl      = state.grid.reduce((s,x) => s + Number(x.netProfitUsdt||0), 0);
  const wins         = state.futures.filter(x => Number(x.pnlUsdt) > 0).length;
  const winRate      = state.futures.length > 0 ? (wins / state.futures.length) * 100 : 0;
  const currentMonth = new Date().toISOString().slice(0,7);
  const monthDca     = state.dca.filter(x => String(x.date).slice(0,7) === currentMonth);
  const monthBtc     = monthDca.reduce((s,x) => s + Number(x.btcQty||0), 0);
  const monthInvested = monthDca.reduce((s,x) => s + Math.abs(Number(x.usdtAmount||0)), 0);
  const futuresToBtc = price > 0 ? futuresPnl / price : 0;
  const gridToBtc    = price > 0 ? gridPnl    / price : 0;
  return {
    price, usdthb, dcaBtc, dipBtc, totalBtc,
    dcaInvested, totalInvested, avgCost,
    futuresPnl, gridPnl, wins, winRate,
    monthEntries: monthDca.length, monthBtc, monthInvested,
    futuresToBtc, gridToBtc, totalConverted: futuresToBtc + gridToBtc
  };
}

// ── Projection ────────────────────────────
function estimateDcaProjection() {
  const m  = computeMetrics();
  const currentBtc    = Number(state.settings.manualCurrentDcaBtc || m.dcaBtc);
  const targetBTC     = Number(state.settings.goalBtc || 1);
  const currentAge    = Number(state.settings.currentAge || 29);
  const targetAge     = Number(state.settings.targetAge  || 40);
  const monthlyDcaUsd = Number(state.settings.monthlyDcaUsd    || 300);
  const annualGrowthRate = Number(state.settings.annualGrowthRate || 0) / 100;
  const currentPrice  = Number(state.settings.currentPrice || 0);
  const monthsLeft    = Math.max(0, Math.round((targetAge - currentAge) * 12));
  const mgr           = Math.pow(1 + annualGrowthRate, 1/12) - 1;
  let btc = currentBtc, price = currentPrice;
  const path = [{ month:0, age:currentAge, btc }];
  for (let i = 1; i <= monthsLeft; i++) {
    btc += monthlyDcaUsd / price;
    price *= (1 + mgr);
    path.push({ month:i, age: currentAge + i/12, btc });
  }
  const estimatedBTCAtTargetAge = btc;
  const shortfall = Math.max(0, targetBTC - estimatedBTCAtTargetAge);
  let btc2 = currentBtc, price2 = currentPrice, months = 0;
  while (btc2 < targetBTC && months < 1200) { btc2 += monthlyDcaUsd / price2; price2 *= (1+mgr); months++; }
  const reachAge    = currentAge + months / 12;
  const requiredDca = solveRequiredDca({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, annualGrowthRate });
  const suggestions = [100, 300, 0].map((extra, idx) => {
    const growthAdj = idx === 2 ? 0.15 : annualGrowthRate;
    const monthly   = monthlyDcaUsd + extra;
    const scenario  = estimateWithInputs({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, monthlyDcaUsd: monthly, annualGrowthRate: growthAdj });
    return {
      title: idx === 2 ? 'Increase growth to 15%' : `Add $${extra}/month`,
      body: `Reach goal at age ${scenario.reachAge.toFixed(1)}`,
      sub: scenario.onTrack ? 'On target 🎯' : `${Math.max(0, scenario.reachAge - targetAge).toFixed(1)} years late`
    };
  });
  return {
    currentBtc, targetBTC, currentAge, targetAge, currentPrice, monthlyDcaUsd, annualGrowthRate,
    monthsLeft, estimatedBTCAtTargetAge, shortfall, reachAge,
    lateYears: Math.max(0, reachAge - targetAge),
    requiredDca, path, suggestions, onTrack: estimatedBTCAtTargetAge >= targetBTC
  };
}

function estimateWithInputs({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, monthlyDcaUsd, annualGrowthRate }) {
  const monthsLeft = Math.max(0, Math.round((targetAge - currentAge) * 12));
  const mgr = Math.pow(1 + annualGrowthRate, 1/12) - 1;
  let btc = currentBtc, price = currentPrice;
  for (let i = 1; i <= monthsLeft; i++) { btc += monthlyDcaUsd / price; price *= (1+mgr); }
  let btc2 = currentBtc, price2 = currentPrice, months = 0;
  while (btc2 < targetBTC && months < 1200) { btc2 += monthlyDcaUsd / price2; price2 *= (1+mgr); months++; }
  return { projectedBtc: btc, reachAge: currentAge + months/12, onTrack: btc >= targetBTC };
}

function solveRequiredDca({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, annualGrowthRate }) {
  let low = 0, high = 10000;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const result = estimateWithInputs({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, monthlyDcaUsd: mid, annualGrowthRate });
    if (result.projectedBtc >= targetBTC) high = mid; else low = mid;
  }
  return high;
}

// ── Render Helpers ────────────────────────
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function renderStats(elId, items) {
  document.getElementById(elId).innerHTML = items.map(item => `
    <div class="stat-card">
      <p class="meta-label">${item.label}</p>
      <span class="stat-value ${item.className||''}">${item.value}</span>
      <span class="stat-hint">${item.hint||''}</span>
    </div>`).join('');
}

function renderRecent(elId, rows) {
  document.getElementById(elId).innerHTML = rows.map(row => `
    <div class="list-row">
      <div class="row-left">
        <div class="badge ${row.kind||''}">${row.badge||''}</div>
        <div>
          <p class="row-title">${row.title}</p>
          <p class="row-sub">${row.subtitle}</p>
        </div>
      </div>
      <div class="row-value">
        <strong class="${row.className||''}">${row.value}</strong>
        <span>${row.subValue||''}</span>
      </div>
    </div>`).join('');
}

function drawLineChart(svgId, points, opts = {}) {
  const svg = document.getElementById(svgId);
  if (!svg || !points.length) return;
  const W = 320, H = 180, P = { l:44, r:14, t:14, b:26 };
  const maxX  = Math.max(...points.map(p => p.x), 1);
  const rawMin = Math.min(...points.map(p => p.y), opts.goal ?? Infinity, 0);
  const rawMax = Math.max(...points.map(p => p.y), opts.goal||0, 1);
  const minY  = Math.min(0, rawMin);
  const maxY  = rawMax === minY ? minY + 1 : rawMax;
  const x = v => P.l + (v / maxX) * (W - P.l - P.r);
  const y = v => H - P.b - ((v - minY) / (maxY - minY)) * (H - P.t - P.b);
  const line  = points.map((p,i) => `${i?'L':'M'} ${x(p.x).toFixed(2)} ${y(p.y).toFixed(2)}`).join(' ');
  const baseY = y(Math.max(0, minY));
  const area  = `M ${x(points[0].x)} ${baseY} ` + points.map(p => `L ${x(p.x).toFixed(2)} ${y(p.y).toFixed(2)}`).join(' ') + ` L ${x(points.at(-1).x)} ${baseY} Z`;
  const ticks = [minY, (minY+maxY)/2, maxY].map(v => Number(v.toFixed(3)));
  const yTicks = ticks.map(v =>
    `<line class="axis" x1="${P.l}" y1="${y(v)}" x2="${W-P.r}" y2="${y(v)}"></line>` +
    `<text x="4" y="${y(v)+4}">${opts.currency ? (v<0?'-':'')+'$'+Math.abs(Math.round(v)) : v.toFixed(2)}</text>`
  ).join('');
  const goalLine = opts.goal != null
    ? `<line class="goal-line" x1="${P.l}" y1="${y(opts.goal)}" x2="${W-P.r}" y2="${y(opts.goal)}"></line>` : '';
  const xticks = points
    .filter((_,i) => i===0 || i===points.length-1 || i===Math.floor(points.length/2))
    .map(p => `<text x="${x(p.x)}" y="${H-6}" text-anchor="middle">${p.label}</text>`).join('');
  const endX = x(points.at(-1).x), endY = y(points.at(-1).y);
  const pillText = opts.pillText || `${points.at(-1).y.toFixed(3)} BTC`;
  svg.innerHTML =
    `${yTicks}${goalLine}` +
    `<path class="data-area" d="${area}"></path>` +
    `<path class="data-line" d="${line}"></path>` +
    `<circle class="end-dot" cx="${endX}" cy="${endY}" r="4"></circle>` +
    `<rect class="label-pill" x="${Math.max(P.l,endX-8)}" y="${Math.max(P.t,endY-16)}" rx="10" ry="10" width="70" height="20"></rect>` +
    `<text class="label-text" x="${Math.max(P.l+8,endX+1)}" y="${Math.max(P.t+13,endY-3)}">${pillText}</text>` +
    xticks;
}

// ── MAIN RENDER ───────────────────────────
function render() {
  document.getElementById('headerDate').textContent = todayStr();
  const m = computeMetrics();
  const p = estimateDcaProjection();

  // Topbar price pill
  setText('topbarBtcPrice', `$${Math.round(m.price).toLocaleString()}`);
  setText('topbarThbPrice', `฿${(m.price * m.usdthb / 1000).toFixed(0)}k`);

  // Hero
  setText('heroBtc', fmtNum(m.totalBtc, 4));
  setText('heroGoal', `${fmtNum(state.settings.goalBtc, 4)} BTC`);
  const heroUsd = m.totalBtc * m.price;
  setText('heroUsdValue', `≈ ${fmtUsd(heroUsd, 0)} · ${fmtThb(heroUsd * m.usdthb, 0)}`);
  const goalPct = Math.min(100, (m.totalBtc / state.settings.goalBtc) * 100);
  document.getElementById('goalProgressFill').style.width = `${goalPct}%`;
  setText('goalPercent', fmtPct(goalPct, 1));
  setText('remainingBtc', `${fmtNum(Math.max(0, state.settings.goalBtc - m.totalBtc), 4)} BTC`);

  renderStats('homeStats', [
    { label: 'Avg Cost',    value: fmtUsd(m.avgCost, 0),       hint: 'per BTC' },
    { label: 'Capital',     value: fmtUsd(m.totalInvested, 0),  hint: 'USD deployed' },
    { label: 'BTC Stacked', value: fmtNum(m.totalBtc, 4),      hint: 'BTC' }
  ]);

  // Cash flow
  setText('futuresCash', fmtUsd(m.futuresPnl, 2));
  document.getElementById('futuresCash').className = m.futuresPnl >= 0 ? 'positive' : 'negative';
  setText('gridCash', fmtUsd(m.gridPnl, 2));
  document.getElementById('gridCash').className = m.gridPnl >= 0 ? 'positive' : 'negative';
  setText('futuresToBtc', `${m.futuresToBtc>=0?'+':''}${fmtNum(m.futuresToBtc,4)} BTC`);
  document.getElementById('futuresToBtc').className = m.futuresToBtc >= 0 ? 'positive' : 'negative';
  setText('gridToBtc', `${m.gridToBtc>=0?'+':''}${fmtNum(m.gridToBtc,4)} BTC`);
  document.getElementById('gridToBtc').className = m.gridToBtc >= 0 ? 'positive' : 'negative';
  setText('totalConverted', `${m.totalConverted>=0?'+':''}${fmtNum(m.totalConverted,4)} BTC`);
  document.getElementById('totalConverted').className = `big mono ${m.totalConverted>=0?'positive':'negative'}`;

  // This month
  setText('monthBtc',      `${m.monthBtc>=0?'+':''}${fmtNum(m.monthBtc,4)}`);
  setText('monthEntries',  String(m.monthEntries));
  setText('monthInvested', fmtUsd(m.monthInvested, 0));

  // Recent
  const recentRows = [
    ...state.dca.slice(0,3).map(x => ({
      kind:'dca', badge:'DCA',
      title: new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short'}),
      subtitle: `${x.type} · ${x.note||x.source}`,
      value: `${x.btcQty>=0?'+':''}${fmtNum(x.btcQty,4)} BTC`,
      subValue: fmtUsd(x.usdtAmount,2), className: x.btcQty>=0?'positive':''
    })),
    ...state.futures.slice(0,2).map(x => ({
      kind:'futures', badge:'FUT',
      title: new Date(x.dateClose).toLocaleDateString(undefined,{day:'numeric',month:'short'}),
      subtitle: `${x.side} · ${x.mode}`,
      value: fmtUsd(x.pnlUsdt,2), subValue:'Closed',
      className: x.pnlUsdt>=0?'positive':'negative'
    }))
  ].slice(0,5);
  renderRecent('recentActivity', recentRows);

  renderProjection(p);
  renderFutures(m);
  renderMore(m);
  renderTriggers(m);
}

// ── Projection Screen ─────────────────────
function renderProjection(p) {
  setText('dcaGoalLabel', fmtNum(state.settings.goalBtc, 1));
  setText('projCurrentBtc',      fmtNum(p.currentBtc, 4));
  setText('projTargetValue',     fmtNum(p.targetBTC, 4));
  setText('projTargetValueSide', fmtNum(p.targetBTC, 4));
  setText('projTargetAgeInline', String(p.targetAge));
  setText('projTimeLeft',        `${Math.max(0, p.targetAge - p.currentAge)} yrs`);
  const pct = Math.min(100, p.currentBtc / p.targetBTC * 100);
  document.getElementById('projProgressFill').style.width = `${pct}%`;
  setText('projProgressPct', fmtPct(pct, 1));
  setText('projHeroNote', p.currentBtc < p.targetBTC * 0.1
    ? "Keep stacking. You're early."
    : p.onTrack ? 'On target. Stay consistent.'
    : 'Stay consistent. You are building your stack.');
  setText('projSummaryAge',   String(p.targetAge));
  setText('projAtTargetAge',  fmtNum(p.estimatedBTCAtTargetAge, 3));
  const chip = document.getElementById('projGapChip');
  chip.textContent = p.onTrack ? '✓ On target' : `${fmtNum(p.shortfall,3)} BTC short`;
  chip.className   = `status-chip ${p.onTrack ? '' : 'negative'}`;
  setText('projReachAge',    p.reachAge > 100 ? '100+' : p.reachAge.toFixed(1));
  setText('projLateYears',   p.onTrack ? 'On target' : `${fmtNum(p.shortfall,3)} BTC`);
  setText('projTargetAge',   String(p.targetAge));
  setText('projTargetAge2',  String(p.targetAge));
  setText('projRequiredDca', fmtUsd(p.requiredDca, 0));

  document.getElementById('projectionAssumptions').innerHTML = [
    ['Age',        `${p.currentAge}`,                   'years'],
    ['Target Age', `${p.targetAge}`,                    'years'],
    ['DCA Stack',  fmtNum(p.currentBtc,4),              'BTC'],
    ['Monthly',    fmtUsd(p.monthlyDcaUsd,0),           '/month'],
    ['BTC Price',  fmtUsd(p.currentPrice,0),            'per BTC'],
    ['Growth',     `${state.settings.annualGrowthRate}%`, '/year']
  ].map(([label,value,hint]) => `
    <div class="assumption-card">
      <p class="label">${label}</p>
      <p class="value">${value}</p>
      <p class="hint">${hint}</p>
    </div>`).join('');

  setText('projectionFootnote',
    `Projections use ${state.settings.annualGrowthRate}% annual BTC growth. Price updates live.`);

  const chartPts = p.path
    .filter((_,i) => i===0 || i===p.path.length-1 || i%24===0)
    .map(pt => ({ x: pt.age - p.currentAge, y: pt.btc, label: `${Math.round(pt.age)}` }));
  drawLineChart('projectionChart', chartPts, { goal: p.targetBTC, pillText: `${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC` });

  document.getElementById('projectionCallout').innerHTML = p.onTrack
    ? `At age <strong>${p.targetAge}</strong>, your DCA path reaches <strong>${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC</strong>. On target ✓`
    : `At age <strong>${p.targetAge}</strong>, your DCA path reaches <strong>${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC</strong>. Raise DCA to <strong>${fmtUsd(p.requiredDca,0)}/month</strong> to hit goal.`;

  document.getElementById('projectionSuggestions').innerHTML = p.suggestions.map(s => `
    <div class="suggestion-card">
      <div></div>
      <div>
        <strong>${s.title}</strong>
        <p>${s.body}</p>
        <p>${s.sub}</p>
      </div>
    </div>`).join('');

  const allDca = state.dca.slice().sort((a,b) => sortByDateDesc(a,b));
  setText('dcaCountLabel', `${allDca.length} entries`);
  renderRecent('dcaList', allDca.slice(0,15).map(x => ({
    kind:'dca', badge:'DCA',
    title: new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),
    subtitle: (x.note||x.source).replace(/, 1m candle/g,''),
    value: `${x.btcQty>=0?'+':''}${fmtNum(x.btcQty,4)} BTC`,
    subValue: fmtUsd(x.price,0), className: x.btcQty>=0?'positive':''
  })));
}

// ── Futures Screen ────────────────────────
function renderFutures(m) {
  setText('futuresCountLabel', `${state.futures.length} trades`);
  renderStats('futuresStats', [
    { label:'Total PnL', value:fmtUsd(m.futuresPnl,2), className:m.futuresPnl>=0?'positive':'negative', hint:'USD' },
    { label:'Win Rate',  value:fmtPct(m.winRate,0),    className:m.winRate>=50?'positive':'negative',   hint:`${m.wins}/${state.futures.length} wins` },
    { label:'Trades',   value:String(state.futures.length), hint:'total' }
  ]);
  const sorted = state.futures.slice().sort((a,b) => sortByDateDesc(b,a,'dateClose')).reverse();
  const cum = []; let acc = 0;
  sorted.forEach((x,i) => { acc += Number(x.pnlUsdt||0); cum.push({x:i+1,y:acc,label:`${i+1}`}); });
  drawLineChart('futuresChart', cum.length ? cum : [{x:0,y:0,label:'0'}], { pillText:fmtUsd(acc,0), currency:true });
  renderRecent('futuresList', state.futures.slice().sort((a,b) => sortByDateDesc(a,b,'dateClose')).slice(0,15).map(x => ({
    kind:'futures', badge:'FUT',
    title: new Date(x.dateClose).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),
    subtitle: `${x.side} · ${x.leverage||''} · ${x.mode}${x.mistakeTag?' · '+x.mistakeTag:''}`,
    value: fmtUsd(x.pnlUsdt,2),
    subValue: x.roi!=null ? fmtPct(x.roi,2) : '',
    className: x.pnlUsdt>=0?'positive':'negative'
  })));
}

// ── More Screen ───────────────────────────
function renderMore(m) {
  const thbPrice = m.price * m.usdthb;
  setText('liveBtcPrice', fmtUsd(m.price, 0));
  setText('liveBtcThb',   fmtThb(thbPrice, 0));
  setText('priceUpdatedAt', state.settings.priceUpdatedAt
    ? `Updated ${new Date(state.settings.priceUpdatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`
    : 'Using saved price');

  const refreshBtn = document.getElementById('refreshPriceBtn');
  if (refreshBtn && !refreshBtn._bound) {
    refreshBtn._bound = true;
    refreshBtn.addEventListener('click', () => {
      refreshBtn.textContent = '↻ …';
      refreshPrice().then(() => { refreshBtn.textContent = '↻ Refresh'; });
    });
  }

  renderStats('dipStats', [
    { label:'Total BTC', value:fmtNum(m.dipBtc,4), hint:'BTC' },
    { label:'Capital',   value:fmtUsd(state.dip.reduce((s,x)=>s+Math.abs(Number(x.usdtAmount||0)),0),0), hint:'USD' },
    { label:'Entries',   value:String(state.dip.length), hint:'count' }
  ]);
  renderRecent('dipList', state.dip.slice().sort((a,b)=>sortByDateDesc(a,b)).slice(0,10).map(x => ({
    kind:'dip', badge:'DIP',
    title: new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),
    subtitle: x.note||x.source,
    value: `${x.btcQty>=0?'+':''}${fmtNum(x.btcQty,4)} BTC`,
    subValue: fmtUsd(x.price,0), className: x.btcQty>=0?'positive':''
  })));
  renderStats('gridStats', [
    { label:'Profit',  value:fmtUsd(m.gridPnl,2), className:m.gridPnl>=0?'positive':'negative', hint:'USD' },
    { label:'Capital', value:fmtUsd(state.grid.reduce((s,x)=>s+Math.abs(Number(x.capitalUsdt||0)),0),0), hint:'USD' },
    { label:'Runs',    value:String(state.grid.length), hint:'bots' }
  ]);
  renderRecent('gridList', state.grid.slice().sort((a,b)=>sortByDateDesc(a,b,'dateEnd')).slice(0,8).map(x => ({
    kind:'grid', badge:'GRD',
    title: new Date(x.dateEnd).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),
    subtitle: `${x.gridType} · ${x.mode}`,
    value: fmtUsd(x.netProfitUsdt,2),
    subValue: fmtPct(x.roi,2), className: x.netProfitUsdt>=0?'positive':'negative'
  })));
}

// ── Triggers Screen ───────────────────────
function renderTriggers(m) {
  const refPrice = m.price || state.settings.currentPrice || 0;
  const usdthb   = m.usdthb;
  setText('triggerRefPrice', fmtUsd(refPrice, 0));

  const listEl = document.getElementById('triggersList');
  if (!listEl) return;

  if (!state.triggers || state.triggers.length === 0) {
    listEl.innerHTML = '<p class="subtle">No triggers configured.</p>';
    return;
  }

  listEl.innerHTML = state.triggers.map(t => {
    const isPanic   = t.fundSource === 'Panic';
    const isFired   = refPrice > 0 && refPrice <= t.buyPrice * 1.02;
    const badgeCls  = isPanic ? 'l3' : '';
    return `
    <div class="trigger-row">
      <div class="trigger-level">
        <span class="trigger-badge ${badgeCls}">${t.level} · ${t.fundSource}</span>
        <span class="trigger-note">${t.notes}</span>
      </div>
      <div class="trigger-stat">
        <div class="trigger-stat-label">Buy Price</div>
        <div class="trigger-stat-value ${isFired?'positive':''}">${fmtUsd(t.buyPrice,0)}</div>
      </div>
      <div class="trigger-stat">
        <div class="trigger-stat-label">Drop</div>
        <div class="trigger-stat-value negative">${(t.drop*100).toFixed(0)}%</div>
      </div>
      <div class="trigger-stat">
        <div class="trigger-stat-label">Deploy (THB)</div>
        <div class="trigger-stat-value">${fmtThb(t.thbUse,0)}</div>
      </div>
      <div class="trigger-stat">
        <div class="trigger-stat-label">Est. BTC</div>
        <div class="trigger-stat-value positive">${fmtNum(t.btcEst||0,4)}</div>
      </div>
    </div>`;
  }).join('');

  // Avg cost vs market
  const avgVsEl = document.getElementById('avgVsMarket');
  if (avgVsEl && refPrice > 0 && m.avgCost > 0) {
    const diff    = refPrice - m.avgCost;
    const diffPct = (diff / m.avgCost) * 100;
    const isUp    = diff >= 0;
    avgVsEl.innerHTML = `
      <div class="avg-vs-col">
        <div class="label">Your Avg Cost</div>
        <div class="val">${fmtUsd(m.avgCost, 0)}</div>
      </div>
      <div class="avg-vs-divider">
        <span class="avg-vs-diff ${isUp?'positive':'negative'}">${isUp?'+':''}${fmtPct(diffPct,1)}</span>
        <span style="font-size:11px;color:var(--muted)">vs market</span>
      </div>
      <div class="avg-vs-col">
        <div class="label">Market Price</div>
        <div class="val">${fmtUsd(refPrice, 0)}</div>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
