const STORAGE_KEY = 'btc-stacking-v6';

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
    startingSource: 'dca',
    manualCurrentDcaBtc: null
  },
  dca: [], dip: [], futures: [], grid: [], triggers: []
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
  setupShare();
  render();
  refreshPrice();
}

function hydrateLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.settings) Object.assign(state.settings, saved.settings);
    ['dca','dip','futures','grid'].forEach(k => { if (Array.isArray(saved[k])) state[k] = saved[k]; });
  } catch {}
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: state.settings, dca: state.dca, dip: state.dip, futures: state.futures, grid: state.grid }));
}

const fmtNum = (v,d=4) => Number(v||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtUsd = (v,d=0) => `${Number(v)<0?'-':''}$${Math.abs(Number(v||0)).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}`;
const fmtPct = (v,d=2) => `${Number(v||0).toFixed(d)}%`;
const asDate = v => new Date(v);
const sortDateDesc = (a,b,key='date') => asDate(b[key]) - asDate(a[key]);
const clamp = (n,min,max) => Math.max(min, Math.min(max, n));
function formatHeaderDate(){ return new Date().toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}); }
function signBtc(v,d=4){ return `${Number(v)>=0?'+':'-'}${fmtNum(Math.abs(v),d)} BTC`; }

function setupTheme() {
  applyTheme();
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    persist(); applyTheme();
  });
}
function applyTheme(){ document.getElementById('app').classList.toggle('theme-dark', state.settings.theme === 'dark'); }

function setupNav() {
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.addEventListener('click', () => switchScreen(btn.dataset.screen)));
}
function switchScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.classList.toggle('active', btn.dataset.screen===screen));
  const titles = { home:'Home', dca:'BTC Stacking', futures:'Futures', cash:'Cash Flow' };
  document.getElementById('pageTitle').textContent = titles[screen] || 'Home';
}

function setupDialogs() {
  const goalDialog = document.getElementById('goalDialog');
  document.getElementById('editGoalBtn').addEventListener('click', () => {
    document.getElementById('goalInput').value = state.settings.goalBtc;
    goalDialog.showModal();
  });
  document.getElementById('saveGoalBtn').addEventListener('click', () => {
    state.settings.goalBtc = Math.max(0.001, Number(document.getElementById('goalInput').value || 1));
    persist(); goalDialog.close(); render();
  });

  const projectionDialog = document.getElementById('projectionDialog');
  const projectionForm = document.getElementById('projectionForm');
  const sourceSelect = document.getElementById('startingSourceSelect');
  const customWrap = document.getElementById('customCurrentWrap');
  const updateCustomVisibility = () => customWrap.classList.toggle('hidden', sourceSelect.value !== 'custom');
  sourceSelect.addEventListener('change', updateCustomVisibility);

  document.getElementById('editProjectionBtn').addEventListener('click', () => {
    const metrics = computeMetrics();
    projectionForm.currentAge.value = state.settings.currentAge;
    projectionForm.targetAge.value = state.settings.targetAge;
    projectionForm.startingSource.value = state.settings.startingSource || 'dca';
    projectionForm.currentDcaBtc.value = Number(state.settings.manualCurrentDcaBtc ?? metrics.dcaBtc).toFixed(4);
    projectionForm.monthlyDcaUsd.value = state.settings.monthlyDcaUsd;
    projectionForm.annualGrowthRate.value = state.settings.annualGrowthRate;
    updateCustomVisibility();
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
    state.settings.startingSource = f.get('startingSource') || 'dca';
    state.settings.manualCurrentDcaBtc = state.settings.startingSource === 'custom' ? Number(f.get('currentDcaBtc') || 0) : null;
    persist(); projectionDialog.close(); render();
  });

  setupEntryDialog();
}

