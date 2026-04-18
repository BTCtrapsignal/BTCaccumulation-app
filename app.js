const STORAGE_KEY = 'btc-stacking-v5';

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
    priceUpdatedAt: null,
    stackSource: 'dca',
    manualCurrentDcaBtc: null,
    shareMode: 'progress'
  },
  dca: [],
  dip: [],
  futures: [],
  grid: [],
  triggers: []
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheEls();
  const remote = await fetch('data.json').then(r => r.json());
  Object.assign(state.settings, remote.settings || {});
  state.dca = remote.dca || [];
  state.dip = remote.dip || [];
  state.futures = remote.futures || [];
  state.grid = remote.grid || [];
  state.triggers = remote.triggers || [];
  hydrateLocal();
  wireUi();
  applyTheme();
  render();
  refreshPrice();
}

function cacheEls() {
  ['app','headerDate','pageTitle','themeToggleBtn','editGoalBtn','goalInput','saveGoalBtn','goalDialog','projectionDialog','projectionForm','editProjectionBtn','closeProjectionBtn','cancelProjectionBtn','stackSourceSelect','customStackField','entryDialog','entryForm','addBtn','closeEntryBtn','cancelEntryBtn','shareDialog','shareForm','shareModeSeg','sharePreview','shareProgressBtn','closeShareBtn'].forEach(id => els[id] = document.getElementById(id));
}

function hydrateLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.settings) Object.assign(state.settings, saved.settings);
    ['dca','dip','futures','grid'].forEach(k => { if (Array.isArray(saved[k])) state[k] = saved[k]; });
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

function wireUi() {
  els.themeToggleBtn.addEventListener('click', toggleTheme);
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.addEventListener('click', () => switchScreen(btn.dataset.screen)));

  els.editGoalBtn.addEventListener('click', () => {
    els.goalInput.value = state.settings.goalBtc;
    els.goalDialog.showModal();
  });
  els.saveGoalBtn.addEventListener('click', () => {
    state.settings.goalBtc = Math.max(0.001, Number(els.goalInput.value || 1));
    persist();
    els.goalDialog.close();
    render();
  });

  els.editProjectionBtn.addEventListener('click', openProjectionDialog);
  els.closeProjectionBtn.addEventListener('click', () => els.projectionDialog.close());
  els.cancelProjectionBtn.addEventListener('click', () => els.projectionDialog.close());
  els.stackSourceSelect.addEventListener('change', () => {
    els.customStackField.classList.toggle('hidden', els.stackSourceSelect.value !== 'custom');
  });
  els.projectionForm.addEventListener('submit', saveProjection);

  setupEntryDialog();
  setupShareDialog();
}

function setupEntryDialog() {
  const form = els.entryForm;
  els.addBtn.addEventListener('click', () => {
    form.reset();
    const today = new Date().toISOString().slice(0,10);
    ['date','dateOpen','dateClose','dateStart','dateEnd'].forEach(name => { if (form[name]) form[name].value = today; });
    setEntryMode('DCA');
    els.entryDialog.showModal();
  });
  els.closeEntryBtn.addEventListener('click', () => els.entryDialog.close());
  els.cancelEntryBtn.addEventListener('click', () => els.entryDialog.close());
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn => btn.addEventListener('click', () => setEntryMode(btn.dataset.value)));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const mode = document.querySelector('#entryStrategySeg .seg-btn.active').dataset.value;
    const f = new FormData(form);
    if (mode === 'Futures') {
      state.futures.unshift({
        dateOpen: f.get('dateOpen'), dateClose: f.get('dateClose'), side: f.get('side'), leverage: f.get('leverage'), mode: f.get('mode'),
        entryPrice: num(f.get('entryPrice')), exitPrice: num(f.get('exitPrice')), sizeBtc: num(f.get('sizeBtc')), pnlUsdt: num(f.get('pnlUsdt')), notes: f.get('notes') || ''
      });
    } else if (mode === 'Grid Bot') {
      state.grid.unshift({
        dateStart: f.get('dateStart'), dateEnd: f.get('dateEnd'), gridType: f.get('gridType'), mode: f.get('gridMode'),
        capitalUsdt: num(f.get('capitalUsdt')), netProfitUsdt: num(f.get('netProfitUsdt')), roi: num(f.get('roi')), note: f.get('gridNote') || ''
      });
    } else {
      const targetArray = mode === 'Dip Reserve' ? state.dip : state.dca;
      targetArray.unshift({
        date: f.get('date'), type: f.get('type'), source: f.get('source'), btcQty: num(f.get('btcQty')), usdtAmount: num(f.get('usdtAmount')),
        price: num(f.get('price')), note: f.get('note') || '', location: f.get('location'), strategy: mode
      });
    }
    persist();
    els.entryDialog.close();
    render();
  });
}

