/* ============================================================
   session.js — Sesión de entrenamiento activa + resumen.
   Registro de series (reps/peso), marcar completadas,
   recordar la última vez, finalizar y ver estadísticas.
   ============================================================ */

import { el, esc, num, round, fmtDate, fmtTime, fmtDuration, fmtClock, fmtNum, toast, confirmDialog, showModal,
  tsFromDateTime, dateInputValue, timeInputValue } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel, getUnit } from '../prefs.js';
import * as store from '../store.js';

/* ---------------- Sesión activa ---------------- */
export async function session(ctx) {
  const s = await store.getSession(ctx.params.id);
  if (!s) return notFound();
  if (s.status === 'finished') { navigate(`#/session/${s.id}/summary`); return { title: '', back: '#/', node: el('<div></div>') }; }

  stopRest(); // descarta un temporizador que quedara de una visita anterior
  stopClock();

  const node = el('<div></div>');

  // Récords previos por ejercicio (la sesión activa no está finalizada → no se incluye).
  const prMap = new Map();
  for (const r of await store.personalRecords()) {
    prMap.set(r.exerciseId, { topWeight: r.topWeight.weight, best1RM: r.best1RM.value });
  }

  // Objetivos por ejercicio, con su estado PREVIO a esta sesión (para avisar solo al cruzarlo).
  const goalMap = new Map(); // exerciseId -> [{ metric, target, name, done }]
  for (const g of await store.goalProgress()) {
    if (!goalMap.has(g.exerciseId)) goalMap.set(g.exerciseId, []);
    goalMap.get(g.exerciseId).push({ metric: g.metric, target: g.target, name: g.name, done: g.achieved });
  }

  // Barra de temporizador de descanso (solo si se activó al crear la sesión).
  const restBar = s.restTimer && s.restTimer.enabled ? createRestBar(s.restTimer.seconds || 90) : null;

  // Contexto compartido con las filas de series (PR/objetivo en vivo + arranque del descanso).
  const sctx = {
    onSetDone(ex, set) {
      celebratePR(ex, set, prMap);
      celebrateGoals(ex, set, goalMap);
      if (restBar) restBar.start();
    },
  };

  // Cabecera de progreso (con cronómetro en vivo)
  const header = el(`
    <div class="card">
      <div class="row between">
        <div class="grow">
          <div style="font-weight:800;font-size:18px">${esc(s.groupName)}</div>
          <div class="sub muted">${fmtDate(s.startedAt)} · ${s.exercises.length} ejercicios</div>
        </div>
        <span class="badge live" id="se-clock">0:00</span>
      </div>
    </div>`);
  node.appendChild(header);
  startClock(header.querySelector('#se-clock'), s);

  // Día y hora de inicio (editables)
  const schedule = el(`
    <div class="card">
      <div class="row" style="gap:10px">
        <div class="field grow" style="margin:0">
          <label>Día</label>
          <input class="input" type="date" id="se-date" value="${dateInputValue(s.startedAt)}">
        </div>
        <div class="field" style="width:130px;margin:0">
          <label>Hora inicio</label>
          <input class="input" type="time" id="se-start" value="${timeInputValue(s.startedAt)}">
        </div>
      </div>
    </div>`);
  const syncStart = () => {
    s.startedAt = tsFromDateTime(schedule.querySelector('#se-date').value, schedule.querySelector('#se-start').value);
    autosave(s);
  };
  schedule.querySelector('#se-date').onchange = syncStart;
  schedule.querySelector('#se-start').onchange = syncStart;
  node.appendChild(schedule);

  // Render de cada ejercicio
  s.exercises.forEach((ex, exIdx) => {
    node.appendChild(renderExercise(s, ex, exIdx, sctx));
  });

  // Añadir más ejercicios a la sesión en curso (por grupo o sueltos).
  const addRow = el(`
    <div class="btn-row mt">
      <button class="btn ghost" id="add-group">+ Grupo</button>
      <button class="btn ghost" id="add-ex">+ Ejercicio</button>
    </div>`);
  addRow.querySelector('#add-group').onclick = () => openAddGroups(s);
  addRow.querySelector('#add-ex').onclick = () => openAddExercises(s);
  node.appendChild(addRow);

  // Notas de la sesión (texto libre)
  node.appendChild(renderNotesCard(s));

  // Acciones finales
  const actions = el(`
    <div class="btn-row mt">
      <button class="btn danger" id="cancel-session">Descartar</button>
      <button class="btn primary" id="finish-session">Finalizar sesión</button>
    </div>`);
  actions.querySelector('#finish-session').onclick = async () => {
    cancelAutosave(); // descarta un guardado pendiente: persistimos el estado final aquí.
    stopRest();
    stopClock();
    s.status = 'finished';
    s.finishedAt = Date.now();
    await store.saveSession(s);
    toast('¡Sesión finalizada!', 'success');
    navigate(`#/session/${s.id}/summary`);
  };
  actions.querySelector('#cancel-session').onclick = async () => {
    if (await confirmDialog('¿Descartar esta sesión? Se perderán los datos registrados.', { okText: 'Descartar' })) {
      cancelAutosave(); // evita que un autosave pendiente recree la sesión tras borrarla.
      stopRest();
      stopClock();
      await store.deleteSession(s.id);
      toast('Sesión descartada');
      navigate('#/');
    }
  };
  node.appendChild(actions);

  // La barra del temporizador vive dentro del nodo de la vista: al cambiar de
  // vista se quita del DOM y el propio `tick` se autodetiene.
  if (restBar) node.appendChild(restBar.el);

  return { title: 'Sesión activa', back: '#/', node };
}