function setupEntryDialog() {
  const dialog = document.getElementById('entryDialog');
  const form = document.getElementById('entryForm');
  document.getElementById('addBtn').addEventListener('click', () => {
    form.reset();
    const today = new Date().toISOString().slice(0,10);
    ['date','dateOpen','dateClose','dateStart','dateEnd'].forEach(name => { if (form[name]) form[name].value = today; });
    setEntryMode('DCA');
    dialog.showModal();
  });
  document.getElementById('closeEntryBtn').addEventListener('click', () => dialog.close());
  document.getElementById('cancelEntryBtn').addEventListener('click', () => dialog.close());
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn => btn.addEventListener('click', () => setEntryMode(btn.dataset.value)));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const mode = document.querySelector('#entryStrategySeg .seg-btn.active').dataset.value;
    const f = new FormData(form);
    if (mode === 'Futures') {
      state.futures.unshift({ dateOpen:f.get('dateOpen'), dateClose:f.get('dateClose'), side:f.get('side'), leverage:f.get('leverage'), mode:f.get('mode'), entryPrice:Number(f.get('entryPrice')||0), exitPrice:Number(f.get('exitPrice')||0), sizeBtc:Number(f.get('sizeBtc')||0), pnlUsdt:Number(f.get('pnlUsdt')||0), notes:f.get('notes'), strategy:'Futures' });
    } else if (mode === 'Grid Bot') {
      state.grid.unshift({ dateStart:f.get('dateStart'), dateEnd:f.get('dateEnd'), gridType:f.get('gridType'), mode:f.get('gridMode'), capitalUsdt:Number(f.get('capitalUsdt')||0), netProfitUsdt:Number(f.get('netProfitUsdt')||0), roi:Number(f.get('roi')||0), note:f.get('gridNote'), strategy:'Grid Bot' });
    } else {
      const target = mode === 'Dip Reserve' ? state.dip : state.dca;
      target.unshift({ date:f.get('date'), type:f.get('type'), source:f.get('source'), btcQty:Number(f.get('btcQty')||0), usdtAmount:Number(f.get('usdtAmount')||0), price:Number(f.get('price')||0), note:f.get('note'), location:f.get('location'), strategy:mode });
    }
    persist(); dialog.close(); render();
  });
}
function setEntryMode(mode){
  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.value === mode));
  document.getElementById('spotFields').classList.toggle('hidden', mode === 'Futures' || mode === 'Grid Bot');
  document.getElementById('futuresFields').classList.toggle('hidden', mode !== 'Futures');
  document.getElementById('gridFields').classList.toggle('hidden', mode !== 'Grid Bot');
}

