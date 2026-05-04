const fmt = n => (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt2 = n => (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = n => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let DATA = null;
let dayCache = {};
let currentDay = null;
let currentTab = "bets";
let STRATEGIES = null;
let CURRENT_STRATEGY = null;
let equityChart = null;

async function load() {
  STRATEGIES = (await (await fetch("data/strategies.json")).json()).strategies;
  // 默认 conservative (从 URL hash 或第一个)
  const fromHash = location.hash.replace("#", "");
  CURRENT_STRATEGY = STRATEGIES.find(s => s.id === fromHash) || STRATEGIES[0];

  // 渲染选择器
  const sel = document.getElementById("strategy-select");
  sel.innerHTML = STRATEGIES.map(s => `<option value="${s.id}">${s.name} · ${s.label}</option>`).join("");
  sel.value = CURRENT_STRATEGY.id;
  sel.addEventListener("change", () => switchStrategy(sel.value));
  document.getElementById("strategy-desc").textContent = CURRENT_STRATEGY.desc;

  await loadStrategyData(CURRENT_STRATEGY.id);
}

async function loadStrategyData(id) {
  const r = await fetch(`data/results_${id}.json`);
  DATA = await r.json();
  dayCache = {};
  closeDayDetail();
  // 清空旧 DOM (重新渲染时复用容器)
  document.querySelectorAll("#month-table tbody, #recent-days, #grid-table, #heatmap").forEach(el => el.innerHTML = "");
  if (equityChart) { equityChart.destroy(); equityChart = null; }

  renderRecentDays();
  renderKPI();
  renderEquity();
  renderYearPicker();
  renderHeatmap();
  renderMonthly();
  renderGrid();

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      renderDayBody();
    });
  });
}

function renderRecentDays() {
  const container = document.getElementById("recent-days");
  const detailDays = DATA.daily.filter(d => d.has_detail);
  if (!detailDays.length) {
    container.innerHTML = `<p class="hint">暂无可点开明细的天</p>`;
    return;
  }
  // newest first
  detailDays.sort((a, b) => b.date.localeCompare(a.date));
  let html = "";
  for (const d of detailDays) {
    const pnlCls = d.pnl >= 0 ? "pos" : "neg";
    const stopBadge = d.stopped_by === "止盈" ? "tp" : (d.stopped_by === "止损" ? "sl" : "end");
    const wd = ["周日","周一","周二","周三","周四","周五","周六"][new Date(d.date).getDay()];
    html += `<div class="recent-card" onclick="openDay('${d.date}')">
      <div class="rc-head">
        <span class="rc-date">${d.date} <span class="rc-dow">${wd}</span></span>
        <span class="rc-badge ${stopBadge}">${d.stopped_by}</span>
      </div>
      <div class="rc-pnl ${pnlCls}">${d.pnl >= 0 ? "+" : ""}$${fmt(d.pnl)}</div>
      <div class="rc-stats">
        <span><b>${d.total_bets}</b> 注</span>
        <span><b>${d.total_wins}</b> 中</span>
        <span><b>${d.win_rate}%</b> 胜率</span>
        <span><b>${d.triggers}</b> 触发</span>
      </div>
    </div>`;
  }
  container.innerHTML = html;
}

function renderKPI() {
  const s = DATA.summary;
  document.getElementById("kpi-total").textContent = "$" + fmt(s.total_pnl);
  document.getElementById("kpi-avg").textContent = "$" + fmt2(s.avg_pnl);
  const wpct = (s.win_days / s.total_days * 100).toFixed(1);
  document.getElementById("kpi-winrate").textContent = wpct + "%";
  document.getElementById("kpi-winsub").textContent = `${s.win_days} 盈 / ${s.loss_days} 亏 / ${s.total_days} 总`;
  document.getElementById("kpi-bust").textContent = s.bust_days;
  document.getElementById("kpi-bust-sub").textContent = `已被 $${(CURRENT_STRATEGY.sl/1000)}K 止损接住`;
  document.getElementById("kpi-tpsl").textContent = `${s.tp_days} : ${s.sl_days}`;
  document.getElementById("kpi-tpsl-sub").textContent = `止盈 ${(s.tp_days/s.total_days*100).toFixed(0)}% · 止损 ${(s.sl_days/s.total_days*100).toFixed(0)}%`;
  document.getElementById("kpi-extreme").textContent = `$${fmt(s.min_pnl)} / $${fmt(s.max_pnl)}`;

  const tot = document.getElementById("kpi-total");
  tot.className = "kpi-value " + (s.total_pnl >= 0 ? "pos" : "neg");
  const avg = document.getElementById("kpi-avg");
  avg.className = "kpi-value " + (s.avg_pnl >= 0 ? "pos" : "neg");
  const bust = document.getElementById("kpi-bust");
  bust.className = "kpi-value " + (s.bust_days === 0 ? "pos" : "neg");
}