/** Persiste cambios de la sesión (debounced ligero). */
let _saveTimer = null;
function autosave(s) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => store.saveSession(s), 350);
}
/** Cancela un autosave pendiente (evita re-escribir una sesión ya borrada/finalizada). */
function cancelAutosave() { clearTimeout(_saveTimer); }

/* ---------------- Cronómetro en vivo de la sesión ---------------- */
let _clockInt = null;
function stopClock() { if (_clockInt) { clearInterval(_clockInt); _clockInt = null; } }
function startClock(elc, s) {
  stopClock();
  const paint = () => {
    if (!document.body.contains(elc)) { stopClock(); return; } // se cambió de vista
    elc.textContent = fmtClock(Date.now() - s.startedAt);
  };
  paint();
  _clockInt = setInterval(paint, 1000);
}

/** Tarjeta de notas de la sesión (texto libre con autosave). */
function renderNotesCard(s) {
  const card = el(`
    <div class="card mt">
      <div class="section-title" style="margin-top:0">Notas de la sesión</div>
      <textarea class="input" id="se-notes" rows="2" placeholder="¿Cómo te sentiste? Energía, molestias, técnica…">${esc(s.notes || '')}</textarea>
    </div>`);
  card.querySelector('#se-notes').oninput = (e) => { s.notes = e.target.value; autosave(s); };
  return card;
}

/** Repite una sesión pasada creando una nueva activa con los mismos ejercicios. */
export async function repeatSession(past) {
  const active = await store.getActiveSession();
  if (active) {
    toast('Ya tienes una sesión en curso. Finalízala antes de repetir otra.', 'error');
    navigate(`#/session/${active.id}`);
    return;
  }
  const ns = await store.buildSessionFromPast(past, { startedAt: Date.now() });
  if (!ns.exercises.length) { toast('Esta sesión no tiene ejercicios para repetir', 'error'); return; }
  await store.saveSession(ns);
  toast('Entreno repetido: ¡a darle!', 'success');
  navigate(`#/session/${ns.id}`);
}

/* ---------------- Récord personal en vivo ---------------- */
/**
 * Avisa con un toast si la serie recién completada bate el récord previo de
 * peso o de 1RM estimado del ejercicio. `prMap` mantiene el mejor visto y se va
 * actualizando para celebrar también mejoras sucesivas dentro de la sesión.
 */
function celebratePR(ex, set, prMap) {
  const w = num(set.weight), r = num(set.reps);
  if (w <= 0 || r <= 0) return;
  const rm = store.epley1RM(w, r);
  const u = unitLabel();
  const pr = prMap.get(ex.exerciseId);
  if (!pr) { prMap.set(ex.exerciseId, { topWeight: w, best1RM: rm }); return; } // sin histórico: fija base, no celebra
  let shown = false;
  if (w > pr.topWeight) {
    toast(`🏆 ¡Récord de peso en ${ex.name}! ${fmtNum(w)} ${u}`, 'success');
    pr.topWeight = w; shown = true;
  }
  if (rm > pr.best1RM) {
    if (!shown) toast(`🏆 ¡Récord de 1RM est. en ${ex.name}! ${fmtNum(rm)} ${u}`, 'success');
    pr.best1RM = rm;
  }
}

