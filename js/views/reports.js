/* ============================================================
   reports.js — Informes y progresión.
   Resumen global, volumen por sesión y progreso por ejercicio.
   ============================================================ */

import { el, esc, fmtNum, fmtDateShort, lineChart } from '../utils.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

export async function reports() {
  const node = el('<div></div>');
  const g = await store.globalStats();

  if (!g.sessionCount) {
    node.appendChild(el(`
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
        <p>Aún no hay datos de progreso.</p>
        <p class="faint">Finaliza alguna sesión para ver tus informes.</p>
      </div>`));
    return { title: 'Informes', back: false, node };
  }

  // Resumen global
  node.appendChild(el(`
    <div class="stat-grid">
      <div class="stat"><div class="val">${g.sessionCount}</div><div class="lbl">Sesiones</div></div>
      <div class="stat"><div class="val">${fmtNum(g.totalVolume)}<span class="unit"> ${esc(unitLabel())}</span></div><div class="lbl">Volumen total</div></div>
      <div class="stat"><div class="val">${g.totalSets}</div><div class="lbl">Series</div></div>
      <div class="stat"><div class="val">${g.totalReps}</div><div class="lbl">Repeticiones</div></div>
    </div>`));

  // Volumen por sesión
  node.appendChild(el('<div class="section-title">Volumen por sesión</div>'));
  const volPoints = g.volumeByDate.map((d) => ({ x: fmtDateShort(d.date), y: d.volume }));
  node.appendChild(el(`<div class="card">${lineChart(volPoints, { unit: 'kg' })}</div>`));

  // Progreso por ejercicio (selector)
  node.appendChild(el('<div class="section-title">Progreso por ejercicio</div>'));
  const exercises = await store.listExercises();
  const card = el('<div class="card"></div>');
  const select = el('<select class="input mb"></select>');
  select.appendChild(el('<option value="">Selecciona un ejercicio…</option>'));
  for (const ex of exercises) select.appendChild(el(`<option value="${esc(ex.id)}">${esc(ex.name)}</option>`));
  card.appendChild(select);

  const metricRow = el(`
    <div class="chip-grid mb" id="metric-row" hidden>
      <button class="chip selected" data-metric="topWeight">Peso máximo</button>
      <button class="chip" data-metric="volume">Volumen</button>
    </div>`);
  card.appendChild(metricRow);

  const chartHost = el('<div></div>');
  card.appendChild(chartHost);
  node.appendChild(card);

  let currentMetric = 'topWeight';
  let currentSeries = [];

  async function loadExercise(id) {
    if (!id) { metricRow.hidden = true; chartHost.innerHTML = ''; return; }
    currentSeries = await store.exerciseProgress(id);
    metricRow.hidden = false;
    drawChart();
  }
  function drawChart() {
    if (!currentSeries.length) {
      chartHost.innerHTML = '<div class="empty"><p>Sin registros para este ejercicio.</p></div>';
      return;
    }
    const points = currentSeries.map((s) => ({ x: fmtDateShort(s.date), y: s[currentMetric] }));
    const unit = currentMetric === 'volume' ? 'kg' : 'kg';
    chartHost.innerHTML = lineChart(points, { unit });
  }

  select.onchange = () => loadExercise(select.value);
  metricRow.querySelectorAll('[data-metric]').forEach((b) => {
    b.onclick = () => {
      currentMetric = b.dataset.metric;
      metricRow.querySelectorAll('[data-metric]').forEach((x) => x.classList.toggle('selected', x === b));
      drawChart();
    };
  });

  return { title: 'Informes', back: false, node };
}
