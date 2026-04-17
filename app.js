const STORAGE_KEY = 'btcAccumulationAppData_v1';

async function loadSeedData() {
  const resp = await fetch('data.json');
  return resp.json();
}

function fmtNum(n, d=4) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtUsd(n, d=0) {
  return '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n, d=2) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function isoDate(s) {
  return new Date(s).toISOString().slice(0,10);
}

let state;

function mergeSeedWithLocal(seed) {
  const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (!local) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
  return local;
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSpotEntries() {
  return [...state.dca, ...state.dip].sort((a,b)=>new Date(a.date)-new Date(b.date));
}
function getRecentActivity() {
  const spot = getSpotEntries().map(x=>({
    kind: x.strategy === 'DCA' ? 'dca' : 'dip',
    title: x.type,
    subtitle: `${x.strategy}${x.note ? ' · ' + x.note : ''}`,
    date: x.date,
    value: x.btcQty,
    subValue: Math.abs(x.usdtAmount || 0),
    unit: 'BTC'
  }));
  const fut = state.futures.map(x=>({
    kind: 'futures',
    title: x.side,
    subtitle: `Futures${x.mode ? ' · ' + x.mode : ''}`,
    date: x.dateClose || x.dateOpen,
    value: x.pnlUsdt,
    subValue: x.symbol,
    unit: 'USDT'
  }));
  const grid = state.grid.map(x=>({
    kind: 'grid',
    title: x.gridType + ' Grid',
    subtitle: x.mode || 'Grid Bot',
    date: x.dateEnd || x.dateStart,
    value: x.netProfitUsdt,
    subValue: 'Grid cycle',
    unit: 'USDT'
  }));
  return [...spot, ...fut, ...grid].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
}
function computeMetrics() {
  const spotEntries = getSpotEntries();
  const buys = spotEntries.filter(x => (x.btcQty || 0) > 0);
  const totalBtc = spotEntries.reduce((s,x)=>s + Number(x.btcQty || 0),0);
  const investedUsdt = spotEntries.reduce((s,x)=> s + Math.abs(Math.min(Number(x.usdtAmount || 0), 0)),0) + spotEntries.reduce((s,x)=> s + Math.max(Number(x.usdtAmount || 0),0),0);
  const avgCost = totalBtc > 0 ? investedUsdt / totalBtc : 0;
  const currentPrice = Number(state.settings.currentPrice || 0);
  const goalBtc = Number(state.settings.goalBtc || 1);
  const remaining = Math.max(goalBtc - totalBtc, 0);
  const progress = goalBtc > 0 ? Math.min(totalBtc/goalBtc, 1) : 0;
  const unrealized = (currentPrice - avgCost) * totalBtc;
  const futuresPnl = state.futures.reduce((s,x)=>s + Number(x.pnlUsdt || 0),0);
  const gridPnl = state.grid.reduce((s,x)=>s + Number(x.netProfitUsdt || 0),0);
  const futuresToBtc = currentPrice ? futuresPnl/currentPrice : 0;
  const gridToBtc = currentPrice ? gridPnl/currentPrice : 0;
  const totalConverted = futuresToBtc + gridToBtc;
  const latestDate = getRecentActivity()[0]?.date || new Date().toISOString();
  const currentMonth = new Date(latestDate);
  const monthKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`;
  const monthSpot = buys.filter(x=> {
    const d=new Date(x.date);
    return `${d.getFullYear()}-${d.getMonth()}`===monthKey;
  });
  const monthBtc = monthSpot.reduce((s,x)=>s+Number(x.btcQty || 0),0);
  const monthInvested = monthSpot.reduce((s,x)=>s+Math.abs(Number(x.usdtAmount || 0)),0);
  const monthEntries = monthSpot.length;

  const dcaBtc = state.dca.reduce((s,x)=>s + Number(x.btcQty || 0),0);
  const dcaInvested = state.dca.reduce((s,x)=>s + Math.abs(Number(x.usdtAmount || 0)),0);
  const dcaAvg = dcaBtc ? dcaInvested/dcaBtc : 0;
  const dipBtc = state.dip.reduce((s,x)=>s + Number(x.btcQty || 0),0);
  const dipInvested = state.dip.reduce((s,x)=>s + Math.abs(Number(x.usdtAmount || 0)),0);
  const dipAvg = dipBtc ? dipInvested/dipBtc : 0;
  const dipUnrealized = (currentPrice - dipAvg) * dipBtc;
  const futWins = state.futures.filter(x=>Number(x.pnlUsdt || 0) > 0).length;
  const futLoss = state.futures.filter(x=>Number(x.pnlUsdt || 0) < 0).length;
  const futTrades = state.futures.length;
  const futWinRate = futTrades ? futWins / futTrades * 100 : 0;
  const gridCapital = state.grid.reduce((s,x)=>s + Number(x.capitalUsdt || 0),0);
  const gridRoi = gridCapital ? gridPnl / gridCapital * 100 : 0;

  return {
    totalBtc, investedUsdt, avgCost, currentPrice, unrealized, goalBtc, remaining, progress,
    futuresPnl, gridPnl, futuresToBtc, gridToBtc, totalConverted, latestDate,
    monthBtc, monthInvested, monthEntries, dcaBtc, dcaInvested, dcaAvg,
    dipBtc, dipInvested, dipAvg, dipUnrealized, futWins, futLoss, futTrades, futWinRate,
    gridCapital, gridRoi
  };
}

function renderStats(containerId, items) {
  const el = document.getElementById(containerId);
  el.innerHTML = items.map(item => `
    <div class="stat-card">
      <span class="label">${item.label}</span>
      <span class="value ${item.className || ''}">${item.value}</span>
      ${item.hint ? `<span class="hint">${item.hint}</span>` : ''}
    </div>
  `).join('');
}

function renderRecent(listId, items, mode='mixed') {
  const el = document.getElementById(listId);
  el.innerHTML = items.map(item => {
    const kind = item.kind || (item.strategy === 'DCA' ? 'dca' : item.strategy === 'Dip Reserve' ? 'dip' : item.strategy === 'Futures' ? 'futures' : 'grid');
    const isPositive = Number(item.value || item.pnlUsdt || item.netProfitUsdt || 0) >= 0;
    const valueText = item.unit === 'BTC' || item.strategy === 'DCA' || item.strategy === 'Dip Reserve'
      ? `${Number(item.value || item.btcQty || 0) >= 0 ? '+' : ''}${fmtNum(item.value || item.btcQty || 0,4)} BTC`
      : `${Number(item.value || item.pnlUsdt || item.netProfitUsdt || 0) >= 0 ? '+' : ''}${fmtUsd(item.value || item.pnlUsdt || item.netProfitUsdt || 0,2)}${item.unit ? ' ' + item.unit : ''}`;
    const subValue = item.subValue !== undefined ? item.subValue : (item.usdtAmount ? fmtUsd(Math.abs(item.usdtAmount),2) : item.price ? fmtUsd(item.price,0) : '');
    return `
      <div class="list-row">
        <div class="row-left">
          <div class="badge ${kind}">${kind === 'dca' ? 'DCA' : kind === 'dip' ? 'DIP' : kind === 'futures' ? 'FUT' : 'GRD'}</div>
          <div>
            <p class="row-title">${fmtDate(item.date || item.dateClose || item.dateOpen || item.dateStart)}</p>
            <p class="row-sub">${item.title || item.type || item.side || item.gridType} · ${item.subtitle || item.note || item.mode || item.source || ''}</p>
          </div>
        </div>
        <div class="row-value">
          <strong class="${isPositive ? 'positive':'negative'}">${valueText}</strong>
          <span>${typeof subValue === 'number' ? fmtUsd(subValue,2) : subValue}</span>
        </div>
      </div>`;
  }).join('');
}

function drawLineChart(svgId, values, colorMode='positiveOnly') {
  const svg = document.getElementById(svgId);
  const width = 320, height = 180, pad = 18;
  svg.innerHTML = '';
  if (!values.length) return;
  const nums = values.map(Number);
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums, 0.0001);
  const range = max - min || 1;
  const x = i => pad + (i * (width - pad*2) / Math.max(values.length - 1, 1));
  const y = v => height - pad - ((v - min) * (height - pad*2) / range);

  const axis = document.createElementNS('http://www.w3.org/2000/svg','line');
  axis.setAttribute('x1', pad); axis.setAttribute('x2', width-pad); axis.setAttribute('y1', y(0)); axis.setAttribute('y2', y(0));
  axis.setAttribute('stroke', '#e5e5e1'); axis.setAttribute('stroke-width', '1'); svg.appendChild(axis);

  for (let i=0;i<nums.length-1;i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', x(i)); line.setAttribute('y1', y(nums[i]));
    line.setAttribute('x2', x(i+1)); line.setAttribute('y2', y(nums[i+1]));
    let color = '#18a957';
    if (colorMode === 'greenRed') color = nums[i+1] >= nums[i] ? '#18a957' : '#d64545';
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  }

  const last = document.createElementNS('http://www.w3.org/2000/svg','circle');
  last.setAttribute('cx', x(nums.length-1)); last.setAttribute('cy', y(nums[nums.length-1])); last.setAttribute('r', '4.5');
  last.setAttribute('fill', colorMode === 'greenRed' && nums.length > 1 && nums[nums.length-1] < nums[nums.length-2] ? '#d64545' : '#18a957');
  svg.appendChild(last);
}

function render() {
  const m = computeMetrics();
  document.getElementById('headerDate').textContent = fmtDate(m.latestDate);
  document.getElementById('heroBtc').textContent = fmtNum(m.totalBtc, 4);
  document.getElementById('heroGoal').textContent = fmtNum(m.goalBtc, 4);
  document.getElementById('goalPercent').textContent = fmtPct(m.progress * 100, 2);
  document.getElementById('goalProgressFill').style.width = `${m.progress * 100}%`;
  document.getElementById('remainingBtc').textContent = `${fmtNum(m.remaining, 4)} BTC`;
  document.getElementById('goalStatus').textContent = m.progress >= 0.75 ? 'Ahead' : m.progress >= 0.25 ? 'On track' : 'Starting';
  document.getElementById('futuresCash').textContent = fmtUsd(m.futuresPnl, 2);
  document.getElementById('gridCash').textContent = fmtUsd(m.gridPnl, 2);
  document.getElementById('futuresToBtc').textContent = `+${fmtNum(m.futuresToBtc,4)} BTC`;
  document.getElementById('gridToBtc').textContent = `+${fmtNum(m.gridToBtc,4)} BTC`;
  document.getElementById('totalConverted').textContent = `+${fmtNum(m.totalConverted,4)} BTC`;
  document.getElementById('monthBtc').textContent = `+${fmtNum(m.monthBtc,4)} BTC`;
  document.getElementById('monthEntries').textContent = `${m.monthEntries}`;
  document.getElementById('monthInvested').textContent = fmtUsd(m.monthInvested, 0);

  renderStats('homeStats', [
    { label: 'Avg Cost', value: fmtUsd(m.avgCost, 0), hint: 'per BTC' },
    { label: 'Capital Deployed', value: fmtUsd(m.investedUsdt, 0), hint: 'USDT' },
    { label: 'BTC Stacked', value: fmtNum(m.totalBtc,4), hint: 'BTC' }
  ]);
  renderRecent('recentActivity', getRecentActivity());

  renderStats('dcaStats', [
    { label: 'Total BTC', value: fmtNum(m.dcaBtc,4), hint: 'BTC' },
    { label: 'Avg Buy', value: fmtUsd(m.dcaAvg,0), hint: 'per BTC' },
    { label: 'Total Invested', value: fmtUsd(m.dcaInvested,2), hint: 'USDT' }
  ]);
  renderRecent('dcaList', state.dca.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(x=>({
    ...x, kind:'dca', title:'DCA Buy', subtitle:x.note || x.source, value:x.btcQty, subValue:x.price, unit:'BTC'
  })));
  let cum = 0; const dcaCum = state.dca.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).map(x => cum += Number(x.btcQty || 0));
  drawLineChart('dcaChart', dcaCum, 'positiveOnly');

  renderStats('futuresStats', [
    { label: 'Total PnL', value: fmtUsd(m.futuresPnl,2), className: m.futuresPnl >=0 ? 'positive':'negative', hint:'USDT' },
    { label: 'Win Rate', value: fmtPct(m.futWinRate,1), hint:`${m.futWins}/${m.futTrades} wins` },
    { label: 'Trades', value: `${m.futTrades}`, hint:`${m.futLoss} losses` }
  ]);
  renderRecent('futuresList', state.futures.slice().sort((a,b)=>new Date(b.dateClose)-new Date(a.dateClose)).map(x=>({
    ...x, kind:'futures', date:x.dateClose, title:x.side, subtitle:`${x.mode} ${x.leverage}`, value:x.pnlUsdt, subValue:x.symbol, unit:'USDT'
  })));
  drawLineChart('futuresChart', state.futures.map(x=>x.cumPnlUsdt), 'greenRed');

  renderStats('dipStats', [
    { label: 'Total BTC', value: fmtNum(m.dipBtc,4), hint:'BTC' },
    { label: 'Avg Buy', value: fmtUsd(m.dipAvg,0), hint:'per BTC' },
    { label: 'Unrealized P/L', value: fmtUsd(m.dipUnrealized,2), className: m.dipUnrealized >=0 ? 'positive':'negative', hint:'USDT' }
  ]);
  renderRecent('dipList', state.dip.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(x=>({
    ...x, kind:'dip', title:x.type, subtitle:x.note || x.source, value:x.btcQty, subValue:x.price, unit:'BTC'
  })));

  renderStats('gridStats', [
    { label: 'Total Profit', value: fmtUsd(m.gridPnl,2), className: m.gridPnl>=0 ? 'positive':'negative', hint:'USDT' },
    { label: 'ROI', value: fmtPct(m.gridRoi,2), hint:'portfolio' },
    { label: 'Total Capital', value: fmtUsd(m.gridCapital,2), hint:'USDT' }
  ]);
  renderRecent('gridList', state.grid.slice().sort((a,b)=>new Date(b.dateEnd)-new Date(a.dateEnd)).map(x=>({
    ...x, kind:'grid', date:x.dateEnd, title:x.gridType + ' Grid', subtitle:x.mode, value:x.netProfitUsdt, subValue:fmtPct(x.roi,2), unit:'USDT'
  })));

  const trigEl = document.getElementById('triggerList');
  trigEl.innerHTML = state.triggers.map(t => `
    <div class="list-row trigger-item">
      <div class="level-badge">${t.level}</div>
      <div>
        <p class="row-title">${fmtPct(t.drop*100,0)} drop · Buy at ${fmtUsd(t.buyPrice,0)}</p>
        <p class="row-sub">${t.fundSource} · ${t.notes}</p>
      </div>
      <div class="row-value"><strong>${fmtNum(t.btcEst,4)} BTC</strong><span>${fmtUsd(t.thbUse / state.settings.usdthb,0)}</span></div>
    </div>`).join('');
}

function switchScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screen));
  document.getElementById('pageTitle').textContent = screen === 'home' ? 'Home' : screen === 'dca' ? 'DCA' : screen === 'futures' ? 'Futures' : 'More';
}

function setupNav() {
  document.querySelectorAll('.nav-item[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });
}

function setupGoalDialog() {
  const dialog = document.getElementById('goalDialog');
  const openers = [document.getElementById('editGoalBtn'), document.getElementById('editGoalTopBtn')];
  const input = document.getElementById('goalInput');
  openers.forEach(btn => btn.addEventListener('click', ()=> {
    input.value = state.settings.goalBtc;
    dialog.showModal();
  }));
  document.getElementById('saveGoalBtn').addEventListener('click', ()=> {
    state.settings.goalBtc = Number(input.value || 1);
    persist();
    dialog.close();
    render();
  });
}

function setupEntryDialog() {
  const dialog = document.getElementById('entryDialog');
  const addBtn = document.getElementById('addBtn');
  const close = ()=> dialog.close();
  addBtn.addEventListener('click', ()=> {
    document.getElementById('entryForm').reset();
    document.querySelectorAll('#entryStrategySeg .seg-btn').forEach((btn,i)=>btn.classList.toggle('active', i===0));
    updateEntryMode('DCA');
    const today = new Date().toISOString().slice(0,10);
    dialog.querySelector('[name="date"]').value = today;
    dialog.querySelector('[name="dateOpen"]').value = today;
    dialog.querySelector('[name="dateClose"]').value = today;
    dialog.querySelector('[name="dateStart"]').value = today;
    dialog.querySelector('[name="dateEnd"]').value = today;
    dialog.showModal();
  });
  document.getElementById('closeEntryBtn').addEventListener('click', close);
  document.getElementById('cancelEntryBtn').addEventListener('click', close);

  document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(btn => btn.addEventListener('click', ()=> {
    document.querySelectorAll('#entryStrategySeg .seg-btn').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    updateEntryMode(btn.dataset.value);
  }));

  document.getElementById('entryForm').addEventListener('submit', e=> {
    e.preventDefault();
    const form = new FormData(e.target);
    const strategy = document.querySelector('#entryStrategySeg .seg-btn.active').dataset.value;
    if (strategy === 'DCA' || strategy === 'Dip Reserve') {
      const entry = {
        date: form.get('date'),
        type: form.get('type') || 'BUY',
        btcQty: Number(form.get('btcQty') || 0),
        price: Number(form.get('price') || 0),
        usdtAmount: -Math.abs(Number(form.get('usdtAmount') || 0)),
        source: form.get('source') || 'Manual',
        location: form.get('location') || 'Wallet',
        note: form.get('note') || '',
        strategy
      };
      if (strategy === 'DCA') state.dca.push(entry); else state.dip.push(entry);
    } else if (strategy === 'Futures') {
      state.futures.push({
        dateOpen: form.get('dateOpen'),
        dateClose: form.get('dateClose'),
        symbol: 'BTCUSDT',
        side: form.get('side') || 'Long',
        leverage: form.get('leverage') || '3x',
        mode: form.get('mode') || 'Cross',
        entryPrice: Number(form.get('entryPrice') || 0),
        exitPrice: Number(form.get('exitPrice') || 0),
        sizeBtc: Number(form.get('sizeBtc') || 0),
        pnlUsdt: Number(form.get('pnlUsdt') || 0),
        cumPnlUsdt: 0,
        notes: form.get('notes') || '',
        strategy: 'Futures'
      });
      let cum = 0;
      state.futures.sort((a,b)=>new Date(a.dateClose)-new Date(b.dateClose)).forEach(x=> { cum += Number(x.pnlUsdt||0); x.cumPnlUsdt = cum; });
    } else {
      state.grid.push({
        dateStart: form.get('dateStart'),
        dateEnd: form.get('dateEnd'),
        gridType: form.get('gridType') || 'Spot',
        mode: form.get('gridMode') || 'Arithmetic Grid',
        capitalUsdt: Number(form.get('capitalUsdt') || 0),
        netProfitUsdt: Number(form.get('netProfitUsdt') || 0),
        roi: Number(form.get('gridRoi') || 0),
        strategy: 'Grid Bot'
      });
    }
    persist();
    close();
    render();
  });
}

function updateEntryMode(strategy) {
  const spot = document.getElementById('spotFields');
  const fut = document.getElementById('futuresFields');
  const grid = document.getElementById('gridFields');
  spot.classList.toggle('hidden', !(strategy === 'DCA' || strategy === 'Dip Reserve'));
  fut.classList.toggle('hidden', strategy !== 'Futures');
  grid.classList.toggle('hidden', strategy !== 'Grid Bot');
}

(async function init() {
  const seed = await loadSeedData();
  state = mergeSeedWithLocal(seed);
  setupNav();
  setupGoalDialog();
  setupEntryDialog();
  render();
})();