/**
 * Avisa si la serie completada alcanza un objetivo del ejercicio que aún no
 * estaba cumplido. Marca el objetivo como cumplido para no repetir el aviso.
 */
function celebrateGoals(ex, set, goalMap) {
  const goals = goalMap.get(ex.exerciseId);
  if (!goals) return;
  const w = num(set.weight), r = num(set.reps);
  if (w <= 0 || r <= 0) return;
  const rm = store.epley1RM(w, r);
  const u = unitLabel();
  for (const g of goals) {
    if (g.done) continue;
    const val = g.metric === 'est1RM' ? rm : w;
    if (val >= g.target) {
      g.done = true;
      toast(`🎯 ¡Objetivo cumplido: ${ex.name} ${fmtNum(g.target)} ${u}!`, 'success');
    }
  }
}

/* ---------------- Temporizador de descanso ---------------- */
let _restInt = null;
let _audioCtx = null;
function stopRest() { if (_restInt) { clearInterval(_restInt); _restInt = null; } }

/** Prepara/reanuda el contexto de audio dentro del gesto del usuario (toque). */
function unlockAudio() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
  } catch (e) { /* dispositivo sin audio: se ignora */ }
}
/** Pitido corto generado con WebAudio (sin archivos de sonido). */
function beep() {
  try {
    const ctx = _audioCtx;
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.start(t); o.stop(t + 0.47);
  } catch (e) { /* se ignora */ }
}
function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* se ignora */ } }

/** Crea la barra flotante del temporizador. Devuelve { el, start }. */
function createRestBar(seconds) {
  const bar = el(`
    <div class="rest-bar" hidden>
      <button class="rest-btn" data-act="dec" type="button" aria-label="Menos 15 segundos">−15</button>
      <button class="rest-btn" data-act="toggle" type="button" aria-label="Pausar o reanudar">⏸</button>
      <div class="rest-time">0:00</div>
      <button class="rest-btn" data-act="inc" type="button" aria-label="Más 15 segundos">+15</button>
      <button class="rest-btn rest-skip" data-act="skip" type="button" aria-label="Saltar descanso">✕</button>
    </div>`);
  const timeEl = bar.querySelector('.rest-time');
  const toggleBtn = bar.querySelector('[data-act="toggle"]');
  let remaining = 0, paused = false;
  const fmt = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  const paint = () => { timeEl.textContent = fmt(Math.max(0, remaining)); toggleBtn.textContent = paused ? '▶' : '⏸'; };
  function finish() { stopRest(); bar.hidden = true; beep(); vibrate([180, 80, 180]); toast('⏱️ ¡Descanso terminado!'); }
  function tick() {
    if (!document.body.contains(bar)) { stopRest(); return; } // se cambió de vista → autolimpieza
    if (paused) return;
    remaining -= 1;
    paint();
    if (remaining <= 0) finish();
  }
  bar.querySelector('[data-act="dec"]').onclick = () => { remaining = Math.max(5, remaining - 15); paint(); };
  bar.querySelector('[data-act="inc"]').onclick = () => { remaining += 15; paint(); };
  toggleBtn.onclick = () => { paused = !paused; paint(); };
  bar.querySelector('[data-act="skip"]').onclick = () => { stopRest(); bar.hidden = true; };
  return {
    el: bar,
    start() {
      unlockAudio();
      remaining = seconds; paused = false;
      bar.hidden = false; paint();
      stopRest();
      _restInt = setInterval(tick, 1000);
    },
  };
}