function setEntryMode(mode) {
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.value === mode));
  document.getElementById('spotFields').classList.toggle('hidden', mode === 'Futures' || mode === 'Grid Bot');
  document.getElementById('futuresFields').classList.toggle('hidden', mode !== 'Futures');
  document.getElementById('gridFields').classList.toggle('hidden', mode !== 'Grid Bot');
}

function setupShareDialog() {
  els.shareProgressBtn.addEventListener('click', () => {
    renderSharePreview();
    els.shareDialog.showModal();
  });
  els.closeShareBtn.addEventListener('click', () => els.shareDialog.close());
  document.querySelectorAll('#shareModeSeg .seg-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('#shareModeSeg .seg-btn').forEach(x => x.classList.toggle('active', x === btn));
    state.settings.shareMode = btn.dataset.value;
    persist();
    renderSharePreview();
  }));
  document.querySelectorAll('[data-share]').forEach(btn => btn.addEventListener('click', () => shareProgress(btn.dataset.share)));
}

function openProjectionDialog() {
  const form = els.projectionForm;
  const metrics = computeMetrics();
  form.currentAge.value = state.settings.currentAge;
  form.targetAge.value = state.settings.targetAge;
  form.stackSource.value = state.settings.stackSource || 'dca';
  form.currentDcaBtc.value = (state.settings.manualCurrentDcaBtc ?? metrics.dcaBtc).toFixed(4);
  form.monthlyDcaUsd.value = state.settings.monthlyDcaUsd;
  form.annualGrowthRate.value = state.settings.annualGrowthRate;
  els.stackSourceSelect.value = state.settings.stackSource || 'dca';
  els.customStackField.classList.toggle('hidden', els.stackSourceSelect.value !== 'custom');
  els.projectionDialog.showModal();
}

function saveProjection(e) {
  e.preventDefault();
  const f = new FormData(els.projectionForm);
  state.settings.currentAge = num(f.get('currentAge')) || 29;
  state.settings.targetAge = num(f.get('targetAge')) || 40;
  state.settings.monthlyDcaUsd = num(f.get('monthlyDcaUsd')) || 300;
  state.settings.annualGrowthRate = num(f.get('annualGrowthRate')) || 10;
  state.settings.stackSource = f.get('stackSource') || 'dca';
  if (state.settings.stackSource === 'custom') state.settings.manualCurrentDcaBtc = num(f.get('currentDcaBtc')) || 0;
  persist();
  els.projectionDialog.close();
  render();
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  persist();
  applyTheme();
  renderSharePreview();
}

function applyTheme() {
  els.app.classList.toggle('theme-dark', state.settings.theme === 'dark');
}

function switchScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screen));
  els.pageTitle.textContent = screen === 'home' ? 'Home' : screen === 'dca' ? 'BTC Stacking' : screen === 'futures' ? 'Futures' : 'More';
}

async function refreshPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await res.json();
    const usd = data?.bitcoin?.usd;
    if (usd) {
      state.settings.currentPrice = Number(usd);
      state.settings.priceUpdatedAt = new Date().toISOString();
      persist();
      render();
    }
  } catch {}
}

