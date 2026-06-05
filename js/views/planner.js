/* ============================================================
   planner.js — Planificación semanal.
   Asigna grupos de ejercicios a cada día; Inicio muestra "Hoy toca".
   ============================================================ */

import { el, esc, toast, showModal } from '../utils.js';
import { navigate } from '../router.js';
import * as store from '../store.js';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export async function planner() {
  const node = el('<div></div>');
  const groups = await store.listGroups();
  const days = await store.getPlanner(); // 7 arrays de ids (0 = lunes)
  const byId = new Map(groups.map((g) => [g.id, g]));

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

  render();
  return { title: 'Planificador', back: '#/settings', node };
}