/** Modal para añadir uno o varios grupos a la sesión en curso. */
async function openAddGroups(s) {
  const groups = await store.listGroups();
  if (!groups.length) { toast('No hay grupos. Crea uno primero.', 'error'); return; }

  const selected = new Set();
  const content = el(`
    <div>
      <div class="field">
        <label>Grupos a añadir (puedes elegir varios)</label>
        <div class="chip-grid" id="g-chips"></div>
      </div>
      <button class="btn primary block mt" id="add" disabled>Añadir a la sesión</button>
    </div>`);
  const chipsHost = content.querySelector('#g-chips');
  const addBtn = content.querySelector('#add');
  for (const g of groups) {
    const exCount = g.exerciseIds.length;
    const chip = el(`<button class="chip" type="button">${esc(g.name)}${exCount ? ` · ${exCount}` : ''}</button>`);
    if (exCount === 0) { chip.disabled = true; chip.style.opacity = '0.4'; }
    chip.onclick = () => {
      if (selected.has(g.id)) { selected.delete(g.id); chip.classList.remove('selected'); }
      else { selected.add(g.id); chip.classList.add('selected'); }
      addBtn.disabled = selected.size === 0;
    };
    chipsHost.appendChild(chip);
  }

  const { close } = showModal('Añadir grupo', content);
  addBtn.onclick = async () => {
    if (!selected.size) return;
    const chosen = [];
    for (const g of groups) if (selected.has(g.id)) chosen.push(await store.getGroup(g.id));
    const added = await store.addGroupsToSession(s, chosen);
    close();
    toast(added > 0 ? `${added} ejercicio${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}` : 'Ya estaban todos en la sesión',
      added > 0 ? 'success' : '');
    navigate(`#/session/${s.id}${s.status === 'finished' ? '/edit' : ''}`);
  };
}

/** Modal para añadir ejercicios sueltos a la sesión en curso (con filtro por etiqueta). */
async function openAddExercises(s) {
  const all = await store.listExercises();
  const inSession = new Set(s.exercises.map((e) => e.exerciseId));
  const available = all.filter((e) => !inSession.has(e.id));
  if (!available.length) { toast('Todos los ejercicios ya están en la sesión'); return; }

  const tags = [...new Set(available.flatMap((e) => store.exerciseTags(e)))].sort((a, b) => a.localeCompare(b, 'es'));
  const filter = new Set();
  const selected = new Set();

  const content = el(`
    <div>
      <div class="field" id="filter-field" style="margin-bottom:10px">
        <label>Filtrar por etiqueta</label>
        <div class="chip-grid" id="f-tags"></div>
      </div>
      <div class="field">
        <label>Ejercicios a añadir (puedes elegir varios)</label>
        <div class="chip-grid" id="ex-chips"></div>
      </div>
      <button class="btn primary block mt" id="add" disabled>Añadir a la sesión</button>
    </div>`);
  const fTags = content.querySelector('#f-tags');
  const exChips = content.querySelector('#ex-chips');
  const addBtn = content.querySelector('#add');
  if (!tags.length) content.querySelector('#filter-field').hidden = true;

  function renderChips() {
    fTags.innerHTML = '';
    if (tags.length) {
      const allc = el(`<button class="chip ${filter.size === 0 ? 'selected' : ''}" type="button">Todas</button>`);
      allc.onclick = () => { filter.clear(); renderChips(); };
      fTags.appendChild(allc);
      for (const t of tags) {
        const c = el(`<button class="chip ${filter.has(t) ? 'selected' : ''}" type="button">${esc(t)}</button>`);
        c.onclick = () => { if (filter.has(t)) filter.delete(t); else filter.add(t); renderChips(); };
        fTags.appendChild(c);
      }
    }
    exChips.innerHTML = '';
    const list = filter.size ? available.filter((e) => store.exerciseTags(e).some((t) => filter.has(t))) : available;
    if (!list.length) exChips.appendChild(el('<span class="faint">Ningún ejercicio con ese filtro.</span>'));
    for (const e of list) {
      const c = el(`<button class="chip ${selected.has(e.id) ? 'selected' : ''}" type="button">${esc(e.name)}</button>`);
      c.onclick = () => { if (selected.has(e.id)) selected.delete(e.id); else selected.add(e.id); renderChips(); };
      exChips.appendChild(c);
    }
    addBtn.disabled = selected.size === 0;
  }
  renderChips();

  const { close } = showModal('Añadir ejercicio', content);
  addBtn.onclick = async () => {
    if (!selected.size) return;
    const added = await store.addExercisesToSession(s, [...selected]);
    close();
    toast(`${added} ejercicio${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}`, 'success');
    navigate(`#/session/${s.id}${s.status === 'finished' ? '/edit' : ''}`);
  };
}