function computeMetrics() {
  const price = num(state.settings.currentPrice);
  const dcaBtc = state.dca.reduce((s, x) => s + num(x.btcQty), 0);
  const dipBtc = state.dip.reduce((s, x) => s + num(x.btcQty), 0);
  const totalBtc = dcaBtc + dipBtc;
  const dcaInvested = state.dca.reduce((s, x) => s + Math.max(0, num(x.usdtAmount)), 0);
  const dipInvested = state.dip.reduce((s, x) => s + Math.max(0, Math.abs(num(x.usdtAmount))), 0);
  const totalInvested = dcaInvested + dipInvested;
  const avgCost = totalBtc > 0 ? totalInvested / totalBtc : 0;
  const futuresPnl = state.futures.reduce((s, x) => s + num(x.pnlUsdt), 0);
  const gridPnl = state.grid.reduce((s, x) => s + num(x.netProfitUsdt), 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthDca = state.dca.filter(x => String(x.date).slice(0, 7) === currentMonth);
  const monthEntries = monthDca.length;
  const monthBtc = monthDca.reduce((s, x) => s + num(x.btcQty), 0);
  const monthInvested = monthDca.reduce((s, x) => s + Math.max(0, num(x.usdtAmount)), 0);
  const futuresToBtc = price > 0 ? futuresPnl / price : 0;
  const gridToBtc = price > 0 ? gridPnl / price : 0;
  return { price, dcaBtc, dipBtc, totalBtc, dcaInvested, totalInvested, avgCost, futuresPnl, gridPnl, monthEntries, monthBtc, monthInvested, futuresToBtc, gridToBtc, totalConverted: futuresToBtc + gridToBtc };
}

function estimateDcaProjection() {
  const m = computeMetrics();
  let currentBtc = m.dcaBtc;
  if (state.settings.stackSource === 'total') currentBtc = m.totalBtc;
  if (state.settings.stackSource === 'custom') currentBtc = num(state.settings.manualCurrentDcaBtc);
  const targetBTC = num(state.settings.goalBtc) || 1;
  const currentAge = num(state.settings.currentAge) || 29;
  const targetAge = num(state.settings.targetAge) || 40;
  const monthsLeft = Math.max(1, Math.round((targetAge - currentAge) * 12));
  const monthlyDcaUsd = num(state.settings.monthlyDcaUsd) || 300;
  const annualGrowthRate = num(state.settings.annualGrowthRate) / 100;
  const currentPrice = num(state.settings.currentPrice);
  const monthlyGrowthRate = Math.pow(1 + annualGrowthRate, 1 / 12) - 1;

  let price = currentPrice;
  let btc = currentBtc;
  const path = [{ age: currentAge, btc: currentBtc }];
  for (let mth = 1; mth <= monthsLeft; mth++) {
    btc += monthlyDcaUsd / Math.max(price, 1);
    price *= (1 + monthlyGrowthRate);
    path.push({ age: currentAge + mth / 12, btc });
  }
  const estimatedBTCAtTargetAge = btc;
  const shortfall = Math.max(0, targetBTC - estimatedBTCAtTargetAge);
  const onTrack = estimatedBTCAtTargetAge >= targetBTC;

  const requiredDca = solveRequiredDca({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, annualGrowthRate });
  const reachAgeResult = estimateAgeToReachTarget({ currentBtc, targetBTC, currentAge, currentPrice, monthlyDcaUsd, annualGrowthRate });

  const suggestions = [
    { key:'add100', title:'Add $100 / month', icon:'💵', tint:'green', monthlyDcaUsd: monthlyDcaUsd + 100 },
    { key:'add300', title:'Add $300 / month', icon:'💰', tint:'orange', monthlyDcaUsd: monthlyDcaUsd + 300 },
    { key:'grow15', title:'Increase growth to 15%', icon:'📈', tint:'blue', monthlyDcaUsd, annualGrowthRate: 0.15 }
  ].map(s => {
    const projected = projectByTargetAge({ currentBtc, currentAge, targetAge, targetBTC, currentPrice, monthlyDcaUsd: s.monthlyDcaUsd, annualGrowthRate: s.annualGrowthRate ?? annualGrowthRate });
    return {
      ...s,
      body: `Projected ${fmtNum(projected.estimatedBTCAtTargetAge, 3)} BTC by age ${targetAge}`,
      sub: projected.onTrack ? 'On target' : `${fmtNum(projected.shortfall, 3)} BTC short`
    };
  });

  return {
    currentBtc, targetBTC, currentAge, targetAge, monthsLeft, monthlyDcaUsd, currentPrice, annualGrowthRate: annualGrowthRate * 100,
    estimatedBTCAtTargetAge, shortfall, onTrack, requiredDca,
    reachAgeResult, path, suggestions
  };
}

function projectByTargetAge({ currentBtc, currentAge, targetAge, targetBTC, currentPrice, monthlyDcaUsd, annualGrowthRate }) {
  const monthsLeft = Math.max(1, Math.round((targetAge - currentAge) * 12));
  const monthlyGrowthRate = Math.pow(1 + annualGrowthRate, 1 / 12) - 1;
  let price = currentPrice; let btc = currentBtc;
  for (let i = 0; i < monthsLeft; i++) {
    btc += monthlyDcaUsd / Math.max(price,1);
    price *= (1 + monthlyGrowthRate);
  }
  return { estimatedBTCAtTargetAge: btc, shortfall: Math.max(0, targetBTC - btc), onTrack: btc >= targetBTC };
}

function estimateAgeToReachTarget({ currentBtc, targetBTC, currentAge, currentPrice, monthlyDcaUsd, annualGrowthRate, maxMonths = 600 }) {
  const monthlyGrowthRate = Math.pow(1 + annualGrowthRate, 1 / 12) - 1;
  let price = currentPrice; let btc = currentBtc; let months = 0;
  while (btc < targetBTC && months < maxMonths) {
    btc += monthlyDcaUsd / Math.max(price,1);
    price *= (1 + monthlyGrowthRate);
    months += 1;
  }
  return {
    reached: btc >= targetBTC,
    monthsNeeded: months,
    ageReached: btc >= targetBTC ? currentAge + months / 12 : null,
    finalBTC: btc
  };
}

function solveRequiredDca({ currentBtc, targetBTC, currentAge, targetAge, currentPrice, annualGrowthRate }) {
  let lo = 0, hi = 20000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const projected = projectByTargetAge({ currentBtc, currentAge, targetAge, targetBTC, currentPrice, monthlyDcaUsd: mid, annualGrowthRate });
    if (projected.estimatedBTCAtTargetAge >= targetBTC) hi = mid; else lo = mid;
  }
  return Math.ceil(hi);
}

