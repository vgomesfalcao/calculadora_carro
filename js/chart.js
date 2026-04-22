let chartData = null;

function renderChart(globals, H, histAntigo, scenarioResults, bestOld) {
  const svg = $('chart_svg');
  const W = 900;
  const Ht = 500;
  const padL = 70;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const plotW = W - padL - padR;
  const plotH = Ht - padT - padB;

  const antigoLabel = bestOld ? `Manter ${bestOld.oldCar.name}` : 'Manter antigo';

  const allSeries = [
    { name: antigoLabel, color: ANTIGO_COLOR, data: histAntigo, isAntigo: true },
    ...scenarioResults.map(result => ({
      name: result.name,
      color: result.color,
      dashArray: result.dashArray,
      data: result.historico,
      isAntigo: false,
      detail: result.detail,
      type: result.type
    }))
  ];

  const allValues = allSeries.flatMap(series => series.data.map(point => point.patrimonio));
  const maxY = Math.max(...allValues) * 1.05;
  const minY = Math.min(...allValues, 0) * (Math.min(...allValues) < 0 ? 1.05 : 0.95);

  const xScale = mes => padL + (mes / H) * plotW;
  const yScale = value => padT + plotH - ((value - minY) / (maxY - minY)) * plotH;

  let html = '';
  const nGrid = 5;
  for (let index = 0; index <= nGrid; index++) {
    const value = minY + (maxY - minY) * (index / nGrid);
    const y = yScale(value);
    html += `<line class="chart-grid-line" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>`;
    html += `<text class="chart-axis-label" x="${padL - 8}" y="${y + 4}" text-anchor="end">${fmtBRL(value)}</text>`;
  }

  const nX = Math.min(6, H);
  for (let index = 0; index <= nX; index++) {
    const mes = Math.round((H * index) / nX);
    const x = xScale(mes);
    html += `<line class="chart-grid-line" x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke-dasharray="2,3"/>`;
    html += `<text class="chart-axis-label" x="${x}" y="${padT + plotH + 20}" text-anchor="middle">${mes}m</text>`;
  }

  html += `<line class="chart-axis-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}"/>`;
  html += `<line class="chart-axis-line" x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}"/>`;

  if (minY < 0) {
    const y0 = yScale(0);
    html += `<line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" stroke="#aaa" stroke-width="1" stroke-dasharray="4,4"/>`;
  }

  allSeries.forEach((series, index) => {
    const points = series.data.map(point => `${xScale(point.mes)},${yScale(point.patrimonio)}`).join(' ');
    html += `<polyline class="chart-line" points="${points}" stroke="${series.color}" stroke-dasharray="${series.dashArray || ''}" data-series="${index}"/>`;

    const last = series.data[series.data.length - 1];
    html += `<circle class="chart-dot" cx="${xScale(last.mes)}" cy="${yScale(last.patrimonio)}" r="5" stroke="${series.color}"/>`;
  });

  html += `<text class="chart-axis-label" x="${W / 2}" y="${Ht - 8}" text-anchor="middle" style="font-size:11px;">Meses</text>`;
  html += `<text class="chart-axis-label" x="15" y="${padT + plotH / 2}" text-anchor="middle" transform="rotate(-90 15 ${padT + plotH / 2})" style="font-size:11px;">Patrimônio (R$)</text>`;
  html += `<rect id="chart_overlay" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair;"/>`;

  svg.innerHTML = html;

  chartData = { globals, H, padL, padR, padT, padB, plotW, plotH, xScale, yScale, allSeries };

  const overlay = svg.querySelector('#chart_overlay');
  const tooltip = $('chart_tooltip');

  overlay.addEventListener('mousemove', event => {
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / Ht;
    const svgX = (event.clientX - rect.left) / scaleX;
    const mes = Math.round(((svgX - padL) / plotW) * H);
    if (mes < 0 || mes > H) {
      tooltip.classList.remove('show');
      return;
    }

    const tooltipRows = allSeries.map(series => {
      const point = series.data[Math.min(mes, series.data.length - 1)];
      return `<div class="tt-row">
        <span><span class="dot" style="background:${series.color}"></span>${escapeHTML(series.name)}</span>
        <strong>${fmtBRL(point.patrimonio)}</strong>
      </div>`;
    }).join('');

    tooltip.innerHTML = `<div class="tt-title">Mês ${mes}</div>${tooltipRows}`;
    tooltip.classList.add('show');

    const chartWrapRect = svg.parentElement.getBoundingClientRect();
    let tx = event.clientX - chartWrapRect.left + 14;
    let ty = event.clientY - chartWrapRect.top - 10;
    if (tx + 220 > chartWrapRect.width) tx = event.clientX - chartWrapRect.left - 230;
    if (ty + 200 > chartWrapRect.height) ty = chartWrapRect.height - 210;
    if (ty < 0) ty = 10;
    tooltip.style.left = `${tx}px`;
    tooltip.style.top = `${ty}px`;

    const existing = svg.querySelector('.hover-line');
    if (existing) existing.remove();
    const hoverX = xScale(mes);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'hover-line');
    line.setAttribute('x1', hoverX);
    line.setAttribute('x2', hoverX);
    line.setAttribute('y1', padT);
    line.setAttribute('y2', padT + plotH);
    line.setAttribute('stroke', '#000');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '3,3');
    line.setAttribute('opacity', '0.4');
    svg.appendChild(line);
  });

  overlay.addEventListener('mouseleave', () => {
    tooltip.classList.remove('show');
    const existing = svg.querySelector('.hover-line');
    if (existing) existing.remove();
  });
}