function renderExercise(s, ex, exIdx, sctx) {
  const isLast = s.exercises[s.exercises.length - 1] === ex;
  const card = el(`<div class="card${ex.supersetNext ? ' superset-linked' : ''}"></div>`);
  const badges = [];
  if (ex.unilateral) badges.push('<span class="badge" style="white-space:nowrap">Unilateral ×2</span>');
  if (ex.supersetNext) badges.push('<span class="badge" style="white-space:nowrap">⛓ Superserie</span>');
  const head = el(`
    <div class="row between" style="gap:8px;margin-bottom:4px;align-items:flex-start">
      <div class="grow" style="min-width:0">
        <div style="font-weight:800;font-size:16px;line-height:1.25">${esc(ex.name)}</div>
        ${badges.length ? `<div class="row wrap" style="gap:6px;margin-top:6px">${badges.join('')}</div>` : ''}
      </div>
      <div class="row" style="gap:2px;flex-shrink:0">
        ${isLast ? '' : `<button class="icon-btn" data-act="superset" aria-label="Superserie con el siguiente" title="Superserie con el siguiente" style="width:34px;height:34px;${ex.supersetNext ? 'color:var(--primary)' : ''}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>
        </button>`}
        <button class="icon-btn" data-act="rm-ex" aria-label="Quitar ejercicio de la sesión" style="width:34px;height:34px">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
        </button>
      </div>
    </div>`);
  const ssBtn = head.querySelector('[data-act="superset"]');
  if (ssBtn) ssBtn.onclick = async () => {
    ex.supersetNext = !ex.supersetNext;
    await store.saveSession(s);
    navigate(`#/session/${s.id}${s.status === 'finished' ? '/edit' : ''}`);
  };
  head.querySelector('[data-act="rm-ex"]').onclick = async () => {
    const logged = (ex.sets || []).some((st) => num(st.reps) > 0 || num(st.weight) > 0);
    const msg = logged
      ? `¿Quitar "${ex.name}" de la sesión? Tiene series registradas que se perderán.`
      : `¿Quitar "${ex.name}" de la sesión?`;
    if (await confirmDialog(msg, { okText: 'Quitar' })) {
      const idx = s.exercises.indexOf(ex);
      if (idx >= 0) s.exercises.splice(idx, 1);
      await store.saveSession(s);
      toast('Ejercicio quitado');
      navigate(`#/session/${s.id}${s.status === 'finished' ? '/edit' : ''}`);
    }
  };
  card.appendChild(head);

  function renderRows() {
    tbody.innerHTML = '';
    ex.sets.forEach((set, i) => tbody.appendChild(renderSetRow(s, ex, set, i, renderRows, sctx)));
  }

  if (ex.previous) {
    const hasWeight = (ex.previous.sets || []).some((st) => num(st.weight) > 0);
    const row = el(`
      <div class="row between" style="gap:8px;margin-bottom:10px">
        <div class="sub faint">Última vez · ${fmtDate(ex.previous.date)}</div>
      </div>`);
    if (hasWeight) {
      // Progresión automática: sube el peso de la última vez un escalón (sobrecarga progresiva).
      const step = getUnit() === 'lb' ? 5 : 2.5;
      const btn = el(`<button class="chip" type="button" style="padding:4px 10px;font-size:12px;white-space:nowrap">📈 +${fmtNum(step)} ${esc(unitLabel())}</button>`);
      btn.onclick = () => {
        ex.sets.forEach((set, i) => {
          const pv = ex.previous.sets[i];
          const base = pv ? num(pv.weight) : num(set.weight);
          set.weight = round(base + step, 2);
          set.done = false;
        });
        renderRows();
        autosave(s);
        toast(`Sugerencia aplicada: +${fmtNum(step)} ${unitLabel()}`, 'success');
      };
      row.appendChild(btn);
    }
    card.appendChild(row);
  } else {
    card.appendChild(el(`<div class="sub faint" style="margin-bottom:10px">Primera vez con este ejercicio</div>`));
  }

  const table = el(`
    <table class="sets-table">
      <thead>
        <tr>
          <th class="set-idx">#</th>
          <th>Anterior</th>
          <th>Reps</th>
          <th>${esc(unitLabel().toUpperCase())}</th>
          ${s.trackRpe ? '<th class="set-rpe">RPE</th>' : ''}
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>`);
  const tbody = table.querySelector('tbody');
  renderRows();
  card.appendChild(table);

  const addRow = el(`
    <div class="btn-row mt">
      <button class="btn ghost" id="add-set" style="padding:10px">+ Añadir serie</button>
      <button class="btn ghost" id="scheme" style="padding:10px">Esquema</button>
    </div>`);
  addRow.querySelector('#add-set').onclick = () => {
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({ reps: last ? last.reps : 0, weight: last ? last.weight : 0, done: false });
    renderRows();
    autosave(s);
  };
  addRow.querySelector('#scheme').onclick = () => openSchemeModal(s, ex, renderRows);
  card.appendChild(addRow);
  return card;
}