function render() {
  const metrics = computeMetrics();
  const projection = estimateDcaProjection();
  els.headerDate.textContent = new Date().toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
  renderHome(metrics);
  renderProjection(projection);
  renderFutures(metrics);
  renderMore(metrics);
  renderSharePreview();
}

function renderHome(m) {
  text('heroBtc', fmtNum(m.totalBtc, 4));
  text('heroGoal', fmtNum(state.settings.goalBtc, 4));
  const goalPct = Math.min(100, (m.totalBtc / state.settings.goalBtc) * 100);
  cssWidth('goalProgressFill', `${goalPct}%`);
  text('goalPercent', fmtPct(goalPct, 2));
  text('remainingBtc', `${fmtNum(Math.max(0, state.settings.goalBtc - m.totalBtc), 4)} BTC`);
  text('goalStatus', m.totalBtc >= state.settings.goalBtc ? 'Reached' : m.totalBtc >= 0.1 ? 'On track' : 'Starting');
  renderStats('homeStats', [
    { label:'Avg Cost', value:fmtUsd(m.avgCost,0), hint:'per BTC' },
    { label:'Capital Deployed', value:fmtUsd(m.totalInvested,0), hint:'USD' },
    { label:'BTC Stacked', value:fmtNum(m.totalBtc,4), hint:'BTC' }
  ]);
  renderCashRow('futuresCash', m.futuresPnl, true);
  renderCashRow('gridCash', m.gridPnl, true);
  renderBtcRow('futuresToBtc', m.futuresToBtc);
  renderBtcRow('gridToBtc', m.gridToBtc);
  renderBtcRow('totalConverted', m.totalConverted);
  document.getElementById('totalConverted').classList.add('big');

  document.getElementById('monthGrid').innerHTML = [
    { value:`${m.monthBtc >=0?'+':''}${fmtNum(m.monthBtc,4)} BTC`, label:'BTC accumulated', cls:m.monthBtc>=0?'positive':'' },
    { value:`${m.monthEntries}`, label:'Entries' },
    { value:fmtUsd(m.monthInvested,0), label:'Capital deployed' }
  ].map(x => `
    <div class="month-stat">
      <div class="month-number ${x.cls || ''}">${x.value}</div>
      <div class="meta-label">${x.label}</div>
    </div>
  `).join('');

  const recent = [
    ...state.dca.slice().sort((a,b)=>byDateDesc(a,b,'date')).slice(0,3).map(x => rowData('dca','DCA',x.date,x.note || x.source, `${sign(num(x.btcQty))}${fmtNum(x.btcQty,4)} BTC`, fmtUsd(x.usdtAmount,2), num(x.btcQty) >= 0 ? 'positive':'')),
    ...state.futures.slice().sort((a,b)=>byDateDesc(a,b,'dateClose')).slice(0,2).map(x => rowData('futures','FUT',x.dateClose,`${x.side} · ${x.mode}`, fmtUsd(x.pnlUsdt,2), x.notes || 'Closed trade', num(x.pnlUsdt) >= 0 ? 'positive':'negative'))
  ].sort((a,b)=>b.ts-a.ts).slice(0,4);
  renderList('recentActivity', recent);
}

