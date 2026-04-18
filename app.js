const STORAGE_KEY = 'btc-stacking-v2';

const state = {
  settings: {
    currentPrice: 71000,
    usdthb: 32.86,
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
  state.dca = remote.dca || [];
  state.dip = remote.dip || [];
  state.futures = remote.futures || [];
  state.grid = remote.grid || [];
  state.triggers = remote.triggers || [];

  hydrateLocal();
  setupTheme();
  setupNav();
  setupDialogs();
  render();
  refreshPrice();
}

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

function fmtNum(v, d = 4) { return Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtUsd(v, d = 0) {
  const sign = Number(v) < 0 ? '-' : '';
  return `${sign}$${Math.abs(Number(v || 0)).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
function fmtPct(v, d = 2) { return `${Number(v || 0).toFixed(d)}%`; }
function fmtYears(v) { return `${Number(v).toFixed(1)} years`; }
function todayStr() { return new Date().toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }); }
function asDate(v) { return new Date(v); }
function sortByDateDesc(a,b,key='date'){ return asDate(b[key]) - asDate(a[key]); }

function applyTheme() {
  document.getElementById('app').classList.toggle('theme-dark', state.settings.theme === 'dark');
}

function setupTheme() {
  applyTheme();
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    persist();
    applyTheme();
  });
}

function setupNav() {
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });
}

function switchScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screen));
  document.getElementById('pageTitle').textContent = screen === 'home' ? 'Home' : screen === 'dca' ? 'BTC Stacking' : screen === 'futures' ? 'Futures' : 'More';
}

function setupDialogs() {
  const goalDialog = document.getElementById('goalDialog');
  document.getElementById('editGoalBtn').addEventListener('click', () => {
    document.getElementById('goalInput').value = state.settings.goalBtc;
    goalDialog.showModal();
  });
  document.getElementById('saveGoalBtn').addEventListener('click', () => {
    state.settings.goalBtc = Math.max(0.001, Number(document.getElementById('goalInput').value || 1));
    persist();
    goalDialog.close();
    render();
  });

  const projectionDialog = document.getElementById('projectionDialog');
  const projectionForm = document.getElementById('projectionForm');
  document.getElementById('editProjectionBtn').addEventListener('click', () => {
    projectionForm.currentAge.value = state.settings.currentAge;
    projectionForm.targetAge.value = state.settings.targetAge;
    projectionForm.currentDcaBtc.value = computeMetrics().dcaBtc.toFixed(4);
    projectionForm.monthlyDcaUsd.value = state.settings.monthlyDcaUsd;
    projectionForm.annualGrowthRate.value = state.settings.annualGrowthRate;
    projectionDialog.showModal();
  });
  document.getElementById('closeProjectionBtn').addEventListener('click', () => projectionDialog.close());
  document.getElementById('cancelProjectionBtn').addEventListener('click', () => projectionDialog.close());
  projectionForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(projectionForm);
    state.settings.currentAge = Number(f.get('currentAge') || 29);
    state.settings.targetAge = Number(f.get('targetAge') || 40);
    state.settings.monthlyDcaUsd = Number(f.get('monthlyDcaUsd') || 300);
    state.settings.annualGrowthRate = Number(f.get('annualGrowthRate') || 10);
    const manualCurrent = Number(f.get('currentDcaBtc') || 0);
    if (manualCurrent > 0) state.settings.manualCurrentDcaBtc = manualCurrent;
    persist();
    projectionDialog.close();
    render();
  });

  setupEntryDialog();
}

function setupEntryDialog() {
  const dialog = document.getElementById('entryDialog');
  const form = document.getElementById('entryForm');
  const addBtn = document.getElementById('addBtn');
  const close = () => dialog.close();
  addBtn.addEventListener('click', () => {
    form.reset();
    const today = new Date().toISOString().slice(0,10);
    ['date','dateOpen','dateClose','dateStart','dateEnd'].forEach(name => { if (form[name]) form[name].value = today; });
    setEntryMode('DCA');
    dialog.showModal();
  });
  document.getElementById('closeEntryBtn').addEventListener('click', close);
  document.getElementById('cancelEntryBtn').addEventListener('click', close);
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn => btn.addEventListener('click', () => setEntryMode(btn.dataset.value)));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const mode = document.querySelector('#entryStrategySeg .seg-btn.active').dataset.value;
    const f = new FormData(form);
    if (mode === 'Futures') {
      state.futures.unshift({
        dateOpen: f.get('dateOpen'), dateClose: f.get('dateClose'), side: f.get('side'), leverage: f.get('leverage'),
        mode: f.get('mode'), entryPrice: Number(f.get('entryPrice')||0), exitPrice: Number(f.get('exitPrice')||0),
        sizeBtc: Number(f.get('sizeBtc')||0), pnlUsdt: Number(f.get('pnlUsdt')||0), notes: f.get('notes')
      });
    } else if (mode === 'Grid Bot') {
      state.grid.unshift({
        dateStart: f.get('dateStart'), dateEnd: f.get('dateEnd'), gridType: f.get('gridType'), mode: f.get('gridMode'),
        capitalUsdt: Number(f.get('capitalUsdt')||0), netProfitUsdt: Number(f.get('netProfitUsdt')||0), roi: Number(f.get('roi')||0), note: f.get('gridNote')
      });
    } else {
      const targetArray = mode === 'Dip Reserve' ? state.dip : state.dca;
      targetArray.unshift({
        date: f.get('date'), type: f.get('type'), source: f.get('source'), btcQty: Number(f.get('btcQty')||0),
        usdtAmount: Number(f.get('usdtAmount')||0), price: Number(f.get('price')||0), note: f.get('note'),
        location: f.get('location'), strategy: mode
      });
    }
    persist();
    close();
    render();
  });
}

function setEntryMode(mode) {
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.value === mode));
  document.getElementById('spotFields').classList.toggle('hidden', mode === 'Futures' || mode === 'Grid Bot');
  document.getElementById('futuresFields').classList.toggle('hidden', mode !== 'Futures');
  document.getElementById('gridFields').classList.toggle('hidden', mode !== 'Grid Bot');
}

async function refreshPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await res.json();
    if (data?.bitcoin?.usd) {
      state.settings.currentPrice = Number(data.bitcoin.usd);
      state.settings.priceUpdatedAt = new Date().toISOString();
      persist();
      render();
    }
  } catch {}
}

function computeMetrics() {
  const price = Number(state.settings.currentPrice || 0);
  const dcaBtc = state.dca.reduce((s, x) => s + Number(x.btcQty || 0), 0);
  const dipBtc = state.dip.reduce((s, x) => s + Number(x.btcQty || 0), 0);
  const totalBtc = dcaBtc + dipBtc;
  const dcaInvested = state.dca.reduce((s, x) => s + Math.abs(Number(x.usdtAmount || 0)), 0);
  const dipInvested = state.dip.reduce((s, x) => s + Math.abs(Number(x.usdtAmount || 0)), 0);
  const totalInvested = dcaInvested + dipInvested;
  const avgCost = totalBtc > 0 ? totalInvested / totalBtc : 0;
  const futuresPnl = state.futures.reduce((s, x) => s + Number(x.pnlUsdt || 0), 0);
  const gridPnl = state.grid.reduce((s, x) => s + Number(x.netProfitUsdt || 0), 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthDca = state.dca.filter(x => String(x.date).slice(0,7) === currentMonth);
  const monthEntries = monthDca.length;
  const monthBtc = monthDca.reduce((s, x) => s + Number(x.btcQty || 0), 0);
  const monthInvested = monthDca.reduce((s, x) => s + Math.abs(Number(x.usdtAmount || 0)), 0);
  const futuresToBtc = price > 0 ? futuresPnl / price : 0;
  const gridToBtc = price > 0 ? gridPnl / price : 0;
  return { price, dcaBtc, dipBtc, totalBtc, dcaInvested, totalInvested, avgCost, futuresPnl, gridPnl, monthEntries, monthBtc, monthInvested, futuresToBtc, gridToBtc, totalConverted: futuresToBtc + gridToBtc };
}

function estimateDcaProjection() {
  const m = computeMetrics();
  const currentBtc = Number(state.settings.manualCurrentDcaBtc || m.dcaBtc);
  const targetBTC = Number(state.settings.goalBtc || 1);
  const currentAge = Number(state.settings.currentAge || 29);
  const targetAge = Number(state.settings.targetAge || 40);
  const monthlyDcaUsd = Number(state.settings.monthlyDcaUsd || 300);
  const annualGrowthRate = Number(state.settings.annualGrowthRate || 0) / 100;
  const currentPrice = Number(state.settings.currentPrice || 0);
  const monthsLeft = Math.max(0, Math.round((targetAge - currentAge) * 12));
  const monthlyGrowthRate = Math.pow(1 + annualGrowthRate, 1 / 12) - 1;
  let btc = currentBtc;
  let price = currentPrice;
  const path = [{ month: 0, age: currentAge, btc }];
  for (let i = 1; i <= monthsLeft; i++) {
    btc += monthlyDcaUsd / price;
    price *= (1 + monthlyGrowthRate);
    path.push({ month: i, age: currentAge + (i / 12), btc });
  }
  const estimatedBTCAtTargetAge = btc;
  const shortfall = Math.max(0, targetBTC - estimatedBTCAtTargetAge);
  let btc2 = currentBtc;
  let price2 = currentPrice;
  let months = 0;
  while (btc2 < targetBTC && months < 1200) {
    btc2 += monthlyDcaUsd / price2;
    price2 *= (1 + monthlyGrowthRate);
    months++;
  }
  const reachAge = currentAge + months / 12;

  const requiredDca = solveRequiredDca({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, annualGrowthRate });

  const suggestions = [100, 300, 0].map((extra, idx) => {
    const growthAdj = idx === 2 ? 0.15 : annualGrowthRate;
    const monthly = monthlyDcaUsd + extra;
    const scenario = estimateWithInputs({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, monthlyDcaUsd: monthly, annualGrowthRate: growthAdj });
    return {
      title: idx === 2 ? 'Increase growth to 15%' : `Add $${extra}/month`,
      body: idx === 2 ? `Reach at age ${scenario.reachAge.toFixed(1)}` : `Reach at age ${scenario.reachAge.toFixed(1)}`,
      sub: idx === 2 ? `${Math.max(0, scenario.reachAge - currentAge).toFixed(1)} years later` : scenario.onTrack ? 'On target' : `${Math.max(0, scenario.reachAge - targetAge).toFixed(1)} years late`
    };
  });

  return {
    currentBtc, targetBTC, currentAge, targetAge, currentPrice, monthlyDcaUsd, annualGrowthRate,
    monthsLeft, estimatedBTCAtTargetAge, shortfall, reachAge, lateYears: Math.max(0, reachAge - targetAge), requiredDca, path, suggestions,
    onTrack: estimatedBTCAtTargetAge >= targetBTC
  };
}

function estimateWithInputs({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, monthlyDcaUsd, annualGrowthRate }) {
  const monthsLeft = Math.max(0, Math.round((targetAge - currentAge) * 12));
  const monthlyGrowthRate = Math.pow(1 + annualGrowthRate, 1 / 12) - 1;
  let btc = currentBtc;
  let price = currentPrice;
  for (let i = 1; i <= monthsLeft; i++) {
    btc += monthlyDcaUsd / price;
    price *= (1 + monthlyGrowthRate);
  }
  let btc2 = currentBtc;
  let price2 = currentPrice;
  let months = 0;
  while (btc2 < targetBTC && months < 1200) {
    btc2 += monthlyDcaUsd / price2;
    price2 *= (1 + monthlyGrowthRate);
    months++;
  }
  return { projectedBtc: btc, reachAge: currentAge + months / 12, onTrack: btc >= targetBTC };
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

function renderStats(elId, items) {
  document.getElementById(elId).innerHTML = items.map(item => `
    <div class="stat-card">
      <p class="meta-label">${item.label}</p>
      <span class="stat-value ${item.className || ''}">${item.value}</span>
      <span class="stat-hint">${item.hint || ''}</span>
    </div>
  `).join('');
}

function renderRecent(elId, rows) {
  document.getElementById(elId).innerHTML = rows.map(row => `
    <div class="list-row">
      <div class="row-left">
        <div class="badge ${row.kind || ''}">${row.badge || (row.kind || '•').slice(0,3).toUpperCase()}</div>
        <div>
          <p class="row-title">${row.title}</p>
          <p class="row-sub">${row.subtitle}</p>
        </div>
      </div>
      <div class="row-value">
        <strong class="${row.className || ''}">${row.value}</strong>
        <span>${row.subValue || ''}</span>
      </div>
    </div>
  `).join('');
}

function drawLineChart(svgId, points, opts = {}) {
  const svg = document.getElementById(svgId);
  const W = 320, H = 180, P = { l: 28, r: 14, t: 14, b: 22 };
  const maxX = Math.max(...points.map(p => p.x), 1);
  const maxY = Math.max(opts.goal || 0, ...points.map(p => p.y), 1);
  const minY = 0;
  const x = v => P.l + (v / maxX) * (W - P.l - P.r);
  const y = v => H - P.b - ((v - minY) / (maxY - minY)) * (H - P.t - P.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${x(p.x).toFixed(2)} ${y(p.y).toFixed(2)}`).join(' ');
  const area = `M ${x(points[0].x)} ${H-P.b} ` + points.map(p => `L ${x(p.x).toFixed(2)} ${y(p.y).toFixed(2)}`).join(' ') + ` L ${x(points.at(-1).x)} ${H-P.b} Z`;
  const goalLine = opts.goal ? `<line class="goal-line" x1="${P.l}" y1="${y(opts.goal)}" x2="${W-P.r}" y2="${y(opts.goal)}"></line>` : '';
  const xticks = points.filter((_,i)=> i===0 || i===points.length-1 || i===Math.floor(points.length/2)).map(p => `<text x="${x(p.x)}" y="${H-6}" text-anchor="middle">${p.label}</text>`).join('');
  const endX = x(points.at(-1).x), endY = y(points.at(-1).y);
  const pillText = opts.pillText || `${points.at(-1).y.toFixed(3)} BTC`;
  svg.innerHTML = `
    <line class="axis" x1="${P.l}" y1="${H-P.b}" x2="${W-P.r}" y2="${H-P.b}"></line>
    ${goalLine}
    <path class="data-area" d="${area}"></path>
    <path class="data-line" d="${line}"></path>
    <circle class="end-dot" cx="${endX}" cy="${endY}" r="3.5"></circle>
    <rect class="label-pill" x="${Math.max(P.l, endX-6)}" y="${Math.max(P.t, endY-16)}" rx="10" ry="10" width="62" height="20"></rect>
    <text class="label-text" x="${Math.max(P.l+8, endX+2)}" y="${Math.max(P.t+13, endY-3)}">${pillText}</text>
    ${xticks}
  `;
}

function render() {
  document.getElementById('headerDate').textContent = todayStr();
  const m = computeMetrics();
  const p = estimateDcaProjection();

  document.getElementById('heroBtc').textContent = fmtNum(m.totalBtc, 4);
  document.getElementById('heroGoal').textContent = fmtNum(state.settings.goalBtc, 4);
  const goalPct = Math.min(100, (m.totalBtc / state.settings.goalBtc) * 100);
  document.getElementById('goalProgressFill').style.width = `${goalPct}%`;
  document.getElementById('goalPercent').textContent = fmtPct(goalPct, 2);
  document.getElementById('remainingBtc').textContent = `${fmtNum(Math.max(0, state.settings.goalBtc - m.totalBtc), 4)} BTC`;
  document.getElementById('goalStatus').textContent = m.totalBtc >= state.settings.goalBtc ? 'Reached' : m.totalBtc >= state.settings.goalBtc * 0.5 ? 'On track' : 'Starting';

  renderStats('homeStats', [
    { label: 'Avg Cost', value: fmtUsd(m.avgCost, 0), hint: 'per BTC' },
    { label: 'Capital Deployed', value: fmtUsd(m.totalInvested, 0), hint: 'USD' },
    { label: 'BTC Stacked', value: fmtNum(m.totalBtc, 4), hint: 'BTC' }
  ]);

  document.getElementById('futuresCash').textContent = fmtUsd(m.futuresPnl, 2);
  document.getElementById('futuresCash').className = m.futuresPnl >= 0 ? 'positive' : 'negative';
  document.getElementById('gridCash').textContent = fmtUsd(m.gridPnl, 2);
  document.getElementById('gridCash').className = m.gridPnl >= 0 ? 'positive' : 'negative';
  document.getElementById('futuresToBtc').textContent = `${m.futuresToBtc >=0 ? '+' : ''}${fmtNum(m.futuresToBtc, 4)} BTC`;
  document.getElementById('futuresToBtc').className = m.futuresToBtc >= 0 ? 'positive' : 'negative';
  document.getElementById('gridToBtc').textContent = `${m.gridToBtc >=0 ? '+' : ''}${fmtNum(m.gridToBtc, 4)} BTC`;
  document.getElementById('gridToBtc').className = m.gridToBtc >= 0 ? 'positive' : 'negative';
  document.getElementById('totalConverted').textContent = `${m.totalConverted >=0 ? '+' : ''}${fmtNum(m.totalConverted, 4)} BTC`;
  document.getElementById('totalConverted').className = `big ${m.totalConverted >= 0 ? 'positive' : 'negative'}`;

  document.getElementById('monthBtc').textContent = `${m.monthBtc >=0 ? '+' : ''}${fmtNum(m.monthBtc, 4)} BTC`;
  document.getElementById('monthEntries').textContent = String(m.monthEntries);
  document.getElementById('monthInvested').textContent = fmtUsd(m.monthInvested, 0);

  const recentRows = [
    ...state.dca.slice(0,4).map(x => ({ kind:'dca', badge:'DCA', title: new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:`${x.type} · ${x.note || x.source}`, value:`${x.btcQty >=0 ? '+' : ''}${fmtNum(x.btcQty,4)} BTC`, subValue: fmtUsd(x.usdtAmount,2), className: x.btcQty>=0 ? 'positive':'' })),
    ...state.futures.slice(0,2).map(x => ({ kind:'futures', badge:'FUT', title: new Date(x.dateClose).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:`${x.side} · ${x.mode}`, value:fmtUsd(x.pnlUsdt,2), subValue:'Closed trade', className: x.pnlUsdt>=0 ? 'positive':'negative' }))
  ].sort((a,b)=>0).slice(0,4);
  renderRecent('recentActivity', recentRows);

  renderProjection(p);
  renderFutures(m);
  renderMore(m);
}

function renderProjection(p) {
  document.getElementById('projCurrentBtc').textContent = fmtNum(p.currentBtc, 4);
  document.getElementById('projTargetBtc').textContent = fmtNum(p.targetBTC, 4);
  document.getElementById('projTargetValue').textContent = fmtNum(p.targetBTC, 4);
  document.getElementById('projTargetAgeInline').textContent = p.targetAge;
  document.getElementById('projTimeLeft').textContent = `${p.targetAge - p.currentAge} years 0 months`;
  const pct = Math.min(100, p.currentBtc / p.targetBTC * 100);
  document.getElementById('projProgressFill').style.width = `${pct}%`;
  document.getElementById('projProgressPct').textContent = fmtPct(pct, 2);
  document.getElementById('projHeroNote').textContent = p.currentBtc < p.targetBTC * 0.1 ? 'Keep stacking. You’re early.' : 'Stay consistent. You are building your stack.';
  document.getElementById('projSummaryAge').textContent = p.targetAge;
  document.getElementById('projAtTargetAge').textContent = fmtNum(p.estimatedBTCAtTargetAge, 3);
  const chip = document.getElementById('projGapChip');
  chip.textContent = p.onTrack ? 'On target' : `${fmtNum(p.shortfall, 3)} BTC short`;
  chip.className = `status-chip ${p.onTrack ? '' : 'negative'}`;
  document.getElementById('projReachAge').textContent = `Age ${p.reachAge.toFixed(1)}`;
  document.getElementById('projLateYears').textContent = p.lateYears > 0 ? `${p.lateYears.toFixed(1)} years` : 'On time';
  document.getElementById('projTargetAge').textContent = p.targetAge;
  document.getElementById('projRequiredDca').textContent = `${fmtUsd(p.requiredDca, 0)}/mo`;

  document.getElementById('projectionAssumptions').innerHTML = [
    ['Current Age', `${p.currentAge}`, 'years'],
    ['Target Age', `${p.targetAge}`, 'years'],
    ['Current Stack', `${fmtNum(p.currentBtc, 4)}`, 'BTC'],
    ['Monthly DCA', fmtUsd(p.monthlyDcaUsd, 0), 'per month'],
    ['BTC Price', fmtUsd(p.currentPrice, 0), 'per BTC'],
    ['Price Growth', `${state.settings.annualGrowthRate}%`, 'per year']
  ].map(([label,value,hint]) => `
    <div class="assumption-card">
      <p class="label">${label}</p>
      <p class="value">${value}</p>
      <p class="hint">${hint}</p>
    </div>
  `).join('');
  document.getElementById('projectionFootnote').textContent = `Projections use an average annual BTC price growth of ${state.settings.annualGrowthRate}%. Live BTC price updates automatically.`;

  drawLineChart('projectionChart', p.path.filter((_,i)=> i===0 || i===p.path.length-1 || i%24===0).map(pt => ({ x: pt.age - p.currentAge, y: pt.btc, label: `${Math.round(pt.age)}` })), { goal: p.targetBTC, pillText: `${fmtNum(p.estimatedBTCAtTargetAge, 3)} BTC` });
  document.getElementById('projectionCallout').innerHTML = p.onTrack ? `At age <strong>${p.targetAge}</strong>, your DCA-only path reaches <strong>${fmtNum(p.estimatedBTCAtTargetAge, 3)} BTC</strong>. You are on target.` : `At age <strong>${p.targetAge}</strong>, your DCA-only path reaches <strong>${fmtNum(p.estimatedBTCAtTargetAge, 3)} BTC</strong>. To hit <strong>1 BTC by age ${p.targetAge}</strong>, raise DCA to <strong>${fmtUsd(p.requiredDca, 0)}/month</strong>.`;
  document.getElementById('projectionSuggestions').innerHTML = p.suggestions.map(s => `
    <div class="suggestion-card">
      <strong>${s.title}</strong>
      <p>${s.body}</p>
      <p>${s.sub}</p>
    </div>
  `).join('');
  renderRecent('dcaList', state.dca.slice().sort((a,b)=>sortByDateDesc(a,b)).map(x => ({
    kind:'dca', badge:'DCA', title:new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),
    subtitle:x.note || x.source, value:`${x.btcQty >=0 ? '+' : ''}${fmtNum(x.btcQty,4)} BTC`, subValue: fmtUsd(x.price,0), className: x.btcQty>=0 ? 'positive':''
  })).slice(0,10));
}

