const fmt = n => (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt2 = n => (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = n => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let DATA = null;
let monthCache = {};
let currentDay = null;
let currentTab = "bets";

async function load() {
  const r = await fetch("data/results.json");
  DATA = await r.json();
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

function renderKPI() {
  const s = DATA.summary;
  document.getElementById("kpi-total").textContent = "$" + fmt(s.total_pnl);
  document.getElementById("kpi-avg").textContent = "$" + fmt2(s.avg_pnl);
  const wpct = (s.win_days / s.total_days * 100).toFixed(1);
  document.getElementById("kpi-winrate").textContent = wpct + "%";
  document.getElementById("kpi-winsub").textContent = `${s.win_days} 盈 / ${s.loss_days} 亏 / ${s.total_days} 总`;
  document.getElementById("kpi-bust").textContent = s.bust_days;
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
  new Chart(ctx, {
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
        if (tp === 3000 && sl === 5000) div.classList.add("best");
      }
      container.appendChild(div);
    }
  }
}

async function openDay(date) {
  const detail = document.getElementById("day-detail");
  detail.style.display = "block";
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("day-detail-title").textContent = `📅 ${date} 全日明细`;
  document.getElementById("day-detail-body").innerHTML = `<p class="hint">加载中… (按月加载, 首次约 4MB)</p>`;

  const ym = date.slice(0, 7);
  if (!monthCache[ym]) {
    try {
      const r = await fetch(`data/months/${ym}.json`);
      if (!r.ok) {
        document.getElementById("day-detail-body").innerHTML = `<p class="hint">该月明细未保存（仅最近 12 个月可点开查看，更早数据见图表/月度统计）</p>`;
        return;
      }
      monthCache[ym] = await r.json();
    } catch (e) {
      document.getElementById("day-detail-body").innerHTML = `<p class="hint">加载失败: ${e.message}</p>`;
      return;
    }
  }
  if (!monthCache[ym][date]) {
    document.getElementById("day-detail-body").innerHTML = `<p class="hint">该日无数据</p>`;
    return;
  }
  currentDay = monthCache[ym][date];

  // Summary
  const d = currentDay;
  const pnlClr = d.pnl >= 0 ? "#3fb950" : "#f85149";
  document.getElementById("day-detail-summary").innerHTML = `
    <span><b>停止原因</b> ${d.stopped_by}</span>
    <span><b>当日盈亏</b> <em style="color:${pnlClr}">${fmtMoney(d.pnl)}</em></span>
    <span><b>开奖期数</b> ${d.n_draws}</span>
    <span><b>下注笔数</b> ${d.total_bets}</span>
    <span><b>胜利</b> ${d.total_wins}</span>
    <span><b>胜率</b> ${d.win_rate}%</span>
    <span><b>触发次数</b> ${d.triggers.length}</span>
  `;

  // Tab counts
  document.getElementById("bets-count").textContent = d.bets.length;
  document.getElementById("draws-count").textContent = d.draws.length;
  document.getElementById("trig-count").textContent = d.triggers.length;

  renderDayBody();
}

function renderDayBody() {
  if (!currentDay) return;
  const body = document.getElementById("day-detail-body");
  const d = currentDay;

  // 建立 issue→time 索引 (从 draws), 以便 bets/triggers 显示时间
  const issueIdx = {};
  for (const dr of d.draws) issueIdx[dr[0]] = dr;

  if (currentTab === "bets") {
    if (!d.bets.length) {
      body.innerHTML = `<p class="hint">本日无下注 (10 车道全程未触发同号 2 期)</p>`;
      return;
    }
    let html = `<div class="trade-list">
      <div class="trade-row header">
        <span>时间</span><span>期号</span><span>车道</span><span>追号</span>
        <span>开出</span><span>注码</span><span>第N期</span><span>结果</span><span>盈亏</span><span>余额</span>
      </div>`;
    for (const b of d.bets) {
      const [issue, lane, tgt, actual, bet, round, win, delta, bal] = b;
      const tt = issueIdx[issue] ? issueIdx[issue][1] : "";
      const cls = win ? "win" : "lose";
      const hit = actual === tgt;
      html += `<div class="trade-row ${cls}">
        <span>${tt}</span>
        <span>${issue}</span>
        <span>第${lane}名</span>
        <span class="num">${tgt}</span>
        <span class="num ${hit ? 'hit' : ''}">${actual}</span>
        <span>$${bet}</span>
        <span>R${round}</span>
        <span>${win ? "✅ 中" : "❌ 未中"}</span>
        <span class="${win ? 'pos' : 'neg'}">${win ? "+" : ""}${fmtMoney(delta)}</span>
        <span>${fmtMoney(bal)}</span>
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
  document.getElementById("day-detail").style.display = "none";
  currentDay = null;
}

window.openDay = openDay;
window.closeDayDetail = closeDayDetail;

load();