function renderProjection(p) {
  text('projCurrentBtc', fmtNum(p.currentBtc, 4));
  text('projTargetBtc', fmtNum(p.targetBTC, 4));
  text('projTargetValue', fmtNum(p.targetBTC, 4));
  text('projTargetAgeInline', p.targetAge);
  text('projTimeLeft', `${p.targetAge - p.currentAge} years 0 months (${p.monthsLeft} months)`);
  const pct = Math.min(100, (p.currentBtc / p.targetBTC) * 100);
  cssWidth('projProgressFill', `${pct}%`);
  text('projProgressPct', fmtPct(pct, 2));
  text('projHeroNote', p.currentBtc < p.targetBTC * 0.1 ? 'Keep stacking. You’re early.' : 'Stay consistent. Your stack is compounding.');
  text('projSummaryAge', p.targetAge);
  text('projAtTargetAge', fmtNum(p.estimatedBTCAtTargetAge, 3));
  document.getElementById('projGapSentence').textContent = p.onTrack ? `You stay on track for ${fmtNum(p.targetBTC, 4)} BTC by age ${p.targetAge}.` : `You’d still be short by ${fmtNum(p.shortfall, 3)} BTC at age ${p.targetAge}.`;
  document.getElementById('projGapSentence').classList.toggle('negative', !p.onTrack);

  const reachValue = p.reachAgeResult.reached && p.reachAgeResult.ageReached < 100 ? `Age ${p.reachAgeResult.ageReached.toFixed(1)}` : 'Beyond 100+';
  const gapValue = p.onTrack ? 'On target' : `${fmtNum(p.shortfall, 3)} BTC`;
  const cards = [
    { icon:'⏱', tint:'blue', title:'Reach age', value: reachValue, sub:'At current pace' },
    { icon:'⚑', tint:'orange', title:'Gap to goal', value: gapValue, sub: p.onTrack ? 'By your target age' : `By age ${p.targetAge}` },
    { icon:'↗', tint:'green', title:'Need / mo', value: `${fmtUsd(p.requiredDca,0)}`, sub:`To hit age ${p.targetAge}` }
  ];
  document.getElementById('projectionMiniCards').innerHTML = cards.map(c => `
    <div class="mini-card">
      <div class="mini-top">
        <div class="mini-icon ${c.tint}">${c.icon}</div>
        <div class="mini-title">${c.title}</div>
      </div>
      <div class="mini-value">${c.value}</div>
      <div class="mini-sub">${c.sub}</div>
    </div>
  `).join('');

  const assumptions = [
    ['👤','green','Current Age', `${p.currentAge}`, 'years'],
    ['⚑','green','Target Age', `${p.targetAge}`, 'years'],
    ['₿','orange','Current DCA', `${fmtNum(p.currentBtc,4)}`, 'BTC'],
    ['$','orange','Monthly DCA', `${fmtUsd(p.monthlyDcaUsd,0)}`, 'per month'],
    ['↗','blue','BTC Price', `${fmtUsd(p.currentPrice,0)}`, 'per BTC'],
    ['⌁','purple','Price Growth', `${p.annualGrowthRate}%`, 'per year']
  ];
  document.getElementById('projectionAssumptions').innerHTML = assumptions.map(([icon,tint,label,value,hint]) => `
    <div class="assumption-card">
      <div class="icon-wrap mini-icon ${tint}">${icon}</div>
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="hint">${hint}</div>
    </div>
  `).join('');
  document.getElementById('projectionFootnote').textContent = `Projections use an average annual BTC price growth of ${p.annualGrowthRate}%. Live BTC price updates automatically.`;

  const chartPoints = makeProjectionSeries(p.path, p.currentAge, p.targetAge);
  drawProjectionChart('projectionChart', chartPoints, p.targetBTC, p.currentAge, p.targetAge, p.estimatedBTCAtTargetAge);
  document.getElementById('projectionCallout').innerHTML = p.onTrack
    ? `At age <strong>${p.targetAge}</strong>, your DCA-only path reaches <strong>${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC</strong>. You stay on track for your goal.`
    : `At age <strong>${p.targetAge}</strong>, your DCA-only path reaches <strong>${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC</strong>. To hit <strong>${fmtNum(p.targetBTC,4)} BTC</strong>, raise DCA to <strong>${fmtUsd(p.requiredDca,0)}/month</strong>.`;

  document.getElementById('projectionSuggestions').innerHTML = p.suggestions.map(s => `
    <div class="close-gap-card">
      <div class="close-gap-head">
        <div class="mini-icon ${s.tint}">${s.icon}</div>
        <div class="title">${s.title}</div>
      </div>
      <div class="body">${s.body}</div>
      <div class="sub">${s.sub}</div>
    </div>
  `).join('');

  renderList('dcaList', state.dca.slice().sort((a,b)=>byDateDesc(a,b,'date')).map(x => rowData('dca','DCA',x.date,x.note || x.source, `${sign(num(x.btcQty))}${fmtNum(x.btcQty,4)} BTC`, fmtUsd(x.price,0), num(x.btcQty)>=0?'positive':'')));
}