function renderFutures(m) {
  renderStats('futuresStats', [
    { label: 'Total PnL', value: fmtUsd(m.futuresPnl, 2), className: m.futuresPnl>=0 ? 'positive':'negative', hint: 'USD' },
    { label: 'Winning Trades', value: String(state.futures.filter(x => Number(x.pnlUsdt) > 0).length), hint: 'count' },
    { label: 'Trades', value: String(state.futures.length), hint: 'total' }
  ]);
  const cum = [];
  let acc = 0;
  state.futures.slice().sort((a,b)=>sortByDateDesc(b,a,'dateClose')).reverse().forEach((x,i)=> { acc += Number(x.pnlUsdt||0); cum.push({ x:i+1, y:acc, label:`${i+1}` }); });
  drawLineChart('futuresChart', cum.length ? cum : [{x:0,y:0,label:'0'}], { pillText: fmtUsd(acc, 0), goal: 0 });
  renderRecent('futuresList', state.futures.slice().sort((a,b)=>sortByDateDesc(a,b,'dateClose')).map(x => ({ kind:'futures', badge:'FUT', title:new Date(x.dateClose).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:`${x.side} · ${x.mode}`, value:fmtUsd(x.pnlUsdt,2), subValue:x.notes || '', className: x.pnlUsdt>=0?'positive':'negative' })).slice(0,10));
}