function renderEquity() {
  const ctx = document.getElementById("equity-chart").getContext("2d");
  let cum = 0;
  const labels = [];
  const data = [];
  for (const d of DATA.daily) {
    cum += d.pnl;
    labels.push(d.date);
    data.push(cum);
  }
  equityChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "累计盈亏 ($)",
        data,
        borderColor: "#3fb950",
        backgroundColor: "rgba(63, 185, 80, 0.1)",
        fill: true,
        borderWidth: 2,
        tension: 0,
        pointRadius: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#e6edf3" } },
        tooltip: {
          backgroundColor: "#1f2428",
          borderColor: "#58a6ff",
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `累计: $${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8b949e", maxTicksLimit: 10 },
          grid: { color: "#21262d" },
        },
        y: {
          ticks: {
            color: "#8b949e",
            callback: v => "$" + (v / 1000).toFixed(0) + "K",
          },
          grid: { color: "#21262d" },
        },
      },
    },
  });
}

function renderYearPicker() {
  const years = [...new Set(DATA.daily.map(d => d.date.slice(0, 4)))].sort();
  const sel = document.getElementById("year-select");
  sel.innerHTML = `<option value="ALL">全部 (${years.join(", ")})</option>` +
    years.map(y => `<option value="${y}">${y}</option>`).join("");
  sel.addEventListener("change", renderHeatmap);
}

function renderHeatmap() {
  const container = document.getElementById("heatmap");
  container.innerHTML = "";
  let tip = document.getElementById("tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "tooltip";
    document.body.appendChild(tip);
  }

  const sel = document.getElementById("year-select");
  const yearFilter = sel ? sel.value : "ALL";

  const filtered = yearFilter === "ALL"
    ? DATA.daily
    : DATA.daily.filter(d => d.date.startsWith(yearFilter));
  if (!filtered.length) return;

  const byDate = {};
  for (const d of filtered) byDate[d.date] = d;

  const start = new Date(filtered[0].date);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(filtered[filtered.length - 1].date);

  const totalDays = Math.floor((end - start) / 86400000);
  const totalWeeks = Math.ceil(totalDays / 7) + 1;
  container.style.gridTemplateColumns = `repeat(${totalWeeks}, 1fr)`;

  for (let w = 0; w < totalWeeks; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const cellDate = new Date(start);
      cellDate.setDate(cellDate.getDate() + w * 7 + dow);
      const ds = cellDate.toISOString().slice(0, 10);
      const div = document.createElement("div");
      const d = byDate[ds];
      let cls = "cell empty";
      let title = "";
      if (d) {
        if (d.stopped_by === "止盈") cls = "cell tp";
        else if (d.stopped_by === "止损") cls = "cell sl";
        else if (d.stopped_by === "爆仓") cls = "cell sl-mid";
        else cls = "cell end";
        title = `${ds} · ${d.stopped_by} · $${fmt2(d.pnl)} · ${d.total_bets} 注 · 胜率 ${d.win_rate}%`;
      }
      div.className = cls;
      div.style.gridColumn = w + 1;
      div.style.gridRow = dow + 1;
      if (d) {
        div.addEventListener("mouseenter", e => {
          tip.textContent = title;
          tip.style.display = "block";
          tip.style.left = (e.clientX + 10) + "px";
          tip.style.top = (e.clientY + 10) + "px";
        });
        div.addEventListener("mousemove", e => {
          tip.style.left = (e.clientX + 10) + "px";
          tip.style.top = (e.clientY + 10) + "px";
        });
        div.addEventListener("mouseleave", () => { tip.style.display = "none"; });
        div.addEventListener("click", () => openDay(ds));
      }
      container.appendChild(div);
    }
  }
}

function renderMonthly() {
  const tbody = document.querySelector("#month-table tbody");
  const byMonth = {};
  for (const d of DATA.daily) {
    const ym = d.date.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = { days: 0, pnl: 0, wins: 0, tp: 0, sl: 0 };
    const m = byMonth[ym];
    m.days++;
    m.pnl += d.pnl;
    if (d.pnl > 0) m.wins++;
    if (d.stopped_by === "止盈") m.tp++;
    if (d.stopped_by === "止损") m.sl++;
  }
  const months = Object.keys(byMonth).sort();
  for (const ym of months) {
    const m = byMonth[ym];
    const tr = document.createElement("tr");
    const pnlClass = m.pnl >= 0 ? "pos" : "neg";
    const avgPnl = m.pnl / m.days;
    tr.innerHTML = `
      <td>${ym}</td>
      <td>${m.days}</td>
      <td class="${pnlClass}">$${fmt2(m.pnl)}</td>
      <td class="${avgPnl >= 0 ? 'pos' : 'neg'}">$${fmt2(avgPnl)}</td>
      <td>${(m.wins / m.days * 100).toFixed(0)}%</td>
      <td>${m.tp}</td>
      <td>${m.sl}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderGrid() {
  const container = document.getElementById("grid-table");
  const grid = DATA.grid;
  const tps = [...new Set(grid.map(g => g.tp))].sort((a, b) => a - b);
  const sls = [...new Set(grid.map(g => g.sl))].sort((a, b) => a - b);

  const corner = document.createElement("div");
  corner.className = "gh";
  corner.textContent = "TP \\ SL";
  container.appendChild(corner);
  for (const sl of sls) {
    const h = document.createElement("div");
    h.className = "gh";
    h.textContent = "$" + (sl / 1000) + "K";
    container.appendChild(h);
  }

  const maxAbs = Math.max(...grid.map(g => Math.abs(g.total_pnl)));

  for (const tp of tps) {
    const rh = document.createElement("div");
    rh.className = "gh";
    rh.textContent = "$" + (tp / 1000) + "K";
    container.appendChild(rh);
    for (const sl of sls) {
      const cell = grid.find(g => g.tp === tp && g.sl === sl);
      const div = document.createElement("div");
      div.className = "gc";
      if (cell) {
        const v = cell.total_pnl;
        const intensity = Math.min(1, Math.abs(v) / maxAbs);
        const alpha = 0.15 + intensity * 0.7;
        div.style.background = v >= 0
          ? `rgba(63, 185, 80, ${alpha})`
          : `rgba(248, 81, 73, ${alpha})`;
        div.textContent = "$" + fmt(v);
        div.title = `TP=$${tp}/SL=$${sl}: $${fmt(v)} 累计 / 胜率 ${cell.win_rate.toFixed(1)}%`;
        if (tp === CURRENT_STRATEGY.tp && sl === CURRENT_STRATEGY.sl) div.classList.add("best");
      }
      container.appendChild(div);
    }
  }
}

async function openDay(date) {
  const detail = document.getElementById("day-detail");
  detail.style.display = "block";
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("day-detail-title").textContent = `📅 ${date} 当日汇总`;
  document.getElementById("day-kline-wrap").style.display = "none";

  // Always show summary from results.json
  const dayMeta = DATA.daily.find(d => d.date === date);
  if (!dayMeta) {
    document.getElementById("day-detail-body").innerHTML = `<p class="hint">该日无数据</p>`;
    document.getElementById("day-detail-summary").innerHTML = "";
    return;
  }
  const pnlClr = dayMeta.pnl >= 0 ? "#3fb950" : "#f85149";
  document.getElementById("day-detail-summary").innerHTML = `
    <span><b>停止原因</b> ${dayMeta.stopped_by}</span>
    <span><b>当日盈亏</b> <em style="color:${pnlClr}">${fmtMoney(dayMeta.pnl)}</em></span>
    <span><b>开奖期数</b> ${dayMeta.draws}</span>
    <span><b>下注笔数</b> ${dayMeta.total_bets}</span>
    <span><b>胜利</b> ${dayMeta.total_wins}</span>
    <span><b>胜率</b> ${dayMeta.win_rate}%</span>
    <span><b>触发次数</b> ${dayMeta.triggers}</span>
  `;

  if (!dayMeta.has_detail) {
    document.getElementById("bets-count").textContent = dayMeta.total_bets;
    document.getElementById("draws-count").textContent = dayMeta.draws;
    document.getElementById("trig-count").textContent = dayMeta.triggers;
    document.getElementById("day-detail-body").innerHTML = `
      <div class="no-detail">
        <p class="hint"><b>该日逐笔明细未保存。</b>仅最近 7 天保留完整开奖 + 逐笔下注流水（数据量太大无法全量上线，您看到的"当日汇总"是从全量回测数据中取的真实统计）。</p>
        <p class="hint">最近 7 天可点开看明细的日期: ${DATA.daily.filter(d => d.has_detail).map(d => d.date).join(", ")}</p>
      </div>`;
    return;
  }

  // Has detail: load day file
  document.getElementById("day-detail-body").innerHTML = `<p class="hint">加载逐笔明细中…</p>`;
  if (!dayCache[date]) {
    try {
      const r = await fetch(`data/days_${CURRENT_STRATEGY.id}/${date}.json`);
      dayCache[date] = await r.json();
    } catch (e) {
      document.getElementById("day-detail-body").innerHTML = `<p class="hint">加载失败: ${e.message}</p>`;
      return;
    }
  }
  currentDay = dayCache[date];

  // Group bets by issue (per-issue rendering)
  const betsByIssue = {};
  for (const b of currentDay.bets) {
    const issue = b[0];
    if (!betsByIssue[issue]) betsByIssue[issue] = [];
    betsByIssue[issue].push(b);
  }
  currentDay._betsByIssue = betsByIssue;
  currentDay._issueCount = Object.keys(betsByIssue).length;

  document.getElementById("bets-count").textContent = currentDay._issueCount;
  document.getElementById("draws-count").textContent = currentDay.draws.length;
  document.getElementById("trig-count").textContent = currentDay.triggers.length;

  renderKline();
  renderDayBody();
}

function renderKline() {
  const wrap = document.getElementById("day-kline-wrap");
  const container = document.getElementById("day-kline");
  container.innerHTML = "";
  wrap.style.display = "block";

  if (!currentDay || !currentDay.bets.length) {
    wrap.style.display = "none";
    return;
  }

  // 按时间转 ts
  const issueIdx = {};
  for (const dr of currentDay.draws) issueIdx[dr[0]] = dr[1]; // issue → "HH:MM:SS"

  // 每 30 分钟一根 K 线
  const BUCKET = 30 * 60;
  const buckets = {};
  for (const b of currentDay.bets) {
    const issue = b[0];
    const t = issueIdx[issue] || "00:00:00";
    const [hh, mm, ss] = t.split(":").map(Number);
    const ts = hh * 3600 + mm * 60 + ss;
    const bucket = Math.floor(ts / BUCKET) * BUCKET;
    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(b[8] - 10000); // pnl after this bet
  }

  // Inject seed point at day-start (0 PnL) so first bucket isn't empty-open
  const sortedBuckets = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  let prevClose = 0;
  const candles = [];
  for (const bk of sortedBuckets) {
    const ps = buckets[bk];
    const open = prevClose;
    const close = ps[ps.length - 1];
    const high = Math.max(open, ...ps);
    const low = Math.min(open, ...ps);
    candles.push({ time: bk, open, high, low, close });
    prevClose = close;
  }

  const chart = LightweightCharts.createChart(container, {
    layout: { background: { color: "#0d1117" }, textColor: "#8b949e" },
    grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
      borderColor: "#30363d",
      tickMarkFormatter: (ts) => {
        const h = Math.floor(ts / 3600);
        const m = Math.floor((ts % 3600) / 60);
        return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      },
    },
    rightPriceScale: { borderColor: "#30363d" },
    crosshair: { mode: 0 },
    height: 280,
    localization: {
      timeFormatter: (ts) => {
        const h = Math.floor(ts / 3600);
        const m = Math.floor((ts % 3600) / 60);
        return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      },
      priceFormatter: (v) => (v >= 0 ? "+" : "") + "$" + Math.round(v).toLocaleString(),
    },
  });
  const series = chart.addCandlestickSeries({
    upColor: "#3fb950",
    downColor: "#f85149",
    borderUpColor: "#3fb950",
    borderDownColor: "#f85149",
    wickUpColor: "#3fb950",
    wickDownColor: "#f85149",
  });
  series.setData(candles);
  chart.timeScale().fitContent();
}

function renderDayBody() {
  if (!currentDay) return;
  const body = document.getElementById("day-detail-body");
  const d = currentDay;

  // 建立 issue→time 索引 (从 draws), 以便 bets/triggers 显示时间
  const issueIdx = {};
  for (const dr of d.draws) issueIdx[dr[0]] = dr;

  if (currentTab === "bets") {
    const groups = d._betsByIssue || {};
    const issues = Object.keys(groups).map(Number).sort((a, b) => a - b);
    if (!issues.length) {
      body.innerHTML = `<p class="hint">本日无下注 (10 车道全程未触发同号 2 期)</p>`;
      return;
    }
    // draws issue → row
    const drawByIssue = {};
    for (const dr of d.draws) drawByIssue[dr[0]] = dr;

    let html = `<div class="trade-list">
      <div class="trade-row issue-row header">
        <span>时间</span><span>期号</span><span>开奖 (1→10)</span>
        <span>本期下注 (车道-押号 注码)</span><span>余额</span>
      </div>`;
    for (const issue of issues) {
      const bets = groups[issue];
      const draw = drawByIssue[issue]; // [issue, t, n01..n10]
      const t = draw ? draw[1] : "";
      const nums = draw ? draw.slice(2) : [];
      const lastBal = bets[bets.length - 1][8];

      const numsHtml = nums.map((n, i) => {
        // highlight a num if any bet in this issue had lane=i+1 and actual=n (that is the cell that decides win/lose for this lane)
        const matched = bets.some(b => b[1] === i + 1 && b[3] === n && b[2] === n);
        return `<span class="num ${matched ? 'hit' : ''}" style="width:20px;height:20px;line-height:20px;font-size:11px">${n}</span>`;
      }).join("");

      const chips = bets.map(b => {
        const [_issue, lane, tgt, actual, bet, round, win, delta, bal] = b;
        const cls = win ? "win" : "lose";
        const sign = win ? "✅" : "❌";
        return `<span class="lane-bet-chip ${cls}" title="第${round}期追号">
          <span class="ln">第${lane}道</span>→<span class="tn">${tgt}</span>
          <span class="am">$${bet}</span>
          ${sign}${win ? `<span class="pos">+${fmtMoney(delta)}</span>` : ``}
        </span>`;
      }).join("");

      html += `<div class="trade-row issue-row">
        <span>${t}</span>
        <span>${issue}</span>
        <div class="draw-nums">${numsHtml}</div>
        <div class="lane-bets">${chips}</div>
        <span>${fmtMoney(lastBal)}</span>
      </div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
  } else if (currentTab === "draws") {
    let html = `<div class="trade-list">
      <div class="trade-row draw-header">
        <span>时间</span><span>期号</span>
        ${[1,2,3,4,5,6,7,8,9,10].map(i => `<span>第${i}名</span>`).join("")}
      </div>`;
    for (const dr of d.draws) {
      const [issue, t, ...nums] = dr;
      html += `<div class="trade-row draw">
        <span>${t}</span>
        <span>${issue}</span>
        ${nums.map(n => `<span class="num">${n}</span>`).join("")}
      </div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
  } else if (currentTab === "triggers") {
    if (!d.triggers.length) {
      body.innerHTML = `<p class="hint">本日无触发</p>`;
      return;
    }
    let html = `<div class="trade-list">
      <div class="trade-row header">
        <span>触发期号</span><span>触发时间</span><span>车道</span><span>追号</span>
      </div>`;
    for (const tr of d.triggers) {
      const [issue, lane, tgt] = tr;
      const tt = issueIdx[issue] ? issueIdx[issue][1] : "";
      html += `<div class="trade-row trigger">
        <span>${issue}</span>
        <span>${tt}</span>
        <span>第${lane}名</span>
        <span class="num">${tgt}</span>
      </div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
  }
}

function closeDayDetail() {
  const el = document.getElementById("day-detail");
  if (el) el.style.display = "none";
  const kl = document.getElementById("day-kline-wrap");
  if (kl) kl.style.display = "none";
  currentDay = null;
}

async function switchStrategy(id) {
  CURRENT_STRATEGY = STRATEGIES.find(s => s.id === id);
  document.getElementById("strategy-desc").textContent = CURRENT_STRATEGY.desc;
  location.hash = id;
  await loadStrategyData(id);
}

window.openDay = openDay;
window.closeDayDetail = closeDayDetail;

load();