function setupShare() {
  const dialog = document.getElementById('shareDialog');
  document.getElementById('shareBtn').addEventListener('click', () => { updateShareCard(); dialog.showModal(); });
  document.getElementById('closeShareBtn').addEventListener('click', () => dialog.close());
  document.querySelectorAll('#shareModeSeg .seg-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('#shareModeSeg .seg-btn').forEach(b => b.classList.toggle('active', b===btn));
    updateShareCard();
  }));
  document.getElementById('saveImageBtn').addEventListener('click', () => shareProgress('save'));
  document.getElementById('igShareBtn').addEventListener('click', () => shareProgress('ig'));
  document.getElementById('fbShareBtn').addEventListener('click', () => shareProgress('fb'));
  document.getElementById('xShareBtn').addEventListener('click', () => shareProgress('x'));
}
async function shareProgress(channel) {
  const { blob, text } = await createShareAsset();
  if (channel === 'x') {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    return;
  }
  const file = new File([blob], 'btc-stacking.png', { type: 'image/png' });
  if (channel === 'save') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'btc-stacking.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  }
  if (navigator.share && navigator.canShare?.({ files:[file] })) {
    try {
      await navigator.share({ files:[file], title:'BTC Stacking', text: channel === 'ig' ? 'Share to Instagram Story' : 'Share to Facebook' });
    } catch {}
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'btc-stacking.png'; a.click();
  }
}
async function createShareAsset() {
  const card = document.getElementById('shareCard');
  const canvas = await html2canvas(card, { backgroundColor: null, scale: 2 });
  const blob = await new Promise(resolve => canvas.toBlob(resolve));
  return { blob, text: getShareText() };
}
function getShareText() {
  const p = estimateDcaProjection();
  const mode = document.querySelector('#shareModeSeg .seg-btn.active')?.dataset.value || 'amount';
  if (mode === 'progress') return `I’m ${fmtPct((p.currentBtc/p.targetBTC)*100,2)} to 1 BTC. Stacking consistently.`;
  if (mode === 'stealth') return `Stacking Bitcoin quietly. Stay humble. Stack sats.`;
  if (mode === 'plan') return `At age ${p.targetAge}, my DCA-only path reaches ${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC.`;
  return `I’m stacking ${fmtNum(p.currentBtc,4)} BTC on my way to 1 BTC.`;
}
function updateShareCard() {
  const p = estimateDcaProjection();
  const mode = document.querySelector('#shareModeSeg .seg-btn.active')?.dataset.value || 'amount';
  let main = `${fmtNum(p.currentBtc,4)} BTC`, sub = `${fmtPct((p.currentBtc/p.targetBTC)*100,2)} → 1 BTC`;
  if (mode === 'progress') { main = `${fmtPct((p.currentBtc/p.targetBTC)*100,2)} to 1 BTC`; sub = 'Stacking consistently.'; }
  if (mode === 'stealth') { main = 'Stacking Bitcoin quietly'; sub = 'Stay humble. Stack sats.'; }
  if (mode === 'plan') { main = `${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC by age ${p.targetAge}`; sub = `DCA-only path`; }
  document.getElementById('shareCard').innerHTML = `<p class="kicker">BTC Stacking</p><p class="big">${main}</p><p class="sub">${sub}</p><p class="subtle" style="margin-top:16px">btcstack.app</p>`;
}

async function refreshPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await res.json();
    if (data?.bitcoin?.usd) {
      state.settings.currentPrice = Number(data.bitcoin.usd);
      state.settings.priceUpdatedAt = new Date().toISOString();
      persist(); render();
    }
  } catch {}
}

function computeMetrics() {
  const price = Number(state.settings.currentPrice || 0);
  const dcaBtc = state.dca.reduce((s,x)=>s+Number(x.btcQty||0),0);
  const dipBtc = state.dip.reduce((s,x)=>s+Number(x.btcQty||0),0);
  const totalBtc = dcaBtc + dipBtc;
  const dcaInvested = state.dca.reduce((s,x)=>s+Math.abs(Number(x.usdtAmount||0)),0);
  const dipInvested = state.dip.reduce((s,x)=>s+Math.abs(Number(x.usdtAmount||0)),0);
  const totalInvested = dcaInvested + dipInvested;
  const avgCost = totalBtc > 0 ? totalInvested / totalBtc : 0;
  const futuresPnl = state.futures.reduce((s,x)=>s+Number(x.pnlUsdt||0),0);
  const gridPnl = state.grid.reduce((s,x)=>s+Number(x.netProfitUsdt||0),0);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthDca = state.dca.filter(x => String(x.date).slice(0,7) === currentMonth);
  const monthEntries = monthDca.length;
  const monthBtc = monthDca.reduce((s,x)=>s+Number(x.btcQty||0),0);
  const monthInvested = monthDca.reduce((s,x)=>s+Math.abs(Number(x.usdtAmount||0)),0);
  const futuresToBtc = price > 0 ? futuresPnl / price : 0;
  const gridToBtc = price > 0 ? gridPnl / price : 0;
  return { price,dcaBtc,dipBtc,totalBtc,dcaInvested,totalInvested,avgCost,futuresPnl,gridPnl,monthEntries,monthBtc,monthInvested,futuresToBtc,gridToBtc,totalConverted:futuresToBtc+gridToBtc };
}

