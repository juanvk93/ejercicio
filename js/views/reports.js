/* ============================================================
   reports.js — Informes y progresión.
   Filtro por periodo, resumen global, volumen por sesión,
   frecuencia y rachas, duración, volumen por grupo muscular,
   récords personales y progreso por ejercicio (con 1RM estimado).
   ============================================================ */

import { el, esc, fmtNum, fmtDateShort, fmtDuration, lineChart, barChart } from '../utils.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

/** Periodos del filtro global (toggle horizontal). `all` = todo el histórico. */
const PERIODS = [
  { key: 'all', label: 'Todo' },
  { key: '1a', label: '1A' },
  { key: 'ytd', label: 'YTD' },
  { key: '6m', label: '6M' },
  { key: '3m', label: '3M' },
  { key: '1m', label: '1M' },
  { key: '2s', label: '2S' },
];

/**
 * Timestamp (ms) de inicio del periodo, u `null` para "todo".
 * YTD = 1 de enero del año en curso; el resto se calcula con aritmética de
 * fechas reales (no días fijos) para respetar meses de distinta duración.
 */
function periodSince(key) {
  if (key === 'all') return null;
  const now = new Date();
  if (key === 'ytd') return new Date(now.getFullYear(), 0, 1).getTime();
  const d = new Date(now);
  switch (key) {
    case '1a': d.setFullYear(d.getFullYear() - 1); break;
    case '6m': d.setMonth(d.getMonth() - 6); break;
    case '3m': d.setMonth(d.getMonth() - 3); break;
    case '1m': d.setMonth(d.getMonth() - 1); break;
    case '2s': d.setDate(d.getDate() - 14); break;
    default: return null;
  }
  return d.getTime();
}

const PR_VISIBLE = 8; // récords mostrados antes del botón "Ver todos"