function renderMore(m) {
  document.getElementById('liveBtcPrice').textContent = fmtUsd(m.price, 0);
  document.getElementById('priceUpdatedAt').textContent = state.settings.priceUpdatedAt ? `Updated ${new Date(state.settings.priceUpdatedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}` : 'Using saved price';
  renderStats('dipStats', [
    { label: 'Total BTC', value: fmtNum(m.dipBtc, 4), hint: 'BTC' },
    { label: 'Capital Used', value: fmtUsd(state.dip.reduce((s,x)=>s+Math.abs(Number(x.usdtAmount||0)),0),0), hint: 'USD' },
    { label: 'Entry Count', value: String(state.dip.length), hint: 'entries' }
  ]);
  renderRecent('dipList', state.dip.slice().sort((a,b)=>sortByDateDesc(a,b)).map(x => ({ kind:'dip', badge:'DIP', title:new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:x.note || x.source, value:`${x.btcQty >=0 ? '+' : ''}${fmtNum(x.btcQty,4)} BTC`, subValue:fmtUsd(x.price,0), className: x.btcQty>=0 ? 'positive':'' })).slice(0,8));
  renderStats('gridStats', [
    { label: 'Total Profit', value: fmtUsd(m.gridPnl,2), className: m.gridPnl>=0 ? 'positive':'negative', hint:'USD' },
    { label: 'Total Capital', value: fmtUsd(state.grid.reduce((s,x)=>s+Math.abs(Number(x.capitalUsdt||0)),0),0), hint:'USD' },
    { label: 'Runs', value: String(state.grid.length), hint:'bots' }
  ]);
  renderRecent('gridList', state.grid.slice().sort((a,b)=>sortByDateDesc(a,b,'dateEnd')).map(x => ({ kind:'grid', badge:'GRD', title:new Date(x.dateEnd).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:`${x.gridType} · ${x.mode}`, value:fmtUsd(x.netProfitUsdt,2), subValue:fmtPct(x.roi,2), className: x.netProfitUsdt>=0?'positive':'negative' })).slice(0,8));
}

document.addEventListener('DOMContentLoaded', init);
