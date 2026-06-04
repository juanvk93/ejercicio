/* ============================================================
   weight.js — Peso corporal y medidas (cintura, brazo, pecho…).
   El peso corporal usa el almacén bodyweight; las demás medidas,
   el almacén measurements. Cada tipo tiene su evolución e historial.
   ============================================================ */

import { el, esc, num, round, todayISO, fmtDate, fmtDateShort, fmtNum, toast, confirmDialog, lineChart } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

// Tipo seleccionado, recordado entre renders ('weight' o 'm:<Tipo>').
let _selType = 'weight';

export async function weight() {
  const node = el('<div></div>');
  const types = await store.measurementTypes();

  // Validez del tipo recordado (puede haber desaparecido).
  const measureKeys = types.map((t) => 'm:' + t);
  if (_selType !== 'weight' && !measureKeys.includes(_selType)) _selType = 'weight';

  // Selector de tipo
  const sel = el('<select class="input mb"></select>');
  sel.appendChild(el('<option value="weight">Peso corporal</option>'));
  for (const t of types) sel.appendChild(el(`<option value="m:${esc(t)}">${esc(t)}</option>`));
  sel.value = _selType;
  sel.onchange = () => { _selType = sel.value; render(); };
  node.appendChild(sel);

  const content = el('<div></div>');
  node.appendChild(content);

  async function render() {
    content.innerHTML = '';
    const isWeight = _selType === 'weight';
    const type = isWeight ? null : _selType.slice(2);
    const u = isWeight ? unitLabel() : 'cm';
    const records = isWeight ? await store.listBodyweight() : await store.listMeasurements(type);
    const valOf = (r) => (isWeight ? r.weight : r.value);
    const label = isWeight ? 'Peso' : esc(type);

    // Formulario de registro
    const form = el(`
      <div class="card">
        <div class="row" style="gap:10px;align-items:flex-end">
          <div class="field grow" style="margin:0">
            <label>Fecha</label>
            <input class="input" type="date" id="w-date" value="${todayISO()}">
          </div>
          <div class="field" style="margin:0;width:120px">
            <label>${label} (${esc(u)})</label>
            <input class="input" type="number" inputmode="decimal" step="0.1" min="0" id="w-val" placeholder="0.0">
          </div>
        </div>
        <button class="btn primary block mt" id="w-save">Registrar ${isWeight ? 'peso' : 'medida'}</button>
      </div>`);
    form.querySelector('#w-save').onclick = async () => {
      const date = form.querySelector('#w-date').value;
      const val = num(form.querySelector('#w-val').value);
      if (!date || val <= 0) { toast('Introduce una fecha y un valor válido', 'error'); return; }
      if (isWeight) await store.saveBodyweight({ date, weight: val });
      else await store.saveMeasurement({ type, date, value: val });
      toast('Registrado', 'success');
      render();
    };
    content.appendChild(form);

    // Evolución
    if (records.length) {
      content.appendChild(el('<div class="section-title">Evolución</div>'));
      const first = valOf(records[0]);
      const last = valOf(records[records.length - 1]);
      const vals = records.map(valOf);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const diff = round(last - first, 2);
      const sign = diff > 0 ? '+' : '';
      const diffColor = diff > 0 ? 'var(--warning)' : (diff < 0 ? 'var(--success)' : 'var(--text-faint)');

      content.appendChild(el(`
        <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><div class="val">${fmtNum(last)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Actual</div></div>
          <div class="stat"><div class="val" style="color:${diffColor}">${sign}${fmtNum(diff)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Variación</div></div>
          <div class="stat"><div class="val">${fmtNum(min)}–${fmtNum(max)}</div><div class="lbl">Rango</div></div>
        </div>`));

      if (records.length >= 2) {
        const points = records.map((r) => ({ x: fmtDateShort(r.date), y: valOf(r) }));
        content.appendChild(el(`<div class="card mt">${lineChart(points, { unit: u })}<div class="faint center" style="font-size:12px;margin-top:6px">${label} (${esc(u)}) por fecha</div></div>`));
      } else {
        content.appendChild(el('<div class="card"><div class="empty"><p>Registra al menos 2 valores para ver la gráfica.</p></div></div>'));
      }
    }

    // Historial
    content.appendChild(el('<div class="section-title">Historial</div>'));
    if (!records.length) {
      content.appendChild(el(`<div class="empty"><p>Aún no hay registros de ${isWeight ? 'tu peso' : label.toLowerCase()}.</p></div>`));
      return;
    }
    const list = el('<div class="list"></div>');
    const reversed = records.slice().reverse();
    reversed.forEach((r, i) => {
      const prev = reversed[i + 1];
      let delta = '';
      if (prev) {
        const d = valOf(r) - valOf(prev);
        const sg = d > 0 ? '+' : '';
        const color = d > 0 ? 'var(--warning)' : (d < 0 ? 'var(--success)' : 'var(--text-faint)');
        delta = `<span style="color:${color};font-weight:700">${sg}${fmtNum(d)} ${esc(u)}</span>`;
      }
      const item = el(`
        <div class="item">
          <div class="grow">
            <div class="title">${fmtNum(valOf(r))} ${esc(u)}</div>
            <div class="sub">${fmtDate(r.date)}</div>
          </div>
          ${delta}
          <button class="icon-btn" data-act="del" aria-label="Eliminar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>`);
      item.querySelector('[data-act="del"]').onclick = async () => {
        if (await confirmDialog('¿Eliminar este registro?')) {
          if (isWeight) await store.deleteBodyweight(r.id);
          else await store.deleteMeasurement(r.id);
          toast('Registro eliminado', 'success');
          render();
        }
      };
      list.appendChild(item);
    });
    content.appendChild(list);
  }

  await render();
  return { title: 'Peso y medidas', back: '#/settings', node };
}