/* Esquemas de series rápidos. `reps` numérico + `sets`, o array de reps (pirámide). */
const SET_SCHEMES = [
  { label: '5 × 5', sets: 5, reps: 5 },
  { label: '3 × 8', sets: 3, reps: 8 },
  { label: '3 × 10', sets: 3, reps: 10 },
  { label: '3 × 12', sets: 3, reps: 12 },
  { label: '4 × 6', sets: 4, reps: 6 },
  { label: 'Pirámide 12-10-8', reps: [12, 10, 8] },
  { label: 'Pirámide 15-12-10-8', reps: [15, 12, 10, 8] },
];

/** Modal para reemplazar las series del ejercicio por un esquema predefinido. */
function openSchemeModal(s, ex, renderRows) {
  const baseWeight = num((ex.sets[0] || {}).weight) || 0;
  const logged = (ex.sets || []).some((st) => num(st.reps) > 0 || num(st.weight) > 0);

  const content = el('<div><p class="muted" style="margin-top:0">Rellena las series de un toque. Se mantiene el peso de la primera serie.</p><div class="chip-grid" id="schemes"></div></div>');
  const host = content.querySelector('#schemes');
  const { close } = showModal('Esquema de series', content);

  for (const sch of SET_SCHEMES) {
    const chip = el(`<button class="chip" type="button">${esc(sch.label)}</button>`);
    chip.onclick = async () => {
      close();
      if (logged && !(await confirmDialog('Esto reemplazará las series actuales de este ejercicio. ¿Continuar?', { okText: 'Reemplazar', danger: false }))) return;
      const repsArr = Array.isArray(sch.reps) ? sch.reps.slice() : Array.from({ length: sch.sets }, () => sch.reps);
      ex.sets = repsArr.map((r) => ({ reps: r, weight: baseWeight, done: false }));
      renderRows();
      autosave(s);
      toast('Esquema aplicado', 'success');
    };
    host.appendChild(chip);
  }
}

function renderSetRow(s, ex, set, i, renderRows, sctx) {
  const prev = ex.previous && ex.previous.sets[i]
    ? `${fmtNum(ex.previous.sets[i].reps)}×${fmtNum(ex.previous.sets[i].weight)}`
    : '—';
  const tr = el(`
    <tr class="set-row ${set.done ? 'done' : ''}">
      <td class="set-idx">${i + 1}</td>
      <td class="prev-cell">${prev}</td>
      <td><input class="input-inline" type="number" inputmode="numeric" min="0" step="1" value="${set.reps || ''}" placeholder="0" data-f="reps"></td>
      <td><input class="input-inline" type="number" inputmode="decimal" min="0" step="0.5" value="${set.weight || ''}" placeholder="0" data-f="weight"></td>
      ${s.trackRpe ? `<td class="set-rpe"><input class="input-inline" type="number" inputmode="decimal" min="0" max="10" step="0.5" value="${set.rpe != null ? set.rpe : ''}" placeholder="–" data-f="rpe"></td>` : ''}
      <td>
        <div class="row" style="gap:2px">
          <button class="set-done-btn ${set.done ? 'done' : ''}" data-act="done" aria-label="Completar serie">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          </button>
          <button class="icon-btn" data-act="del" aria-label="Eliminar serie" style="width:32px;height:32px">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--text-faint)" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </td>
    </tr>`);

  tr.querySelector('[data-f="reps"]').oninput = (e) => { set.reps = num(e.target.value); autosave(s); };
  tr.querySelector('[data-f="weight"]').oninput = (e) => { set.weight = num(e.target.value); autosave(s); };
  const rpeInput = tr.querySelector('[data-f="rpe"]');
  if (rpeInput) rpeInput.oninput = (e) => {
    const v = e.target.value;
    if (v === '') delete set.rpe; else set.rpe = num(v);
    autosave(s);
  };
  tr.querySelector('[data-act="done"]').onclick = () => {
    set.done = !set.done;
    tr.classList.toggle('done', set.done);
    tr.querySelector('[data-act="done"]').classList.toggle('done', set.done);
    autosave(s);
    if (set.done && sctx) sctx.onSetDone(ex, set);
  };
  tr.querySelector('[data-act="del"]').onclick = () => {
    if (ex.sets.length <= 1) { ex.sets[0] = { reps: 0, weight: 0, done: false }; }
    else ex.sets.splice(i, 1);
    renderRows();
    autosave(s);
  };
  return tr;
}