function estimateDcaProjection() {
  const m = computeMetrics();
  const targetBTC = Number(state.settings.goalBtc || 1);
  const currentAge = Number(state.settings.currentAge || 29);
  const targetAge = Number(state.settings.targetAge || 40);
  const monthlyDcaUsd = Number(state.settings.monthlyDcaUsd || 300);
  const annualGrowthRate = Number(state.settings.annualGrowthRate || 0) / 100;
  let currentBtc = m.dcaBtc;
  if (state.settings.startingSource === 'total') currentBtc = m.totalBtc;
  if (state.settings.startingSource === 'custom' && state.settings.manualCurrentDcaBtc != null) currentBtc = Number(state.settings.manualCurrentDcaBtc || 0);
  const currentPrice = Number(state.settings.currentPrice || 0);
  const monthsLeft = Math.max(1, Math.round((targetAge - currentAge) * 12));
  const monthlyGrowthRate = Math.pow(1 + annualGrowthRate, 1/12) - 1;
  let btc = currentBtc, price = currentPrice;
  const path = [{ age: currentAge, btc: currentBtc }];
  for (let i=1;i<=monthsLeft;i++) {
    btc += monthlyDcaUsd / price;
    price *= (1 + monthlyGrowthRate);
    path.push({ age: currentAge + i/12, btc });
  }
  const estimatedBTCAtTargetAge = btc;
  const shortfall = Math.max(0, targetBTC - estimatedBTCAtTargetAge);
  const onTrack = shortfall <= 0.0000001;
  let reachAge = null;
  if (onTrack) {
    for (let i=0;i<path.length;i++) if (path[i].btc >= targetBTC) { reachAge = path[i].age; break; }
  } else {
    let simBtc = currentBtc, simPrice = currentPrice, months = 0;
    while (simBtc < targetBTC && months < 1200) {
      simBtc += monthlyDcaUsd / simPrice;
      simPrice *= (1 + monthlyGrowthRate);
      months++;
    }
    reachAge = currentAge + months / 12;
  }
  const lateYears = Math.max(0, reachAge - targetAge);
  const flatMonthsLeft = Math.max(1, Math.round((targetAge - currentAge) * 12));
  const reqBtcPerMonth = Math.max(0, targetBTC - currentBtc) / flatMonthsLeft;
  const requiredDca = reqBtcPerMonth * currentPrice;
  const suggestions = [100,300].map(add => {
    const projected = simulateWithMonthly(currentBtc,currentPrice,monthlyDcaUsd+add,monthlyGrowthRate,monthsLeft);
    return { icon:'💵', title:`Add $${add} / month`, body:`Projected ${fmtNum(projected,3)} BTC by age ${targetAge}` };
  });
  const growthProjected = simulateWithMonthly(currentBtc,currentPrice,monthlyDcaUsd,Math.pow(1+0.15,1/12)-1,monthsLeft);
  suggestions.push({ icon:'📈', title:'Increase growth to 15%', body:`Projected ${fmtNum(growthProjected,3)} BTC by age ${targetAge}` });
  return { currentBtc,targetBTC,currentAge,targetAge,monthlyDcaUsd,currentPrice,estimatedBTCAtTargetAge,shortfall,onTrack,reachAge,lateYears,requiredDca,path,suggestions };
}
function simulateWithMonthly(currentBtc,currentPrice,monthlyDca,monthlyGrowthRate,monthsLeft){ let btc=currentBtc, price=currentPrice; for(let i=0;i<monthsLeft;i++){ btc+=monthlyDca/price; price*=1+monthlyGrowthRate; } return btc; }