export async function reports() {
  const node = el('<div></div>');

  // Sin ninguna sesión finalizada no hay nada que informar.
  const hasAny = (await store.globalStats()).sessionCount > 0;
  if (!hasAny) {
    node.appendChild(el(`
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
        <p>Aún no hay datos de progreso.</p>
        <p class="faint">Finaliza alguna sesión para ver tus informes.</p>
      </div>`));
    return { title: 'Informes', back: false, node };
  }

  // ---- Estado de la vista (sobrevive a los repintados por cambio de periodo)
  let period = 'all';
  let currentExerciseId = '';
  let currentMetric = 'topWeight';
  let prTag = ''; // filtro de etiqueta en récords personales ('' = todos)

  const exercises = await store.listExercises();
  const prs = await store.personalRecords(); // siempre sobre todo el histórico
  const tags = await store.allTags();

  // ---- Filtro de periodo (toggle horizontal)
  const toggle = el(`<div class="period-toggle mb">${PERIODS.map((p) =>
    `<button class="${p.key === period ? 'active' : ''}" data-period="${p.key}">${esc(p.label)}</button>`).join('')}</div>`);
  node.appendChild(toggle);
  toggle.querySelectorAll('[data-period]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.period === period) return;
      period = b.dataset.period;
      toggle.querySelectorAll('[data-period]').forEach((x) => x.classList.toggle('active', x === b));
      render();
    };
  });

  const content = el('<div></div>');
  node.appendChild(content);

  async function render() {
    const since = periodSince(period);
    const u = unitLabel();

    const [g, freq, dur, byTag, weeklySets, balance, rpe] = await Promise.all([
      store.globalStats({ since }),
      store.frequencyStats({ since }),
      store.durationStats({ since }),
      store.volumeByTag({ since }),
      store.weeklySetsByTag(),
      store.muscleBalance({ since }),
      store.rpeTrend({ since }),
    ]);

    content.innerHTML = '';

    if (!g.sessionCount) {
      content.appendChild(el('<div class="card"><div class="empty"><p>No hay sesiones en este periodo.</p></div></div>'));
    } else {
      // ---- Resumen global
      content.appendChild(el(`
        <div class="stat-grid">
          <div class="stat"><div class="val">${g.sessionCount}</div><div class="lbl">Sesiones</div></div>
          <div class="stat"><div class="val">${fmtNum(g.totalVolume)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Volumen total</div></div>
          <div class="stat"><div class="val">${g.totalSets}</div><div class="lbl">Series</div></div>
          <div class="stat"><div class="val">${g.totalReps}</div><div class="lbl">Repeticiones</div></div>
        </div>`));

      // ---- Volumen por sesión
      content.appendChild(el('<div class="section-title">Volumen por sesión</div>'));
      const volPoints = g.volumeByDate.map((d) => ({ x: fmtDateShort(d.date), y: d.volume }));
      content.appendChild(el(`<div class="card">${lineChart(volPoints, { unit: u })}</div>`));

      // ---- Frecuencia y constancia
      content.appendChild(el('<div class="section-title">Frecuencia y constancia</div>'));
      content.appendChild(el(`
        <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><div class="val">${freq.currentStreak}<span class="unit"> sem</span></div><div class="lbl">Racha actual</div></div>
          <div class="stat"><div class="val">${freq.bestStreak}<span class="unit"> sem</span></div><div class="lbl">Mejor racha</div></div>
          <div class="stat"><div class="val">${fmtNum(freq.avgPerWeek)}</div><div class="lbl">Sesiones/semana</div></div>
        </div>`));
      const weekPoints = freq.weeks.map((w) => ({ x: fmtDateShort(w.start), y: w.count }));
      content.appendChild(el(`<div class="card mt">${barChart(weekPoints)}<div class="faint center" style="font-size:12px;margin-top:6px">Sesiones por semana</div></div>`));

      // ---- Duración de los entrenamientos
      content.appendChild(el('<div class="section-title">Duración de los entrenamientos</div>'));
      if (!dur.count) {
        content.appendChild(el('<div class="card"><div class="empty"><p>Sin sesiones con hora de inicio y fin.</p></div></div>'));
      } else {
        content.appendChild(el(`
          <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
            <div class="stat"><div class="val">${fmtDuration(dur.avgMs)}</div><div class="lbl">Media</div></div>
            <div class="stat"><div class="val">${fmtDuration(dur.longestMs)}</div><div class="lbl">Más largo</div></div>
            <div class="stat"><div class="val">${fmtDuration(dur.totalMs)}</div><div class="lbl">Tiempo total</div></div>
          </div>`));
        const durPoints = dur.series.map((d) => ({ x: fmtDateShort(d.date), y: Math.round(d.ms / 60000) }));
        content.appendChild(el(`<div class="card mt">${lineChart(durPoints, { unit: 'min' })}<div class="faint center" style="font-size:12px;margin-top:6px">Minutos por sesión</div></div>`));
      }

      // ---- Tendencia de RPE (fatiga)
      if (rpe.length >= 2) {
        content.appendChild(el('<div class="section-title">Tendencia de RPE</div>'));
        const rpePoints = rpe.map((d) => ({ x: fmtDateShort(d.date), y: d.avgRpe }));
        content.appendChild(el(`<div class="card">${lineChart(rpePoints, { unit: '' })}<div class="faint center" style="font-size:12px;margin-top:6px">RPE medio por sesión</div></div>`));
      }

      // ---- Volumen por grupo muscular (etiqueta)
      content.appendChild(el('<div class="section-title">Volumen por grupo muscular</div>'));
      if (!byTag.length) {
        content.appendChild(el('<div class="card"><div class="empty"><p>Aún no hay volumen por etiqueta.</p></div></div>'));
      } else {
        const max = Math.max(...byTag.map((t) => t.volume)) || 1;
        const card = el('<div class="card"></div>');
        for (const t of byTag) {
          const pct = Math.max(2, Math.round((t.volume / max) * 100));
          card.appendChild(el(`
            <div style="margin-bottom:12px">
              <div class="row between" style="font-size:13px;margin-bottom:5px">
                <span style="font-weight:700">${esc(t.tag)}</span>
                <span class="muted">${fmtNum(t.volume)} ${esc(u)} · ${t.sets} series</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
            </div>`));
        }
        content.appendChild(card);
      }

      // ---- Series por grupo muscular (últimos 7 días) — clave en hipertrofia
      content.appendChild(el('<div class="section-title">Series por grupo · últimos 7 días</div>'));
      if (!weeklySets.length) {
        content.appendChild(el('<div class="card"><div class="empty"><p>Sin series en los últimos 7 días.</p></div></div>'));
      } else {
        const maxSets = Math.max(...weeklySets.map((t) => t.sets), 20);
        const card = el('<div class="card"></div>');
        for (const t of weeklySets) {
          const zone = t.sets < 10 ? { c: 'var(--warning)', l: 'bajo' }
            : (t.sets <= 20 ? { c: 'var(--success)', l: 'óptimo' } : { c: 'var(--primary)', l: 'alto' });
          const pct = Math.max(3, Math.round((t.sets / maxSets) * 100));
          card.appendChild(el(`
            <div style="margin-bottom:12px">
              <div class="row between" style="font-size:13px;margin-bottom:5px">
                <span style="font-weight:700">${esc(t.tag)}</span>
                <span class="muted">${t.sets} series · <span style="color:${zone.c}">${zone.l}</span></span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${zone.c}"></div></div>
            </div>`));
        }
        card.appendChild(el('<div class="faint" style="font-size:12px;margin-top:4px">Referencia hipertrofia: ~10–20 series por grupo y semana.</div>'));
        content.appendChild(card);
      }

      // ---- Equilibrio muscular (empuje/tirón y superior/inferior)
      const balTotal = balance.push + balance.pull + balance.legs + balance.core + balance.other;
      if (balTotal > 0) {
        content.appendChild(el('<div class="section-title">Equilibrio muscular</div>'));
        const card = el('<div class="card"></div>');
        const pairBar = (la, va, lb, vb) => {
          const tot = va + vb;
          const pa = tot > 0 ? Math.round((va / tot) * 100) : 50;
          return `
            <div style="margin-bottom:14px">
              <div class="row between" style="font-size:13px;margin-bottom:5px">
                <span style="font-weight:700">${la} · ${pa}%</span>
                <span style="font-weight:700">${100 - pa}% · ${lb}</span>
              </div>
              <div class="bar-track" style="display:flex">
                <div style="width:${pa}%;background:var(--primary);height:100%"></div>
                <div style="width:${100 - pa}%;background:var(--primary-dim);height:100%"></div>
              </div>
            </div>`;
        };
        card.innerHTML = pairBar('Empuje', balance.push, 'Tirón', balance.pull)
          + pairBar('Sup.', balance.push + balance.pull, 'Inf.', balance.legs);
        if (balance.other > 0) {
          card.appendChild(el(`<div class="faint" style="font-size:12px">Otros (sin clasificar): ${fmtNum(balance.other)} ${esc(u)}</div>`));
        }
        content.appendChild(card);
      }
    }

    // ---- Récords personales (siempre sobre todo el histórico)
    content.appendChild(el('<div class="section-title">Récords personales</div>'));
    if (!prs.length) {
      content.appendChild(el('<div class="card"><div class="empty"><p>Aún no hay récords registrados.</p></div></div>'));
    } else {
      const card = el('<div class="card"></div>');
      const prRow = (r) => el(`
        <div class="pr-item">
          <div class="row between" style="margin-bottom:4px">
            <span style="font-weight:700">${esc(r.name)}${r.isRecent ? ' <span class="badge">Nuevo PR</span>' : ''}</span>
            <span class="faint" style="font-size:12px">${fmtDateShort(r.best1RM.date)}</span>
          </div>
          <div class="row muted" style="gap:14px;font-size:13px;flex-wrap:wrap">
            <span>Peso máx <b>${fmtNum(r.topWeight.weight)} ${esc(u)}</b></span>
            <span>Mejor serie <b>${fmtNum(r.bestSet.weight)} × ${fmtNum(r.bestSet.reps)}</b></span>
            <span>1RM est. <b>${fmtNum(r.best1RM.value)} ${esc(u)}</b></span>
          </div>
        </div>`);

      // Filtro por etiqueta (grupo muscular)
      if (tags.length) {
        const sel = el('<select class="input mb"></select>');
        sel.appendChild(el('<option value="">Todos los grupos</option>'));
        for (const t of tags) sel.appendChild(el(`<option value="${esc(t)}"${t === prTag ? ' selected' : ''}>${esc(t)}</option>`));
        sel.onchange = () => { prTag = sel.value; fillPRs(); };
        card.appendChild(sel);
      }

      const list = el('<div></div>');
      card.appendChild(list);

      function fillPRs() {
        list.innerHTML = '';
        const filtered = prTag ? prs.filter((r) => (r.tags || []).includes(prTag)) : prs;
        if (!filtered.length) {
          list.appendChild(el('<div class="empty"><p>Sin récords para este grupo.</p></div>'));
          return;
        }
        for (const r of filtered.slice(0, PR_VISIBLE)) list.appendChild(prRow(r));
        if (filtered.length > PR_VISIBLE) {
          const more = el(`<button class="btn ghost mt" style="width:100%">Ver todos (${filtered.length})</button>`);
          more.onclick = () => {
            for (const r of filtered.slice(PR_VISIBLE)) list.insertBefore(prRow(r), more);
            more.remove();
          };
          list.appendChild(more);
        }
      }
      fillPRs();
      content.appendChild(card);
    }

    // ---- Progreso por ejercicio (selector + métrica)
    content.appendChild(el('<div class="section-title">Progreso por ejercicio</div>'));
    const card = el('<div class="card"></div>');
    const select = el('<select class="input mb"></select>');
    select.appendChild(el('<option value="">Selecciona un ejercicio…</option>'));
    for (const ex of exercises) select.appendChild(el(`<option value="${esc(ex.id)}">${esc(ex.name)}</option>`));
    select.value = currentExerciseId;
    card.appendChild(select);

    const metricRow = el(`
      <div class="chip-grid mb" hidden>
        <button class="chip${currentMetric === 'topWeight' ? ' selected' : ''}" data-metric="topWeight">Peso máximo</button>
        <button class="chip${currentMetric === 'est1RM' ? ' selected' : ''}" data-metric="est1RM">1RM est.</button>
        <button class="chip${currentMetric === 'volume' ? ' selected' : ''}" data-metric="volume">Volumen</button>
      </div>`);
    card.appendChild(metricRow);

    const chartHost = el('<div></div>');
    card.appendChild(chartHost);
    content.appendChild(card);

    let currentSeries = [];

    async function loadExercise(id) {
      currentExerciseId = id;
      if (!id) { metricRow.hidden = true; chartHost.innerHTML = ''; return; }
      currentSeries = await store.exerciseProgress(id, { since });
      metricRow.hidden = false;
      drawChart();
    }
    function drawChart() {
      if (!currentSeries.length) {
        chartHost.innerHTML = '<div class="empty"><p>Sin registros para este ejercicio en este periodo.</p></div>';
        return;
      }
      const points = currentSeries.map((s) => ({ x: fmtDateShort(s.date), y: s[currentMetric] }));
      chartHost.innerHTML = lineChart(points, { unit: u });
    }

    select.onchange = () => loadExercise(select.value);
    metricRow.querySelectorAll('[data-metric]').forEach((b) => {
      b.onclick = () => {
        currentMetric = b.dataset.metric;
        metricRow.querySelectorAll('[data-metric]').forEach((x) => x.classList.toggle('selected', x === b));
        drawChart();
      };
    });

    if (currentExerciseId) await loadExercise(currentExerciseId);
  }

  await render();
  return { title: 'Informes', back: false, node };
}