function renderLegendAndRanking(globals, H, histAntigo, scenarioResults, bestOld, oldCarCount) {
  const antigoLabel = bestOld ? `Manter ${bestOld.oldCar.name}` : 'Manter antigo';
  const antigoExtra = bestOld && oldCarCount > 1
    ? `melhor entre ${oldCarCount} antigos`
    : 'sem compra de carro';

  const legendEl = $('chart_legend');
  const items = [
    { name: antigoLabel, color: ANTIGO_COLOR, extra: antigoExtra },
    ...scenarioResults.map(result => ({
      name: result.name,
      color: result.color,
      extra: result.detail || '',
      dashArray: result.dashArray || ''
    }))
  ];
  legendEl.innerHTML = items.map(item => `
    <div class="legend-item">
      <span class="legend-line" style="background:${item.color}; ${item.dashArray ? 'mask-image: repeating-linear-gradient(90deg, #000 0 10px, transparent 10px 16px); -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 10px, transparent 10px 16px);' : ''}"></span>
      <span><strong>${escapeHTML(item.name)}</strong> ${item.extra ? `<span style="color:var(--ink-mute);">· ${escapeHTML(item.extra)}</span>` : ''}</span>
    </div>
  `).join('');

  const antigoFinal = histAntigo[histAntigo.length - 1].patrimonio;
  const ranking = [
    { name: antigoLabel, color: ANTIGO_COLOR, patrimonio: antigoFinal, detail: antigoExtra, isAntigo: true },
    ...scenarioResults.map(result => ({
      name: result.name,
      color: result.color,
      patrimonio: result.finalPatrimonio,
      detail: result.detail,
      isAntigo: false
    }))
  ].sort((left, right) => right.patrimonio - left.patrimonio);

  const tableEl = $('ranking_table');
  tableEl.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Cenário</th>
        <th>Detalhes</th>
        <th>Patrimônio em ${H}m</th>
        <th>vs manter antigo</th>
      </tr>
    </thead>
    <tbody>
      ${ranking.map((row, index) => {
        const posClass = index === 0 ? 'p1' : index === 1 ? 'p2' : index === 2 ? 'p3' : '';
        const delta = row.patrimonio - antigoFinal;
        const deltaClass = delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : '';
        const deltaStr = row.isAntigo ? '—' : `${delta >= 0 ? '+' : ''}${fmtBRL(delta)}`;
        return `
          <tr>
            <td class="pos ${posClass}">${index + 1}º</td>
            <td>
              <span class="car-dot" style="background:${row.color}"></span>
              ${escapeHTML(row.name)}
            </td>
            <td style="font-size:0.78rem; color:var(--ink-mute);">${escapeHTML(row.detail)}</td>
            <td style="font-weight:700;">${fmtBRL(row.patrimonio)}</td>
            <td class="${deltaClass}">${deltaStr}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
}