function renderStatCards(elId, items) {
  document.getElementById(elId).innerHTML = items.map(item => `<div class="mini-stat"><p class="label">${item.label}</p><p class="value ${item.className||''}">${item.value}</p><p class="hint">${item.hint||''}</p></div>`).join('');
}
function renderRecent(elId, rows) {
  document.getElementById(elId).innerHTML = rows.map(r => {
    const d = r.date || '';
    const [line1, line2=''] = d.split('|');
    return `<div class="list-row">
      <div class="badge ${r.kind||''}">${r.badge}</div>
      <div class="row-main">
        <p class="title ${r.wrapDate?'date-block':''}">${r.wrapDate?`<span class="line1">${line1}</span><span class="line2">${line2}</span>`:r.title}</p>
        <p class="sub">${r.subtitle||''}</p>
      </div>
      <div class="row-side">
        <p class="value ${r.className||''}">${r.value}</p>
        <p class="sub">${r.subValue||''}</p>
      </div>
    </div>`;
  }).join('');
}

function drawProjectionChart(svgId, p) {
  const svg = document.getElementById(svgId);
  const W=320,H=190,pad={l:46,r:14,t:16,b:26};
  const years = [p.currentAge, Math.round((p.currentAge+p.targetAge)/2), p.targetAge];
  const maxY = Math.max(1.2, p.targetBTC*1.05, p.estimatedBTCAtTargetAge*1.2);
  const xScale = age => pad.l + ((age - p.currentAge) / (p.targetAge - p.currentAge)) * (W-pad.l-pad.r);
  const yScale = v => H-pad.b - (v/maxY)*(H-pad.t-pad.b);
  const sample = [p.currentAge, p.currentAge+((p.targetAge-p.currentAge)*0.5), p.targetAge].map(age => {
    const nearest = p.path.reduce((a,b)=> Math.abs(b.age-age)<Math.abs(a.age-age)?b:a, p.path[0]);
    return nearest;
  });
  const areaPath = sample.map((pt,i)=>`${i?'L':'M'} ${xScale(pt.age)} ${yScale(pt.btc)}`).join(' ') + ` L ${xScale(p.targetAge)} ${H-pad.b} L ${xScale(p.currentAge)} ${H-pad.b} Z`;
  const linePath = sample.map((pt,i)=>`${i?'L':'M'} ${xScale(pt.age)} ${yScale(pt.btc)}`).join(' ');
  const yticks = [0, maxY/3, (maxY*2)/3, maxY].map(v => `<text class="axis" x="4" y="${yScale(v)+4}">${fmtNum(v,1)} BTC</text><line class="grid-line" x1="${pad.l}" x2="${W-pad.r}" y1="${yScale(v)}" y2="${yScale(v)}"></line>`).join('');
  const goalY = yScale(p.targetBTC);
  svg.innerHTML = `${yticks}<line class="goal-line" x1="${pad.l}" x2="${W-pad.r}" y1="${goalY}" y2="${goalY}"></line><path class="path-area" d="${areaPath}"></path><path class="path-line" d="${linePath}"></path>${years.map(y=>`<text class="axis" x="${xScale(y)}" y="${H-4}" text-anchor="middle">${Math.round(y)}</text>`).join('')}<rect class="path-pill" x="${xScale(p.targetAge)-46}" y="${yScale(p.estimatedBTCAtTargetAge)-16}" rx="12" ry="12" width="64" height="24"></rect><text class="path-pill-text" x="${xScale(p.targetAge)-14}" y="${yScale(p.estimatedBTCAtTargetAge)}" text-anchor="middle">${fmtNum(p.estimatedBTCAtTargetAge,3)}</text>`;
}