/* ---------------- Edición de una sesión finalizada ---------------- */
export async function editSession(ctx) {
  const s = await store.getSession(ctx.params.id);
  if (!s) return notFound();
  if (s.status !== 'finished') { navigate(`#/session/${s.id}`); return { title: '', back: '#/', node: el('<div></div>') }; }

  stopRest();
  const node = el('<div></div>');
  node.appendChild(el(`
    <div class="card">
      <div class="row between">
        <div class="grow">
          <div style="font-weight:800;font-size:18px">${esc(s.groupName)}</div>
          <div class="sub muted">${fmtDate(s.startedAt)} · editando series</div>
        </div>
        <span class="badge">Editar</span>
      </div>
    </div>`));

  const sctx = { onSetDone() {} }; // al editar no hay récord en vivo ni descanso
  s.exercises.forEach((ex, i) => node.appendChild(renderExercise(s, ex, i, sctx)));

  const addRow = el(`
    <div class="btn-row mt">
      <button class="btn ghost" id="add-group">+ Grupo</button>
      <button class="btn ghost" id="add-ex">+ Ejercicio</button>
    </div>`);
  addRow.querySelector('#add-group').onclick = () => openAddGroups(s);
  addRow.querySelector('#add-ex').onclick = () => openAddExercises(s);
  node.appendChild(addRow);

  node.appendChild(renderNotesCard(s));

  const done = el('<button class="btn primary block mt" id="done-edit">Guardar y volver</button>');
  done.onclick = async () => {
    await store.saveSession(s);
    toast('Cambios guardados', 'success');
    navigate(`#/session/${s.id}/summary`);
  };
  node.appendChild(done);

  return { title: 'Editar sesión', back: `#/session/${s.id}/summary`, node };
}

