/* ============================================================
   calculator.js — Herramientas: conversión lb⇄kg y discos por lado.
   ============================================================ */

import { el, esc, num, round, lbToKg, kgToLb, fmtNum } from '../utils.js';
import { unitLabel } from '../prefs.js';

// Discos habituales por unidad (de mayor a menor) y peso de barra olímpica por defecto.
const PLATES = { kg: [20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
const DEFAULT_BAR = { kg: 20, lb: 45 };

/** Reparte el peso de un lado en discos (algoritmo voraz). */
function platesPerSide(target, bar, plates) {
  const perSide = round((target - bar) / 2, 2);
  if (perSide <= 0) return { list: [], leftover: 0, perSide };
  const list = [];
  let rem = perSide;
  for (const p of plates) {
    let count = 0;
    while (rem >= p - 1e-9) { rem = round(rem - p, 2); count++; }
    if (count) list.push({ plate: p, count });
  }
  return { list, leftover: round(rem, 2), perSide };
}

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

  return { title: 'Calculadora', back: '#/settings', node };
}
