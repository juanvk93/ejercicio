/* ============================================================
   planner.js — Planificación semanal.
   Asigna grupos de ejercicios a cada día; Inicio muestra "Hoy toca".
   ============================================================ */

import { el, esc, toast, showModal, confirmDialog } from '../utils.js';
import { navigate } from '../router.js';
import * as store from '../store.js';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export async function planner() {
  const node = el('<div></div>');
  const groups = await store.listGroups();
  const days = await store.getPlanner(); // 7 arrays de ids (0 = lunes)
  const byId = new Map(groups.map((g) => [g.id, g]));
  const routines = await store.listRoutines();
  const deload = await store.isDeloadWeek();

  if (!groups.length) {
    node.appendChild(el(`
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
        <p>No tienes grupos de ejercicios.</p>
        <p class="faint">Crea grupos para poder planificar tu semana.</p>
      </div>`));
    const btn = el('<button class="btn primary block" id="go-groups">Crear grupos</button>');
    btn.onclick = () => navigate('#/groups');
    node.appendChild(btn);
    return { title: 'Planificador', back: '#/settings', node };
  }

  node.appendChild(el('<p class="muted" style="margin-top:0">Asigna grupos a cada día. En Inicio verás "Hoy toca" para empezar el entreno de hoy de un toque.</p>'));

  // Semana de descarga (deload): aviso informativo en Inicio.
  const deloadCard = el(`
    <div class="card">
      <label class="row between" style="cursor:pointer;margin:0;gap:12px">
        <div><div class="title" style="font-weight:700">Semana de descarga</div>
          <div class="sub muted">Muestra un aviso en Inicio para bajar intensidad</div></div>
        <input type="checkbox" id="deload" ${deload ? 'checked' : ''}>
      </label>
    </div>`);
  deloadCard.querySelector('#deload').onchange = async (e) => {
    await store.setDeloadWeek(e.target.checked);
    toast(e.target.checked ? 'Semana de descarga activada' : 'Descarga desactivada', 'success');
  };
  node.appendChild(deloadCard);

  const list = el('<div class="list"></div>');
  node.appendChild(list);

  function render() {
    list.innerHTML = '';
    DAYS.forEach((dayName, i) => {
      const names = (days[i] || []).map((id) => byId.get(id)).filter(Boolean).map((g) => g.name);
      const item = el(`
        <div class="item">
          <div class="grow">
            <div class="title">${esc(dayName)}</div>
            <div class="sub ${names.length ? '' : 'faint'}">${names.length ? names.map(esc).join(' + ') : 'Descanso'}</div>
          </div>
          <button class="btn ghost" data-act="edit" style="padding:8px 12px">Editar</button>
        </div>`);
      item.querySelector('[data-act="edit"]').onclick = () => editDay(i);
      list.appendChild(item);
    });
  }

  function editDay(i) {
    const selected = new Set((days[i] || []).filter((id) => byId.has(id)));
    const content = el('<div><div class="chip-grid" id="g-chips"></div><button class="btn primary block mt" id="save">Guardar</button></div>');
    const host = content.querySelector('#g-chips');
    for (const g of groups) {
      const chip = el(`<button class="chip ${selected.has(g.id) ? 'selected' : ''}" type="button">${esc(g.name)}</button>`);
      chip.onclick = () => {
        if (selected.has(g.id)) { selected.delete(g.id); chip.classList.remove('selected'); }
        else { selected.add(g.id); chip.classList.add('selected'); }
      };
      host.appendChild(chip);
    }
    const { close } = showModal(`Plan · ${DAYS[i]}`, content);
    content.querySelector('#save').onclick = async () => {
      days[i] = [...selected];
      await store.savePlanner(days);
      close();
      toast('Plan actualizado', 'success');
      render();
    };
  }

  // --- Plantillas de rutina (guardar la semana actual / aplicar una guardada) ---
  node.appendChild(el('<div class="section-title">Plantillas de rutina</div>'));
  const tplWrap = el('<div></div>');
  node.appendChild(tplWrap);

  const routineSummary = (r) => {
    const n = (r.days || []).filter((d) => Array.isArray(d) && d.length).length;
    return `${n} día${n === 1 ? '' : 's'} con entreno`;
  };

  function renderRoutines() {
    tplWrap.innerHTML = '';
    const save = el('<button class="btn ghost block" id="save-tpl">Guardar la semana actual como plantilla</button>');
    save.onclick = saveCurrentAsTemplate;
    tplWrap.appendChild(save);

    if (!routines.length) {
      tplWrap.appendChild(el('<p class="faint" style="font-size:13px;margin:10px 0 0">Aún no tienes plantillas. Guarda tu semana para reutilizarla.</p>'));
      return;
    }
    const lst = el('<div class="list mt"></div>');
    for (const r of routines) {
      const item = el(`
        <div class="item">
          <div class="grow">
            <div class="title">${esc(r.name)}</div>
            <div class="sub muted">${routineSummary(r)}</div>
          </div>
          <div class="item-actions">
            <button class="btn ghost" data-act="apply" style="padding:8px 12px">Aplicar</button>
            <button class="icon-btn" data-act="del" aria-label="Eliminar plantilla">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
            </button>
          </div>
        </div>`);
      item.querySelector('[data-act="apply"]').onclick = async () => {
        await store.applyRoutine(r.id);
        toast(`Plantilla "${r.name}" aplicada`, 'success');
        navigate('#/planner');
      };
      item.querySelector('[data-act="del"]').onclick = async () => {
        if (await confirmDialog(`¿Eliminar la plantilla "${r.name}"?`)) {
          await store.deleteRoutine(r.id);
          toast('Plantilla eliminada', 'success');
          navigate('#/planner');
        }
      };
      lst.appendChild(item);
    }
    tplWrap.appendChild(lst);
  }

  function saveCurrentAsTemplate() {
    const content = el('<div><div class="field"><label>Nombre de la plantilla</label><input class="input" id="tpl-name" placeholder="Ej. Push Pull Pierna"></div><button class="btn primary block" id="ok">Guardar</button></div>');
    const { close } = showModal('Nueva plantilla', content);
    content.querySelector('#tpl-name').focus();
    content.querySelector('#ok').onclick = async () => {
      const name = content.querySelector('#tpl-name').value.trim();
      if (!name) { toast('Ponle un nombre', 'error'); return; }
      await store.saveRoutine({ name, days });
      close();
      toast('Plantilla guardada', 'success');
      navigate('#/planner');
    };
  }

  renderRoutines();

  render();
  return { title: 'Planificador', back: '#/settings', node };
}
