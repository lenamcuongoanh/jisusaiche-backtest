const fmt = n => (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt2 = n => (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let DATA = null;

async function load() {
  const r = await fetch("data/results.json");
  DATA = await r.json();
  renderKPI();
  renderEquity();
  renderHeatmap();
  renderMonthly();
  renderGrid();
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

  // Set sign colors
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

function renderHeatmap() {
  const container = document.getElementById("heatmap");
  // Build a tooltip
  const tip = document.createElement("div");
  tip.id = "tooltip";
  document.body.appendChild(tip);

  // Use first date as Sunday-of-week anchor
  const byDate = {};
  for (const d of DATA.daily) byDate[d.date] = d;

  const dates = DATA.daily.map(d => new Date(d.date));
  const start = new Date(dates[0]);
  // Align to start of week (Sunday=0)
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(dates[dates.length - 1]);

  const totalDays = Math.floor((end - start) / 86400000);
  const totalWeeks = Math.ceil(totalDays / 7) + 1;
  container.style.gridTemplateColumns = `repeat(${totalWeeks}, 1fr)`;

  // Render: column-major (week by week)
  const cells = [];
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
      }
      cells.push(div);
    }
  }
  cells.forEach(c => container.appendChild(c));
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

  // Header row
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

  // Find max abs for color scale
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

load();