function drawFuturesChart(svgId, trades) {
  const svg = document.getElementById(svgId); const W=320,H=190,pad={l:40,r:16,t:18,b:28};
  const points=[]; let acc=0; trades.forEach((t,i)=>{ acc += Number(t.pnlUsdt||0); points.push({x:i+1,y:acc}); });
  if (!points.length) { svg.innerHTML=''; return; }
  const values = points.map(p=>p.y).concat([0]);
  const minY = Math.min(...values), maxY = Math.max(...values);
  const span = Math.max(1, maxY-minY);
  const yMin = minY - span*0.08, yMax = maxY + span*0.08;
  const xScale = x => pad.l + ((x-1)/(Math.max(points.length-1,1)))*(W-pad.l-pad.r);
  const yScale = y => H-pad.b - ((y-yMin)/(yMax-yMin))*(H-pad.t-pad.b);
  const path = points.map((p,i)=>`${i?'L':'M'} ${xScale(p.x)} ${yScale(p.y)}`).join(' ');
  const yTicks = [yMax, (yMax+yMin)/2, yMin].map(v=>`<text class="axis" x="4" y="${yScale(v)+4}">${fmtUsd(v,0)}</text><line class="grid-line" x1="${pad.l}" x2="${W-pad.r}" y1="${yScale(v)}" y2="${yScale(v)}"></line>`).join('');
  const zeroY = yScale(0);
  const xTicks = points.map((p,i)=>`<text class="axis" x="${xScale(p.x)}" y="${H-4}" text-anchor="middle">${i+1}</text>`).join('');
  svg.innerHTML = `${yTicks}<line class="goal-line" x1="${pad.l}" x2="${W-pad.r}" y1="${zeroY}" y2="${zeroY}"></line><path class="path-line" d="${path}"></path>${xTicks}`;
}

function render() {
  document.getElementById('headerDate').textContent = formatHeaderDate();
  const m = computeMetrics(); const p = estimateDcaProjection();

  document.getElementById('heroBtc').textContent = fmtNum(m.totalBtc,4);
  document.getElementById('heroGoal').textContent = fmtNum(state.settings.goalBtc,4);
  const goalPct = clamp((m.totalBtc/state.settings.goalBtc)*100, 0, 100);
  document.getElementById('goalProgressFill').style.width = `${goalPct}%`;
  document.getElementById('goalPercent').textContent = fmtPct(goalPct,2);
  document.getElementById('remainingBtc').textContent = `${fmtNum(Math.max(0, state.settings.goalBtc-m.totalBtc),4)} BTC`;
  document.getElementById('goalStatus').textContent = m.totalBtc >= state.settings.goalBtc ? 'Reached' : m.totalBtc >= state.settings.goalBtc*0.25 ? 'On track' : 'Starting';

  renderStatCards('homeStats', [
    { label:'Avg Cost', value:fmtUsd(m.avgCost,0), hint:'per BTC' },
    { label:'Capital Deployed', value:fmtUsd(m.totalInvested,0), hint:'USD' },
    { label:'BTC Stacked', value:fmtNum(m.totalBtc,4), hint:'BTC' }
  ]);

  const setSigned = (id,val,fmtFn,unit='') => { const el=document.getElementById(id); el.textContent = `${val>=0?'+':'-'}${fmtFn(Math.abs(val))}${unit}`; el.className = val>=0?'positive':'negative'; };
  document.getElementById('futuresCash').textContent = fmtUsd(m.futuresPnl,2); document.getElementById('futuresCash').className = m.futuresPnl>=0?'positive':'negative';
  document.getElementById('gridCash').textContent = fmtUsd(m.gridPnl,2); document.getElementById('gridCash').className = m.gridPnl>=0?'positive':'negative';
  document.getElementById('futuresToBtc').textContent = signBtc(m.futuresToBtc,4); document.getElementById('futuresToBtc').className = m.futuresToBtc>=0?'positive':'negative';
  document.getElementById('gridToBtc').textContent = signBtc(m.gridToBtc,4); document.getElementById('gridToBtc').className = m.gridToBtc>=0?'positive':'negative';
  document.getElementById('totalConverted').textContent = signBtc(m.totalConverted,4); document.getElementById('totalConverted').className = `big ${m.totalConverted>=0?'positive':'negative'}`;

  document.getElementById('monthGrid').innerHTML = [
    { value:`${Number(m.monthBtc)>=0?'+':''}${fmtNum(m.monthBtc,4)}`, label:'BTC accumulated' },
    { value:String(m.monthEntries), label:'Entries' },
    { value:fmtUsd(m.monthInvested,0), label:'Capital deployed' }
  ].map(i => `<div><p class="month-number ${i.value.startsWith('+')?'positive':''}">${i.value}</p><p class="meta-label">${i.label}</p></div>`).join('');

  const recentRows = state.dca.slice().sort((a,b)=>sortDateDesc(a,b)).slice(0,4).map(x => ({ kind:'dca', badge:'DCA', title:new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:x.note || x.source, value:signBtc(x.btcQty,4), subValue:fmtUsd(x.price,0), className:x.btcQty>=0?'positive':'negative' }));
  renderRecent('recentActivity', recentRows);

  renderProjection(p,m);
  renderFutures(m);
  renderCash(m);
}