function renderFutures(m) {
  renderStats('futuresStats', [
    { label:'Total PnL', value:fmtUsd(m.futuresPnl,2), hint:'USD', className:m.futuresPnl>=0?'positive':'negative' },
    { label:'Winning Trades', value:String(state.futures.filter(x => num(x.pnlUsdt) > 0).length), hint:'count' },
    { label:'Trades', value:String(state.futures.length), hint:'total' }
  ]);
  drawFuturesChart('futuresChart', state.futures.slice().sort((a,b)=>byDateAsc(a,b,'dateClose')).map(x => num(x.pnlUsdt)));
  renderList('futuresList', state.futures.slice().sort((a,b)=>byDateDesc(a,b,'dateClose')).map(x => rowData('futures','FUT',x.dateClose,`${x.side} · ${x.mode}`, fmtUsd(x.pnlUsdt,2), x.notes || '', num(x.pnlUsdt)>=0?'positive':'negative')));
}

function renderMore(m) {
  text('liveBtcPrice', fmtUsd(m.price,0));
  text('priceUpdatedAt', state.settings.priceUpdatedAt ? `Updated ${new Date(state.settings.priceUpdatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'Using saved price');
  renderStats('dipStats', [
    { label:'Total BTC', value:fmtNum(m.dipBtc,4), hint:'BTC' },
    { label:'Capital Used', value:fmtUsd(state.dip.reduce((s,x)=>s+Math.max(0,Math.abs(num(x.usdtAmount))),0),0), hint:'USD' },
    { label:'Entry Count', value:String(state.dip.length), hint:'entries' }
  ]);
  renderList('dipList', state.dip.slice().sort((a,b)=>byDateDesc(a,b,'date')).map(x => rowData('dip','DIP',x.date,x.note || x.source, `${sign(num(x.btcQty))}${fmtNum(x.btcQty,4)} BTC`, fmtUsd(x.price,0), num(x.btcQty)>=0?'positive':'')));
  renderStats('gridStats', [
    { label:'Total Profit', value:fmtUsd(m.gridPnl,2), hint:'USD', className:m.gridPnl>=0?'positive':'negative' },
    { label:'Total Capital', value:fmtUsd(state.grid.reduce((s,x)=>s+Math.abs(num(x.capitalUsdt)),0),0), hint:'USD' },
    { label:'Runs', value:String(state.grid.length), hint:'bots' }
  ]);
  renderList('gridList', state.grid.slice().sort((a,b)=>byDateDesc(a,b,'dateEnd')).map(x => rowData('grid','GRD',x.dateEnd,`${x.gridType} · ${x.mode}`, fmtUsd(x.netProfitUsdt,2), fmtPct(x.roi,2), num(x.netProfitUsdt)>=0?'positive':'negative')));
}

function renderStats(id, items) {
  document.getElementById(id).innerHTML = items.map(item => `
    <div class="stat-card">
      <div class="label">${item.label}</div>
      <div class="value ${item.className || ''}">${item.value}</div>
      <div class="hint">${item.hint || ''}</div>
    </div>
  `).join('');
}

function renderList(id, rows) {
  document.getElementById(id).innerHTML = rows.slice(0,10).map(r => `
    <div class="list-row">
      <div class="badge ${r.kind}">${r.badge}</div>
      <div>
        <div class="row-title">${r.title}</div>
        <div class="row-sub">${r.subtitle}</div>
      </div>
      <div class="row-value">
        <strong class="${r.className || ''}">${r.value}</strong>
        <span>${r.subValue}</span>
      </div>
    </div>
  `).join('');
}

function drawProjectionChart(id, series, goal, currentAge, targetAge, endValue) {
  const svg = document.getElementById(id);
  const W = 320, H = 190, L = 44, R = 8, T = 12, B = 30;
  const innerW = W - L - R, innerH = H - T - B;
  const maxY = Math.max(goal * 1.2, endValue * 1.2, 0.5);
  const xFor = age => L + ((age - currentAge) / (targetAge - currentAge || 1)) * innerW;
  const yFor = v => T + innerH - (v / maxY) * innerH;
  const path = series.map((p, i) => `${i ? 'L' : 'M'} ${xFor(p.age).toFixed(1)} ${yFor(p.btc).toFixed(1)}`).join(' ');
  const area = `${path} L ${xFor(targetAge)} ${T+innerH} L ${xFor(currentAge)} ${T+innerH} Z`;
  const yTicks = [0, maxY/3, (maxY/3)*2, maxY].map(v => Math.round(v*10)/10);
  const xTicks = [currentAge, currentAge+Math.round((targetAge-currentAge)/2), targetAge];
  svg.innerHTML = `
    ${yTicks.map(v => `<line class="grid-line" x1="${L}" y1="${yFor(v)}" x2="${W-R}" y2="${yFor(v)}"></line><text class="tick-label" x="6" y="${yFor(v)+4}">${v.toFixed(1)} BTC</text>`).join('')}
    <line class="goal-line" x1="${L}" y1="${yFor(goal)}" x2="${W-R}" y2="${yFor(goal)}"></line>
    <path class="path-area" d="${area}"></path>
    <path class="path-line" d="${path}"></path>
    ${xTicks.map(v => `<text class="tick-label" x="${xFor(v)}" y="${H-8}" text-anchor="middle">${Math.round(v)}</text>`).join('')}
    <rect class="path-pill" x="${Math.max(L, xFor(targetAge)-56)}" y="${Math.max(T, yFor(endValue)-16)}" rx="10" ry="10" width="58" height="22"></rect>
    <text class="path-pill-text" x="${Math.max(L, xFor(targetAge)-27)}" y="${Math.max(T, yFor(endValue)-1)}" text-anchor="middle">${fmtNum(endValue,3)}</text>
  `;
}

function drawFuturesChart(id, pnlSeries) {
  const svg = document.getElementById(id);
  const W = 320, H = 190, L = 40, R = 8, T = 12, B = 24;
  const innerW = W - L - R, innerH = H - T - B;
  let acc = 0;
  const cumulative = pnlSeries.map(v => (acc += v));
  const minY = Math.min(0, ...cumulative, -5);
  const maxY = Math.max(0, ...cumulative, 5);
  const xFor = i => L + (i / Math.max(cumulative.length - 1, 1)) * innerW;
  const yFor = v => T + innerH - ((v - minY) / (maxY - minY || 1)) * innerH;
  const yTicks = [minY, (minY+maxY)/2, maxY];
  const path = cumulative.map((v,i) => `${i ? 'L' : 'M'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ');
  svg.innerHTML = `
    ${yTicks.map(v => `<line class="grid-line" x1="${L}" y1="${yFor(v)}" x2="${W-R}" y2="${yFor(v)}"></line><text class="tick-label" x="4" y="${yFor(v)+4}">${fmtUsd(v,0)}</text>`).join('')}
    <line class="zero-line" x1="${L}" y1="${yFor(0)}" x2="${W-R}" y2="${yFor(0)}"></line>
    <path class="futures-line" d="${path}"></path>
    ${cumulative.map((v,i) => `<text class="tick-label" x="${xFor(i)}" y="${H-6}" text-anchor="middle">${i+1}</text>`).join('')}
  `;
}

function renderSharePreview() {
  const canvas = els.sharePreview;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const mode = state.settings.shareMode || 'progress';
  const m = computeMetrics();
  const p = estimateDcaProjection();
  const dark = state.settings.theme === 'dark';
  const palette = dark ? {
    bg:'#0f1218', card:'#171c25', text:'#eef2f7', muted:'#a2abbb', accent:'#e0b171', green:'#4fd180'
  } : {
    bg:'#f6f6f3', card:'#ffffff', text:'#111111', muted:'#8c8c89', accent:'#d6a05e', green:'#22a95c'
  };
  ctx.fillStyle = palette.bg; ctx.fillRect(0,0,canvas.width,canvas.height);
  roundRect(ctx, 80, 170, 920, 820, 36, palette.card, null);
  ctx.fillStyle = palette.muted; ctx.font = '500 42px Inter'; ctx.fillText('BTC Stacking', 140, 260);
  let main='', sub='';
  const pct = ((m.totalBtc / state.settings.goalBtc) * 100).toFixed(2);
  if (mode === 'full') { main = `${fmtNum(m.totalBtc,4)} BTC`; sub = `${pct}% → ${fmtNum(state.settings.goalBtc,4)} BTC`; }
  if (mode === 'progress') { main = `${pct}% to 1 BTC`; sub = 'Stacking consistently'; }
  if (mode === 'stealth') { main = 'Stacking Bitcoin quietly'; sub = 'Stay humble. Stack sats.'; }
  if (mode === 'strategy') { main = `At age ${p.targetAge}: ${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC`; sub = p.onTrack ? 'On track' : `${fmtUsd(p.requiredDca,0)}/mo to hit goal`; }
  ctx.fillStyle = palette.text; ctx.font = '800 86px Inter'; fitText(ctx, main, 140, 430, 780, 86);
  ctx.fillStyle = mode === 'strategy' ? palette.green : palette.muted; ctx.font = '600 40px Inter'; ctx.fillText(sub, 140, 520);
  // progress
  roundRect(ctx, 140, 620, 720, 22, 11, dark ? '#2a3343' : '#ebe7df');
  roundRect(ctx, 140, 620, Math.max(30, 720 * (m.totalBtc / state.settings.goalBtc)), 22, 11, palette.accent);
  ctx.fillStyle = palette.text; ctx.font = '700 44px Inter'; ctx.fillText(`${pct}%`, 890, 640);
  ctx.fillStyle = palette.muted; ctx.font = '500 34px Inter'; ctx.fillText('btcstack.app', 140, 910);
}

async function shareProgress(destination) {
  const blob = await new Promise(resolve => els.sharePreview.toBlob(resolve, 'image/png'));
  const file = new File([blob], 'btc-stacking.png', { type: 'image/png' });
  const text = getShareText();
  if (destination === 'save') return downloadBlob(blob, 'btc-stacking.png');
  if (destination === 'x') {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    return;
  }
  if (navigator.canShare && navigator.canShare({ files:[file] })) {
    const shareText = destination === 'instagram' ? 'Share to Instagram Story' : destination === 'facebook' ? 'Share to Facebook' : text;
    try { await navigator.share({ files:[file], title:'BTC Stacking', text: shareText }); } catch {}
    return;
  }
  downloadBlob(blob, 'btc-stacking.png');
}

function getShareText() {
  const m = computeMetrics();
  const pct = ((m.totalBtc / state.settings.goalBtc) * 100).toFixed(2);
  switch (state.settings.shareMode) {
    case 'full': return `I’m stacking ${fmtNum(m.totalBtc,4)} BTC. ${pct}% to 1 BTC.`;
    case 'progress': return `I’m ${pct}% on my way to 1 BTC. Stacking consistently.`;
    case 'stealth': return 'Stacking Bitcoin quietly. Stay humble. Stack sats.';
    case 'strategy': return `My DCA-only path is ${pct}% to 1 BTC.`;
    default: return 'Stacking Bitcoin.';
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function rowData(kind,badge,date,subtitle,value,subValue,className='') {
  return { kind, badge, title: new Date(date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle, value, subValue, className, ts:new Date(date).getTime() };
}
function renderCashRow(id, value) {
  const el = document.getElementById(id);
  el.textContent = fmtUsd(value,2);
  el.className = value >= 0 ? 'positive' : 'negative';
}
function renderBtcRow(id, value) {
  const el = document.getElementById(id);
  el.textContent = `${sign(value)}${fmtNum(value,4)} BTC`;
  el.className = value >= 0 ? 'positive' : 'negative';
}
function text(id, value) { document.getElementById(id).textContent = value; }
function cssWidth(id, value) { document.getElementById(id).style.width = value; }
function num(v) { return Number(v || 0); }
function sign(v) { return Number(v) >= 0 ? '+' : ''; }
function fmtNum(v, d=4) { return Number(v || 0).toLocaleString(undefined, { minimumFractionDigits:d, maximumFractionDigits:d }); }
function fmtUsd(v, d=0) { const n = Number(v||0); return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:d, maximumFractionDigits:d})}`; }
function fmtPct(v, d=2) { return `${Number(v || 0).toFixed(d)}%`; }
function byDateDesc(a,b,key){ return new Date(b[key]) - new Date(a[key]); }
function byDateAsc(a,b,key){ return new Date(a[key]) - new Date(b[key]); }
function makeProjectionSeries(path, currentAge, targetAge) {
  const ticks = [currentAge, currentAge + (targetAge-currentAge)/2, targetAge];
  const out = [];
  for (const age of ticks) {
    let nearest = path.reduce((best, p) => Math.abs(p.age - age) < Math.abs(best.age - age) ? p : best, path[0]);
    out.push(nearest);
  }
  return [path[0], ...out.slice(1,-1), path[path.length-1]];
}
function roundRect(ctx, x, y, w, h, r, fillStyle, strokeStyle) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
  if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.stroke(); }
}
function fitText(ctx, text, x, y, maxWidth, size) {
  let s = size;
  while (s > 40) {
    ctx.font = `800 ${s}px Inter`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  }
  ctx.fillText(text, x, y);
}
