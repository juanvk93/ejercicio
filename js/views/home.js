/* ============================================================
   home.js — Pantalla de inicio.
   Botón "Nueva Sesión", sesión activa (si existe) y recientes.
   ============================================================ */

import { el, esc, num, fmtDate, fmtDuration, fmtNum, confirmDialog, toast, todayISO, timeInputValue, tsFromDateTime, showModal } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';
import { repeatSession } from './session.js';

// Icono de mancuerna reutilizable para los avatares de sesión.
const DUMBBELL = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="9" y="10.5" width="6" height="3" rx="1.2"/><rect x="6.5" y="7.5" width="2.4" height="9" rx="1.1"/><rect x="15.1" y="7.5" width="2.4" height="9" rx="1.1"/><rect x="3.6" y="9.2" width="1.9" height="5.6" rx="0.9"/><rect x="18.5" y="9.2" width="1.9" height="5.6" rx="0.9"/></svg>';

export async function home() {
  const node = el('<div></div>');
  const active = await store.getActiveSession();
  const sessions = await store.listSessions();
  const finished = sessions.filter((s) => s.status === 'finished').slice(0, 8);
  const groups = await store.listGroups();
  const goalsProgress = await store.goalProgress();

  // CTA principal: si hay sesión activa, invita a continuarla (no deja iniciar otra).
  const cta = active
    ? el(`<button class="fab-cta" id="continue-session">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 3l14 9-14 9V3z"/></svg>
        Continuar sesión
      </button>`)
    : el(`<button class="fab-cta" id="new-session">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Nueva Sesión
      </button>`);
  cta.onclick = active ? () => navigate(`#/session/${active.id}`) : () => onNewSession(groups);
  node.appendChild(cta);

  // Sesión activa
  if (active) {
    const card = el(`
      <div class="card clickable active-session" style="margin-top:16px">
        <div class="row" style="gap:14px">
          <span class="av av-lg">${DUMBBELL}</span>
          <div class="grow">
            <span class="badge live">En curso</span>
            <div class="title" style="font-weight:800;font-size:18px;margin-top:8px">${esc(active.groupName)}</div>
            <div class="sub muted">Iniciada ${fmtDate(active.startedAt)} · ${active.exercises.length} ejercicios</div>
          </div>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--primary)" stroke-width="2.4" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>`);
    card.onclick = () => navigate(`#/session/${active.id}`);
    node.appendChild(card);
  }

  // Resumen de la semana (si ya hay sesiones finalizadas)
  if (finished.length) {
    const w = await store.weekStats();
    node.appendChild(el('<div class="section-title">Tu semana</div>'));
    node.appendChild(el(`
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><div class="val">${w.count}</div><div class="lbl">Sesiones</div></div>
        <div class="stat"><div class="val">${fmtNum(w.volume)}<span class="unit"> ${esc(unitLabel())}</span></div><div class="lbl">Volumen</div></div>
        <div class="stat"><div class="val">${fmtDuration(w.durationMs)}</div><div class="lbl">Tiempo</div></div>
      </div>`));
  }

  // Resumen de objetivos (si hay alguno)
  if (goalsProgress.length) {
    const achieved = goalsProgress.filter((g) => g.achieved).length;
    const total = goalsProgress.length;
    node.appendChild(el('<div class="section-title">Objetivos</div>'));
    const card = el(`
      <div class="card clickable">
        <div class="row" style="gap:14px">
          <span class="av av-lg"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></span>
          <div class="grow">
            <div class="title" style="font-weight:800;font-size:18px">${achieved} de ${total} logrado${total === 1 ? '' : 's'}</div>
            <div class="sub muted">${total - achieved} en progreso</div>
          </div>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--primary)" stroke-width="2.4" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>`);
    card.onclick = () => navigate('#/goals');
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
          <span class="av">${DUMBBELL}</span>
          <div class="grow">
            <div class="title">${esc(s.groupName)}</div>
            <div class="sub">${fmtDate(s.startedAt)} · ${st.totalSets} series · ${st.totalVolume} ${esc(unitLabel())} vol · ${fmtDuration(st.duration)}</div>
          </div>
          <button class="icon-btn" data-act="repeat" aria-label="Repetir entreno" title="Repetir entreno">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </button>
          <button class="icon-btn" data-act="del" aria-label="Eliminar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>`);
      item.querySelector('.av').onclick = () => navigate(`#/session/${s.id}/summary`);
      item.querySelector('.grow').onclick = () => navigate(`#/session/${s.id}/summary`);
      item.querySelector('[data-act="repeat"]').onclick = (e) => { e.stopPropagation(); repeatSession(s); };
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
  // Bloquea iniciar otra sesión si ya hay una en curso.
  const active = await store.getActiveSession();
  if (active) {
    const content = el(`
      <div>
        <p class="muted" style="margin-top:0">Ya tienes una sesión en curso (<b>${esc(active.groupName)}</b>). Finalízala o descártala antes de empezar otra.</p>
        <button class="btn primary block" id="go-active">Ir a la sesión en curso</button>
      </div>`);
    const { close } = showModal('Sesión en curso', content);
    content.querySelector('#go-active').onclick = () => { close(); navigate(`#/session/${active.id}`); };
    return;
  }

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
      <div class="field" style="margin-top:6px;margin-bottom:0">
        <label class="row" style="gap:10px;cursor:pointer;margin:0">
          <input type="checkbox" id="s-rest">
          <span>Temporizador de descanso entre series</span>
        </label>
        <div id="s-rest-wrap" hidden style="margin-top:10px">
          <label>Descanso (segundos)</label>
          <input class="input" type="number" inputmode="numeric" min="5" step="5" value="90" id="s-rest-secs">
        </div>
      </div>
      <div class="field" style="margin-top:6px;margin-bottom:0">
        <label class="row" style="gap:10px;cursor:pointer;margin:0">
          <input type="checkbox" id="s-rpe">
          <span>Registrar RPE/RIR por serie</span>
        </label>
      </div>
      <button class="btn primary block mt" id="start" disabled>Comenzar sesión</button>
    </div>`);

  const chipsHost = content.querySelector('#g-chips');
  const startBtn = content.querySelector('#start');
  const restChk = content.querySelector('#s-rest');
  const restWrap = content.querySelector('#s-rest-wrap');
  restChk.onchange = () => { restWrap.hidden = !restChk.checked; };
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
    const restTimer = { enabled: restChk.checked, seconds: num(content.querySelector('#s-rest-secs').value) || 90 };
    const trackRpe = content.querySelector('#s-rpe').checked;
    const session = await store.buildNewSession(chosen, { startedAt, restTimer, trackRpe });
    if (!session.exercises.length) { toast('Los grupos elegidos no tienen ejercicios', 'error'); return; }
    await store.saveSession(session);
    close();
    navigate(`#/session/${session.id}`);
  };
}
