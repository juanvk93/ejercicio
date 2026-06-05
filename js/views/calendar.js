/* ============================================================
   calendar.js — Calendario de sesiones.
   Marca los días con sesiones registradas y permite ver las
   sesiones de un día concreto. Navegación por meses.
   ============================================================ */

import { el, esc, fmtNum, fmtDuration, dateInputValue } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export async function calendar() {
  const node = el('<div></div>');
  const sessions = await store.listSessions();

  // Agrupa las sesiones por día (clave local YYYY-MM-DD).
  const byDay = new Map();
  for (const s of sessions) {
    const k = dateInputValue(s.startedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }

  const now = new Date();
  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  let viewY = now.getFullYear();
  let viewM = now.getMonth();
  let selectedKey = byDay.has(todayKey) ? todayKey : null;

  // --- Cabecera de navegación de mes ---
  const header = el(`
    <div class="cal-header">
      <button class="icon-btn" id="prev" aria-label="Mes anterior">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div id="cal-label" style="font-weight:800;font-size:17px"></div>
      <button class="icon-btn" id="next" aria-label="Mes siguiente">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>`);
  node.appendChild(header);

  const card = el('<div class="card"></div>');
  const dowRow = el('<div class="cal-grid" style="margin-bottom:6px"></div>');
  for (const d of DOW) dowRow.appendChild(el(`<div class="cal-dow">${d}</div>`));
  card.appendChild(dowRow);
  const grid = el('<div class="cal-grid"></div>');
  card.appendChild(grid);
  node.appendChild(card);

  // Resumen del mes.
  const monthInfo = el('<div class="muted center" style="font-size:13px;margin:10px 0 0"></div>');
  node.appendChild(monthInfo);

  // Heatmap de constancia (últimas 12 semanas, intensidad por volumen del día).
  node.appendChild(el('<div class="section-title">Constancia · 12 semanas</div>'));
  const hmCard = el('<div class="card"></div>');
  const volByKey = new Map();
  for (const [k, list] of byDay) {
    let v = 0;
    for (const sx of list) v += store.sessionStats(sx).totalVolume;
    volByKey.set(k, v);
  }
  const maxVol = Math.max(1, ...volByKey.values());
  const level = (v) => {
    if (!v) return 0;
    const r = v / maxVol;
    return r <= 0.25 ? 1 : (r <= 0.5 ? 2 : (r <= 0.75 ? 3 : 4));
  };
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const startMon = new Date(today0);
  startMon.setDate(today0.getDate() - ((today0.getDay() + 6) % 7) - 11 * 7); // lunes, 12 columnas atrás
  const hm = el('<div class="heatmap"></div>');
  for (let c = 0; c < 12; c++) {
    const col = el('<div class="hm-col"></div>');
    for (let r = 0; r < 7; r++) {
      const d = new Date(startMon);
      d.setDate(startMon.getDate() + c * 7 + r);
      const k = keyOf(d.getFullYear(), d.getMonth(), d.getDate());
      const future = d.getTime() > today0.getTime();
      const vol = volByKey.get(k) || 0;
      const lvl = future ? 0 : level(vol);
      const title = `${k}${vol ? ` · ${fmtNum(vol)} ${unitLabel()} vol` : ''}`;
      col.appendChild(el(`<div class="hm-cell hm-${lvl}" title="${esc(title)}"></div>`));
    }
    hm.appendChild(col);
  }
  hmCard.appendChild(hm);
  hmCard.appendChild(el(`
    <div class="row" style="justify-content:flex-end;gap:5px;align-items:center;margin-top:8px;font-size:11px">
      <span class="faint">menos</span>
      <span class="hm-cell hm-0"></span><span class="hm-cell hm-1"></span><span class="hm-cell hm-2"></span><span class="hm-cell hm-3"></span><span class="hm-cell hm-4"></span>
      <span class="faint">más</span>
    </div>`));
  node.appendChild(hmCard);

  // Panel del día seleccionado.
  const panel = el('<div id="cal-panel"></div>');
  node.appendChild(panel);

  function renderGrid() {
    header.querySelector('#cal-label').textContent = `${MONTHS[viewM]} ${viewY}`;
    grid.innerHTML = '';

    const first = new Date(viewY, viewM, 1);
    const startDow = (first.getDay() + 6) % 7; // semana empieza en lunes
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();

    for (let i = 0; i < startDow; i++) grid.appendChild(el('<div class="cal-day empty"></div>'));

    let daysWithSessions = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = keyOf(viewY, viewM, d);
      const has = byDay.has(k);
      if (has) daysWithSessions++;
      const cls = ['cal-day'];
      if (has) cls.push('has');
      if (k === todayKey) cls.push('today');
      if (k === selectedKey) cls.push('selected');
      const cell = el(`<button class="${cls.join(' ')}">${d}${has ? '<span class="cal-dot"></span>' : ''}</button>`);
      cell.onclick = () => { selectedKey = (selectedKey === k ? null : k); renderGrid(); renderPanel(); };
      grid.appendChild(cell);
    }

    monthInfo.textContent = daysWithSessions
      ? `${daysWithSessions} día${daysWithSessions === 1 ? '' : 's'} con sesión este mes`
      : 'Sin sesiones este mes';
  }

  function renderPanel() {
    panel.innerHTML = '';
    if (!selectedKey) return;
    const list = byDay.get(selectedKey) || [];
    const [y, m, d] = selectedKey.split('-').map(Number);
    const titleDate = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    panel.appendChild(el(`<div class="section-title">${esc(titleDate.charAt(0).toUpperCase() + titleDate.slice(1))}</div>`));

    if (!list.length) {
      panel.appendChild(el('<div class="empty"><p>No hay sesiones este día.</p></div>'));
      return;
    }
    const wrap = el('<div class="list"></div>');
    for (const s of list) {
      const st = store.sessionStats(s);
      const active = s.status === 'active';
      const item = el(`
        <div class="item clickable">
          <div class="grow">
            <div class="title">${esc(s.groupName)} ${active ? '<span class="badge">En curso</span>' : ''}</div>
            <div class="sub">${st.totalSets} series · ${st.totalVolume} ${esc(unitLabel())} vol · ${fmtDuration(st.duration)}</div>
          </div>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--text-faint)" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>`);
      item.onclick = () => navigate(active ? `#/session/${s.id}` : `#/session/${s.id}/summary`);
      wrap.appendChild(item);
    }
    panel.appendChild(wrap);
  }

  header.querySelector('#prev').onclick = () => {
    viewM--; if (viewM < 0) { viewM = 11; viewY--; }
    renderGrid();
  };
  header.querySelector('#next').onclick = () => {
    viewM++; if (viewM > 11) { viewM = 0; viewY++; }
    renderGrid();
  };

  renderGrid();
  renderPanel();

  return { title: 'Calendario', back: false, node };
}