function renderProjection(p,m) {
  document.getElementById('projCurrentBtc').textContent = fmtNum(p.currentBtc,4);
  document.getElementById('projTargetBtc').textContent = fmtNum(p.targetBTC,4);
  document.getElementById('projTargetValue').textContent = fmtNum(p.targetBTC,4);
  document.getElementById('projTargetAgeInline').textContent = p.targetAge;
  document.getElementById('projTimeLeft').textContent = `${p.targetAge - p.currentAge} years · ${(p.targetAge - p.currentAge) * 12} months`;
  const projPct = clamp((p.currentBtc/p.targetBTC)*100,0,100);
  document.getElementById('projProgressFill').style.width = `${projPct}%`;
  document.getElementById('projProgressPct').textContent = fmtPct(projPct,2);
  document.getElementById('projHeroNote').textContent = 'Keep stacking. You’re early.';
  document.getElementById('projSummaryTopic').textContent = `At age ${p.targetAge}`;
  document.getElementById('projAtTargetAge').textContent = fmtNum(p.estimatedBTCAtTargetAge,3);
  const chip = document.getElementById('projGapChip');
  chip.textContent = `${fmtNum(p.shortfall,3)} BTC short`;
  chip.className = 'status-chip';
  const reachText = p.reachAge > 100 ? 'Beyond 100+' : `Age ${p.reachAge.toFixed(1)}`;
  document.getElementById('projectionMiniCards').innerHTML = [
    { icon:'⏱', kicker:'Reach age', main:reachText, sub:'At current pace' },
    { icon:'⚑', kicker:'Gap to goal', main:`${fmtNum(p.shortfall,3)} BTC`, sub:`By age ${p.targetAge}` },
    { icon:'↗', kicker:'Need / mo', main:`${fmtUsd(p.requiredDca,0)}`, sub:`To hit age ${p.targetAge}` },
  ].map(c => `<div class="mini-insight"><div class="icon">${c.icon}</div><div><p class="kicker">${c.kicker}</p><p class="main">${c.main}</p><p class="sub">${c.sub}</p></div></div>`).join('');

  const assumptionIcons = ['👤','⚑','₿','💵','↗','↗'];
  document.getElementById('projectionAssumptions').innerHTML = [
    ['Current Age', `${p.currentAge}`, 'years'],
    ['Target Age', `${p.targetAge}`, 'years'],
    ['Current DCA', `${fmtNum(p.currentBtc,4)}`, 'BTC'],
    ['Monthly DCA', fmtUsd(p.monthlyDcaUsd,0), 'per month'],
    ['BTC Price', fmtUsd(p.currentPrice,0), 'per BTC'],
    ['Price Growth', `${state.settings.annualGrowthRate}%`, 'per year']
  ].map(([label,value,hint],i)=>`<div class="assumption-card"><div class="icon">${assumptionIcons[i]}</div><p class="label">${label}</p><p class="value">${value}</p><p class="hint">${hint}</p></div>`).join('');
  document.getElementById('projectionFootnote').textContent = `Projections use an average annual BTC price growth of ${state.settings.annualGrowthRate}%. Live BTC price updates automatically.`;

  drawProjectionChart('projectionChart', p);
  document.getElementById('projectionCallout').innerHTML = `At age <strong>${p.targetAge}</strong>, your DCA-only path reaches <strong>${fmtNum(p.estimatedBTCAtTargetAge,3)} BTC</strong>. To hit <strong>1 BTC</strong>, raise DCA to <strong>${fmtUsd(p.requiredDca,0)}/month</strong>.`;

  document.getElementById('projectionSuggestions').innerHTML = p.suggestions.map(s => `<div class="suggestion-card"><div class="icon">${s.icon}</div><div><p class="title">${s.title}</p><p class="body">${s.body}</p></div></div>`).join('');

  renderRecent('dcaList', state.dca.slice().sort((a,b)=>sortDateDesc(a,b)).slice(0,12).map(x => ({ kind:'dca', badge:'DCA', title:new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:x.note || x.source, value:signBtc(x.btcQty,4), subValue:fmtUsd(x.price,0), className:x.btcQty>=0?'positive':'negative' })));
  updateShareCard();
}

