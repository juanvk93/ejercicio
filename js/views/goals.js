/* ============================================================
   goals.js — Objetivos por ejercicio (peso máximo o 1RM est.).
   Barra de progreso calculada con los récords personales.
   ============================================================ */

import { el, esc, num, fmtNum, toast, showModal, confirmDialog } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

const METRIC_LABEL = { topWeight: 'Peso máximo', est1RM: '1RM estimado' };

export async function goals() {
  const node = el('<div></div>');
  const u = unitLabel();
  const exercises = await store.listExercises();

  const addBtn = el('<button class="btn primary block" id="add">+ Nuevo objetivo</button>');
  addBtn.onclick = () => {
    if (!exercises.length) { toast('Crea algún ejercicio primero', 'error'); return; }
    openForm(null, exercises);
  };
  node.appendChild(addBtn);

  const progress = await store.goalProgress();
  if (!progress.length) {
    node.appendChild(el(`
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        <p>Aún no tienes objetivos.</p>
        <p class="faint">Marca una meta (p. ej. "Press banca 100 kg") y sigue su progreso.</p>
      </div>`));
    return { title: 'Objetivos', back: '#/settings', node };
  }

  const list = el('<div class="mt"></div>');
  for (const g of progress) {
    const card = el('<div class="card" style="margin-bottom:12px"></div>');
    card.appendChild(el(`
      <div class="row between" style="margin-bottom:6px">
        <div style="font-weight:700">${esc(g.name)}${g.achieved ? ' <span class="badge" style="background:var(--success);color:#fff">¡Logrado!</span>' : ''}</div>
        <div class="row" style="gap:2px">
          <button class="icon-btn" data-act="edit" aria-label="Editar" style="width:32px;height:32px">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button class="icon-btn" data-act="del" aria-label="Eliminar" style="width:32px;height:32px">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      </div>
      <div class="row between" style="font-size:13px;margin-bottom:6px">
        <span class="muted">${esc(METRIC_LABEL[g.metric])}</span>
        <span class="muted"><b style="color:var(--text)">${fmtNum(g.current)}</b> / ${fmtNum(g.target)} ${esc(u)} · ${g.pct}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, g.pct)}%${g.achieved ? ';background:var(--success)' : ''}"></div></div>`));
    card.querySelector('[data-act="edit"]').onclick = () => openForm(g, exercises);
    card.querySelector('[data-act="del"]').onclick = async () => {
      if (await confirmDialog('¿Eliminar este objetivo?')) {
        await store.deleteGoal(g.id);
        toast('Objetivo eliminado', 'success');
        navigate('#/goals');
      }
    };
    list.appendChild(card);
  }
  node.appendChild(list);

  return { title: 'Objetivos', back: '#/settings', node };
}

function openForm(goal, exercises) {
  const isEdit = !!goal;
  const content = el(`
    <div>
      <div class="field">
        <label>Ejercicio</label>
        <select class="input" id="g-ex"></select>
      </div>
      <div class="field">
        <label>Métrica</label>
        <div class="chip-grid" id="g-metric">
          <button class="chip" type="button" data-metric="topWeight">Peso máximo</button>
          <button class="chip" type="button" data-metric="est1RM">1RM estimado</button>
        </div>
      </div>
      <div class="field">
        <label>Objetivo (${esc(unitLabel())})</label>
        <input class="input" type="number" inputmode="decimal" min="0" step="0.5" id="g-target" value="${goal ? goal.target : ''}" placeholder="0">
      </div>
      <button class="btn primary block" id="save">${isEdit ? 'Guardar cambios' : 'Crear objetivo'}</button>
    </div>`);

  const sel = content.querySelector('#g-ex');
  for (const ex of exercises) sel.appendChild(el(`<option value="${esc(ex.id)}">${esc(ex.name)}</option>`));
  if (goal) sel.value = goal.exerciseId;

  let metric = goal ? goal.metric : 'topWeight';
  const paintMetric = () => content.querySelectorAll('[data-metric]').forEach((b) => b.classList.toggle('selected', b.dataset.metric === metric));
  content.querySelectorAll('[data-metric]').forEach((b) => { b.onclick = () => { metric = b.dataset.metric; paintMetric(); }; });
  paintMetric();

  const { close } = showModal(isEdit ? 'Editar objetivo' : 'Nuevo objetivo', content);
  content.querySelector('#save').onclick = async () => {
    const exerciseId = sel.value;
    const target = num(content.querySelector('#g-target').value);
    if (!exerciseId) { toast('Elige un ejercicio', 'error'); return; }
    if (target <= 0) { toast('Introduce un objetivo válido', 'error'); return; }
    await store.saveGoal({ id: goal?.id, exerciseId, metric, target, createdAt: goal?.createdAt });
    toast(isEdit ? 'Objetivo actualizado' : 'Objetivo creado', 'success');
    close();
    navigate('#/goals');
  };
}
