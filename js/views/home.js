/* ============================================================
   home.js — Pantalla de inicio.
   Botón "Nueva Sesión", sesión activa (si existe) y recientes.
   ============================================================ */

import { el, esc, fmtDate, fmtDuration, confirmDialog, toast, todayISO, timeInputValue, tsFromDateTime } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

export async function home() {
  const node = el('<div></div>');
  const active = await store.getActiveSession();
  const sessions = await store.listSessions();
  const finished = sessions.filter((s) => s.status === 'finished').slice(0, 8);
  const groups = await store.listGroups();

  // CTA principal
  const cta = el(`
    <button class="fab-cta" id="new-session">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Nueva Sesión
    </button>`);
  cta.onclick = () => onNewSession(groups);
  node.appendChild(cta);

  // Sesión activa
  if (active) {
    const card = el(`
      <div class="card clickable" style="margin-top:16px;border-color:var(--primary)">
        <div class="row between">
          <div class="grow">
            <span class="badge">En curso</span>
            <div class="title" style="font-weight:800;font-size:18px;margin-top:8px">${esc(active.groupName)}</div>
            <div class="sub muted">Iniciada ${fmtDate(active.startedAt)} · ${active.exercises.length} ejercicios</div>
          </div>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>`);
    card.onclick = () => navigate(`#/session/${active.id}`);
    node.appendChild(card);
  }

  // Recientes
  const sec = el('<div class="section-title">Sesiones recientes</div>');
  node.appendChild(sec);

  if (!finished.length) {
    node.appendChild(el(`
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
        <p>Aún no hay sesiones finalizadas.</p>
        <p class="faint">Pulsa "Nueva Sesión" para empezar.</p>
      </div>`));
  } else {
    const list = el('<div class="list"></div>');
    for (const s of finished) {
      const st = store.sessionStats(s);
      const item = el(`
        <div class="item clickable">
          <div class="grow">
            <div class="title">${esc(s.groupName)}</div>
            <div class="sub">${fmtDate(s.startedAt)} · ${st.totalSets} series · ${st.totalVolume} ${esc(unitLabel())} vol · ${fmtDuration(st.duration)}</div>
          </div>
          <button class="icon-btn" data-act="del" aria-label="Eliminar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>`);
      item.querySelector('.grow').onclick = () => navigate(`#/session/${s.id}/summary`);
      item.querySelector('[data-act="del"]').onclick = async (e) => {
        e.stopPropagation();
        if (await confirmDialog('¿Eliminar esta sesión? No se puede deshacer.')) {
          await store.deleteSession(s.id);
          toast('Sesión eliminada', 'success');
          navigate('#/');
        }
      };
      list.appendChild(item);
    }
    node.appendChild(list);
  }

  return { title: 'Gym Tracker', back: false, node };
}

/** Selector de grupo para iniciar una nueva sesión. */
async function onNewSession(groups) {
  const { showModal } = await import('../utils.js');
  if (!groups.length) {
    const content = el(`
      <div>
        <p class="muted" style="margin-top:0">No tienes grupos de ejercicios. Crea uno primero.</p>
        <button class="btn primary block" id="go-groups">Crear grupo</button>
      </div>`);
    const { close } = showModal('Nueva sesión', content);
    content.querySelector('#go-groups').onclick = () => { close(); navigate('#/groups'); };
    return;
  }

  const selected = new Set();
  const content = el(`
    <div>
      <div class="field">
        <label>Grupos (puedes elegir varios)</label>
        <div class="chip-grid" id="g-chips"></div>
      </div>
      <div class="row" style="gap:10px">
        <div class="field grow" style="margin:0">
          <label>Día</label>
          <input class="input" type="date" id="s-date" value="${todayISO()}">
        </div>
        <div class="field" style="width:130px;margin:0">
          <label>Hora inicio</label>
          <input class="input" type="time" id="s-time" value="${timeInputValue(Date.now())}">
        </div>
      </div>
      <button class="btn primary block mt" id="start" disabled>Comenzar sesión</button>
    </div>`);

  const chipsHost = content.querySelector('#g-chips');
  const startBtn = content.querySelector('#start');
  for (const g of groups) {
    const exCount = g.exerciseIds.length;
    const chip = el(`<button class="chip">${esc(g.name)}${exCount ? ` · ${exCount}` : ''}</button>`);
    if (exCount === 0) { chip.disabled = true; chip.style.opacity = '0.4'; }
    chip.onclick = () => {
      if (selected.has(g.id)) { selected.delete(g.id); chip.classList.remove('selected'); }
      else { selected.add(g.id); chip.classList.add('selected'); }
      startBtn.disabled = selected.size === 0;
    };
    chipsHost.appendChild(chip);
  }

  const { close } = showModal('Nueva sesión', content);

  startBtn.onclick = async () => {
    if (!selected.size) return;
    const date = content.querySelector('#s-date').value;
    const time = content.querySelector('#s-time').value;
    const chosen = [];
    for (const g of groups) if (selected.has(g.id)) chosen.push(await store.getGroup(g.id));
    const startedAt = tsFromDateTime(date, time);
    const session = await store.buildNewSession(chosen, { startedAt });
    if (!session.exercises.length) { toast('Los grupos elegidos no tienen ejercicios', 'error'); return; }
    await store.saveSession(session);
    close();
    navigate(`#/session/${session.id}`);
  };
}
