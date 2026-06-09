/* ============================================================
   calculator.js — Herramientas: conversión lb⇄kg y discos por lado.
   ============================================================ */

import { el, esc, num, round, lbToKg, kgToLb, fmtNum, PLATES, DEFAULT_BAR, platesPerSide } from '../utils.js';
import { unitLabel } from '../prefs.js';
import { epley1RM } from '../store.js';

// Porcentajes del 1RM mostrados en la tabla y rampa de calentamiento (% del peso de trabajo).
const RM_PERCENTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];
const WARMUP = [{ pct: 40, reps: 5 }, { pct: 55, reps: 3 }, { pct: 70, reps: 2 }, { pct: 85, reps: 1 }];

export async function calculator() {
  const node = el('<div></div>');

  /* ---------- Conversión lb ⇄ kg ---------- */
  const card = el(`
    <div class="card">
      <div class="field">
        <label>Libras (lb)</label>
        <input class="input" type="number" inputmode="decimal" step="0.5" min="0" id="lb" placeholder="0">
      </div>
      <div class="center muted" style="font-size:22px;margin:4px 0">⇅</div>
      <div class="field" style="margin-bottom:0">
        <label>Kilogramos (kg)</label>
        <input class="input" type="number" inputmode="decimal" step="0.5" min="0" id="kg" placeholder="0">
      </div>
    </div>`);

  const lb = card.querySelector('#lb');
  const kg = card.querySelector('#kg');

  // Conversión bidireccional, evitando bucles de eventos.
  let lock = false;
  lb.oninput = () => {
    if (lock) return;
    lock = true;
    kg.value = lb.value === '' ? '' : fmtNum(lbToKg(num(lb.value)));
    lock = false;
  };
  kg.oninput = () => {
    if (lock) return;
    lock = true;
    lb.value = kg.value === '' ? '' : fmtNum(kgToLb(num(kg.value)));
    lock = false;
  };

  node.appendChild(card);

  // Tabla de referencia rápida
  node.appendChild(el('<div class="section-title">Referencia rápida</div>'));
  const ref = el('<div class="card"><table class="sets-table"><thead><tr><th>Libras</th><th>Kilos</th></tr></thead><tbody></tbody></table></div>');
  const tbody = ref.querySelector('tbody');
  [2.5, 5, 10, 25, 35, 45].forEach((v) => {
    tbody.appendChild(el(`<tr><td>${v} lb</td><td>${fmtNum(lbToKg(v))} kg</td></tr>`));
  });
  node.appendChild(ref);

  node.appendChild(el('<p class="faint center mt" style="font-size:13px">1 lb = 0,45359237 kg</p>'));

  /* ---------- Calculadora de discos ---------- */
  const u = unitLabel();
  const plates = PLATES[u] || PLATES.kg;
  node.appendChild(el('<div class="section-title">Calculadora de discos</div>'));
  const pcard = el(`
    <div class="card">
      <div class="row" style="gap:10px">
        <div class="field grow" style="margin:0">
          <label>Peso objetivo (${esc(u)})</label>
          <input class="input" type="number" inputmode="decimal" step="0.5" min="0" id="pc-target" placeholder="0">
        </div>
        <div class="field" style="width:120px;margin:0">
          <label>Barra (${esc(u)})</label>
          <input class="input" type="number" inputmode="decimal" step="0.5" min="0" id="pc-bar" value="${DEFAULT_BAR[u] || 20}">
        </div>
      </div>
      <div id="pc-result" class="mt"></div>
    </div>`);
  const tInput = pcard.querySelector('#pc-target');
  const bInput = pcard.querySelector('#pc-bar');
  const result = pcard.querySelector('#pc-result');

  function renderPlates() {
    result.innerHTML = '';
    const target = num(tInput.value);
    const bar = num(bInput.value);
    if (!target) {
      result.appendChild(el('<div class="faint center" style="font-size:13px">Introduce el peso objetivo.</div>'));
      return;
    }
    const { list, leftover, perSide } = platesPerSide(target, bar, plates);
    if (perSide < 0) {
      result.appendChild(el('<div class="faint center" style="font-size:13px">El objetivo es menor que la barra.</div>'));
      return;
    }
    if (perSide === 0) {
      result.appendChild(el('<div class="center" style="font-weight:700">Solo la barra, sin discos.</div>'));
      return;
    }
    result.appendChild(el(`<div class="faint" style="font-size:12px;margin-bottom:8px">Por cada lado · ${fmtNum(perSide)} ${esc(u)}:</div>`));
    const chips = list.map(({ plate, count }) =>
      `<span class="tag" style="font-size:14px;padding:6px 12px">${count} × ${fmtNum(plate)}</span>`).join(' ');
    result.appendChild(el(`<div class="row" style="flex-wrap:wrap;gap:8px">${chips || '<span class="faint">No caben discos.</span>'}</div>`));
    if (leftover > 0) {
      result.appendChild(el(`<div class="faint center mt" style="font-size:12px">No exacto: sobran ${fmtNum(leftover)} ${esc(u)} por lado.</div>`));
    }
  }
  tInput.oninput = renderPlates;
  bInput.oninput = renderPlates;
  renderPlates();
  node.appendChild(pcard);

  node.appendChild(el(`<p class="faint center mt" style="font-size:13px">Discos: ${plates.map((p) => fmtNum(p)).join(' · ')} ${esc(u)}</p>`));

  /* ---------- 1RM estimado, % y calentamiento ---------- */
  node.appendChild(el('<div class="section-title">1RM y calentamiento</div>'));
  const rcard = el(`
    <div class="card">
      <div class="row" style="gap:10px">
        <div class="field grow" style="margin:0">
          <label>Peso de trabajo (${esc(u)})</label>
          <input class="input" type="number" inputmode="decimal" step="0.5" min="0" id="rm-weight" placeholder="0">
        </div>
        <div class="field" style="width:100px;margin:0">
          <label>Reps</label>
          <input class="input" type="number" inputmode="numeric" step="1" min="1" id="rm-reps" placeholder="0">
        </div>
      </div>
      <div id="rm-result" class="mt"></div>
    </div>`);
  const rW = rcard.querySelector('#rm-weight');
  const rR = rcard.querySelector('#rm-reps');
  const rRes = rcard.querySelector('#rm-result');

  function renderRM() {
    rRes.innerHTML = '';
    const w = num(rW.value), reps = num(rR.value);
    if (w <= 0 || reps <= 0) {
      rRes.appendChild(el('<div class="faint center" style="font-size:13px">Introduce peso y repeticiones.</div>'));
      return;
    }
    const rm = epley1RM(w, reps);
    rRes.appendChild(el(`<div class="center" style="margin-bottom:10px">1RM estimado: <b style="font-size:20px">${fmtNum(rm)} ${esc(u)}</b></div>`));

    // Tabla de % del 1RM
    const pctRows = RM_PERCENTS.map((p) => `<tr><td>${p}%</td><td>${fmtNum(round(rm * p / 100, 1))} ${esc(u)}</td></tr>`).join('');
    rRes.appendChild(el(`<table class="sets-table"><thead><tr><th>% 1RM</th><th>Peso</th></tr></thead><tbody>${pctRows}</tbody></table>`));

    // Rampa de calentamiento (% del peso de trabajo)
    rRes.appendChild(el('<div class="section-title" style="margin-bottom:6px">Calentamiento</div>'));
    const warm = WARMUP.map((s) => `<span class="tag" style="font-size:13px;padding:6px 10px">${fmtNum(round(w * s.pct / 100, 1))} × ${s.reps}</span>`).join(' ');
    rRes.appendChild(el(`<div class="row" style="flex-wrap:wrap;gap:8px">${warm}<span class="tag" style="font-size:13px;padding:6px 10px;background:var(--primary-soft);color:var(--primary)">${fmtNum(w)} × ${reps} trabajo</span></div>`));
  }
  rW.oninput = renderRM;
  rR.oninput = renderRM;
  renderRM();
  node.appendChild(rcard);

  return { title: 'Calculadora', back: '#/settings', node };
}
