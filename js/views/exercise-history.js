/* ============================================================
   exercise-history.js — Historial completo de un ejercicio.
   Todas las sesiones finalizadas que lo contienen, con sus series.
   ============================================================ */

import { el, esc, fmtNum, fmtDate } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

export async function exerciseHistory(ctx) {
  const ex = await store.getExercise(ctx.params.id);
  if (!ex) {
    return { title: 'Historial', back: '#/exercises', node: el('<div class="empty"><p>Ejercicio no encontrado.</p></div>') };
  }

  const node = el('<div></div>');
  const u = unitLabel();
  const h = await store.exerciseHistory(ex.id);

  node.appendChild(el(`
    <div class="card">
      <div style="font-weight:800;font-size:18px">${esc(ex.name)}</div>
      <div class="sub muted">${h.sessionCount} sesion${h.sessionCount === 1 ? '' : 'es'} con este ejercicio</div>
    </div>`));

  if (!h.sessionCount) {
    node.appendChild(el('<div class="empty"><p>Sin registros todavía.</p><p class="faint">Aparecerá aquí cuando lo entrenes en una sesión finalizada.</p></div>'));
    return { title: 'Historial', back: '#/exercises', node };
  }

  // Resumen
  node.appendChild(el(`
    <div class="stat-grid mt">
      <div class="stat"><div class="val">${fmtNum(h.bestWeight)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Peso máximo</div></div>
      <div class="stat"><div class="val">${fmtNum(h.best1RM)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Mejor 1RM est.</div></div>
      <div class="stat"><div class="val">${fmtNum(h.totalVolume)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Volumen total</div></div>
      <div class="stat"><div class="val">${h.totalSets}</div><div class="lbl">Series totales</div></div>
    </div>`));

  // Acceso a la gráfica de progreso (informes)
  const reportBtn = el('<button class="btn ghost block mt" id="go-reports">Ver gráfica de progreso</button>');
  reportBtn.onclick = () => navigate('#/reports');
  node.appendChild(reportBtn);

  // Sesiones (más reciente primero)
  node.appendChild(el('<div class="section-title">Sesiones</div>'));
  const best = h.bestWeight;
  for (const e of h.entries) {
    const card = el('<div class="card clickable" style="margin-bottom:10px"></div>');
    card.appendChild(el(`
      <div class="row between" style="margin-bottom:8px">
        <div style="font-weight:700">${fmtDate(e.date)}${e.unilateral ? ' · Unilateral ×2' : ''}</div>
        <span class="badge">${fmtNum(e.volume)} ${esc(u)}</span>
      </div>`));
    const rows = e.sets.map((st, i) => {
      const isBest = st.weight > 0 && st.weight === best;
      return `<tr${isBest ? ' style="color:var(--primary);font-weight:700"' : ''}>
        <td class="set-idx">${i + 1}</td>
        <td>${fmtNum(st.reps)}</td>
        <td>${fmtNum(st.weight)} ${esc(u)}</td>
        <td>${st.rpe != null ? 'RPE ' + fmtNum(st.rpe) : ''}</td>
      </tr>`;
    }).join('');
    card.appendChild(el(`
      <table class="sets-table">
        <thead><tr><th class="set-idx">#</th><th>Reps</th><th>Peso</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`));
    card.onclick = () => navigate(`#/session/${e.sessionId}/summary`);
    node.appendChild(card);
  }

  return { title: 'Historial', back: '#/exercises', node };
}