function renderFutures(m) {
  renderStatCards('futuresStats', [
    { label:'Total PnL', value:fmtUsd(m.futuresPnl,2), className:m.futuresPnl>=0?'positive':'negative', hint:'USD' },
    { label:'Winning Trades', value:String(state.futures.filter(x => Number(x.pnlUsdt)>0).length), hint:'count' },
    { label:'Trades', value:String(state.futures.length), hint:'total' }
  ]);
  const trades = state.futures.slice().sort((a,b)=>new Date(a.dateClose)-new Date(b.dateClose));
  drawFuturesChart('futuresChart', trades);
  renderRecent('futuresList', state.futures.slice().sort((a,b)=>sortDateDesc(a,b,'dateClose')).map(x => ({
    kind:'futures', badge:'FUT', title:'', date:new Date(x.dateClose).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}).replace(',', '|'), wrapDate:true,
    subtitle:`${x.side} · ${x.mode}${x.notes ? ' · ' + x.notes : ''}`,
    value:fmtUsd(x.pnlUsdt,2), subValue:x.notes || '', className:x.pnlUsdt>=0?'positive':'negative'
  })));
}

function renderCash(m) {
  document.getElementById('liveBtcPrice').textContent = fmtUsd(m.price,0);
  document.getElementById('priceUpdatedAt').textContent = state.settings.priceUpdatedAt ? `Updated ${new Date(state.settings.priceUpdatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'Using saved price';
  renderStatCards('dipStats', [
    { label:'Total BTC', value:fmtNum(m.dipBtc,4), hint:'BTC' },
    { label:'Capital Used', value:fmtUsd(state.dip.reduce((s,x)=>s+Math.abs(Number(x.usdtAmount||0)),0),0), hint:'USD' },
    { label:'Entry Count', value:String(state.dip.length), hint:'entries' }
  ]);
  renderRecent('dipList', state.dip.slice().sort((a,b)=>sortDateDesc(a,b)).slice(0,8).map(x => ({ kind:'dip', badge:'DIP', title:new Date(x.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:x.note || x.source, value:signBtc(x.btcQty,4), subValue:fmtUsd(x.price,0), className:x.btcQty>=0?'positive':'negative' })));
  renderStatCards('gridStats', [
    { label:'Total Profit', value:fmtUsd(m.gridPnl,2), className:m.gridPnl>=0?'positive':'negative', hint:'USD' },
    { label:'Total Capital', value:fmtUsd(state.grid.reduce((s,x)=>s+Math.abs(Number(x.capitalUsdt||0)),0),0), hint:'USD' },
    { label:'Runs', value:String(state.grid.length), hint:'bots' }
  ]);
  renderRecent('gridList', state.grid.slice().sort((a,b)=>sortDateDesc(a,b,'dateEnd')).map(x => ({ kind:'grid', badge:'GRD', title:new Date(x.dateEnd).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}), subtitle:`${x.gridType} · ${x.mode}`, value:fmtUsd(x.netProfitUsdt,2), subValue:fmtPct(x.roi,2), className:x.netProfitUsdt>=0?'positive':'negative' })));
}

document.addEventListener('DOMContentLoaded', init);