/* ---------------- Resumen / estadísticas de la sesión ---------------- */
export async function sessionSummary(ctx) {
  const s = await store.getSession(ctx.params.id);
  if (!s) return notFound();
  const st = store.sessionStats(s);
  const node = el('<div></div>');

  node.appendChild(el(`
    <div class="card center">
      <span class="badge" style="background:var(--success);color:#fff">Finalizada</span>
      <div style="font-weight:800;font-size:22px;margin-top:10px">${esc(s.groupName)}</div>
      <div class="muted">${fmtDate(s.startedAt)}</div>
    </div>`));

  const statGrid = el(`
    <div class="stat-grid mt">
      <div class="stat"><div class="val">${st.totalVolume}<span class="unit"> ${esc(unitLabel())}</span></div><div class="lbl">Volumen total</div></div>
      <div class="stat"><div class="val">${st.totalSets}</div><div class="lbl">Series</div></div>
      <div class="stat"><div class="val">${st.totalReps}</div><div class="lbl">Repeticiones</div></div>
      <div class="stat"><div class="val" id="dur-val">${fmtDuration(st.duration)}</div><div class="lbl">Duración</div></div>
    </div>`);
  node.appendChild(statGrid);

  if (st.avgRpe != null) {
    node.appendChild(el(`<div class="faint center mt" style="font-size:13px">RPE medio: <b style="color:var(--text)">${fmtNum(st.avgRpe)}</b> / 10</div>`));
  }

  // Horario editable (día, inicio y fin) → recalcula la duración en vivo.
  const sched = el(`
    <div class="card mt">
      <div class="section-title" style="margin-top:0">Horario</div>
      <div class="field" style="margin-bottom:10px">
        <label>Día</label>
        <input class="input" type="date" id="h-date" value="${dateInputValue(s.startedAt)}">
      </div>
      <div class="row" style="gap:10px">
        <div class="field grow" style="margin:0">
          <label>Inicio</label>
          <input class="input" type="time" id="h-start" value="${timeInputValue(s.startedAt)}">
        </div>
        <div class="field grow" style="margin:0">
          <label>Fin</label>
          <input class="input" type="time" id="h-end" value="${s.finishedAt ? timeInputValue(s.finishedAt) : ''}">
        </div>
      </div>
      <div class="sub faint mt" id="h-info"></div>
    </div>`);
  const recalc = () => {
    const date = sched.querySelector('#h-date').value;
    const startT = sched.querySelector('#h-start').value;
    const endT = sched.querySelector('#h-end').value;
    s.startedAt = tsFromDateTime(date, startT);
    if (endT) {
      let finished = tsFromDateTime(date, endT);
      // Si la hora de fin es anterior a la de inicio, la sesión cruzó la medianoche.
      if (finished < s.startedAt) finished += 24 * 3600 * 1000;
      s.finishedAt = finished;
    }
    store.saveSession(s);
    const dur = s.finishedAt ? s.finishedAt - s.startedAt : 0;
    statGrid.querySelector('#dur-val').textContent = fmtDuration(dur);
    sched.querySelector('#h-info').textContent = s.finishedAt
      ? `${fmtTime(s.startedAt)} – ${fmtTime(s.finishedAt)}`
      : 'Sin hora de fin';
  };
  sched.querySelectorAll('input').forEach((i) => { i.onchange = recalc; });
  recalc();
  node.appendChild(sched);

  node.appendChild(el('<div class="section-title">Por ejercicio</div>'));
  const list = el('<div class="list"></div>');
  for (const pe of st.perExercise) {
    list.appendChild(el(`
      <div class="item">
        <div class="grow">
          <div class="title">${esc(pe.name)}${pe.unilateral ? ' · Unilateral ×2' : ''}</div>
          <div class="sub">${pe.sets} series · ${pe.reps} reps · máx ${fmtNum(pe.topWeight)} ${esc(unitLabel())}</div>
        </div>
        <div class="badge">${fmtNum(pe.volume)} ${esc(unitLabel())}</div>
      </div>`));
  }
  if (!st.perExercise.length) list.appendChild(el('<div class="empty"><p>No se registraron series.</p></div>'));
  node.appendChild(list);

  // Notas de la sesión (si las hay)
  if (s.notes && s.notes.trim()) {
    node.appendChild(el('<div class="section-title">Notas</div>'));
    node.appendChild(el(`<div class="card"><div style="white-space:pre-wrap">${esc(s.notes)}</div></div>`));
  }

  const editRow = el(`
    <div class="btn-row mt">
      <button class="btn ghost" id="edit-session">Editar series</button>
      <button class="btn ghost" id="repeat-session">Repetir entreno</button>
    </div>`);
  editRow.querySelector('#edit-session').onclick = () => navigate(`#/session/${s.id}/edit`);
  editRow.querySelector('#repeat-session').onclick = () => repeatSession(s);
  node.appendChild(editRow);

  const actions = el(`
    <div class="btn-row mt">
      <button class="btn ghost" id="view-reports">Ver informes</button>
      <button class="btn primary" id="go-home">Inicio</button>
    </div>`);
  actions.querySelector('#go-home').onclick = () => navigate('#/');
  actions.querySelector('#view-reports').onclick = () => navigate('#/reports');
  node.appendChild(actions);

  return { title: 'Resumen', back: '#/', node };
}

function notFound() {
  const node = el('<div class="empty"><p>Sesión no encontrada.</p></div>');
  return { title: 'Sesión', back: '#/', node };
}
